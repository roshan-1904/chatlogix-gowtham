/**
 * Billing cycle window utility
 *
 * The monthly plan quota was removed with the unified rupee wallet, so this file no
 * longer maps subscription plans to credit allowances. `Vendor.subscriptionPlan`
 * remains as bookkeeping only and must not influence any billing calculation.
 */

/**
 * Get billing cycle dates for a vendor
 * Currently uses calendar month. In future, use planStartDate/planEndDate from Vendor model
 * @param vendor - Vendor object with createdAt
 * @returns Object with start and end dates of current billing cycle
 */
export function getBillingCycleDates(vendor: { createdAt: Date }): {
  start: Date;
  end: Date;
} {
  // For now, use calendar month. In future, use planStartDate/planEndDate from Vendor model
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}
