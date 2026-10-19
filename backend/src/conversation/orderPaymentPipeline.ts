import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import type { CartOp } from './types.js';
import { getPaymentLinkService } from '../services/paymentLinkService.js';

/**
 * After CartEngine.apply: create/send payment links when collection is on.
 */
export async function handleOrderPaymentLinksAfterCartApply(input: {
  vendorId: string;
  conversationId: string;
  phoneNumberId?: string;
  orderId: string | null;
  mutated: boolean;
  ops: CartOp[];
  previousTotalPaise?: number;
}): Promise<void> {
  if (!input.mutated || !input.orderId) return;

  const confirmOp = input.ops.some((op) => op.type === 'confirm');
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true, totalAmount: true, paymentMethod: true }
  });
  if (!order) return;

  const service = getPaymentLinkService();

  if (confirmOp && order.status === 'awaiting_payment') {
    const vendor = await prisma.vendor.findUnique({
      where: { id: input.vendorId },
      select: { paymentLinkAutoSend: true, paymentsManagedByChatlogix: true }
    });
    if (!vendor?.paymentsManagedByChatlogix) return;
    if (!vendor.paymentLinkAutoSend) return;

    try {
      await service.createPaymentLinkForOrder(order.id, {
        sendWhatsApp: true,
        phoneNumberId: input.phoneNumberId
      });
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'Auto payment link after confirm failed');
    }
    return;
  }

  if (
    order.status === 'awaiting_payment' &&
    input.previousTotalPaise != null &&
    input.previousTotalPaise !== order.totalAmount
  ) {
    try {
      await service.refreshLinkAfterCartChange(order.id, { phoneNumberId: input.phoneNumberId });
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'Payment link refresh after cart change failed');
    }
  }
}
