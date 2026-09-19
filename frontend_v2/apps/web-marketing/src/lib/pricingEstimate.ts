/**
 * Marketing monthly-spend estimator (1 Oct 2026 WhatsApp rate card).
 *
 * This is a marketing estimate only — a budget hint for the public Pricing page.
 * Live wallet debit is still AI-only (`whatsappCostMilli = 0`) until P2h-h.
 * Wallet authority remains docs/BILLING_AND_PRICING.md. Do not treat this module
 * as a substitute for backend/src/services/pricing/pricingService.ts.
 */

/**
 * Single source for rates and allowances shown on the marketing pricing section.
 * Reuse these instead of hardcoding figures in JSX or copy templates.
 *
 * Verify against Meta's INR rate card effective 2026-10-01 before launch.
 * Meta may change rates on the 1st day of each quarter.
 * Official docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
 * India ₹0.115 + 1,000 free allowance: secondary pointer only (not authority) —
 * https://dev.to/preciousky_45d956626d31c3/whatsapp-business-platform-pricing-in-rupees-and-the-two-things-that-change-on-1-october-2026-4ko0
 */
export const PRICING_CONFIG = {
  WA_SERVICE_RATE_INR: 0.115,
  WA_FREE_ALLOWANCE_PER_MONTH: 1_000, // per business phone number
  WA_RATES_EFFECTIVE: '2026-10-01',
  DAYS_PER_MONTH: 30,
  // TODO(owner B7): confirm a realistic default voice-note share for Home seller. 20 is a placeholder.
  DEFAULT_VOICE_SHARE: 20,
} as const;

export const DAYS_PER_MONTH = PRICING_CONFIG.DAYS_PER_MONTH;
export const FREE_SERVICE_MESSAGES = PRICING_CONFIG.WA_FREE_ALLOWANCE_PER_MONTH;

/** India card, pre-GST. Same figure as `PRICING_CONFIG.WA_SERVICE_RATE_INR`. */
export const SERVICE_BASE_RUPEES = PRICING_CONFIG.WA_SERVICE_RATE_INR;
export const MARKETING_BASE_RUPEES = 0.8631;

export const GST_RATE = 0.18;
/** Same default as Vendor.markupPercent. */
export const MARKUP_RATE = 0.5;

export const TEXT_AI_LOW_RUPEES = 0.18;
export const TEXT_AI_HIGH_RUPEES = 0.3;
export const VOICE_AI_LOW_RUPEES = 0.5;
export const VOICE_AI_HIGH_RUPEES = 1;

/** 0.115 × 1.18 × 1.50 */
export const VENDOR_WA_SERVICE_RATE_RUPEES = 0.20355;
/** 0.8631 × 1.18 × 1.50 — kept for the unused promo term (slider removed; param stays at 0). */
export const VENDOR_WA_MARKETING_RATE_RUPEES = 1.527687;

export const PRICING_PRESETS = [
  { id: 'home-seller' as const, messagesPerDay: 30 },
  { id: 'small-shop' as const, messagesPerDay: 100 },
  { id: 'busy-store' as const, messagesPerDay: 500 },
] as const;

export type PricingPresetId = (typeof PRICING_PRESETS)[number]['id'];

export type PricingEstimatePeriod = 'daily' | 'monthly';

export interface PricingEstimateInput {
  period: PricingEstimatePeriod;
  dailyMessages?: number;
  monthlyMessages?: number;
  /** Share of inbound messages that are voice notes, 0–1. No 50% cap. */
  voiceShare: number;
  /** Kept for config continuity. The UI no longer exposes this; pass 0. */
  monthlyPromo: number;
}

export interface PricingEstimateBreakdown {
  freeReplies: number;
  billedServiceCount: number;
  promoCount: number;
}

export interface PricingEstimate {
  monthlyLow: number;
  monthlyHigh: number;
  dailyLow: number;
  dailyHigh: number;
  monthlyMessages: number;
  breakdown: PricingEstimateBreakdown;
}

/** Nearest ₹10; minimum ₹10 if spend > 0. */
export function roundDisplayRupees(amount: number): number {
  if (amount <= 0) {
    return 0;
  }
  return Math.max(10, Math.round(amount / 10) * 10);
}

export function perDayFromMonthly(monthlyAmount: number): number {
  return Math.round(monthlyAmount / PRICING_CONFIG.DAYS_PER_MONTH);
}

/** Index of the tick nearest `target`. Ties go to the earlier tick. */
export function nearestStepIndex(values: readonly number[], target: number): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < values.length; index += 1) {
    const distance = Math.abs(values[index] - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

const EFFECTIVE_MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `2026-10-01` → `1 Oct 2026`. */
export function formatRatesEffective(isoDate: string = PRICING_CONFIG.WA_RATES_EFFECTIVE): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${day} ${EFFECTIVE_MONTH_SHORT[month - 1]} ${year}`;
}

export function estimateMonthlySpend(input: PricingEstimateInput): PricingEstimate {
  const monthlyInbound =
    input.period === 'daily'
      ? (input.dailyMessages ?? 0) * PRICING_CONFIG.DAYS_PER_MONTH
      : (input.monthlyMessages ?? 0);

  const voiceReplies = monthlyInbound * input.voiceShare;
  const textReplies = monthlyInbound - voiceReplies;

  const aiLow = textReplies * TEXT_AI_LOW_RUPEES + voiceReplies * VOICE_AI_LOW_RUPEES;
  const aiHigh = textReplies * TEXT_AI_HIGH_RUPEES + voiceReplies * VOICE_AI_HIGH_RUPEES;

  const billedServiceCount = Math.max(0, monthlyInbound - PRICING_CONFIG.WA_FREE_ALLOWANCE_PER_MONTH);
  const freeReplies = Math.min(monthlyInbound, PRICING_CONFIG.WA_FREE_ALLOWANCE_PER_MONTH);
  const waService = billedServiceCount * VENDOR_WA_SERVICE_RATE_RUPEES;
  const waMarketing = input.monthlyPromo * VENDOR_WA_MARKETING_RATE_RUPEES;

  const monthlyLow = roundDisplayRupees(aiLow + waService + waMarketing);
  const monthlyHigh = roundDisplayRupees(aiHigh + waService + waMarketing);

  return {
    monthlyLow,
    monthlyHigh,
    dailyLow: perDayFromMonthly(monthlyLow),
    dailyHigh: perDayFromMonthly(monthlyHigh),
    monthlyMessages: monthlyInbound,
    breakdown: {
      freeReplies,
      billedServiceCount,
      promoCount: input.monthlyPromo,
    },
  };
}

// TODO(owner B1): skip the breakdown line until the owner confirms the ₹ range
// includes WhatsApp's fee. When confirmed:
//   waFee = max(0, N - WA_FREE_ALLOWANCE_PER_MONTH) * WA_SERVICE_RATE_INR
//   "WhatsApp fees ≈ ₹{waFee} · ChatLogix ≈ ₹{low - waFee}–₹{high - waFee}"
// Worked example: 3,000 messages → waFee = 2,000 × 0.115 = ₹230.
