/**
 * Unit tests for planUtils
 */

import { describe, it, expect } from 'vitest';
import { getPlanCredits, getBillingCycleDates, PLAN_CREDITS } from '../planUtils.js';

describe('planUtils', () => {
  describe('PLAN_CREDITS', () => {
    it('should have correct credit values for all plans', () => {
      expect(PLAN_CREDITS['Starter']).toBe(100);
      expect(PLAN_CREDITS['Pro']).toBe(500);
      expect(PLAN_CREDITS['Business']).toBe(2000);
      expect(PLAN_CREDITS['Enterprise']).toBe(10000);
    });
  });

  describe('getPlanCredits', () => {
    it('should return correct credits for known plans', () => {
      expect(getPlanCredits('Starter')).toBe(100);
      expect(getPlanCredits('Pro')).toBe(500);
      expect(getPlanCredits('Business')).toBe(2000);
      expect(getPlanCredits('Enterprise')).toBe(10000);
    });

    it('should default to Starter plan for unknown plans', () => {
      expect(getPlanCredits('UnknownPlan')).toBe(100);
      expect(getPlanCredits('')).toBe(100);
    });
  });

  describe('getBillingCycleDates', () => {
    it('should return correct billing cycle dates for current month', () => {
      const vendor = {
        createdAt: new Date('2024-01-15'),
        subscriptionPlan: 'Pro',
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
        subscriptionPlan: 'Business',
      };

      const dates = getBillingCycleDates(vendor);
      
      expect(dates.start.getMonth()).toBe(new Date().getMonth());
      expect(dates.end.getMonth()).toBe(new Date().getMonth());
    });
  });
});

