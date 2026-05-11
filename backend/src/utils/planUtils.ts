/**
 * Plan Credits Mapping Utility
 * Maps subscription plan names to monthly credit allowances
 */

export const PLAN_CREDITS: Record<string, number> = {
  'Starter': 100,
  'Pro': 500,
  'Business': 2000,
  'Enterprise': 10000,
};

/**
 * Get plan credits for a given plan name
 * @param planName - Subscription plan name
 * @returns Number of credits per month, defaults to Starter plan if unknown
 */
export function getPlanCredits(planName: string): number {
  const credits = PLAN_CREDITS[planName];
  if (credits === undefined) {
    console.warn(`Unknown plan: ${planName}, defaulting to Starter`);
    return PLAN_CREDITS['Starter'];
  }
  return credits;
}

/**
 * Get billing cycle dates for a vendor
 * Currently uses calendar month. In future, use planStartDate/planEndDate from Vendor model
 * @param vendor - Vendor object with createdAt and optional subscriptionPlan
 * @returns Object with start and end dates of current billing cycle
 */
export function getBillingCycleDates(vendor: { createdAt: Date; subscriptionPlan?: string }): {
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

