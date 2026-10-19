import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakePaymentLinkRazorpayClient } from '../paymentLinkRazorpayClient.js';
import { FakeRazorpayApiClient } from '../razorpayApiClient.js';
import { FakeRouteClient } from '../routeClient.js';

const hoisted = vi.hoisted(() => {
  const vendors = new Map<string, { settlementBalanceMilli: bigint; razorpayLinkedAccountId: string | null }>();
  const links: Array<{
    id: string;
    vendorId: string;
    orderId: string;
    amountPaise: number;
    url: string;
    expiresAt: Date;
    razorpayLinkId: string;
    status: string;
    createdAt: Date;
    order?: {
      id: string;
      orderNumber: string;
      conversationId: string;
      customerId: string;
      customer: { phone: string };
    };
  }> = [];
  const transfers: Array<{
    id: string;
    vendorId: string;
    status: string;
    amountPaise: number;
    reversedPaise: number;
    razorpayTransferId: string | null;
    customerPaymentId: string;
    createdAt: Date;
  }> = [];
  const entries: Array<{
    vendorId: string;
    amountMilli: bigint;
    direction: string;
    kind: string;
    idempotencyKey: string;
    customerPaymentId?: string;
  }> = [];
  const refunds: Array<{ id: string; status: string; razorpayRefundId: string | null; vendorId: string }> = [];
  const notifications: Array<{ orderId: string | null; templateName: string | null }> = [];
  const payments: Array<{
    id: string;
    vendorId: string;
    razorpayPaymentId: string;
    amountPaise: number;
    gatewayFeePaise: number;
    gatewayTaxPaise: number;
    platformFeePaise: number;
    platformFeeGstPaise: number;
    gstTcsPaise: number;
    tdsPaise: number;
    netMilli: bigint;
    capturedAt: Date;
    settlementAlert: string | null;
    disputeStatus: string | null;
  }> = [];
  let creditCalls = 0;

  return {
    vendors,
    links,
    transfers,
    entries,
    refunds,
    notifications,
    payments,
    get creditCalls() {
      return creditCalls;
    },
    resetCreditCalls() {
      creditCalls = 0;
    },
    bumpCredit() {
      creditCalls += 1;
    }
  };
});

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    paymentLink: {
      findMany: ({ where }: { where?: Record<string, unknown> }) => {
        const w = where ?? {};
        let rows = [...hoisted.links];
        if (w.status) rows = rows.filter((r) => r.status === w.status);
        if (w.createdAt && typeof w.createdAt === 'object' && 'lte' in w.createdAt) {
          const lte = (w.createdAt as { lte: Date }).lte;
          rows = rows.filter((r) => r.createdAt.getTime() <= lte.getTime());
        }
        if (w.expiresAt && typeof w.expiresAt === 'object') {
          const exp = w.expiresAt as { lte?: Date; gt?: Date };
          if (exp.lte) rows = rows.filter((r) => r.expiresAt.getTime() <= exp.lte!.getTime());
          if (exp.gt) rows = rows.filter((r) => r.expiresAt.getTime() > exp.gt!.getTime());
        }
        return Promise.resolve(rows);
      }
    },
    customerRefund: {
      findMany: ({ where }: { where?: Record<string, unknown> }) => {
        const w = where ?? {};
        let rows = [...hoisted.refunds];
        if (w.status) {
          const st = w.status as { in?: string[] };
          if (st.in) rows = rows.filter((r) => st.in!.includes(r.status));
        }
        if (w.razorpayRefundId) rows = rows.filter((r) => r.razorpayRefundId != null);
        return Promise.resolve(rows);
      }
    },
    customerPayment: {
      findMany: ({ where }: { where?: Record<string, unknown> }) => {
        const w = where ?? {};
        let rows = [...hoisted.payments];
        if (w.disputeStatus) rows = rows.filter((r) => r.disputeStatus === w.disputeStatus);
        if (w.capturedAt && typeof w.capturedAt === 'object' && 'gte' in w.capturedAt) {
          const gte = (w.capturedAt as { gte: Date }).gte;
          rows = rows.filter((r) => r.capturedAt.getTime() >= gte.getTime());
        }
        if (w.settlementAlert === null) rows = rows.filter((r) => r.settlementAlert == null);
        if (w.netMilli) rows = rows.filter((r) => r.netMilli > 0n);
        return Promise.resolve(rows);
      }
    },
    settlementEntry: {
      findMany: ({
        where,
        distinct,
        select
      }: {
        where?: Record<string, unknown>;
        distinct?: string[];
        select?: Record<string, boolean>;
      }) => {
        const w = where ?? {};
        let rows = [...hoisted.entries];
        if (w.vendorId) rows = rows.filter((r) => r.vendorId === w.vendorId);
        if (distinct?.includes('vendorId')) {
          const seen = new Set<string>();
          rows = rows.filter((r) => {
            if (seen.has(r.vendorId)) return false;
            seen.add(r.vendorId);
            return true;
          });
          return Promise.resolve(rows.map((r) => ({ vendorId: r.vendorId })));
        }
        if (select) {
          return Promise.resolve(
            rows.map((r) => ({
              amountMilli: r.amountMilli,
              direction: r.direction,
              kind: r.kind
            }))
          );
        }
        return Promise.resolve(rows);
      },
      findFirst: ({ where }: { where?: Record<string, unknown> }) => {
        const w = where ?? {};
        const row = hoisted.entries.find((e) => {
          if (w.customerPaymentId && e.customerPaymentId !== w.customerPaymentId) return false;
          if (w.kind && e.kind !== w.kind) return false;
          if (w.idempotencyKey && typeof w.idempotencyKey === 'object' && 'startsWith' in w.idempotencyKey) {
            const prefix = (w.idempotencyKey as { startsWith: string }).startsWith;
            return e.idempotencyKey.startsWith(prefix);
          }
          return true;
        });
        return Promise.resolve(row ?? null);
      },
      findUnique: ({ where }: { where: { idempotencyKey: string } }) =>
        Promise.resolve(hoisted.entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null)
    },
    settlementTransfer: {
      findMany: ({ where }: { where?: Record<string, unknown> }) => {
        const w = where ?? {};
        let rows = [...hoisted.transfers];
        if (w.status) rows = rows.filter((r) => r.status === w.status);
        if (w.vendorId) rows = rows.filter((r) => r.vendorId === w.vendorId);
        return Promise.resolve(rows);
      }
    },
    vendor: {
      findMany: () => {
        const onHoldVendors = new Set(
          hoisted.transfers.filter((t) => t.status === 'on_hold').map((t) => t.vendorId)
        );
        return Promise.resolve(
          [...hoisted.vendors.entries()]
            .filter(([id, v]) => v.razorpayLinkedAccountId && onHoldVendors.has(id))
            .map(([id, v]) => ({ id, razorpayLinkedAccountId: v.razorpayLinkedAccountId }))
        );
      },
      findUnique: ({ where }: { where: { id: string } }) => {
        const v = hoisted.vendors.get(where.id);
        return Promise.resolve(v ? { settlementBalanceMilli: v.settlementBalanceMilli } : null);
      }
    },
    notificationHistory: {
      findFirst: ({ where }: { where?: Record<string, unknown> }) => {
        const w = where ?? {};
        const row = hoisted.notifications.find((n) => {
          if (w.orderId && n.orderId !== w.orderId) return false;
          if (w.templateName && typeof w.templateName === 'object' && 'in' in w.templateName) {
            const names = (w.templateName as { in: string[] }).in;
            return n.templateName != null && names.includes(n.templateName);
          }
          return true;
        });
        return Promise.resolve(row ?? null);
      },
      create: ({ data }: { data: { orderId: string; templateName: string } }) => {
        hoisted.notifications.push({ orderId: data.orderId, templateName: data.templateName });
        return Promise.resolve({ id: 'ntf_1' });
      }
    },
    message: {
      findFirst: () => Promise.resolve({ timestamp: new Date() })
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({})
  }
}));

vi.mock('../orderPaymentWebhook.js', () => ({
  handleOrderPaymentCapturedInTx: vi.fn(async () => {
    hoisted.bumpCredit();
    return { shouldCreateTransfers: true };
  })
}));

vi.mock('../settlementService.js', () => ({
  createPendingTransfers: vi.fn(async () => ({ created: 0 })),
  finishReleasingTransfers: vi.fn(async () => ({ finished: 0 })),
  submitRefund: vi.fn(async () => {})
}));

vi.mock('../refundWebhook.js', () => ({
  handleRefundStateInTx: vi.fn(async () => {}),
  handleDisputeWebhookInTx: vi.fn(async () => {})
}));

vi.mock('../../whatsappTemplateService.js', () => ({
  WhatsAppTemplateService: class {
    sendPaymentLinkExpiryReminder = vi.fn(async () => ({ success: true, queued: true }));
  }
}));

vi.mock('../../../observability/metrics.js', () => ({
  emitMetric: vi.fn()
}));

import { handleOrderPaymentCapturedInTx } from '../orderPaymentWebhook.js';
import {
  runSettlementDailySweep,
  runSettlementIntentSweep,
  runSettlementLedgerCheck,
  runSettlementRouteCheck,
  sendPaymentLinkExpiryReminders,
  setPaymentReconciliationClientsForTests
} from '../paymentReconciliationService.js';
import { createPendingTransfers, finishReleasingTransfers } from '../settlementService.js';

describe('paymentReconciliationService', () => {
  const fakeLinks = new FakePaymentLinkRazorpayClient();
  const fakeRzp = new FakeRazorpayApiClient();
  const fakeRoute = new FakeRouteClient();

  beforeEach(() => {
    hoisted.vendors.clear();
    hoisted.links.length = 0;
    hoisted.transfers.length = 0;
    hoisted.entries.length = 0;
    hoisted.refunds.length = 0;
    hoisted.notifications.length = 0;
    hoisted.payments.length = 0;
    hoisted.resetCreditCalls();
    fakeLinks.links.clear();
    fakeRzp.payments.clear();
    fakeRoute.onHoldOverridePaiseByAccount.clear();
    fakeRoute.transfers.clear();
    setPaymentReconciliationClientsForTests({
      paymentLinks: fakeLinks,
      razorpay: fakeRzp,
      route: fakeRoute
    });
    vi.mocked(handleOrderPaymentCapturedInTx).mockClear();
    vi.mocked(createPendingTransfers).mockClear();
    vi.mocked(finishReleasingTransfers).mockClear();
  });

  it('credits a stale created link when fake Razorpay returns captured payment; second sweep is a no-op', async () => {
    const now = new Date('2026-10-19T12:00:00Z');
    const createdAt = new Date(now.getTime() - 20 * 60 * 1000);
    fakeLinks.links.set('plink_1', {
      id: 'plink_1',
      short_url: 'https://rzp.io/l/1',
      amount: 50000,
      currency: 'INR',
      status: 'paid',
      payments: [{ id: 'pay_1', status: 'captured' }]
    });
    fakeRzp.payments.set('pay_1', {
      id: 'pay_1',
      amount: 50000,
      currency: 'INR',
      status: 'captured',
      fee: 100,
      tax: 18,
      notes: { orderId: 'ord_1', vendorId: 'v1', purpose: 'order_payment' }
    });
    hoisted.links.push({
      id: 'link_local',
      vendorId: 'v1',
      orderId: 'ord_1',
      amountPaise: 50000,
      url: 'https://rzp.io/l/1',
      expiresAt: new Date(now.getTime() + 3600_000),
      razorpayLinkId: 'plink_1',
      status: 'created',
      createdAt
    });

    const first = await runSettlementDailySweep(now);
    expect(first.staleLinksApplied).toBe(1);
    expect(handleOrderPaymentCapturedInTx).toHaveBeenCalledTimes(1);
    expect(createPendingTransfers).toHaveBeenCalledTimes(1);

    hoisted.links[0]!.status = 'paid';
    const second = await runSettlementDailySweep(now);
    expect(second.staleLinksApplied).toBe(0);
    expect(handleOrderPaymentCapturedInTx).toHaveBeenCalledTimes(1);
  });

  it('delegates releasing transfer finish to settlementService in intent sweep', async () => {
    vi.mocked(finishReleasingTransfers).mockResolvedValueOnce({ finished: 2 });
    const result = await runSettlementIntentSweep();
    expect(result.releasingFinished).toBe(2);
    expect(finishReleasingTransfers).toHaveBeenCalled();
  });

  it('alerts when cached settlement balance differs from ledger sum', async () => {
    hoisted.vendors.set('v1', { settlementBalanceMilli: 999n, razorpayLinkedAccountId: 'acc_1' });
    hoisted.entries.push({
      vendorId: 'v1',
      amountMilli: 500n,
      direction: 'credit',
      kind: 'payment_credit',
      idempotencyKey: 'payment:pay_1'
    });
    const { mismatches } = await runSettlementLedgerCheck();
    expect(mismatches).toBe(1);
  });

  it('alerts when Route on-hold total differs from local on_hold rows', async () => {
    hoisted.vendors.set('v1', { settlementBalanceMilli: 0n, razorpayLinkedAccountId: 'acc_1' });
    hoisted.transfers.push({
      id: 'st_1',
      vendorId: 'v1',
      status: 'on_hold',
      amountPaise: 10_000,
      reversedPaise: 0,
      razorpayTransferId: 'trf_1',
      customerPaymentId: 'cp_1',
      createdAt: new Date()
    });
    fakeRoute.onHoldOverridePaiseByAccount.set('acc_1', 8_000);
    const { mismatches } = await runSettlementRouteCheck();
    expect(mismatches).toBe(1);
  });

  it('sends one expiry reminder and dedupes the second run', async () => {
    const now = new Date('2026-10-19T20:00:00Z');
    hoisted.links.push({
      id: 'link_local',
      vendorId: 'v1',
      orderId: 'ord_1',
      amountPaise: 50000,
      url: 'https://rzp.io/l/1',
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      razorpayLinkId: 'plink_1',
      status: 'created',
      createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      order: {
        id: 'ord_1',
        orderNumber: 'ORD-1',
        conversationId: 'conv_1',
        customerId: 'cust_1',
        customer: { phone: '+919999999999' }
      }
    });

    const first = await sendPaymentLinkExpiryReminders(now);
    expect(first.sent).toBe(1);
    expect(hoisted.notifications).toHaveLength(0);

    hoisted.notifications.push({ orderId: 'ord_1', templateName: 'payment_link_reminder' });
    const second = await sendPaymentLinkExpiryReminders(now);
    expect(second.sent).toBe(0);
  });
});
