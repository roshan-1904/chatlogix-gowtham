/**
 * Razorpay Route API surface used by settlement. Unit tests use FakeRouteClient.
 */

export interface RouteTransfer {
  id: string;
  amount: number;
  on_hold?: boolean;
  notes?: Record<string, string>;
}

export interface RouteReversal {
  id: string;
  amount: number;
}

export interface RouteRefund {
  id: string;
  amount: number;
  status: string;
}

export interface RouteClient {
  createTransfer(input: {
    paymentId: string;
    linkedAccountId: string;
    amountPaise: number;
    onHold: boolean;
    notes: Record<string, string>;
  }): Promise<RouteTransfer>;
  fetchTransfer(transferId: string): Promise<RouteTransfer>;
  fetchPaymentTransfers(paymentId: string): Promise<RouteTransfer[]>;
  /** Sum of on-hold transfer amounts (minus reversals) for a linked account. */
  sumOnHoldTransferPaise(linkedAccountId: string): Promise<number>;
  setTransferHold(transferId: string, onHold: boolean): Promise<RouteTransfer>;
  reverseTransfer(transferId: string, amountPaise: number): Promise<RouteReversal>;
  fetchTransferReversals(transferId: string): Promise<RouteReversal[]>;
  createRefund(input: {
    paymentId: string;
    amountPaise: number;
    speed: 'normal';
    notes: Record<string, string>;
  }): Promise<RouteRefund>;
  fetchRefund(refundId: string): Promise<RouteRefund>;
}

class HttpRouteClient implements RouteClient {
  private async post<T>(path: string, body: unknown): Promise<T> {
    const { env } = await import('../../config/env.js');
    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error('Razorpay API credentials are not configured');
    const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: 'POST',
      headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Route API ${path} returned ${res.status}`);
    return (await res.json()) as T;
  }

  private async get<T>(path: string): Promise<T> {
    const { env } = await import('../../config/env.js');
    const keyId = env.RAZORPAY_KEY_ID;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new Error('Razorpay API credentials are not configured');
    const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      headers: { Authorization: auth, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Route API ${path} returned ${res.status}`);
    return (await res.json()) as T;
  }

  createTransfer(input: {
    paymentId: string;
    linkedAccountId: string;
    amountPaise: number;
    onHold: boolean;
    notes: Record<string, string>;
  }): Promise<RouteTransfer> {
    return this.post('/transfers', {
      transfers: [
        {
          account: input.linkedAccountId,
          amount: input.amountPaise,
          currency: 'INR',
          on_hold: input.onHold ? 1 : 0,
          notes: input.notes
        }
      ],
      payment_id: input.paymentId
    }).then((body: { items?: RouteTransfer[] }) => body.items?.[0] ?? { id: 'trf_unknown', amount: input.amountPaise });
  }

  fetchPaymentTransfers(paymentId: string): Promise<RouteTransfer[]> {
    return this.get<{ items?: RouteTransfer[] }>(`/payments/${paymentId}/transfers`).then((b) => b.items ?? []);
  }

  fetchTransfer(transferId: string): Promise<RouteTransfer> {
    return this.get<RouteTransfer>(`/transfers/${transferId}`);
  }

  async sumOnHoldTransferPaise(linkedAccountId: string): Promise<number> {
    const body = await this.get<{ items?: Array<RouteTransfer & { recipient?: string }> }>(
      `/accounts/${linkedAccountId}/transfers?count=100`
    );
    let sum = 0;
    for (const row of body.items ?? []) {
      if (!row.on_hold) continue;
      const revs = await this.fetchTransferReversals(row.id);
      const reversed = revs.reduce((s, r) => s + r.amount, 0);
      sum += Math.max(0, row.amount - reversed);
    }
    return sum;
  }

  setTransferHold(transferId: string, onHold: boolean): Promise<RouteTransfer> {
    return this.post(`/transfers/${transferId}/hold`, { on_hold: onHold ? 1 : 0 });
  }

  reverseTransfer(transferId: string, amountPaise: number): Promise<RouteReversal> {
    return this.post(`/transfers/${transferId}/reversals`, { amount: amountPaise });
  }

  fetchTransferReversals(transferId: string): Promise<RouteReversal[]> {
    return this.get<{ items?: RouteReversal[] }>(`/transfers/${transferId}/reversals`).then((b) => b.items ?? []);
  }

  createRefund(input: {
    paymentId: string;
    amountPaise: number;
    speed: 'normal';
    notes: Record<string, string>;
  }): Promise<RouteRefund> {
    return this.post('/payments/refund', {
      payment_id: input.paymentId,
      amount: input.amountPaise,
      speed: input.speed,
      notes: input.notes
    });
  }

  fetchRefund(refundId: string): Promise<RouteRefund> {
    return this.get(`/refunds/${refundId}`);
  }
}

let routeClientOverride: RouteClient | null = null;

export function setRouteClientOverride(client: RouteClient | null): void {
  routeClientOverride = client;
}

export function getRouteClient(): RouteClient {
  if (routeClientOverride) return routeClientOverride;
  return new HttpRouteClient();
}

/** Dev / pre-D1: wire FakeRouteClient at process startup when env is set. */
export async function bootstrapRouteClientFromEnv(): Promise<void> {
  const { env } = await import('../../config/env.js');
  if (env.RAZORPAY_USE_FAKE_ROUTE === 'true') {
    routeClientOverride = new FakeRouteClient();
  }
}

export class FakeRouteClient implements RouteClient {
  transfers = new Map<string, RouteTransfer>();
  paymentTransfers = new Map<string, RouteTransfer[]>();
  reversals = new Map<string, RouteReversal[]>();
  refunds = new Map<string, RouteRefund>();
  /** Test hook: remote on-hold total when it should differ from local rows. */
  onHoldOverridePaiseByAccount = new Map<string, number>();
  private seq = 0;

  async createTransfer(input: {
    paymentId: string;
    linkedAccountId: string;
    amountPaise: number;
    onHold: boolean;
    notes: Record<string, string>;
  }): Promise<RouteTransfer> {
    const id = `trf_fake_${++this.seq}`;
    const row: RouteTransfer = {
      id,
      amount: input.amountPaise,
      on_hold: input.onHold,
      notes: input.notes
    };
    this.transfers.set(id, row);
    const list = this.paymentTransfers.get(input.paymentId) ?? [];
    list.push(row);
    this.paymentTransfers.set(input.paymentId, list);
    return row;
  }

  async fetchPaymentTransfers(paymentId: string): Promise<RouteTransfer[]> {
    return [...(this.paymentTransfers.get(paymentId) ?? [])];
  }

  async fetchTransfer(transferId: string): Promise<RouteTransfer> {
    const row = this.transfers.get(transferId);
    if (!row) throw new Error(`transfer not found: ${transferId}`);
    return row;
  }

  async sumOnHoldTransferPaise(linkedAccountId: string): Promise<number> {
    const override = this.onHoldOverridePaiseByAccount.get(linkedAccountId);
    if (override !== undefined) return override;
    let sum = 0;
    for (const row of this.transfers.values()) {
      if (!row.on_hold) continue;
      const revs = this.reversals.get(row.id) ?? [];
      const reversed = revs.reduce((s, r) => s + r.amount, 0);
      sum += Math.max(0, row.amount - reversed);
    }
    return sum;
  }

  async setTransferHold(transferId: string, onHold: boolean): Promise<RouteTransfer> {
    let row = this.transfers.get(transferId);
    if (!row) {
      row = { id: transferId, amount: 0, on_hold: true };
      this.transfers.set(transferId, row);
    }
    row.on_hold = onHold;
    return row;
  }

  async reverseTransfer(transferId: string, amountPaise: number): Promise<RouteReversal> {
    const rev: RouteReversal = { id: `rev_${transferId}_${amountPaise}`, amount: amountPaise };
    const list = this.reversals.get(transferId) ?? [];
    list.push(rev);
    this.reversals.set(transferId, list);
    return rev;
  }

  async fetchTransferReversals(transferId: string): Promise<RouteReversal[]> {
    return [...(this.reversals.get(transferId) ?? [])];
  }

  async createRefund(input: {
    paymentId: string;
    amountPaise: number;
    speed: 'normal';
    notes: Record<string, string>;
  }): Promise<RouteRefund> {
    const id = `rfnd_fake_${++this.seq}`;
    const row: RouteRefund = { id, amount: input.amountPaise, status: 'processed' };
    this.refunds.set(id, row);
    return row;
  }

  async fetchRefund(refundId: string): Promise<RouteRefund> {
    const row = this.refunds.get(refundId);
    if (!row) throw new Error('refund not found');
    return row;
  }
}
