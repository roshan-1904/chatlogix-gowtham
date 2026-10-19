/**
 * Phase 9 — reconciliation sweeps, ledger/Route checks, payment-link expiry reminder.
 * Each repair path reuses the same handlers as webhooks or settlement jobs (rule 13).
 */

import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger.js';
import { emitMetric } from '../../observability/metrics.js';
import { WhatsAppTemplateService } from '../whatsappTemplateService.js';
import { handleOrderPaymentCapturedInTx } from './orderPaymentWebhook.js';
import {
  getPaymentLinkRazorpayClient,
  type PaymentLinkRazorpayClient
} from './paymentLinkRazorpayClient.js';
import { getRazorpayApiClient, type RazorpayApiClient } from './razorpayApiClient.js';
import { handleDisputeWebhookInTx, handleRefundStateInTx } from './refundWebhook.js';
import { getRouteClient, type RouteClient } from './routeClient.js';
import {
  createPendingTransfers,
  finishReleasingTransfers,
  submitRefund
} from './settlementService.js';

const STALE_LINK_MIN_AGE_MS = 15 * 60 * 1000;
const REMINDER_WINDOW_MS = 2 * 60 * 60 * 1000;
const REMINDER_TEMPLATES = ['payment_link_reminder', 'payment_link_reminder_utility'] as const;
const DAILY_PAYMENT_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000;

const CREDIT_ENTRY_KINDS = new Set(['payment_credit', 'shop_funding', 'dispute_credit']);
const DEBIT_ENTRY_KINDS = new Set(['transfer_release', 'refund_debit', 'dispute_debit']);

let paymentLinkClientOverride: PaymentLinkRazorpayClient | null = null;
let razorpayApiOverride: RazorpayApiClient | null = null;
let routeClientOverride: RouteClient | null = null;

export function setPaymentReconciliationClientsForTests(input: {
  paymentLinks?: PaymentLinkRazorpayClient | null;
  razorpay?: RazorpayApiClient | null;
  route?: RouteClient | null;
}): void {
  if ('paymentLinks' in input) paymentLinkClientOverride = input.paymentLinks ?? null;
  if ('razorpay' in input) razorpayApiOverride = input.razorpay ?? null;
  if ('route' in input) routeClientOverride = input.route ?? null;
}

function paymentLinks(): PaymentLinkRazorpayClient {
  return paymentLinkClientOverride ?? getPaymentLinkRazorpayClient();
}

function razorpayApi(): RazorpayApiClient {
  return razorpayApiOverride ?? getRazorpayApiClient();
}

function routeClient(): RouteClient {
  return routeClientOverride ?? getRouteClient();
}

export interface IntentSweepResult {
  transfersCreated: number;
  releasingFinished: number;
  refundsSubmitted: number;
  remindersSent: number;
}

export async function runSettlementIntentSweep(now: Date = new Date()): Promise<IntentSweepResult> {
  const [{ created }, { finished }] = await Promise.all([
    createPendingTransfers(now),
    finishReleasingTransfers(now)
  ]);

  const submitting = await prisma.customerRefund.findMany({
    where: { status: 'submitting' },
    select: { id: true }
  });
  let refundsSubmitted = 0;
  for (const row of submitting) {
    try {
      await submitRefund(row.id);
      refundsSubmitted += 1;
    } catch (err) {
      logger.error({ err, customerRefundId: row.id }, 'submitRefund in intent sweep failed');
    }
  }

  const { sent: remindersSent } = await sendPaymentLinkExpiryReminders(now);

  logger.info(
    { created, finished, refundsSubmitted, remindersSent },
    'settlement intent sweep complete'
  );
  return {
    transfersCreated: created,
    releasingFinished: finished,
    refundsSubmitted,
    remindersSent
  };
}

export interface DailySweepResult {
  staleLinksApplied: number;
  refundsSynced: number;
  disputesSynced: number;
  paymentAlerts: number;
  ledgerMismatches: number;
  routeMismatches: number;
  platformFeeInvoicesIssued: number;
}

export async function runSettlementDailySweep(now: Date = new Date()): Promise<DailySweepResult> {
  const staleLinksApplied = await reconcileStalePaymentLinks(now);
  const refundsSynced = await reconcileRefundStatesFromRazorpay();
  const disputesSynced = await reconcileOpenDisputesFromRazorpay();
  const paymentAlerts = await alertPaymentIntegrityIssues(now);
  const { mismatches: ledgerMismatches } = await runSettlementLedgerCheck();
  const { mismatches: routeMismatches } = await runSettlementRouteCheck();
  let platformFeeInvoicesIssued = 0;
  try {
    const { issueDuePlatformFeeInvoices } = await import('./platformFeeInvoiceService.js');
    platformFeeInvoicesIssued = await issueDuePlatformFeeInvoices(now);
  } catch (err) {
    logger.error({ err }, 'platform fee invoice batch failed during daily sweep');
  }

  logger.info(
    {
      staleLinksApplied,
      refundsSynced,
      disputesSynced,
      paymentAlerts,
      ledgerMismatches,
      routeMismatches,
      platformFeeInvoicesIssued
    },
    'settlement daily sweep complete'
  );
  return {
    staleLinksApplied,
    refundsSynced,
    disputesSynced,
    paymentAlerts,
    ledgerMismatches,
    routeMismatches,
    platformFeeInvoicesIssued
  };
}

async function reconcileStalePaymentLinks(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - STALE_LINK_MIN_AGE_MS);
  const links = await prisma.paymentLink.findMany({
    where: { status: 'created', createdAt: { lte: cutoff } },
    take: 50,
    orderBy: { createdAt: 'asc' }
  });
  let applied = 0;
  for (const link of links) {
    try {
      const remote = await paymentLinks().fetchPaymentLink(link.razorpayLinkId);
      if (remote.status !== 'paid') continue;
      const paymentId = remote.payments?.find((p) => p.id)?.id;
      if (!paymentId) {
        logger.warn({ linkId: link.id, razorpayLinkId: link.razorpayLinkId }, 'paid link missing payment id');
        continue;
      }
      const payment = await razorpayApi().fetchPayment(paymentId);
      if (payment.status !== 'captured') continue;

      let shouldCreateTransfers = false;
      await prisma.$transaction(async (tx) => {
        const outcome = await handleOrderPaymentCapturedInTx(tx, payment, `reconcile:link:${link.id}`);
        shouldCreateTransfers = outcome.shouldCreateTransfers;
      });
      if (shouldCreateTransfers) {
        await createPendingTransfers(now).catch((err) => {
          logger.error({ err, linkId: link.id }, 'createPendingTransfers after stale link reconcile failed');
        });
      }
      applied += 1;
    } catch (err) {
      logger.error({ err, linkId: link.id }, 'reconcileStalePaymentLinks row failed');
    }
  }
  return applied;
}

async function reconcileRefundStatesFromRazorpay(): Promise<number> {
  const rows = await prisma.customerRefund.findMany({
    where: {
      razorpayRefundId: { not: null },
      status: { in: ['submitted', 'submitting'] }
    },
    take: 100
  });
  let synced = 0;
  for (const row of rows) {
    const refundId = row.razorpayRefundId;
    if (!refundId) continue;
    try {
      const remote = await razorpayApi().fetchRefund(refundId);
      if (remote.status === 'processed' && row.status !== 'processed') {
        await prisma.$transaction((tx) => handleRefundStateInTx(tx, remote, 'processed'));
        synced += 1;
      } else if (remote.status === 'failed' && row.status !== 'failed') {
        await prisma.$transaction((tx) => handleRefundStateInTx(tx, remote, 'failed'));
        synced += 1;
      }
    } catch (err) {
      logger.error({ err, customerRefundId: row.id }, 'reconcileRefundStatesFromRazorpay row failed');
    }
  }

  const missingLedger = await prisma.customerRefund.findMany({
    where: { status: { in: ['submitting', 'submitted', 'processed'] } },
    take: 100,
    select: { id: true, vendorId: true, status: true }
  });
  for (const row of missingLedger) {
    const entry = await prisma.settlementEntry.findUnique({
      where: { idempotencyKey: `refund:${row.id}` }
    });
    if (!entry && row.status !== 'awaiting_funding' && row.status !== 'cancelled') {
      logger.error(
        { customerRefundId: row.id, vendorId: row.vendorId, status: row.status },
        'settlement reconciliation: refund without refund_debit ledger row'
      );
      emitMetric('SettlementRefundLedgerMissing', 1, { dimensions: { vendorId: row.vendorId } });
      synced += 1;
    }
  }
  return synced;
}

async function reconcileOpenDisputesFromRazorpay(): Promise<number> {
  const open = await prisma.customerPayment.findMany({
    where: { disputeStatus: 'open' },
    take: 50,
    select: { id: true, vendorId: true, razorpayPaymentId: true }
  });
  let synced = 0;
  for (const payment of open) {
    const debitKeyPrefix = 'dispute-debit:';
    const existingDebit = await prisma.settlementEntry.findFirst({
      where: {
        customerPaymentId: payment.id,
        kind: 'dispute_debit',
        idempotencyKey: { startsWith: debitKeyPrefix }
      }
    });
    if (existingDebit) continue;

    for (const [disputeId, dispute] of await listDisputesForPayment(payment.razorpayPaymentId)) {
      if (dispute.status === 'lost' || dispute.amount_deducted) {
        await prisma.$transaction((tx) =>
          handleDisputeWebhookInTx(tx, 'payment.dispute.lost', dispute)
        );
        synced += 1;
        void disputeId;
      }
    }
  }
  return synced;
}

async function listDisputesForPayment(
  paymentId: string
): Promise<Array<[string, import('./razorpayApiClient.js').RazorpayDisputeEntity]>> {
  const api = razorpayApi() as RazorpayApiClient & {
    disputesForPayment?: (paymentId: string) => Promise<import('./razorpayApiClient.js').RazorpayDisputeEntity[]>;
  };
  if (typeof api.disputesForPayment !== 'function') return [];
  const list = await api.disputesForPayment(paymentId);
  return list.map((d) => [d.id, d] as const);
}

async function alertPaymentIntegrityIssues(now: Date): Promise<number> {
  const since = new Date(now.getTime() - DAILY_PAYMENT_LOOKBACK_MS);
  const payments = await prisma.customerPayment.findMany({
    where: {
      capturedAt: { gte: since },
      settlementAlert: null,
      netMilli: { gt: 0 }
    },
    take: 200
  });
  let alerts = 0;
  for (const row of payments) {
    try {
      const remote = await razorpayApi().fetchPayment(row.razorpayPaymentId);
      if (remote.status !== 'captured') {
        logger.error(
          { customerPaymentId: row.id, razorpayPaymentId: row.razorpayPaymentId, remoteStatus: remote.status },
          'settlement reconciliation: local credit without captured payment at Razorpay'
        );
        emitMetric('SettlementPaymentNotCaptured', 1, { dimensions: { vendorId: row.vendorId } });
        alerts += 1;
        continue;
      }
      const feeTotal =
        row.gatewayFeePaise +
        row.gatewayTaxPaise +
        row.platformFeePaise +
        row.platformFeeGstPaise +
        row.gstTcsPaise +
        row.tdsPaise;
      const netFromParts = row.amountPaise - feeTotal;
      const netPaiseStored = Number(row.netMilli / 10n);
      if (
        remote.amount !== row.amountPaise ||
        (remote.fee ?? 0) !== row.gatewayFeePaise ||
        (remote.tax ?? 0) !== row.gatewayTaxPaise ||
        netFromParts !== netPaiseStored
      ) {
        logger.error(
          {
            customerPaymentId: row.id,
            amountPaise: row.amountPaise,
            remoteAmount: remote.amount,
            netFromParts,
            netPaiseStored
          },
          'settlement reconciliation: payment fee/net parts do not add up'
        );
        emitMetric('SettlementPaymentMathMismatch', 1, { dimensions: { vendorId: row.vendorId } });
        alerts += 1;
      }
    } catch (err) {
      logger.error(
        { err, customerPaymentId: row.id, razorpayPaymentId: row.razorpayPaymentId },
        'settlement reconciliation: could not fetch payment at Razorpay for credited row'
      );
      emitMetric('SettlementPaymentNotCaptured', 1, { dimensions: { vendorId: row.vendorId } });
      alerts += 1;
    }
  }
  return alerts;
}

export async function runSettlementLedgerCheck(): Promise<{ mismatches: number }> {
  const vendorIds = await prisma.settlementEntry.findMany({
    distinct: ['vendorId'],
    select: { vendorId: true }
  });
  let mismatches = 0;
  for (const { vendorId } of vendorIds) {
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { settlementBalanceMilli: true }
    });
    if (!vendor) continue;
    const entries = await prisma.settlementEntry.findMany({
      where: { vendorId },
      select: { amountMilli: true, direction: true, kind: true }
    });
    let sum = 0n;
    for (const e of entries) {
      if (e.kind === 'adjustment') {
        sum += e.direction === 'credit' ? e.amountMilli : -e.amountMilli;
      } else if (CREDIT_ENTRY_KINDS.has(e.kind)) {
        sum += e.amountMilli;
      } else if (DEBIT_ENTRY_KINDS.has(e.kind)) {
        sum -= e.amountMilli;
      }
    }
    if (sum !== vendor.settlementBalanceMilli) {
      logger.error(
        {
          vendorId,
          cachedBalanceMilli: vendor.settlementBalanceMilli.toString(),
          ledgerSumMilli: sum.toString()
        },
        'settlement ledger check: cached balance differs from ledger sum'
      );
      emitMetric('SettlementLedgerMismatch', 1, { dimensions: { vendorId } });
      mismatches += 1;
    }
  }
  return { mismatches };
}

export async function runSettlementRouteCheck(): Promise<{ mismatches: number }> {
  const vendors = await prisma.vendor.findMany({
    where: {
      razorpayLinkedAccountId: { not: null },
      settlementTransfers: { some: { status: 'on_hold' } }
    },
    select: { id: true, razorpayLinkedAccountId: true }
  });
  let mismatches = 0;
  const client = routeClient();
  for (const vendor of vendors) {
    const linkedAccountId = vendor.razorpayLinkedAccountId;
    if (!linkedAccountId) continue;
    const onHold = await prisma.settlementTransfer.findMany({
      where: { vendorId: vendor.id, status: 'on_hold' },
      select: { amountPaise: true, reversedPaise: true }
    });
    const localHeldPaise = onHold.reduce((s, t) => s + (t.amountPaise - t.reversedPaise), 0);
    let remoteHeldPaise: number;
    try {
      remoteHeldPaise = await client.sumOnHoldTransferPaise(linkedAccountId);
    } catch (err) {
      logger.error({ err, vendorId: vendor.id, linkedAccountId }, 'settlement route check fetch failed');
      continue;
    }
    if (localHeldPaise !== remoteHeldPaise) {
      logger.error(
        { vendorId: vendor.id, localHeldPaise, remoteHeldPaise, linkedAccountId },
        'settlement route check: on-hold total differs from Razorpay'
      );
      emitMetric('SettlementRouteMismatch', 1, { dimensions: { vendorId: vendor.id } });
      mismatches += 1;
    }
  }
  return { mismatches };
}

export async function sendPaymentLinkExpiryReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_MS);
  const links = await prisma.paymentLink.findMany({
    where: {
      status: 'created',
      expiresAt: { lte: windowStart, gt: now }
    },
    take: 50,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          conversationId: true,
          customerId: true,
          customer: { select: { phone: true } }
        }
      }
    }
  });

  const whatsapp = new WhatsAppTemplateService();
  let sent = 0;
  for (const link of links) {
    const order = link.order;
    if (!order) continue;

    const prior = await prisma.notificationHistory.findFirst({
      where: {
        orderId: order.id,
        templateName: { in: [...REMINDER_TEMPLATES] }
      }
    });
    if (prior) continue;

    const lastCustomerMessage = await prisma.message.findFirst({
      where: { conversationId: order.conversationId, senderType: 'customer' },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true }
    });
    const outside24h =
      !lastCustomerMessage ||
      now.getTime() - lastCustomerMessage.timestamp.getTime() > 24 * 60 * 60 * 1000;

    const amountFormatted = `₹${(link.amountPaise / 100).toFixed(2)}`;
    const result = await whatsapp.sendPaymentLinkExpiryReminder({
      customerPhone: order.customer.phone,
      paymentLink: link.url,
      orderNumber: order.orderNumber,
      amountFormatted,
      orderId: order.id,
      vendorId: link.vendorId,
      customerId: order.customerId,
      useUtilityTemplate: outside24h
    });
    if (result.success) sent += 1;
  }
  return { sent };
}
