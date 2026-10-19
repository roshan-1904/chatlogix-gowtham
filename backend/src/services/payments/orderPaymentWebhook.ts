import type { Prisma } from '@prisma/client';
import { logger } from '../../logger.js';
import { creditCapturedPaymentTx } from './settlementService.js';
import { maybeFlaggedCaptureRefundInTx } from './refundWebhook.js';
import type { RazorpayPaymentEntity } from './razorpayApiClient.js';
import type { RazorpayWebhookPayload } from './razorpayWebhookDispatch.js';

type Tx = Prisma.TransactionClient;

export async function handleOrderPaymentCapturedInTx(
  tx: Tx,
  payment: RazorpayPaymentEntity,
  providerEventId: string
): Promise<{
  shouldCreateTransfers: boolean;
  orderId?: string;
  submitPlatformRefund?: boolean;
  platformRefundPaymentId?: string;
}> {
  const notes = payment.notes ?? {};
  const orderId = notes.orderId?.trim();
  const vendorId = notes.vendorId?.trim();
  if (!orderId || !vendorId) {
    logger.warn({ providerEventId, paymentId: payment.id }, 'order_payment capture missing orderId/vendorId notes');
    return { shouldCreateTransfers: false };
  }

  if (payment.status !== 'captured') {
    logger.warn({ providerEventId, paymentId: payment.id, status: payment.status }, 'order_payment fetch not captured');
    return { shouldCreateTransfers: false };
  }

  const linkId =
    notes.payment_link_id ??
    notes.razorpay_payment_link_id ??
    undefined;

  const result = await creditCapturedPaymentTx(tx, {
    vendorId,
    orderId,
    amountPaise: payment.amount,
    gatewayFeePaise: payment.fee ?? 0,
    gatewayTaxPaise: payment.tax ?? 0,
    currency: payment.currency,
    razorpayPaymentId: payment.id,
    razorpayPaymentLinkId: linkId ?? null
  });

  if (linkId) {
    await tx.paymentLink.updateMany({
      where: { razorpayLinkId: linkId, orderId },
      data: { status: 'paid' }
    });
  } else {
    await tx.paymentLink.updateMany({
      where: { orderId, status: 'created' },
      data: { status: 'paid' }
    });
  }

  if (!result.guardFailed && !result.blocked && !result.alreadyCredited) {
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'confirmed', confirmedAt: new Date() }
    });
  }

  const shouldCreateTransfers =
    !result.alreadyCredited && !result.guardFailed && !result.blocked;

  let submitPlatformRefund = false;
  if (result.blocked || result.guardFailed) {
    const flagged = await maybeFlaggedCaptureRefundInTx(tx, result.paymentId);
    submitPlatformRefund = flagged.submitPlatformRefund;
  }

  return { shouldCreateTransfers, orderId, submitPlatformRefund, platformRefundPaymentId: result.paymentId };
}

export async function handlePaymentLinkExpiredInTx(
  tx: Tx,
  body: RazorpayWebhookPayload
): Promise<void> {
  const entity = body.payload?.payment_link?.entity;
  const linkId = entity?.id;
  const notes = entity?.notes ?? {};
  const orderId = notes.orderId?.trim();
  if (!linkId) return;

  await tx.paymentLink.updateMany({
    where: { razorpayLinkId: linkId },
    data: { status: 'expired' }
  });

  if (orderId) {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, vendorId: true } });
    if (order?.status === 'awaiting_payment') {
      logger.info(
        { orderId, vendorId: order.vendorId, linkId },
        'Payment link expired — order remains awaiting_payment; shop should resend, switch to COD, or cancel'
      );
    }
  }
}

export function extractPaymentIdFromPaymentLinkPaid(body: RazorpayWebhookPayload): string | undefined {
  return body.payload?.payment?.entity?.id ?? body.payload?.payment_link?.entity?.id;
}
