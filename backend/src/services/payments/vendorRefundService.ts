import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { requestRefund, submitRefund } from './settlementService.js';

export async function startVendorOrderRefund(input: {
  vendorId: string;
  orderId: string;
  refundPaise?: number;
  requestedBy: string;
}) {
  const payment = await prisma.customerPayment.findFirst({
    where: {
      orderId: input.orderId,
      vendorId: input.vendorId,
      settlementAlert: null,
      refundRequired: false,
      netMilli: { gt: 0 }
    },
    orderBy: { capturedAt: 'desc' }
  });

  if (!payment) {
    const flagged = await prisma.customerPayment.findFirst({
      where: { orderId: input.orderId, vendorId: input.vendorId }
    });
    if (flagged?.refundRequired || flagged?.settlementAlert === 'net_not_positive') {
      throw createError(
        'This payment must be refunded by ChatLogix support',
        409,
        ErrorType.PAYMENT
      );
    }
    throw createError('No refundable payment on this order', 404, ErrorType.NOT_FOUND);
  }

  const remainder = payment.amountPaise - payment.refundedPaise;
  if (remainder <= 0) {
    throw createError('Nothing left to refund on this payment', 409, ErrorType.PAYMENT);
  }

  const refundPaise = input.refundPaise ?? remainder;
  if (refundPaise <= 0 || refundPaise > remainder) {
    throw createError('Invalid refund amount', 400, ErrorType.VALIDATION);
  }

  const result = await requestRefund({
    vendorId: input.vendorId,
    customerPaymentId: payment.id,
    refundPaise,
    requestedBy: input.requestedBy
  });

  if (result.status === 'submitting') {
    await submitRefund(result.refundId);
  }

  const refund = await prisma.customerRefund.findUnique({ where: { id: result.refundId } });
  return {
    refundId: result.refundId,
    status: result.status,
    shortfallMilli: result.shortfallMilli.toString(),
    amountPaise: refund?.amountPaise ?? refundPaise,
    customerPaymentId: payment.id
  };
}
