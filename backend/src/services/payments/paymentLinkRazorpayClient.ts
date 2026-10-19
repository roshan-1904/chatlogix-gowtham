/**
 * Razorpay Payment Links API (order checkout). Tests inject FakePaymentLinkRazorpayClient.
 */

import { env } from '../../config/env.js';
import { logger } from '../../logger.js';

export interface RazorpayPaymentLinkEntity {
  id: string;
  short_url: string;
  amount: number;
  currency: string;
  status: string;
  expire_by?: number;
  payments?: Array<{ id: string; status?: string }>;
}

export interface CreatePaymentLinkInput {
  amountPaise: number;
  description: string;
  customer: { name: string; contact: string; email?: string };
  notes: Record<string, string>;
  expireByUnix: number;
}

export interface PaymentLinkRazorpayClient {
  createPaymentLink(input: CreatePaymentLinkInput): Promise<RazorpayPaymentLinkEntity>;
  fetchPaymentLink(linkId: string): Promise<RazorpayPaymentLinkEntity>;
  cancelPaymentLink(linkId: string): Promise<void>;
}

let clientOverride: PaymentLinkRazorpayClient | null = null;

export function setPaymentLinkRazorpayClientForTests(client: PaymentLinkRazorpayClient | null): void {
  clientOverride = client;
}

function authHeader(): string {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay API credentials are not configured');
  }
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

class HttpPaymentLinkRazorpayClient implements PaymentLinkRazorpayClient {
  async createPaymentLink(input: CreatePaymentLinkInput): Promise<RazorpayPaymentLinkEntity> {
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: 'INR',
        description: input.description,
        customer: input.customer,
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: input.notes,
        expire_by: input.expireByUnix
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ status: res.status, body: text.slice(0, 500) }, 'Razorpay create payment link failed');
      throw new Error(`Razorpay payment_links returned ${res.status}`);
    }
    return (await res.json()) as RazorpayPaymentLinkEntity;
  }

  async fetchPaymentLink(linkId: string): Promise<RazorpayPaymentLinkEntity> {
    const res = await fetch(`https://api.razorpay.com/v1/payment_links/${linkId}`, {
      headers: { Authorization: authHeader(), Accept: 'application/json' }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.error({ linkId, status: res.status, body: text.slice(0, 500) }, 'Razorpay fetch payment link failed');
      throw new Error(`Razorpay fetch payment_link returned ${res.status}`);
    }
    return (await res.json()) as RazorpayPaymentLinkEntity;
  }

  async cancelPaymentLink(linkId: string): Promise<void> {
    const res = await fetch(`https://api.razorpay.com/v1/payment_links/${linkId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      logger.error({ linkId, status: res.status, body: text.slice(0, 500) }, 'Razorpay cancel payment link failed');
      throw new Error(`Razorpay cancel payment_link returned ${res.status}`);
    }
  }
}

const httpClient = new HttpPaymentLinkRazorpayClient();

export function getPaymentLinkRazorpayClient(): PaymentLinkRazorpayClient {
  return clientOverride ?? httpClient;
}

export class FakePaymentLinkRazorpayClient implements PaymentLinkRazorpayClient {
  links = new Map<string, RazorpayPaymentLinkEntity>();
  cancelled = new Set<string>();
  private seq = 0;

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<RazorpayPaymentLinkEntity> {
    const id = `plink_fake_${++this.seq}`;
    const row: RazorpayPaymentLinkEntity = {
      id,
      short_url: `https://rzp.io/l/${id}`,
      amount: input.amountPaise,
      currency: 'INR',
      status: 'created',
      expire_by: input.expireByUnix
    };
    this.links.set(id, row);
    return row;
  }

  async fetchPaymentLink(linkId: string): Promise<RazorpayPaymentLinkEntity> {
    const row = this.links.get(linkId);
    if (!row) throw new Error(`payment link not found: ${linkId}`);
    return { ...row, payments: row.payments ? [...row.payments] : undefined };
  }

  async cancelPaymentLink(linkId: string): Promise<void> {
    this.cancelled.add(linkId);
    const row = this.links.get(linkId);
    if (row) row.status = 'cancelled';
  }
}
