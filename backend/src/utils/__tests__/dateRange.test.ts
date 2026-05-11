/**
 * Unit tests for dateRange utility
 */

import { describe, it, expect } from 'vitest';
import { getDateRange, type DateRangePreset } from '../dateRange.js';

describe('dateRange', () => {
  describe('getDateRange', () => {
    it('should return correct date range for thisWeek', () => {
      const range = getDateRange('thisWeek');
      
      expect(range.preset).toBe('thisWeek');
      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
      expect(range.label).toBeTruthy();
    });

    it('should return correct date range for thisMonth', () => {
      const range = getDateRange('thisMonth');
      
      expect(range.preset).toBe('thisMonth');
      expect(range.start.getDate()).toBe(1); // First day of month
      expect(range.end).toBeInstanceOf(Date);
    });

    it('should return correct date range for last3Months', () => {
      const range = getDateRange('last3Months');
      
      expect(range.preset).toBe('last3Months');
      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
    });

    it('should return correct date range for last6Months', () => {
      const range = getDateRange('last6Months');
      
      expect(range.preset).toBe('last6Months');
      expect(range.start).toBeInstanceOf(Date);
      expect(range.end).toBeInstanceOf(Date);
    });

    it('should return correct date range for thisFinancialYear (Indian FY)', () => {
      const range = getDateRange('thisFinancialYear');
      
      expect(range.preset).toBe('thisFinancialYear');
      expect(range.start.getMonth()).toBe(3); // April (month index 3)
      expect(range.start.getDate()).toBe(1);
    });

    it('should handle custom date range with valid dates', () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';
      const range = getDateRange('custom', startDate, endDate);
      
      expect(range.preset).toBe('custom');
      expect(range.start.toISOString().split('T')[0]).toBe(startDate);
      expect(range.end.toISOString().split('T')[0]).toBe(endDate);
    });

    it('should throw error for custom range exceeding 1 year', () => {
      const startDate = '2024-01-01';
      const endDate = '2025-02-01'; // More than 1 year
      
      expect(() => getDateRange('custom', startDate, endDate)).toThrow();
    });

    it('should throw error for custom range without dates', () => {
      expect(() => getDateRange('custom')).toThrow();
    });
  });
});

