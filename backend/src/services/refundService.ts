/**
 * Refund eligibility for customer-facing flows (conversation + legacy).
 * Managed Razorpay payments: eligible while a captured remainder exists.
 * COD / non-managed: pending/confirmed within 7 days (shop confirms manually).
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';

export interface RefundEligibility {
  eligible: boolean;
  reason: string;
  orderNumber?: string | null;
  refundAmount?: number | null;
  processingTime?: string;
  managedPayment?: boolean;
}

const REFUNDABLE_COD_STATUSES = ['pending', 'confirmed'];
const REFUND_WINDOW_DAYS = 7;

function codEligibility(order: { status: string; createdAt: Date }): RefundEligibility {
  if (!REFUNDABLE_COD_STATUSES.includes(order.status)) {
    return {
      eligible: false,
      reason: `Order status is ${order.status}. Only pending or confirmed orders can be refunded.`,
      managedPayment: false
    };
  }
  const daysSinceOrder = (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceOrder > REFUND_WINDOW_DAYS) {
    return {
      eligible: false,
      reason: 'Refund request is outside the 7-day window',
      managedPayment: false
    };
  }
  return {
    eligible: true,
    reason: 'Order is eligible for refund review',
    processingTime: 'The shop will confirm your refund',
    managedPayment: false
  };
}

async function managedPaymentEligibility(
  order: { id: string; orderNumber: string | null; paymentMethod: string | null }
): Promise<RefundEligibility> {
  const payment = await prisma.customerPayment.findFirst({
    where: {
      orderId: order.id,
      settlementAlert: null,
      refundRequired: false,
      netMilli: { gt: 0 }
    },
    orderBy: { capturedAt: 'desc' }
  });
  if (!payment) {
    return {
      eligible: false,
      reason: 'No online payment found to refund on this order',
      orderNumber: order.orderNumber,
      managedPayment: true
    };
  }
  const remainder = payment.amountPaise - payment.refundedPaise;
  if (remainder <= 0) {
    return {
      eligible: false,
      reason: 'This order has already been fully refunded',
      orderNumber: order.orderNumber,
      managedPayment: true
    };
  }
  return {
    eligible: true,
    reason: 'Your refund request will be reviewed by the shop',
    orderNumber: order.orderNumber,
    refundAmount: remainder,
    processingTime: 'The shop will confirm and process your refund',
    managedPayment: true
  };
}

/**
 * Check refund eligibility for a customer request
 */
export async function checkRefundEligibility(
  conversationId: string,
  vendorId: string,
  orderNumber?: string | null
): Promise<RefundEligibility> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true }
    });

    if (!conversation) {
      return {
        eligible: false,
        reason: 'Conversation not found'
      };
    }

    let order = null;
    if (orderNumber) {
      order = await prisma.order.findFirst({
        where: {
          orderNumber,
          vendorId,
          customerId: conversation.customerId
        }
      });
    } else {
      order = await prisma.order.findFirst({
        where: {
          vendorId,
          customerId: conversation.customerId
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!order) {
      return {
        eligible: false,
        reason: 'No order found'
      };
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { paymentsManagedByChatlogix: true }
    });

    const managed =
      vendor?.paymentsManagedByChatlogix === true &&
      order.paymentMethod === 'razorpay';

    if (managed) {
      const result = await managedPaymentEligibility(order);
      return { ...result, orderNumber: order.orderNumber };
    }

    const cod = codEligibility(order);
    return {
      ...cod,
      orderNumber: order.orderNumber,
      refundAmount: cod.eligible ? order.totalAmount : null
    };
  } catch (error) {
    logger.error({ err: error, conversationId, vendorId }, 'Failed to check refund eligibility');
    return {
      eligible: false,
      reason: 'Error checking eligibility'
    };
  }
}

/**
 * Legacy path — vendor dashboard uses settlementService via vendorRefundService.
 */
export async function processRefund(
  orderNumber: string,
  amount: number,
  vendorId: string
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { orderNumber, vendorId }
  });
  if (!order) {
    throw new Error('Order not found');
  }
  const { startVendorOrderRefund } = await import('./payments/vendorRefundService.js');
  await startVendorOrderRefund({
    vendorId,
    orderId: order.id,
    refundPaise: amount,
    requestedBy: 'legacy_refund_service'
  });
}
