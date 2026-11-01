import { describe, it, expect } from 'vitest';
import {
  formatPaiseToRupees,
  formatUptime,
  formatTimestamp,
  getTopErrorCode,
} from '../reliability';

describe('Reliability helpers', () => {
  describe('formatPaiseToRupees', () => {
    it('formats 49900 paise as ₹499.00', () => {
      const formatted = formatPaiseToRupees(49900);
      expect(formatted).toContain('499.00');
    });

    it('formats 0 paise as ₹0.00', () => {
      const formatted = formatPaiseToRupees(0);
      expect(formatted).toContain('0.00');
    });

    it('formats 150 paise as ₹1.50', () => {
      const formatted = formatPaiseToRupees(150);
      expect(formatted).toContain('1.50');
    });
  });

  describe('formatUptime', () => {
    it('formats seconds under a minute', () => {
      expect(formatUptime(45)).toBe('45s');
    });

    it('formats minutes under an hour', () => {
      expect(formatUptime(150)).toBe('2m');
    });

    it('formats hours and minutes', () => {
      expect(formatUptime(3600 * 4 + 720)).toBe('4h 12m');
    });

    it('formats days and hours', () => {
      expect(formatUptime(86400 * 3 + 3600 * 5)).toBe('3d 5h');
    });
  });

  describe('getTopErrorCode', () => {
    it('returns None when errorCounts is missing or empty', () => {
      expect(getTopErrorCode(undefined)).toBe('None');
      expect(getTopErrorCode({})).toBe('None');
    });

    it('finds the error code with the highest count', () => {
      const counts = {
        VALIDATION_ERROR: 14,
        NOT_FOUND: 2,
        RATE_LIMITED: 8,
      };
      expect(getTopErrorCode(counts)).toBe('VALIDATION_ERROR (14)');
    });
  });

  describe('formatTimestamp', () => {
    it('formats valid ISO dates', () => {
      const formatted = formatTimestamp('2026-10-28T10:30:00Z');
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
    });

    it('returns raw string for invalid dates', () => {
      expect(formatTimestamp('invalid-date')).toBe('invalid-date');
    });
  });
});
