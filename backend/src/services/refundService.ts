/**
 * Refund Service
 * Handles refund eligibility checks and processing
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';

export interface RefundEligibility {
  eligible: boolean;
  reason: string;
  orderNumber?: string | null;
  refundAmount?: number | null;
  processingTime?: string;
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

    // Find relevant order
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
      // Find most recent order
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

    // Check order status - only pending/confirmed orders can be refunded
    const refundableStatuses = ['pending', 'confirmed'];
    if (!refundableStatuses.includes(order.status)) {
      return {
        eligible: false,
        reason: `Order status is ${order.status}. Only pending or confirmed orders can be refunded.`,
        orderNumber: order.orderNumber || null
      };
    }

    // Check time limit (e.g., within 7 days)
    const orderDate = new Date(order.createdAt);
    const daysSinceOrder = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceOrder > 7) {
      return {
        eligible: false,
        reason: 'Refund request is outside the 7-day window',
        orderNumber: order.orderNumber || null
      };
    }

    return {
      eligible: true,
      reason: 'Order is eligible for refund',
      orderNumber: order.orderNumber || null,
      refundAmount: order.totalAmount,
      processingTime: '3-5 business days'
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
 * Process refund for an order
 */
export async function processRefund(
  orderNumber: string,
  amount: number,
  vendorId: string
): Promise<void> {
  try {
    // Find order
    const order = await prisma.order.findFirst({
      where: {
        orderNumber,
        vendorId
      }
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Update order status - use 'cancelled' as refunded orders are typically cancelled
    // TODO: Add 'refunded' status to OrderStatus enum if needed
    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'cancelled' // Using cancelled as refunded status - can be updated if refunded status is added to enum
      }
    });

    logger.info({ orderNumber, amount, vendorId }, 'Refund processed');

    // TODO: Integrate with payment gateway to process actual refund
    // await paymentGateway.refund(order.paymentId, amount);
    
  } catch (error) {
    logger.error({ err: error, orderNumber, vendorId }, 'Failed to process refund');
    throw error;
  }
}

