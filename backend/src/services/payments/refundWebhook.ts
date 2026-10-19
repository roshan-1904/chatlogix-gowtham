import type { Prisma } from '@prisma/client';
import { logger } from '../../logger.js';
import { quoteOrderSettlement } from './settlementMath.js';
import { taxRatesForVendorId } from './settlementTax.js';
import {
  applyDisputeTx,
  applyRefundStateTx,
  creditShopFundingTx,
  submitFlaggedCaptureRefundTx
} from './settlementService.js';
import type {
  RazorpayDisputeEntity,
  RazorpayPaymentEntity,
  RazorpayRefundEntity
} from './razorpayApiClient.js';

type Tx = Prisma.TransactionClient;

export async function handleShopFundingCapturedInTx(
  tx: Tx,
  payment: RazorpayPaymentEntity,
  providerEventId: string
): Promise<{ submitRefundId?: string }> {
  const notes = payment.notes ?? {};
  const vendorId = notes.vendorId?.trim();
  const customerRefundId = notes.customerRefundId?.trim();
  if (!vendorId || !customerRefundId) {
    logger.warn({ providerEventId, paymentId: payment.id }, 'shop_funding capture missing vendorId/customerRefundId');
    return {};
  }

  const vendor = await tx.vendor.findUnique({
    where: { id: vendorId },
    select: { paymentFeeBps: true, panEncrypted: true }
  });
  if (!vendor) return {};

  const taxRates = taxRatesForVendorId(vendor);
  const quote = quoteOrderSettlement({
    amountPaise: payment.amount,
    gatewayFeePaise: payment.fee ?? 0,
    gatewayTaxPaise: payment.tax ?? 0,
    paymentFeeBps: vendor.paymentFeeBps,
    gstTcsBps: taxRates.gstTcsBps,
    tdsBps: taxRates.tdsBps
  });

  await creditShopFundingTx(tx, {
    vendorId,
    customerRefundId,
    netMilli: quote.netMilli,
    razorpayPaymentId: payment.id
  });

  const refund = await tx.customerRefund.findUnique({ where: { id: customerRefundId } });
  if (refund?.status === 'submitting') {
    return { submitRefundId: refund.id };
  }
  return {};
}

export async function handleRefundStateInTx(
  tx: Tx,
  refund: RazorpayRefundEntity,
  event: 'processed' | 'failed'
): Promise<void> {
  const customerRefundId = refund.notes?.customerRefundId?.trim();
  if (!customerRefundId) {
    logger.warn({ refundId: refund.id }, 'refund webhook missing notes.customerRefundId');
    return;
  }
  await applyRefundStateTx(tx, { customerRefundId, event, razorpayRefundId: refund.id });
}

export async function handleDisputeWebhookInTx(
  tx: Tx,
  eventType: string,
  dispute: RazorpayDisputeEntity
): Promise<void> {
  const paymentId = dispute.payment_id;
  if (!paymentId) return;

  const payment = await tx.customerPayment.findUnique({
    where: { razorpayPaymentId: paymentId }
  });
  if (!payment) {
    logger.warn({ disputeId: dispute.id, paymentId }, 'dispute for unknown customer payment');
    return;
  }

  if (eventType === 'payment.dispute.created') {
    await applyDisputeTx(tx, {
      vendorId: payment.vendorId,
      customerPaymentId: payment.id,
      disputeId: dispute.id,
      phase: 'created'
    });
    return;
  }

  const deductPaise = dispute.amount_deducted ?? dispute.amount ?? payment.amountPaise;
  if (
    eventType === 'payment.dispute.lost' ||
    (eventType === 'payment.dispute.created' && (dispute.amount_deducted ?? 0) > 0)
  ) {
    await applyDisputeTx(tx, {
      vendorId: payment.vendorId,
      customerPaymentId: payment.id,
      disputeId: dispute.id,
      phase: 'deducted',
      deductPaise
    });
  }

  if (
    eventType === 'payment.dispute.won' ||
    (eventType === 'payment.dispute.closed' && dispute.status === 'won')
  ) {
    await applyDisputeTx(tx, {
      vendorId: payment.vendorId,
      customerPaymentId: payment.id,
      disputeId: dispute.id,
      phase: 'won',
      deductPaise
    });
  }
}

export async function maybeFlaggedCaptureRefundInTx(
  tx: Tx,
  customerPaymentId: string
): Promise<{ submitPlatformRefund: boolean }> {
  return submitFlaggedCaptureRefundTx(tx, customerPaymentId);
}
