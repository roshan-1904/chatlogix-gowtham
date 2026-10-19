/**
 * The only writer of `Vendor.settlementBalanceMilli`.
 * Customer order payments land here; the AI wallet is never touched.
 */

import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { getPlatformSettings } from '../platformSettingsService.js';
import { getRouteClient, type RouteClient } from './routeClient.js';
import { lockVendorForSettlement } from './vendorSettlementLock.js';
import {
  BANK_CHANGE_PAUSE_MS,
  REFUND_DRAFT_TTL_MS,
  RELEASE_BATCH_SIZE,
  holdMsForShop,
  istDayKey,
  exceedsNewShopDailyCap,
  isNewShop,
  NEW_SHOP_DAILY_RELEASE_CAP_MILLI,
  paiseToMilliBig,
  quoteOrderSettlement,
  reserveEligibleAt,
  splitReserve,
  summarizeSettlement,
  heldPaiseFromTransfers,
  transferablePaiseAfterOwed,
  transferEligibleAt,
  type OrderSettlementQuote
} from './settlementMath.js';

type Tx = Prisma.TransactionClient;

const ACTIVE_TRANSFER_STATUSES = ['to_create', 'on_hold', 'releasing'] as const;
const REFUND_IN_PROGRESS = ['awaiting_funding', 'submitting'] as const;

export interface SettlementTaxRates {
  gstTcsBps: number;
  tdsBps: number;
}

export interface CreditCapturedPaymentInput {
  vendorId: string;
  orderId: string;
  razorpayPaymentId: string;
  razorpayPaymentLinkId?: string | null;
  amountPaise: number;
  gatewayFeePaise: number;
  gatewayTaxPaise: number;
  currency?: string;
  /** Tests only; production uses the DB clock inside the transaction. */
  capturedAtOverride?: Date;
  taxRates?: SettlementTaxRates;
}

export interface CreditCapturedPaymentResult {
  paymentId: string;
  netMilli: bigint;
  balanceMilli: bigint;
  alreadyCredited: boolean;
  blocked: boolean;
  guardFailed: boolean;
}

export type ReversalPlanItem = { settlementTransferId: string; reversePaise: number };

let routeClientForTests: RouteClient | null = null;

export function setRouteClientForTests(client: RouteClient | null): void {
  routeClientForTests = client;
}

function resolveRouteClient(): RouteClient {
  if (routeClientForTests) return routeClientForTests;
  return getRouteClient();
}

function taxRatesForVendor(
  vendor: { panEncrypted: string | null },
  override?: SettlementTaxRates
): SettlementTaxRates {
  if (override) return override;
  const settings = getPlatformSettings();
  const tdsBps =
    vendor.panEncrypted != null && vendor.panEncrypted !== ''
      ? settings.tds194oBps
      : settings.tds194oNoPanBps;
  return { gstTcsBps: settings.gstTcsBps, tdsBps };
}

export async function creditCapturedPayment(
  input: CreditCapturedPaymentInput
): Promise<CreditCapturedPaymentResult> {
  return prisma.$transaction((tx) => creditCapturedPaymentTx(tx, input));
}

export async function creditCapturedPaymentTx(
  tx: Tx,
  input: CreditCapturedPaymentInput
): Promise<CreditCapturedPaymentResult> {
  await lockVendorForSettlement(tx, input.vendorId);

  const existing = await tx.customerPayment.findUnique({
    where: { razorpayPaymentId: input.razorpayPaymentId }
  });
  if (existing) {
    const vendor = await requireVendor(tx, existing.vendorId);
    return {
      paymentId: existing.id,
      netMilli: existing.netMilli,
      balanceMilli: vendor.settlementBalanceMilli,
      alreadyCredited: true,
      blocked: existing.settlementAlert != null,
      guardFailed: existing.refundRequired
    };
  }

  const vendor = await requireVendor(tx, input.vendorId);
  const clockRows = await tx.$queryRaw<{ now: Date }[]>`SELECT NOW() AS now`;
  const capturedAt = input.capturedAtOverride ?? clockRows[0]?.now ?? new Date();

  const guard = await evaluateCaptureGuards(tx, input);
  const taxRates = taxRatesForVendor(vendor, input.taxRates);
  const quote = quoteOrderSettlement({
    amountPaise: input.amountPaise,
    gatewayFeePaise: input.gatewayFeePaise,
    gatewayTaxPaise: input.gatewayTaxPaise,
    paymentFeeBps: vendor.paymentFeeBps,
    gstTcsBps: taxRates.gstTcsBps,
    tdsBps: taxRates.tdsBps
  });

  const blocked = quote.blocked || guard.alert != null;
  const payment = await tx.customerPayment.create({
    data: {
      vendorId: input.vendorId,
      orderId: input.orderId,
      amountPaise: input.amountPaise,
      gatewayFeePaise: input.gatewayFeePaise,
      gatewayTaxPaise: input.gatewayTaxPaise,
      platformFeePaise: quote.platformFeePaise,
      platformFeeGstPaise: quote.platformFeeGstPaise,
      gstTcsPaise: quote.gstTcsPaise,
      tdsPaise: quote.tdsPaise,
      netMilli: blocked ? 0n : quote.netMilli,
      status: 'captured',
      razorpayPaymentId: input.razorpayPaymentId,
      razorpayPaymentLinkId: input.razorpayPaymentLinkId ?? null,
      capturedAt,
      settlementAlert: guard.alert ?? (quote.blocked ? 'net_not_positive' : null),
      refundRequired: guard.alert != null,
      disputeStatus: null
    }
  });

  if (blocked) {
    if (quote.blocked) {
      logger.warn(
        { vendorId: input.vendorId, orderId: input.orderId, netPaise: quote.netPaise },
        'Order payment fees consumed the amount; settlement was not credited'
      );
    }
    return {
      paymentId: payment.id,
      netMilli: 0n,
      balanceMilli: vendor.settlementBalanceMilli,
      alreadyCredited: false,
      blocked: true,
      guardFailed: guard.alert != null
    };
  }

  const balanceBefore = vendor.settlementBalanceMilli;
  const balanceMilli = balanceBefore + quote.netMilli;
  await tx.vendor.update({
    where: { id: input.vendorId },
    data: { settlementBalanceMilli: balanceMilli }
  });
  await tx.settlementEntry.create({
    data: {
      id: randomUUID(),
      vendorId: input.vendorId,
      amountMilli: quote.netMilli,
      direction: 'credit',
      balanceAfterMilli: balanceMilli,
      kind: 'payment_credit',
      idempotencyKey: `payment:${input.razorpayPaymentId}`,
      customerPaymentId: payment.id,
      metadata: {
        amountPaise: input.amountPaise,
        platformFeePaise: quote.platformFeePaise,
        netPaise: quote.netPaise
      }
    }
  });

  await createTransferRowsForCapture(tx, {
    vendor,
    paymentId: payment.id,
    capturedAt,
    quote,
    balanceBeforeMilli: balanceBefore
  });

  return {
    paymentId: payment.id,
    netMilli: quote.netMilli,
    balanceMilli,
    alreadyCredited: false,
    blocked: false,
    guardFailed: false
  };
}

async function evaluateCaptureGuards(
  tx: Tx,
  input: CreditCapturedPaymentInput
): Promise<{ alert: string | null }> {
  if ((input.currency ?? 'INR').toUpperCase() !== 'INR') {
    return { alert: 'not_inr' };
  }
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    select: { totalAmount: true, cancelledAt: true, status: true, vendorId: true }
  });
  if (!order || order.vendorId !== input.vendorId) {
    return { alert: 'amount_mismatch' };
  }
  if (order.cancelledAt != null || order.status === 'cancelled') {
    return { alert: 'order_cancelled' };
  }
  if (order.totalAmount !== input.amountPaise) {
    return { alert: 'amount_mismatch' };
  }
  const priorCapture = await tx.customerPayment.findFirst({
    where: {
      orderId: input.orderId,
      settlementAlert: null,
      netMilli: { gt: 0 }
    }
  });
  if (priorCapture) {
    return { alert: 'order_already_paid' };
  }
  if (input.razorpayPaymentLinkId) {
    const openLink = await tx.paymentLink.findFirst({
      where: { orderId: input.orderId, status: 'created' }
    });
    if (!openLink || openLink.razorpayLinkId !== input.razorpayPaymentLinkId) {
      return { alert: 'unknown_link' };
    }
  }
  return { alert: null };
}

async function createTransferRowsForCapture(
  tx: Tx,
  input: {
    vendor: Awaited<ReturnType<typeof requireVendor>>;
    paymentId: string;
    capturedAt: Date;
    quote: OrderSettlementQuote;
    balanceBeforeMilli: bigint;
  }
): Promise<void> {
  const transferablePaise = transferablePaiseAfterOwed(
    input.balanceBeforeMilli,
    input.quote.netMilli
  );
  if (transferablePaise <= 0) return;

  const capturedCount = await tx.customerPayment.count({
    where: { vendorId: input.vendor.id, settlementAlert: null, netMilli: { gt: 0 } }
  });
  const holdMs = holdMsForShop({
    now: input.capturedAt,
    collectionStartedAt: input.vendor.collectionStartedAt,
    capturedPaymentCount: capturedCount
  });
  const mainEligible = transferEligibleAt(input.capturedAt, holdMs);
  const split = splitReserve(transferablePaise, input.vendor.rollingReserveBps);

  if (split.mainPaise > 0) {
    await tx.settlementTransfer.create({
      data: {
        id: randomUUID(),
        vendorId: input.vendor.id,
        customerPaymentId: input.paymentId,
        amountPaise: split.mainPaise,
        kind: 'main',
        status: 'to_create',
        eligibleAt: mainEligible
      }
    });
  }
  if (split.reservePaise > 0) {
    await tx.settlementTransfer.create({
      data: {
        id: randomUUID(),
        vendorId: input.vendor.id,
        customerPaymentId: input.paymentId,
        amountPaise: split.reservePaise,
        kind: 'reserve',
        status: 'to_create',
        eligibleAt: reserveEligibleAt(input.capturedAt)
      }
    });
  }
}

export async function createPendingTransfers(now: Date = new Date()): Promise<{ created: number }> {
  const pending = await prisma.settlementTransfer.findMany({
    where: { status: 'to_create' },
    take: RELEASE_BATCH_SIZE,
    orderBy: { createdAt: 'asc' },
    include: {
      customerPayment: { select: { razorpayPaymentId: true } },
      vendor: { select: { razorpayLinkedAccountId: true } }
    }
  });
  const client = resolveRouteClient();
  let created = 0;
  for (const row of pending) {
    if (!row.vendor.razorpayLinkedAccountId) continue;
    const existing = await client.fetchPaymentTransfers(row.customerPayment.razorpayPaymentId);
    const matched = existing.find((t) => t.notes?.settlementTransferId === row.id);
    if (matched) {
      await prisma.settlementTransfer.update({
        where: { id: row.id },
        data: { status: 'on_hold', razorpayTransferId: matched.id }
      });
      continue;
    }
    const transfer = await client.createTransfer({
      paymentId: row.customerPayment.razorpayPaymentId,
      linkedAccountId: row.vendor.razorpayLinkedAccountId,
      amountPaise: row.amountPaise,
      onHold: true,
      notes: { settlementTransferId: row.id }
    });
    await prisma.settlementTransfer.update({
      where: { id: row.id },
      data: { status: 'on_hold', razorpayTransferId: transfer.id }
    });
    created += 1;
  }
  void now;
  return { created };
}

/** Finish transfers left in `releasing` after a crash between Route PATCH and ledger write (rule 13). */
export async function finishReleasingTransfers(now: Date = new Date()): Promise<{ finished: number }> {
  const client = resolveRouteClient();
  let finished = 0;
  for (;;) {
    const batch = await prisma.settlementTransfer.findMany({
      where: { status: 'releasing' },
      take: RELEASE_BATCH_SIZE,
      orderBy: { createdAt: 'asc' }
    });
    if (batch.length === 0) break;

    for (const row of batch) {
      if (!row.razorpayTransferId) continue;
      try {
        const remote = await client.fetchTransfer(row.razorpayTransferId);
        if (remote.on_hold) {
          await client.setTransferHold(row.razorpayTransferId, false);
          continue;
        }
        await prisma.$transaction(async (tx) => {
          await lockVendorForSettlement(tx, row.vendorId);
          const fresh = await tx.settlementTransfer.findUnique({ where: { id: row.id } });
          if (!fresh || fresh.status !== 'releasing') return;
          const vendor = await requireVendor(tx, row.vendorId);
          const releaseMilli = paiseToMilliBig(fresh.amountPaise - fresh.reversedPaise);
          const balanceMilli = vendor.settlementBalanceMilli - releaseMilli;
          await tx.vendor.update({
            where: { id: row.vendorId },
            data: { settlementBalanceMilli: balanceMilli }
          });
          await tx.settlementEntry.create({
            data: {
              id: randomUUID(),
              vendorId: row.vendorId,
              amountMilli: releaseMilli,
              direction: 'debit',
              balanceAfterMilli: balanceMilli,
              kind: 'transfer_release',
              idempotencyKey: `transfer-release:${row.id}`,
              settlementTransferId: row.id,
              customerPaymentId: row.customerPaymentId
            }
          });
          await tx.settlementTransfer.update({
            where: { id: row.id },
            data: { status: 'released', releasedAt: now }
          });
        });
        finished += 1;
      } catch (err) {
        logger.error({ err, settlementTransferId: row.id }, 'finishReleasingTransfers row failed');
      }
    }
    if (batch.length < RELEASE_BATCH_SIZE) break;
  }
  return { finished };
}

export async function releaseDueTransfers(now: Date = new Date()): Promise<{ released: number }> {
  let released = 0;
  const client = resolveRouteClient();
  for (;;) {
    const marked = await prisma.$transaction(async (tx) => {
      const due = await tx.settlementTransfer.findMany({
        where: { status: 'on_hold', eligibleAt: { lte: now } },
        take: RELEASE_BATCH_SIZE,
        orderBy: { eligibleAt: 'asc' }
      });
      const ids: string[] = [];
      let pendingReleaseTodayMilli = 0n;
      for (const row of due) {
        const allowed = await canReleaseTransfer(tx, row.vendorId, row, now, pendingReleaseTodayMilli);
        if (!allowed) continue;
        pendingReleaseTodayMilli += paiseToMilliBig(row.amountPaise - row.reversedPaise);
        await tx.settlementTransfer.update({
          where: { id: row.id, status: 'on_hold' },
          data: { status: 'releasing' }
        });
        ids.push(row.id);
      }
      return ids;
    });
    if (marked.length === 0) break;

    for (const id of marked) {
      const row = await prisma.settlementTransfer.findUnique({ where: { id } });
      if (!row || row.status !== 'releasing') continue;
      if (row.razorpayTransferId) {
        await client.setTransferHold(row.razorpayTransferId, false);
      }
      await prisma.$transaction(async (tx) => {
        await lockVendorForSettlement(tx, row.vendorId);
        const fresh = await tx.settlementTransfer.findUnique({ where: { id: row.id } });
        if (!fresh || fresh.status !== 'releasing') return;
        const vendor = await requireVendor(tx, row.vendorId);
        const releaseMilli = paiseToMilliBig(fresh.amountPaise - fresh.reversedPaise);
        const balanceMilli = vendor.settlementBalanceMilli - releaseMilli;
        await tx.vendor.update({
          where: { id: row.vendorId },
          data: { settlementBalanceMilli: balanceMilli }
        });
        await tx.settlementEntry.create({
          data: {
            id: randomUUID(),
            vendorId: row.vendorId,
            amountMilli: releaseMilli,
            direction: 'debit',
            balanceAfterMilli: balanceMilli,
            kind: 'transfer_release',
            idempotencyKey: `transfer-release:${row.id}`,
            settlementTransferId: row.id,
            customerPaymentId: row.customerPaymentId
          }
        });
        await tx.settlementTransfer.update({
          where: { id: row.id },
          data: { status: 'released', releasedAt: now }
        });
      });
      released += 1;
    }
    if (marked.length < RELEASE_BATCH_SIZE) break;
  }
  return { released };
}

async function canReleaseTransfer(
  tx: Tx,
  vendorId: string,
  row: { amountPaise: number; reversedPaise: number; eligibleAt: Date },
  now: Date,
  pendingReleaseTodayMilli = 0n
): Promise<boolean> {
  const vendor = await tx.vendor.findUnique({
    where: { id: vendorId },
    select: {
      releasesFrozenAt: true,
      releasesFrozenReason: true,
      settlementBankChangedAt: true,
      collectionStartedAt: true
    }
  });
  if (!vendor) return false;
  const adminFrozen =
    vendor.releasesFrozenAt != null &&
    (vendor.releasesFrozenReason == null || !vendor.releasesFrozenReason.startsWith('dispute:'));
  if (adminFrozen) return false;
  if (
    vendor.settlementBankChangedAt &&
    now.getTime() - vendor.settlementBankChangedAt.getTime() < BANK_CHANGE_PAUSE_MS
  ) {
    return false;
  }
  const openDispute = await tx.customerPayment.findFirst({
    where: { vendorId, disputeStatus: 'open' }
  });
  if (openDispute) return false;
  const refundBusy = await tx.customerRefund.findFirst({
    where: { vendorId, status: { in: [...REFUND_IN_PROGRESS] } }
  });
  if (refundBusy) return false;

  const capturedCount = await tx.customerPayment.count({
    where: { vendorId, settlementAlert: null, netMilli: { gt: 0 } }
  });
  const newShop = isNewShop({
    now,
    collectionStartedAt: vendor.collectionStartedAt,
    capturedPaymentCount: capturedCount
  });
  if (newShop) {
    const day = istDayKey(now);
    const releasedToday = await tx.settlementEntry.findMany({
      where: {
        vendorId,
        kind: 'transfer_release',
        createdAt: { gte: startOfIstDayUtc(day) }
      }
    });
    const releasedTodayMilli =
      releasedToday.reduce((s, e) => s + e.amountMilli, 0n) + pendingReleaseTodayMilli;
    const transferMilli = paiseToMilliBig(row.amountPaise - row.reversedPaise);
    const alone = transferMilli > NEW_SHOP_DAILY_RELEASE_CAP_MILLI;
    if (
      exceedsNewShopDailyCap({
        releasedTodayMilli,
        transferMilli,
        transferAlone: alone
      })
    ) {
      return false;
    }
  }
  return true;
}

function startOfIstDayUtc(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+05:30`);
}

export async function requestRefund(input: {
  vendorId: string;
  customerPaymentId: string;
  refundPaise: number;
  requestedBy: string;
}): Promise<{ refundId: string; status: string; shortfallMilli: bigint }> {
  return prisma.$transaction((tx) => requestRefundTx(tx, input));
}

export async function requestRefundTx(
  tx: Tx,
  input: {
    vendorId: string;
    customerPaymentId: string;
    refundPaise: number;
    requestedBy: string;
  }
): Promise<{ refundId: string; status: string; shortfallMilli: bigint }> {
  await lockVendorForSettlement(tx, input.vendorId);
  const payment = await tx.customerPayment.findUnique({ where: { id: input.customerPaymentId } });
  if (!payment || payment.vendorId !== input.vendorId) {
    throw createError('Payment not found', 404, ErrorType.NOT_FOUND);
  }
  if (payment.settlementAlert === 'net_not_positive' || payment.refundRequired) {
    throw createError('Payment must be refunded by ChatLogix ops', 409, ErrorType.PAYMENT);
  }
  if (payment.refundedPaise + input.refundPaise > payment.amountPaise) {
    throw createError('Refund exceeds captured amount', 400, ErrorType.PAYMENT);
  }

  const refundMilli = paiseToMilliBig(input.refundPaise);
  const transfers = await tx.settlementTransfer.findMany({
    where: {
      vendorId: input.vendorId,
      status: { in: [...ACTIVE_TRANSFER_STATUSES] }
    },
    orderBy: { createdAt: 'desc' }
  });
  const heldMilli = paiseToMilliBig(heldPaiseFromTransfers(transfers));

  if (heldMilli < refundMilli) {
    const shortfallMilli = refundMilli - heldMilli;
    const refund = await tx.customerRefund.create({
      data: {
        vendorId: input.vendorId,
        customerPaymentId: payment.id,
        amountPaise: input.refundPaise,
        status: 'awaiting_funding',
        shortfallMilli,
        reversalPlan: [],
        fundingExpiresAt: new Date(Date.now() + REFUND_DRAFT_TTL_MS),
        requestedBy: input.requestedBy
      }
    });
    return { refundId: refund.id, status: refund.status, shortfallMilli };
  }

  const plan = buildReversalPlan(transfers, payment.id, input.refundPaise);
  const vendor = await requireVendor(tx, input.vendorId);
  const balanceMilli = vendor.settlementBalanceMilli - refundMilli;
  await tx.vendor.update({
    where: { id: input.vendorId },
    data: { settlementBalanceMilli: balanceMilli }
  });
  const refund = await tx.customerRefund.create({
    data: {
      vendorId: input.vendorId,
      customerPaymentId: payment.id,
      amountPaise: input.refundPaise,
      status: 'submitting',
      shortfallMilli: 0n,
      reversalPlan: plan,
      requestedBy: input.requestedBy
    }
  });
  await tx.settlementEntry.create({
    data: {
      id: randomUUID(),
      vendorId: input.vendorId,
      amountMilli: refundMilli,
      direction: 'debit',
      balanceAfterMilli: balanceMilli,
      kind: 'refund_debit',
      idempotencyKey: `refund:${refund.id}`,
      customerPaymentId: payment.id,
      customerRefundId: refund.id
    }
  });
  return { refundId: refund.id, status: refund.status, shortfallMilli: 0n };
}

function buildReversalPlan(
  transfers: Array<{
    id: string;
    customerPaymentId: string;
    amountPaise: number;
    reversedPaise: number;
    createdAt: Date;
  }>,
  paymentId: string,
  refundPaise: number
): ReversalPlanItem[] {
  const plan: ReversalPlanItem[] = [];
  let remaining = refundPaise;
  const ordered = [...transfers].sort((a, b) => {
    if (a.customerPaymentId === paymentId && b.customerPaymentId !== paymentId) return -1;
    if (b.customerPaymentId === paymentId && a.customerPaymentId !== paymentId) return 1;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
  for (const row of ordered) {
    if (remaining <= 0) break;
    const free = Math.max(0, row.amountPaise - row.reversedPaise);
    if (free <= 0) continue;
    const take = Math.min(free, remaining);
    plan.push({ settlementTransferId: row.id, reversePaise: take });
    remaining -= take;
  }
  return plan;
}

export async function creditShopFundingTx(
  tx: Tx,
  input: {
    vendorId: string;
    customerRefundId: string;
    netMilli: bigint;
    razorpayPaymentId: string;
  }
): Promise<{ balanceMilli: bigint }> {
  await lockVendorForSettlement(tx, input.vendorId);
  const key = `shop-funding:${input.razorpayPaymentId}`;
  const existing = await tx.settlementEntry.findUnique({ where: { idempotencyKey: key } });
  const vendor = await requireVendor(tx, input.vendorId);
  if (existing) {
    return { balanceMilli: vendor.settlementBalanceMilli };
  }
  const balanceMilli = vendor.settlementBalanceMilli + input.netMilli;
  await tx.vendor.update({
    where: { id: input.vendorId },
    data: { settlementBalanceMilli: balanceMilli }
  });
  await tx.settlementEntry.create({
    data: {
      id: randomUUID(),
      vendorId: input.vendorId,
      amountMilli: input.netMilli,
      direction: 'credit',
      balanceAfterMilli: balanceMilli,
      kind: 'shop_funding',
      idempotencyKey: key,
      customerRefundId: input.customerRefundId
    }
  });

  const refund = await tx.customerRefund.findUnique({ where: { id: input.customerRefundId } });
  if (refund && refund.status === 'awaiting_funding') {
    const payment = await tx.customerPayment.findUnique({ where: { id: refund.customerPaymentId } });
    if (!payment) return { balanceMilli };
    const refundMilli = paiseToMilliBig(refund.amountPaise);
    const transfers = await tx.settlementTransfer.findMany({
      where: { vendorId: input.vendorId, status: { in: [...ACTIVE_TRANSFER_STATUSES] } },
      orderBy: { createdAt: 'desc' }
    });
    const heldMilli = paiseToMilliBig(heldPaiseFromTransfers(transfers));
    if (balanceMilli < refundMilli) {
      const shortfallMilli = refundMilli - balanceMilli;
      await tx.customerRefund.update({
        where: { id: refund.id },
        data: { shortfallMilli }
      });
      return { balanceMilli };
    }
    const plan = buildReversalPlan(transfers, payment.id, refund.amountPaise);
    const planPaise = plan.reduce((s, row) => s + row.reversePaise, 0);
    if (planPaise < refund.amountPaise && heldMilli + balanceMilli < refundMilli) {
      await tx.customerRefund.update({
        where: { id: refund.id },
        data: { shortfallMilli: refundMilli - balanceMilli }
      });
      return { balanceMilli };
    }
    const newBalance = balanceMilli - refundMilli;
    await tx.vendor.update({
      where: { id: input.vendorId },
      data: { settlementBalanceMilli: newBalance }
    });
    await tx.customerRefund.update({
      where: { id: refund.id },
      data: { status: 'submitting', shortfallMilli: 0n, reversalPlan: plan }
    });
    await tx.settlementEntry.create({
      data: {
        id: randomUUID(),
        vendorId: input.vendorId,
        amountMilli: refundMilli,
        direction: 'debit',
        balanceAfterMilli: newBalance,
        kind: 'refund_debit',
        idempotencyKey: `refund:${refund.id}`,
        customerPaymentId: payment.id,
        customerRefundId: refund.id
      }
    });
    return { balanceMilli: newBalance };
  }
  return { balanceMilli };
}

export async function submitRefund(refundId: string): Promise<void> {
  const refund = await prisma.customerRefund.findUnique({
    where: { id: refundId },
    include: { customerPayment: true }
  });
  if (!refund || refund.status !== 'submitting') return;
  const client = resolveRouteClient();
  const plan = refund.reversalPlan as ReversalPlanItem[];
  for (const item of plan) {
    const row = await prisma.settlementTransfer.findUnique({ where: { id: item.settlementTransferId } });
    if (!row?.razorpayTransferId) continue;
    const existing = await client.fetchTransferReversals(row.razorpayTransferId);
    const already = existing.some((r) => r.amount === item.reversePaise);
    if (!already) {
      await client.reverseTransfer(row.razorpayTransferId, item.reversePaise);
    }
    await prisma.settlementTransfer.update({
      where: { id: row.id },
      data: { reversedPaise: row.reversedPaise + item.reversePaise }
    });
  }
  const created = await client.createRefund({
    paymentId: refund.customerPayment.razorpayPaymentId,
    amountPaise: refund.amountPaise,
    speed: 'normal',
    notes: { customerRefundId: refund.id }
  });
  await prisma.customerRefund.update({
    where: { id: refund.id },
    data: { status: 'submitted', razorpayRefundId: created.id }
  });
}

export async function applyRefundStateTx(
  tx: Tx,
  input: { customerRefundId: string; event: 'processed' | 'failed'; razorpayRefundId?: string }
): Promise<void> {
  const refund = await tx.customerRefund.findUnique({ where: { id: input.customerRefundId } });
  if (!refund) return;
  await lockVendorForSettlement(tx, refund.vendorId);
  if (input.event === 'processed') {
    if (refund.status === 'processed') return;
    await tx.customerRefund.update({
      where: { id: refund.id },
      data: {
        status: 'processed',
        razorpayRefundId: input.razorpayRefundId ?? refund.razorpayRefundId
      }
    });
    const payment = await tx.customerPayment.findUnique({
      where: { id: refund.customerPaymentId },
      include: { order: { select: { id: true, status: true } } }
    });
    if (payment) {
      const refundedPaise = payment.refundedPaise + refund.amountPaise;
      const fullRefund = refundedPaise === payment.amountPaise;
      await tx.customerPayment.update({
        where: { id: payment.id },
        data: {
          refundedPaise,
          status: fullRefund ? 'refunded' : 'partially_refunded'
        }
      });
      const order = payment.order;
      if (order && fullRefund && order.status !== 'delivered' && order.status !== 'cancelled') {
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: 'Full refund processed' }
        });
      }
    }
  } else if (refund.status !== 'failed') {
    await tx.customerRefund.update({ where: { id: refund.id }, data: { status: 'failed' } });
    logger.error({ customerRefundId: refund.id }, 'Refund failed at Razorpay; ops retry required');
  }
}

export async function applyDisputeTx(
  tx: Tx,
  input: {
    vendorId: string;
    customerPaymentId: string;
    disputeId: string;
    phase: 'created' | 'deducted' | 'won';
    deductPaise?: number;
  }
): Promise<void> {
  await lockVendorForSettlement(tx, input.vendorId);
  if (input.phase === 'created') {
    await tx.vendor.update({
      where: { id: input.vendorId },
      data: {
        releasesFrozenAt: new Date(),
        releasesFrozenReason: `dispute:${input.disputeId}`
      }
    });
    await tx.customerPayment.update({
      where: { id: input.customerPaymentId },
      data: { disputeStatus: 'open' }
    });
    return;
  }
  if (input.phase === 'deducted') {
    const deductMilli = paiseToMilliBig(input.deductPaise ?? 0);
    const key = `dispute-debit:${input.disputeId}`;
    const existing = await tx.settlementEntry.findUnique({ where: { idempotencyKey: key } });
    if (existing) return;
    const vendor = await requireVendor(tx, input.vendorId);
    const balanceMilli = vendor.settlementBalanceMilli - deductMilli;
    await tx.vendor.update({
      where: { id: input.vendorId },
      data: { settlementBalanceMilli: balanceMilli }
    });
    await tx.settlementEntry.create({
      data: {
        id: randomUUID(),
        vendorId: input.vendorId,
        amountMilli: deductMilli,
        direction: 'debit',
        balanceAfterMilli: balanceMilli,
        kind: 'dispute_debit',
        idempotencyKey: key,
        customerPaymentId: input.customerPaymentId
      }
    });
    return;
  }
  if (input.phase === 'won') {
    const key = `dispute-credit:${input.disputeId}`;
    const existing = await tx.settlementEntry.findUnique({ where: { idempotencyKey: key } });
    if (existing) return;
    const vendor = await requireVendor(tx, input.vendorId);
    const creditMilli = paiseToMilliBig(input.deductPaise ?? 0);
    const balanceMilli = vendor.settlementBalanceMilli + creditMilli;
    await tx.vendor.update({
      where: { id: input.vendorId },
      data: { settlementBalanceMilli: balanceMilli }
    });
    await tx.settlementEntry.create({
      data: {
        id: randomUUID(),
        vendorId: input.vendorId,
        amountMilli: creditMilli,
        direction: 'credit',
        balanceAfterMilli: balanceMilli,
        kind: 'dispute_credit',
        idempotencyKey: key,
        customerPaymentId: input.customerPaymentId
      }
    });
    const payment = await tx.customerPayment.findUnique({ where: { id: input.customerPaymentId } });
    if (payment && creditMilli > 0n) {
      const paise = Number(creditMilli / 10n);
      const holdMs = holdMsForShop({
        now: new Date(),
        collectionStartedAt: vendor.collectionStartedAt,
        capturedPaymentCount: 1
      });
      await tx.settlementTransfer.create({
        data: {
          id: randomUUID(),
          vendorId: input.vendorId,
          customerPaymentId: input.customerPaymentId,
          amountPaise: paise,
          kind: 'dispute_return',
          status: 'to_create',
          eligibleAt: transferEligibleAt(new Date(), holdMs)
        }
      });
    }
    await tx.customerPayment.update({
      where: { id: input.customerPaymentId },
      data: { disputeStatus: 'won' }
    });
    const openDispute = await tx.customerPayment.findFirst({
      where: { vendorId: input.vendorId, disputeStatus: 'open' }
    });
    if (!openDispute) {
      const vendor = await tx.vendor.findUnique({
        where: { id: input.vendorId },
        select: { releasesFrozenReason: true }
      });
      if (vendor?.releasesFrozenReason?.startsWith('dispute:')) {
        await tx.vendor.update({
          where: { id: input.vendorId },
          data: { releasesFrozenAt: null, releasesFrozenReason: null }
        });
      }
    }
  }
}

/** F7 — refund a flagged capture from ChatLogix's Razorpay account (no ledger). */
export async function submitFlaggedCaptureRefundTx(
  tx: Tx,
  customerPaymentId: string
): Promise<{ submitPlatformRefund: boolean }> {
  const payment = await tx.customerPayment.findUnique({ where: { id: customerPaymentId } });
  if (!payment) return { submitPlatformRefund: false };
  if (!payment.refundRequired && payment.settlementAlert !== 'net_not_positive') {
    return { submitPlatformRefund: false };
  }
  if (payment.refundedPaise >= payment.amountPaise) return { submitPlatformRefund: false };
  const existing = await tx.customerRefund.findFirst({
    where: { customerPaymentId, status: { not: 'cancelled' } }
  });
  if (existing) return { submitPlatformRefund: false };
  await tx.customerRefund.create({
    data: {
      vendorId: payment.vendorId,
      customerPaymentId: payment.id,
      amountPaise: payment.amountPaise - payment.refundedPaise,
      status: 'submitting',
      shortfallMilli: 0n,
      reversalPlan: [],
      requestedBy: 'platform_ops'
    }
  });
  logger.error(
    { customerPaymentId, razorpayPaymentId: payment.razorpayPaymentId, alert: payment.settlementAlert },
    'Flagged capture queued for platform refund (F7)'
  );
  return { submitPlatformRefund: true };
}

/** Phase 10 — credit withheld TCS/TDS back to the shop when the CA refund rule applies. */
export async function creditWithheldTaxRefundAdjustmentTx(
  tx: Tx,
  input: {
    vendorId: string;
    customerPaymentId: string;
    customerRefundId: string;
    yearMonth: string;
    creditPaise: number;
  }
): Promise<boolean> {
  if (input.creditPaise <= 0) return false;
  const key = `tax-withheld-refund:${input.yearMonth}:${input.customerRefundId}`;
  const existing = await tx.settlementEntry.findUnique({ where: { idempotencyKey: key } });
  if (existing) return false;

  await lockVendorForSettlement(tx, input.vendorId);
  const vendor = await requireVendor(tx, input.vendorId);
  const creditMilli = paiseToMilliBig(input.creditPaise);
  const balanceMilli = vendor.settlementBalanceMilli + creditMilli;
  await tx.vendor.update({
    where: { id: input.vendorId },
    data: { settlementBalanceMilli: balanceMilli }
  });
  await tx.settlementEntry.create({
    data: {
      id: randomUUID(),
      vendorId: input.vendorId,
      amountMilli: creditMilli,
      direction: 'credit',
      balanceAfterMilli: balanceMilli,
      kind: 'adjustment',
      idempotencyKey: key,
      customerPaymentId: input.customerPaymentId,
      customerRefundId: input.customerRefundId,
      metadata: {
        reason: 'withheld_tax_refund',
        yearMonth: input.yearMonth,
        creditPaise: input.creditPaise
      }
    }
  });
  return true;
}

export async function expireRefundDrafts(now: Date = new Date()): Promise<{ cancelled: number }> {
  const result = await prisma.customerRefund.updateMany({
    where: {
      status: 'awaiting_funding',
      fundingExpiresAt: { lte: now }
    },
    data: { status: 'cancelled' }
  });
  return { cancelled: result.count };
}

export async function getSettlementPosition(vendorId: string, now: Date = new Date()) {
  return prisma.$transaction(async (tx) => {
    await lockVendorForSettlement(tx, vendorId);
    const vendor = await requireVendor(tx, vendorId);
    const transfers = await tx.settlementTransfer.findMany({ where: { vendorId } });
    const summary = summarizeSettlement({
      balanceMilli: vendor.settlementBalanceMilli,
      transfers
    });
    const onHold = transfers.filter((t) => t.status === 'on_hold');
    const futureEligible = onHold
      .map((t) => t.eligibleAt)
      .filter((d) => d.getTime() > now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    const nextReleaseAt = futureEligible[0] ?? null;
    const releasedAgg = await tx.settlementEntry.aggregate({
      where: { vendorId, kind: 'transfer_release' },
      _sum: { amountMilli: true }
    });
    return {
      balanceMilli: vendor.settlementBalanceMilli,
      ...summary,
      releasedMilli: releasedAgg._sum.amountMilli ?? 0n,
      nextReleaseAt,
      asOf: now
    };
  });
}

export async function getVendorSettlementOverview(vendorId: string, now: Date = new Date()) {
  const position = await getSettlementPosition(vendorId, now);
  const awaitingFunding = await prisma.customerRefund.findMany({
    where: { vendorId, status: 'awaiting_funding', shortfallMilli: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      amountPaise: true,
      shortfallMilli: true,
      fundingExpiresAt: true,
      customerPaymentId: true
    }
  });
  const transfers = await prisma.settlementTransfer.findMany({
    where: { vendorId, status: { in: ['on_hold', 'releasing', 'released'] } },
    orderBy: { eligibleAt: 'asc' },
    take: 50,
    select: {
      id: true,
      amountPaise: true,
      reversedPaise: true,
      kind: true,
      status: true,
      eligibleAt: true,
      releasedAt: true,
      customerPaymentId: true
    }
  });
  return { position, awaitingFunding, transfers };
}

async function requireVendor(tx: Tx, vendorId: string) {
  const vendor = await tx.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      settlementBalanceMilli: true,
      paymentFeeBps: true,
      walletBalanceMilli: true,
      collectionStartedAt: true,
      rollingReserveBps: true,
      panEncrypted: true,
      razorpayLinkedAccountId: true
    }
  });
  if (!vendor) throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  return vendor;
}
