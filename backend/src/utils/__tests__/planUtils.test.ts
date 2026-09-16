/**
 * Unit tests for planUtils
 */

import { describe, it, expect } from 'vitest';
import { getBillingCycleDates } from '../planUtils.js';

describe('planUtils', () => {
  describe('getBillingCycleDates', () => {
    it('should return correct billing cycle dates for current month', () => {
      const vendor = {
        createdAt: new Date('2024-01-15'),
      };

      const dates = getBillingCycleDates(vendor);

      expect(dates.start).toBeInstanceOf(Date);
      expect(dates.end).toBeInstanceOf(Date);
      expect(dates.start.getDate()).toBe(1); // First day of month
      expect(dates.end.getDate()).toBeGreaterThanOrEqual(28); // Last day of month
    });

    it('should handle different months correctly', () => {
      const vendor = {
        createdAt: new Date('2024-12-20'),
      };

      const dates = getBillingCycleDates(vendor);

      expect(dates.start.getMonth()).toBe(new Date().getMonth());
      expect(dates.end.getMonth()).toBe(new Date().getMonth());
    });
  });
});
