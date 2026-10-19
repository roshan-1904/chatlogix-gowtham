const REFUNDABLE_COD_STATUSES = ['pending', 'confirmed'];
const REFUND_WINDOW_DAYS = 7;

export interface RefundEligibility {
  eligible: boolean;
  reason: string;
  managedPayment?: boolean;
}

export interface RefundEligibilityOrder {
  status: string;
  createdAt: Date;
  paymentMethod?: string | null;
  paymentsManagedByChatlogix?: boolean;
  capturedRemainderPaise?: number | null;
}

/**
 * CartEngine eligibility: managed payments use captured remainder; COD uses 7-day rule.
 */
export function checkRefundEligibility(order: RefundEligibilityOrder): RefundEligibility {
  const managed =
    order.paymentsManagedByChatlogix === true && order.paymentMethod === 'razorpay';

  if (managed) {
    const remainder = order.capturedRemainderPaise ?? 0;
    if (remainder <= 0) {
      return {
        eligible: false,
        reason: 'There is no online payment left to refund on this order.',
        managedPayment: true
      };
    }
    return {
      eligible: true,
      reason: 'The shop will review and confirm your refund.',
      managedPayment: true
    };
  }

  if (!REFUNDABLE_COD_STATUSES.includes(order.status)) {
    return {
      eligible: false,
      reason: `Order status is ${order.status}. Only pending or confirmed orders can be auto-refunded.`,
      managedPayment: false
    };
  }

  const daysSinceOrder = (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceOrder > REFUND_WINDOW_DAYS) {
    return {
      eligible: false,
      reason: `Refund request is outside the ${REFUND_WINDOW_DAYS}-day window.`,
      managedPayment: false
    };
  }

  return { eligible: true, reason: 'The shop will review and confirm your refund.', managedPayment: false };
}
