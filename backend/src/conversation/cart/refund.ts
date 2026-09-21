const REFUNDABLE_STATUSES = ['pending', 'confirmed'];
const REFUND_WINDOW_DAYS = 7;

export interface RefundEligibility {
  eligible: boolean;
  reason: string;
}

/**
 * Mirrors services/refundService.ts's checkRefundEligibility rule exactly
 * (status pending/confirmed + placed within 7 days). Reimplemented locally
 * rather than imported — that file belongs to the legacy pipeline this
 * rewrite is replacing. Keep the two numbers in sync by hand if the
 * business rule ever changes.
 */
export function checkRefundEligibility(order: { status: string; createdAt: Date }): RefundEligibility {
  if (!REFUNDABLE_STATUSES.includes(order.status)) {
    return { eligible: false, reason: `Order status is ${order.status}. Only pending or confirmed orders can be auto-refunded.` };
  }

  const daysSinceOrder = (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceOrder > REFUND_WINDOW_DAYS) {
    return { eligible: false, reason: `Refund request is outside the ${REFUND_WINDOW_DAYS}-day window.` };
  }

  return { eligible: true, reason: 'Order is eligible for refund' };
}
