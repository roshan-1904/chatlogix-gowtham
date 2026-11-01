import { describe, it, expect } from 'vitest';
import { calculateUsageMargin } from '../usage';

describe('calculateUsageMargin', () => {
  describe('Standard calculations', () => {
    it('calculates gross margin percentage for standard values', () => {
      const result = calculateUsageMargin(3000, 2000);
      expect(result.status).toBe('available');
      expect(result.percentage).toBe(33.3);
      expect(result.formatted).toBe('33.3%');
      expect(result.caption).toBe('billed vs AI provider cost');
    });

    it('matches the worked example from BILLING_AND_PRICING.md (50% markup: 260 cost -> 390 charge)', () => {
      // (390 - 260) / 390 = 130 / 390 = 33.333% -> 33.3%
      const result = calculateUsageMargin(390, 260);
      expect(result.status).toBe('available');
      expect(result.percentage).toBe(33.3);
      expect(result.formatted).toBe('33.3%');
    });

    it('calculates 50.0% margin when charges are double the cost (100% markup)', () => {
      const result = calculateUsageMargin(1000, 500);
      expect(result.status).toBe('available');
      expect(result.percentage).toBe(50.0);
      expect(result.formatted).toBe('50.0%');
    });

    it('calculates 100.0% margin when cost is zero', () => {
      const result = calculateUsageMargin(1000, 0);
      expect(result.status).toBe('available');
      expect(result.percentage).toBe(100.0);
      expect(result.formatted).toBe('100.0%');
    });

    it('calculates 0.0% margin when cost equals charges', () => {
      const result = calculateUsageMargin(1000, 1000);
      expect(result.status).toBe('available');
      expect(result.percentage).toBe(0.0);
      expect(result.formatted).toBe('0.0%');
    });

    it('rounds to 1 decimal place cleanly', () => {
      // (100 - 33.3333) / 100 = 66.6667% -> 66.7%
      const result = calculateUsageMargin(100, 33.3333);
      expect(result.percentage).toBe(66.7);
      expect(result.formatted).toBe('66.7%');
    });
  });

  describe('Zero revenue & denominator safety', () => {
    it('handles zero charged amount safely without NaN or Infinity', () => {
      const result = calculateUsageMargin(0, 0);
      expect(result.status).toBe('zero_revenue');
      expect(result.percentage).toBeNull();
      expect(result.formatted).toBe('—');
      expect(result.caption).toBe('No billable charges in range');
      expect(Number.isNaN(result.percentage)).toBe(false);
      expect(result.percentage !== Infinity).toBe(true);
    });

    it('handles zero charges with positive cost safely', () => {
      const result = calculateUsageMargin(0, 500);
      expect(result.status).toBe('zero_revenue');
      expect(result.percentage).toBeNull();
      expect(result.formatted).toBe('—');
      expect(Number.isNaN(result.percentage)).toBe(false);
    });

    it('handles negative or invalid charged values safely', () => {
      const resultNegative = calculateUsageMargin(-100, 50);
      expect(resultNegative.status).toBe('zero_revenue');
      expect(resultNegative.percentage).toBeNull();
      expect(resultNegative.formatted).toBe('—');

      const resultNull = calculateUsageMargin(null, 50);
      expect(resultNull.status).toBe('zero_revenue');
      expect(resultNull.percentage).toBeNull();

      const resultUndefined = calculateUsageMargin(undefined, 50);
      expect(resultUndefined.status).toBe('zero_revenue');
      expect(resultUndefined.percentage).toBeNull();

      const resultNaN = calculateUsageMargin(NaN, 50);
      expect(resultNaN.status).toBe('zero_revenue');
      expect(resultNaN.percentage).toBeNull();
    });
  });

  describe('Negative margin values', () => {
    it('calculates negative margin when cost exceeds charges', () => {
      // (1000 - 1250) / 1000 = -250 / 1000 = -25.0%
      const result = calculateUsageMargin(1000, 1250);
      expect(result.status).toBe('available');
      expect(result.percentage).toBe(-25.0);
      expect(result.formatted).toBe('-25.0%');
      expect(result.caption).toBe('billed vs AI provider cost');
    });

    it('calculates -100.0% margin when cost is double the revenue', () => {
      const result = calculateUsageMargin(500, 1000);
      expect(result.status).toBe('available');
      expect(result.percentage).toBe(-100.0);
      expect(result.formatted).toBe('-100.0%');
    });
  });

  describe('Incomplete cost data handling', () => {
    it('returns incomplete status when openAiCostMilli is null', () => {
      const result = calculateUsageMargin(5000, null);
      expect(result.status).toBe('incomplete');
      expect(result.percentage).toBeNull();
      expect(result.formatted).toBe('—');
      expect(result.caption).toBe('Incomplete AI cost data');
    });

    it('returns incomplete status when openAiCostMilli is undefined', () => {
      const result = calculateUsageMargin(5000, undefined);
      expect(result.status).toBe('incomplete');
      expect(result.percentage).toBeNull();
      expect(result.formatted).toBe('—');
      expect(result.caption).toBe('Incomplete AI cost data');
    });

    it('returns incomplete status when openAiCostMilli is non-finite', () => {
      const result = calculateUsageMargin(5000, NaN);
      expect(result.status).toBe('incomplete');
      expect(result.percentage).toBeNull();
      expect(result.formatted).toBe('—');
    });

    it('returns incomplete status when hasIncompleteCost flag is explicitly true', () => {
      const result = calculateUsageMargin(5000, 3000, true);
      expect(result.status).toBe('incomplete');
      expect(result.percentage).toBeNull();
      expect(result.formatted).toBe('—');
      expect(result.caption).toBe('Incomplete AI cost data');
    });

    it('returns available status when hasIncompleteCost flag is false', () => {
      const result = calculateUsageMargin(5000, 3000, false);
      expect(result.status).toBe('available');
      expect(result.percentage).toBe(40.0);
      expect(result.formatted).toBe('40.0%');
    });
  });
});
