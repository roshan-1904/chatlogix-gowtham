import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface VendorRow {
  id: string;
  settlementBalanceMilli: bigint;
  walletBalanceMilli: number;
  paymentFeeBps: number;
  collectionStartedAt: Date | null;
  rollingReserveBps: number;
  panEncrypted: string | null;
  razorpayLinkedAccountId: string | null;
  releasesFrozenAt: Date | null;
  releasesFrozenReason: string | null;
  settlementBankChangedAt: Date | null;
}

interface OrderRow {
  id: string;
  vendorId: string;
  totalAmount: number;
  cancelledAt: Date | null;
  status: string;
}

interface PaymentRow {
  id: string;
  vendorId: string;
  orderId: string;
  amountPaise: number;
  gatewayFeePaise: number;
  gatewayTaxPaise: number;
  platformFeePaise: number;
  platformFeeGstPaise: number;
  gstTcsPaise: number;
  tdsPaise: number;
  netMilli: bigint;
  refundedPaise: number;
  status: string;
  razorpayPaymentId: string;
  razorpayPaymentLinkId: string | null;
  capturedAt: Date;
  settlementAlert: string | null;
  refundRequired: boolean;
  disputeStatus: string | null;
}

interface TransferRow {
  id: string;
  vendorId: string;
  customerPaymentId: string;
  amountPaise: number;
  reversedPaise: number;
  kind: string;
  status: string;
  eligibleAt: Date;
  releasedAt: Date | null;
  razorpayTransferId: string | null;
  createdAt: Date;
}

interface EntryRow {
  id: string;
  vendorId: string;
  amountMilli: bigint;
  direction: string;
  balanceAfterMilli: bigint;
  kind: string;
  idempotencyKey: string;
  customerPaymentId: string | null;
  settlementTransferId: string | null;
  customerRefundId: string | null;
  createdAt: Date;
}

interface RefundRow {
  id: string;
  vendorId: string;
  customerPaymentId: string;
  amountPaise: number;
  status: string;
  shortfallMilli: bigint;
  fundingExpiresAt: Date | null;
  reversalPlan: unknown;
  requestedBy: string;
}

const hoisted = vi.hoisted(() => {
  const vendors = new Map<string, VendorRow>();
  const orders = new Map<string, OrderRow>();
  const links: Array<{ orderId: string; razorpayLinkId: string; status: string }> = [];
  const payments = new Map<string, PaymentRow>();
  const transfers: TransferRow[] = [];
  const entries: EntryRow[] = [];
  const refunds: RefundRow[] = [];
  let walletWrites = 0;
  let lockCalls = 0;
  let paymentSeq = 0;
  let transferSeq = 0;
  let refundSeq = 0;

  function resetStore() {
    vendors.clear();
    orders.clear();
    links.length = 0;
    payments.clear();
    transfers.length = 0;
    entries.length = 0;
    refunds.length = 0;
    walletWrites = 0;
    lockCalls = 0;
    paymentSeq = 0;
    transferSeq = 0;
    refundSeq = 0;
    vendors.set('v1', {
      id: 'v1',
      settlementBalanceMilli: 0n,
      walletBalanceMilli: 50_000,
      paymentFeeBps: 100,
      collectionStartedAt: new Date('2020-01-01'),
      rollingReserveBps: 0,
      panEncrypted: 'enc',
      razorpayLinkedAccountId: 'la_1',
      releasesFrozenAt: null,
      releasesFrozenReason: null,
      settlementBankChangedAt: null
    });
    orders.set('order-1', {
      id: 'order-1',
      vendorId: 'v1',
      totalAmount: 100_000,
      cancelledAt: null,
      status: 'awaiting_payment'
    });
    links.push({ orderId: 'order-1', razorpayLinkId: 'plink_1', status: 'created' });
  }

  const db = {
  $queryRaw: async () => [{ now: new Date('2026-10-01T12:00:00.000Z') }],
  $executeRaw: async () => {
    lockCalls += 1;
    return 0;
  },
  vendor: {
    findUnique: async ({ where }: { where: { id: string } }) => vendors.get(where.id) ?? null,
    update: async ({
      where,
      data
    }: {
      where: { id: string };
      data: Partial<VendorRow> & { settlementBalanceMilli?: bigint };
    }) => {
      if ('walletBalanceMilli' in data) walletWrites += 1;
      const row = vendors.get(where.id);
      if (!row) throw new Error('missing vendor');
      Object.assign(row, data);
      return row;
    }
  },
  order: {
    findUnique: async ({ where }: { where: { id: string } }) => orders.get(where.id) ?? null
  },
  paymentLink: {
    findFirst: async ({ where }: { where: { orderId: string; status: string } }) =>
      links.find((l) => l.orderId === where.orderId && l.status === where.status) ?? null
  },
  customerPayment: {
    findUnique: async ({ where }: { where: { id?: string; razorpayPaymentId?: string } }) => {
      if (where.razorpayPaymentId) {
        return [...payments.values()].find((p) => p.razorpayPaymentId === where.razorpayPaymentId) ?? null;
      }
      return payments.get(where.id!) ?? null;
    },
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      for (const row of payments.values()) {
        if (where.orderId && row.orderId !== where.orderId) continue;
        if (where.vendorId && row.vendorId !== where.vendorId) continue;
        if (where.settlementAlert === null && row.settlementAlert != null) continue;
        if (where.netMilli && (where.netMilli as { gt: bigint }).gt > row.netMilli) continue;
        if (where.disputeStatus && row.disputeStatus !== where.disputeStatus) continue;
        return row;
      }
      return null;
    },
    count: async ({ where }: { where: Record<string, unknown> }) => {
      let n = 0;
      for (const row of payments.values()) {
        if (where.vendorId && row.vendorId !== where.vendorId) continue;
        if (where.settlementAlert === null && row.settlementAlert != null) continue;
        if (where.netMilli && (where.netMilli as { gt: bigint }).gt > row.netMilli) continue;
        n += 1;
      }
      return n;
    },
    create: async ({ data }: { data: Omit<PaymentRow, 'id'> }) => {
      const row: PaymentRow = { id: `pay-${++paymentSeq}`, ...data };
      payments.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<PaymentRow> }) => {
      const row = payments.get(where.id);
      if (!row) throw new Error('missing payment');
      Object.assign(row, data);
      return row;
    }
  },
  settlementTransfer: {
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      transfers.filter((row) => {
        if (where.vendorId && row.vendorId !== where.vendorId) return false;
        if (where.status && typeof where.status === 'string' && row.status !== where.status) return false;
        if (where.status && (where.status as { in: string[] }).in) {
          if (!(where.status as { in: string[] }).in.includes(row.status)) return false;
        }
        if (where.eligibleAt && (where.eligibleAt as { lte: Date }).lte < row.eligibleAt) return false;
        return true;
      }),
    findUnique: async ({ where }: { where: { id: string } }) =>
      transfers.find((t) => t.id === where.id) ?? null,
    create: async ({ data }: { data: Omit<TransferRow, 'createdAt' | 'releasedAt' | 'reversedPaise' | 'razorpayTransferId'> }) => {
      const row: TransferRow = {
        reversedPaise: 0,
        releasedAt: null,
        razorpayTransferId: null,
        createdAt: new Date(),
        ...data,
        id: data.id ?? `tr-${++transferSeq}`
      };
      transfers.push(row);
      return row;
    },
    update: async ({
      where,
      data
    }: {
      where: { id: string; status?: string };
      data: Partial<TransferRow>;
    }) => {
      const row = transfers.find((t) => t.id === where.id);
      if (!row) throw new Error('missing transfer');
      if (where.status && row.status !== where.status) throw new Error('status mismatch');
      Object.assign(row, data);
      return row;
    },
    updateMany: async () => ({ count: 0 })
  },
  settlementEntry: {
    findUnique: async ({ where }: { where: { idempotencyKey: string } }) =>
      entries.find((e) => e.idempotencyKey === where.idempotencyKey) ?? null,
    findMany: async ({ where }: { where: Record<string, unknown> }) =>
      entries.filter((row) => {
        if (where.vendorId && row.vendorId !== where.vendorId) return false;
        if (where.kind && row.kind !== where.kind) return false;
        if (where.createdAt && (where.createdAt as { gte: Date }).gte > row.createdAt) return false;
        return true;
      }),
    aggregate: async ({
      where,
      _sum
    }: {
      where: Record<string, unknown>;
      _sum: { amountMilli?: boolean };
    }) => {
      const rows = entries.filter((row) => {
        if (where.vendorId && row.vendorId !== where.vendorId) return false;
        if (where.kind && row.kind !== where.kind) return false;
        return true;
      });
      if (_sum.amountMilli) {
        return { _sum: { amountMilli: rows.reduce((s, r) => s + r.amountMilli, 0n) } };
      }
      return { _sum: {} };
    },
    create: async ({ data }: { data: EntryRow }) => {
      const row = { ...data, createdAt: data.createdAt ?? new Date() };
      entries.push(row);
      return row;
    }
  },
  customerRefund: {
    findUnique: async ({ where }: { where: { id: string } }) =>
      refunds.find((r) => r.id === where.id) ?? null,
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      for (const row of refunds) {
        if (where.vendorId && row.vendorId !== where.vendorId) continue;
        if (where.status && (where.status as { in: string[] }).in) {
          if (!(where.status as { in: string[] }).in.includes(row.status)) continue;
        }
        return row;
      }
      return null;
    },
    create: async ({ data }: { data: Omit<RefundRow, 'id'> }) => {
      const row: RefundRow = { id: `cr-${++refundSeq}`, ...data };
      refunds.push(row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<RefundRow> }) => {
      const row = refunds.find((r) => r.id === where.id);
      if (!row) throw new Error('missing refund');
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<RefundRow> }) => {
      let count = 0;
      for (const row of refunds) {
        if (where.status && row.status !== where.status) continue;
        if (where.fundingExpiresAt && (where.fundingExpiresAt as { lte: Date }).lte < (row.fundingExpiresAt ?? new Date(0))) {
          continue;
        }
        Object.assign(row, data);
        count += 1;
      }
      return { count };
    }
  }
  };

  resetStore();
  const runTx = async <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> =>
    fn(db as unknown as Prisma.TransactionClient);
  return {
    db,
    runTx,
    resetStore,
    vendors,
    orders,
    links,
    payments,
    transfers,
    entries,
    refunds,
    getWalletWrites: () => walletWrites,
    getLockCalls: () => lockCalls,
    setLockCalls: (n: number) => {
      lockCalls = n;
    }
  };
});

const {
  runTx,
  resetStore,
  vendors,
  orders,
  links,
  payments,
  transfers,
  entries,
  refunds,
  getWalletWrites,
  getLockCalls,
  setLockCalls
} = hoisted;

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(hoisted.db),
    settlementTransfer: hoisted.db.settlementTransfer,
    customerRefund: hoisted.db.customerRefund
  }
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { bigintToDecimalString } from '../../../utils/bigIntJson.js';
import { seedPlatformSettingsMemory, clearPlatformSettingsCache } from '../../platformSettingsService.js';
import { FakeRouteClient } from '../routeClient.js';
import {
  NEW_SHOP_HOLD_MS,
  SETTLEMENT_HOLD_MS,
  quoteOrderSettlement
} from '../settlementMath.js';
import {
  applyDisputeTx,
  creditCapturedPayment,
  creditCapturedPaymentTx,
  creditShopFundingTx,
  expireRefundDrafts,
  releaseDueTransfers,
  requestRefund,
  setRouteClientForTests
} from '../settlementService.js';
import {
  NEW_SHOP_DAILY_RELEASE_CAP_MILLI,
  paiseToMilliBig,
  BANK_CHANGE_PAUSE_MS
} from '../settlementMath.js';

const ORDER = {
  vendorId: 'v1',
  orderId: 'order-1',
  razorpayPaymentId: 'pay_1000',
  razorpayPaymentLinkId: 'plink_1',
  amountPaise: 100_000,
  gatewayFeePaise: 2_000,
  gatewayTaxPaise: 360,
  currency: 'INR'
};

describe('quoteOrderSettlement', () => {
  it('converts the ₹966.40 net into millirupees, not paise', () => {
    const quote = quoteOrderSettlement({ ...ORDER, paymentFeeBps: 100 });
    expect(quote.netPaise).toBe(96_640);
    expect(quote.netMilli).toBe(966_400n);
    expect(quote.netMilli).not.toBe(96_640n);
    expect(quote.blocked).toBe(false);
  });

  it('applies default TCS and TDS rates', () => {
    seedPlatformSettingsMemory({ gstTcsBps: 50, tds194oBps: 10, tds194oNoPanBps: 500 });
    const quote = quoteOrderSettlement({ ...ORDER, paymentFeeBps: 100, gstTcsBps: 50, tdsBps: 10 });
    expect(quote.gstTcsPaise).toBe(500);
    expect(quote.tdsPaise).toBe(100);
    expect(quote.platformFeeGstPaise).toBe(153);
    expect(quote.netMilli).toBe(960_400n);
  });

  it('drops the platform fee when bps is 0', () => {
    const quote = quoteOrderSettlement({ ...ORDER, paymentFeeBps: 0 });
    expect(quote.platformFeePaise).toBe(0);
    expect(quote.netPaise).toBe(97_640);
    expect(quote.netMilli).toBe(976_400n);
  });
});

describe('settlementService', () => {
  beforeEach(() => {
    resetStore();
    clearPlatformSettingsCache();
    seedPlatformSettingsMemory({ gstTcsBps: 0, tds194oBps: 0, tds194oNoPanBps: 0 });
    setRouteClientForTests(new FakeRouteClient());
  });

  it('credits ₹966.40 with one main transfer and leaves the AI wallet alone', async () => {
    const result = await creditCapturedPayment(ORDER);
    expect(result.netMilli).toBe(966_400n);
    expect(result.balanceMilli).toBe(966_400n);
    expect(vendors.get('v1')?.walletBalanceMilli).toBe(50_000);
    expect(getWalletWrites()).toBe(0);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.kind).toBe('main');
    expect(transfers[0]?.amountPaise).toBe(96_640);
    expect(transfers[0]?.status).toBe('to_create');
    expect(getLockCalls()).toBeGreaterThan(0);
  });

  it('replays the same payment id without a second credit or transfer', async () => {
    await creditCapturedPayment(ORDER);
    const again = await creditCapturedPayment(ORDER);
    expect(again.alreadyCredited).toBe(true);
    expect(entries.filter((e) => e.kind === 'payment_credit')).toHaveLength(1);
    expect(transfers).toHaveLength(1);
  });

  it('does not credit when fees consume the amount', async () => {
    orders.set('order-tiny', {
      id: 'order-tiny',
      vendorId: 'v1',
      totalAmount: 1_000,
      cancelledAt: null,
      status: 'awaiting_payment'
    });
    const result = await creditCapturedPayment({
      ...ORDER,
      orderId: 'order-tiny',
      razorpayPaymentId: 'pay_tiny',
      razorpayPaymentLinkId: null,
      amountPaise: 1_000,
      gatewayFeePaise: 800,
      gatewayTaxPaise: 200
    });
    expect(result.blocked).toBe(true);
    expect(vendors.get('v1')?.settlementBalanceMilli).toBe(0n);
    expect(entries).toHaveLength(0);
    expect(transfers).toHaveLength(0);
    expect([...payments.values()][0]?.settlementAlert).toBe('net_not_positive');
  });

  it('uses a 7-day hold for a new shop', async () => {
    vendors.get('v1')!.collectionStartedAt = new Date('2026-10-01T12:00:00.000Z');
    await creditCapturedPayment(ORDER);
    const eligible = transfers[0]!.eligibleAt.getTime();
    const captured = [...payments.values()][0]!.capturedAt.getTime();
    expect(eligible - captured).toBe(NEW_SHOP_HOLD_MS);
  });

  it('uses a 48-hour hold after the new-shop window and order count', async () => {
    vendors.get('v1')!.collectionStartedAt = new Date('2020-01-01');
    for (let i = 0; i < 19; i++) {
      payments.set(`old-${i}`, {
        id: `old-${i}`,
        vendorId: 'v1',
        orderId: `order-old-${i}`,
        amountPaise: 1,
        gatewayFeePaise: 0,
        gatewayTaxPaise: 0,
        platformFeePaise: 0,
        platformFeeGstPaise: 0,
        gstTcsPaise: 0,
        tdsPaise: 0,
        netMilli: 1n,
        refundedPaise: 0,
        status: 'captured',
        razorpayPaymentId: `old-${i}`,
        razorpayPaymentLinkId: null,
        capturedAt: new Date(),
        settlementAlert: null,
        refundRequired: false,
        disputeStatus: null
      });
    }
    await creditCapturedPayment(ORDER);
    const eligible = transfers[0]!.eligibleAt.getTime();
    const captured = [...payments.values()].find((p) => p.razorpayPaymentId === 'pay_1000')!.capturedAt.getTime();
    expect(eligible - captured).toBe(SETTLEMENT_HOLD_MS);
  });

  it('splits reserve at 500 bps', async () => {
    vendors.get('v1')!.rollingReserveBps = 500;
    await creditCapturedPayment(ORDER);
    const main = transfers.find((t) => t.kind === 'main');
    const reserve = transfers.find((t) => t.kind === 'reserve');
    expect(main?.amountPaise).toBe(91_808);
    expect(reserve?.amountPaise).toBe(4_832);
  });

  it('creates no transfer while the shop owes money, then transfers on the next capture', async () => {
    vendors.get('v1')!.settlementBalanceMilli = -1_000_000n;
    await creditCapturedPayment({ ...ORDER, razorpayPaymentId: 'pay_a' });
    expect(transfers).toHaveLength(0);
    expect(vendors.get('v1')?.settlementBalanceMilli).toBe(-33_600n);
    orders.set('order-2', {
      id: 'order-2',
      vendorId: 'v1',
      totalAmount: 100_000,
      cancelledAt: null,
      status: 'awaiting_payment'
    });
    links.push({ orderId: 'order-2', razorpayLinkId: 'plink_2', status: 'created' });
    await creditCapturedPayment({
      ...ORDER,
      orderId: 'order-2',
      razorpayPaymentId: 'pay_b',
      razorpayPaymentLinkId: 'plink_2'
    });
    expect(vendors.get('v1')?.settlementBalanceMilli).toBe(932_800n);
    const secondPaymentId = [...payments.values()].find((p) => p.razorpayPaymentId === 'pay_b')!.id;
    expect(transfers.find((t) => t.customerPaymentId === secondPaymentId)?.amountPaise).toBe(93_280);
  });

  it('requests funding when held money cannot cover a full refund', async () => {
    await creditCapturedPayment(ORDER);
    const req = await requestRefund({
      vendorId: 'v1',
      customerPaymentId: [...payments.values()][0]!.id,
      refundPaise: 100_000,
      requestedBy: 'vendor'
    });
    expect(req.status).toBe('awaiting_funding');
    expect(req.shortfallMilli).toBe(33_600n);
    expect(entries.filter((e) => e.kind === 'refund_debit')).toHaveLength(0);
  });

  it('moves to submitting after shop funding covers the shortfall', async () => {
    await creditCapturedPayment(ORDER);
    const paymentId = [...payments.values()][0]!.id;
    const draft = await requestRefund({
      vendorId: 'v1',
      customerPaymentId: paymentId,
      refundPaise: 100_000,
      requestedBy: 'vendor'
    });
    await runTx(async (tx) =>
      creditShopFundingTx(tx, {
        vendorId: 'v1',
        customerRefundId: draft.refundId,
        netMilli: 33_600n,
        razorpayPaymentId: 'fund_1'
      })
    );
    expect(refunds[0]?.status).toBe('submitting');
    expect(entries.find((e) => e.kind === 'refund_debit')?.amountMilli).toBe(1_000_000n);
    expect(vendors.get('v1')?.settlementBalanceMilli).toBe(0n);
  });

  it('submits immediately when other held transfers cover the refund', async () => {
    await creditCapturedPayment(ORDER);
    const firstPaymentId = [...payments.values()][0]!.id;
    vendors.get('v1')!.settlementBalanceMilli = 1_466_400n;
    transfers.push({
      id: 'tr-other',
      vendorId: 'v1',
      customerPaymentId: 'pay-other',
      amountPaise: 50_000,
      reversedPaise: 0,
      kind: 'main',
      status: 'on_hold',
      eligibleAt: new Date(),
      releasedAt: null,
      razorpayTransferId: 'trf_x',
      createdAt: new Date('2026-09-01')
    });
    const req = await requestRefund({
      vendorId: 'v1',
      customerPaymentId: firstPaymentId,
      refundPaise: 100_000,
      requestedBy: 'vendor'
    });
    expect(req.status).toBe('submitting');
    expect(vendors.get('v1')?.settlementBalanceMilli).toBe(466_400n);
    const plan = refunds.find((r) => r.id === req.refundId)?.reversalPlan as Array<{
      reversePaise: number;
    }>;
    expect(plan.reduce((s, i) => s + i.reversePaise, 0)).toBe(100_000);
  });

  it('leaves ₹566.40 after a ₹400 partial refund', async () => {
    await creditCapturedPayment(ORDER);
    const paymentId = [...payments.values()][0]!.id;
    await requestRefund({
      vendorId: 'v1',
      customerPaymentId: paymentId,
      refundPaise: 40_000,
      requestedBy: 'vendor'
    });
    expect(vendors.get('v1')?.settlementBalanceMilli).toBe(566_400n);
  });

  it('cancels expired refund drafts', async () => {
    await creditCapturedPayment(ORDER);
    const paymentId = [...payments.values()][0]!.id;
    await requestRefund({
      vendorId: 'v1',
      customerPaymentId: paymentId,
      refundPaise: 100_000,
      requestedBy: 'vendor'
    });
    refunds[0]!.fundingExpiresAt = new Date('2020-01-01');
    const { cancelled } = await expireRefundDrafts(new Date('2026-01-01'));
    expect(cancelled).toBe(1);
    expect(refunds[0]?.status).toBe('cancelled');
  });

  it('records a lost dispute debit and a won dispute credit with return transfer', async () => {
    await creditCapturedPayment(ORDER);
    const paymentId = [...payments.values()][0]!.id;
    await runTx(async (tx) =>
      applyDisputeTx(tx, {
        vendorId: 'v1',
        customerPaymentId: paymentId,
        disputeId: 'dp_1',
        phase: 'deducted',
        deductPaise: 100_000
      })
    );
    expect(vendors.get('v1')?.settlementBalanceMilli).toBe(-33_600n);
    await runTx(async (tx) =>
      applyDisputeTx(tx, {
        vendorId: 'v1',
        customerPaymentId: paymentId,
        disputeId: 'dp_1',
        phase: 'won',
        deductPaise: 100_000
      })
    );
    expect(vendors.get('v1')?.settlementBalanceMilli).toBe(966_400n);
    expect(transfers.some((t) => t.kind === 'dispute_return')).toBe(true);
  });

  it('stringifies settlement bigint values for JSON', () => {
    expect(bigintToDecimalString(960_400n)).toBe('960400');
  });

  it('locks the vendor before balance reads in creditCapturedPaymentTx', async () => {
    setLockCalls(0);
    await runTx(async (tx) => creditCapturedPaymentTx(tx, ORDER));
    expect(getLockCalls()).toBeGreaterThan(0);
  });

  function seedDueTransfer(input: {
    id: string;
    amountPaise: number;
    eligibleAt: Date;
    razorpayTransferId?: string;
  }) {
    const paymentId = `cp-${input.id}`;
    payments.set(paymentId, {
      id: paymentId,
      vendorId: 'v1',
      orderId: 'order-1',
      amountPaise: input.amountPaise,
      gatewayFeePaise: 0,
      gatewayTaxPaise: 0,
      platformFeePaise: 0,
      platformFeeGstPaise: 0,
      gstTcsPaise: 0,
      tdsPaise: 0,
      netMilli: paiseToMilliBig(input.amountPaise),
      refundedPaise: 0,
      status: 'captured',
      razorpayPaymentId: `pay_${input.id}`,
      razorpayPaymentLinkId: null,
      capturedAt: new Date('2020-01-01'),
      settlementAlert: null,
      refundRequired: false,
      disputeStatus: null
    });
    transfers.push({
      id: input.id,
      vendorId: 'v1',
      customerPaymentId: paymentId,
      amountPaise: input.amountPaise,
      reversedPaise: 0,
      kind: 'main',
      status: 'on_hold',
      eligibleAt: input.eligibleAt,
      releasedAt: null,
      razorpayTransferId: input.razorpayTransferId ?? `trf_${input.id}`,
      createdAt: new Date('2020-01-01')
    });
    vendors.get('v1')!.settlementBalanceMilli += paiseToMilliBig(input.amountPaise);
  }

  it('does not release a transfer before eligibleAt', async () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    seedDueTransfer({
      id: 'future',
      amountPaise: 10_000,
      eligibleAt: new Date(now.getTime() + 60_000)
    });
    const { released } = await releaseDueTransfers(now);
    expect(released).toBe(0);
    expect(transfers.find((t) => t.id === 'future')?.status).toBe('on_hold');
  });

  it('releases a due transfer once even if the job runs twice', async () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    seedDueTransfer({ id: 'due', amountPaise: 10_000, eligibleAt: new Date('2020-01-01') });
    const first = await releaseDueTransfers(now);
    const second = await releaseDueTransfers(now);
    expect(first.released).toBe(1);
    expect(second.released).toBe(0);
    expect(entries.filter((e) => e.kind === 'transfer_release')).toHaveLength(1);
    expect(getWalletWrites()).toBe(0);
  });

  it('blocks release for admin freeze, open dispute, bank pause, refund in progress, and daily cap', async () => {
    const now = new Date('2026-10-01T12:00:00.000Z');
    const eligible = new Date('2020-01-01');

    seedDueTransfer({ id: 't-freeze', amountPaise: 5_000, eligibleAt: eligible });
    vendors.get('v1')!.releasesFrozenAt = new Date();
    vendors.get('v1')!.releasesFrozenReason = 'fraud_review';
    expect((await releaseDueTransfers(now)).released).toBe(0);

    resetStore();
    setRouteClientForTests(new FakeRouteClient());
    seedDueTransfer({ id: 't-dispute', amountPaise: 5_000, eligibleAt: eligible });
    payments.get('cp-t-dispute')!.disputeStatus = 'open';
    expect((await releaseDueTransfers(now)).released).toBe(0);

    resetStore();
    setRouteClientForTests(new FakeRouteClient());
    seedDueTransfer({ id: 't-bank', amountPaise: 5_000, eligibleAt: eligible });
    vendors.get('v1')!.settlementBankChangedAt = new Date(now.getTime() - 60 * 60 * 1000);
    expect((await releaseDueTransfers(now)).released).toBe(0);
    vendors.get('v1')!.settlementBankChangedAt = new Date(now.getTime() - BANK_CHANGE_PAUSE_MS - 1000);
    expect((await releaseDueTransfers(now)).released).toBe(1);

    resetStore();
    setRouteClientForTests(new FakeRouteClient());
    seedDueTransfer({ id: 't-refund', amountPaise: 5_000, eligibleAt: eligible });
    refunds.push({
      id: 'cr-1',
      vendorId: 'v1',
      customerPaymentId: 'cp-t-refund',
      amountPaise: 1_000,
      status: 'submitting',
      shortfallMilli: 0n,
      fundingExpiresAt: null,
      reversalPlan: [],
      requestedBy: 'vendor'
    });
    expect((await releaseDueTransfers(now)).released).toBe(0);

    resetStore();
    setRouteClientForTests(new FakeRouteClient());
    vendors.get('v1')!.collectionStartedAt = new Date(now);
    seedDueTransfer({ id: 'cap-a', amountPaise: 2_000_000, eligibleAt: eligible });
    seedDueTransfer({ id: 'cap-b', amountPaise: 2_000_000, eligibleAt: eligible });
    expect((await releaseDueTransfers(now)).released).toBe(1);
    expect((await releaseDueTransfers(now)).released).toBe(0);

    resetStore();
    setRouteClientForTests(new FakeRouteClient());
    vendors.get('v1')!.collectionStartedAt = new Date(now);
    seedDueTransfer({ id: 'alone', amountPaise: 3_000_000, eligibleAt: eligible });
    expect((await releaseDueTransfers(now)).released).toBe(1);
    expect(paiseToMilliBig(3_000_000) > NEW_SHOP_DAILY_RELEASE_CAP_MILLI).toBe(true);
  });
});
