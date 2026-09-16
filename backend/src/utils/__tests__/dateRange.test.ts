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

    // Asserted on local calendar parts, not toISOString: the range boundaries are
    // local midnight, so converting back to UTC shifts the date in IST.
    const localDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    it('should handle custom date range with valid dates', () => {
      const startDate = '2024-01-01';
      const endDate = '2024-01-31';
      const range = getDateRange('custom', startDate, endDate);

      expect(range.preset).toBe('custom');
      expect(localDate(range.start)).toBe(startDate);
      expect(localDate(range.end)).toBe(endDate);
    });

    it('should anchor custom ranges to local midnight, not UTC midnight', () => {
      const range = getDateRange('custom', '2024-01-01', '2024-01-31');

      expect(range.start.getHours()).toBe(0);
      expect(range.start.getMinutes()).toBe(0);
      expect(range.end.getHours()).toBe(23);
      expect(range.end.getMinutes()).toBe(59);
    });

    it('should throw error for a malformed custom date', () => {
      expect(() => getDateRange('custom', '01-01-2024', '2024-01-31')).toThrow(/YYYY-MM-DD/);
    });

    it('should throw error for a date that does not exist', () => {
      expect(() => getDateRange('custom', '2024-02-30', '2024-03-31')).toThrow(/calendar date/);
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

