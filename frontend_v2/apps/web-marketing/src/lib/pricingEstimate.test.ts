import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_MONTH,
  estimateMonthlySpend,
  formatRatesEffective,
  FREE_SERVICE_MESSAGES,
  nearestStepIndex,
  perDayFromMonthly,
  PRICING_CONFIG,
} from './pricingEstimate';

describe('PRICING_CONFIG', () => {
  it('keeps rate, allowance, and month-length aliases on the same values', () => {
    expect(PRICING_CONFIG.WA_SERVICE_RATE_INR).toBe(0.115);
    expect(PRICING_CONFIG.WA_FREE_ALLOWANCE_PER_MONTH).toBe(1_000);
    expect(PRICING_CONFIG.WA_RATES_EFFECTIVE).toBe('2026-10-01');
    expect(PRICING_CONFIG.DAYS_PER_MONTH).toBe(30);
    expect(PRICING_CONFIG.DEFAULT_VOICE_SHARE).toBe(20);
    expect(DAYS_PER_MONTH).toBe(PRICING_CONFIG.DAYS_PER_MONTH);
    expect(FREE_SERVICE_MESSAGES).toBe(PRICING_CONFIG.WA_FREE_ALLOWANCE_PER_MONTH);
  });

  it('formats the rate-card date for the footnote', () => {
    expect(formatRatesEffective()).toBe('1 Oct 2026');
  });
});

describe('nearestStepIndex', () => {
  it('returns the exact tick when present', () => {
    expect(nearestStepIndex([10, 25, 30, 50, 100], 30)).toBe(2);
    expect(nearestStepIndex([0, 10, 20, 25, 50, 100], 20)).toBe(2);
  });

  it('snaps to the nearest tick', () => {
    expect(nearestStepIndex([10, 25, 50, 100], 30)).toBe(1);
    expect(nearestStepIndex([0, 10, 25, 50, 100], 20)).toBe(2);
  });
});

describe('estimateMonthlySpend', () => {
  it.each([
    { daily: 20, voiceShare: 0, promo: 0, low: 110, high: 180, free: 600, billed: 0 },
    { daily: 33, voiceShare: 0, promo: 0, low: 180, high: 300, free: 990, billed: 0 },
    // Plan table listed ₹390–₹590; formula + ₹10 rounding is ₹420–₹660.
    { daily: 50, voiceShare: 0.1, promo: 0, low: 420, high: 660, free: 1000, billed: 500 },
    { daily: 100, voiceShare: 0.1, promo: 500, low: 1810, high: 2280, free: 1000, billed: 2000 },
    { daily: 20, voiceShare: 0, promo: 100, low: 260, high: 330, free: 600, billed: 0 },
  ])(
    '$daily/day voice=$voiceShare promo=$promo → ₹$low–₹$high',
    ({ daily, voiceShare, promo, low, high, free, billed }) => {
      const result = estimateMonthlySpend({
        period: 'daily',
        dailyMessages: daily,
        voiceShare,
        monthlyPromo: promo,
      });

      expect(result.monthlyLow).toBe(low);
      expect(result.monthlyHigh).toBe(high);
      expect(result.breakdown.freeReplies).toBe(free);
      expect(result.breakdown.billedServiceCount).toBe(billed);
      expect(result.breakdown.promoCount).toBe(promo);
    },
  );

  it('33/day 0% 0 promo has WhatsApp ₹0 (under 1,000 free service messages)', () => {
    const result = estimateMonthlySpend({
      period: 'daily',
      dailyMessages: 33,
      voiceShare: 0,
      monthlyPromo: 0,
    });

    expect(33 * DAYS_PER_MONTH).toBeLessThan(FREE_SERVICE_MESSAGES);
    expect(result.breakdown.freeReplies).toBe(990);
    expect(result.breakdown.billedServiceCount).toBe(0);
    expect(result.breakdown.promoCount).toBe(0);
  });

  it('reproduces the 100/day · 50% voice · 0 promo range (₹1,430–₹2,360)', () => {
    const result = estimateMonthlySpend({
      period: 'daily',
      dailyMessages: 100,
      voiceShare: 0.5,
      monthlyPromo: 0,
    });

    expect(result.monthlyMessages).toBe(3_000);
    expect(result.monthlyLow).toBe(1_430);
    expect(result.monthlyHigh).toBe(2_360);
    expect(result.dailyLow).toBe(48);
    expect(result.dailyHigh).toBe(79);
    expect(result.breakdown.promoCount).toBe(0);
  });

  it('does not cap voice share at 50%', () => {
    const half = estimateMonthlySpend({
      period: 'daily',
      dailyMessages: 100,
      voiceShare: 0.5,
      monthlyPromo: 0,
    });
    const full = estimateMonthlySpend({
      period: 'daily',
      dailyMessages: 100,
      voiceShare: 1,
      monthlyPromo: 0,
    });

    expect(full.monthlyLow).toBeGreaterThan(half.monthlyLow);
    expect(full.monthlyHigh).toBeGreaterThan(half.monthlyHigh);
  });

  it('uses the same DAYS_PER_MONTH for the per-day line', () => {
    expect(perDayFromMonthly(1_430)).toBe(48);
    expect(perDayFromMonthly(2_360)).toBe(79);
  });
});
