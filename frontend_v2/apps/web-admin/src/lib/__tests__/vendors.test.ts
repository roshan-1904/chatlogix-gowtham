import { describe, it, expect } from 'vitest';
import {
  parseRupeesToMilli,
  validateRechargeReason,
} from '../../components/vendors/VendorDetailPanel';
import {
  getRegistrationBadge,
  STATUS_OPTIONS,
} from '../../pages/Vendors';
import {
  WhatsAppAlreadyMappedError,
  MIN_MARKUP_PERCENT,
  MAX_MARKUP_PERCENT,
} from '../vendors';

describe('Vendors Module — Frontend Logic', () => {
  describe('parseRupeesToMilli', () => {
    it('correctly converts whole rupees to millirupees (1 INR = 1000 milli)', () => {
      const res = parseRupeesToMilli('50');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.amountMilli).toBe(50000);
        expect(res.rupees).toBe(50);
      }
    });

    it('correctly converts decimal rupees with 2 decimal places', () => {
      const res = parseRupeesToMilli('50.50');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.amountMilli).toBe(50500);
        expect(res.rupees).toBe(50.5);
      }
    });

    it('handles 3 decimal places down to 1 millirupee', () => {
      const res = parseRupeesToMilli('0.001');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.amountMilli).toBe(1);
        expect(res.rupees).toBe(0.001);
      }
    });

    it('rejects empty input', () => {
      const res = parseRupeesToMilli('   ');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toBe('Recharge amount is required');
      }
    });

    it('rejects zero and negative amounts', () => {
      const zero = parseRupeesToMilli('0');
      expect(zero.success).toBe(false);

      const neg = parseRupeesToMilli('-10');
      expect(neg.success).toBe(false);
    });

    it('rejects non-numeric input', () => {
      const res = parseRupeesToMilli('abc');
      expect(res.success).toBe(false);
    });

    it('rejects fractions smaller than 1 millirupee', () => {
      const res = parseRupeesToMilli('0.0001');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toContain('smaller than 1 millirupee');
      }
    });
  });

  describe('validateRechargeReason', () => {
    it('returns null for valid reason between 3 and 200 characters', () => {
      expect(validateRechargeReason('Goodwill credit')).toBeNull();
      expect(validateRechargeReason('Fixed issue')).toBeNull();
    });

    it('rejects empty or whitespace reason', () => {
      expect(validateRechargeReason('')).toBe('Recharge reason is required');
      expect(validateRechargeReason('   ')).toBe('Recharge reason is required');
    });

    it('rejects reason shorter than 3 characters', () => {
      expect(validateRechargeReason('ok')).toBe('Reason must be at least 3 characters');
      expect(validateRechargeReason(' a ')).toBe('Reason must be at least 3 characters');
    });

    it('rejects reason longer than 200 characters', () => {
      const longReason = 'a'.repeat(201);
      expect(validateRechargeReason(longReason)).toBe('Reason cannot exceed 200 characters');
    });
  });

  describe('getRegistrationBadge', () => {
    it('returns success badge for approved', () => {
      const badge = getRegistrationBadge('approved');
      expect(badge.label).toBe('Approved');
      expect(badge.variant).toBe('success');
    });

    it('returns warning badge for pending_approval', () => {
      const badge = getRegistrationBadge('pending_approval');
      expect(badge.label).toBe('Pending Approval');
      expect(badge.variant).toBe('warning');
    });

    it('returns red styled badge for rejected', () => {
      const badge = getRegistrationBadge('rejected');
      expect(badge.label).toBe('Rejected');
      expect(badge.variant).toBe('default');
      expect(badge.className).toContain('text-red-700');
    });

    it('returns info badge for onboarding', () => {
      const badge = getRegistrationBadge('onboarding');
      expect(badge.label).toBe('Onboarding');
      expect(badge.variant).toBe('info');
    });

    it('returns fallback badge for null/empty', () => {
      const badgeNull = getRegistrationBadge(null);
      expect(badgeNull.label).toBe('Not set');
      expect(badgeNull.variant).toBe('default');

      const badgeEmpty = getRegistrationBadge('');
      expect(badgeEmpty.label).toBe('Not set');
    });
  });

  describe('STATUS_OPTIONS', () => {
    it('contains all 5 expected filter values', () => {
      const values = STATUS_OPTIONS.map((o) => o.value);
      expect(values).toEqual(['all', 'onboarding', 'pending_approval', 'approved', 'rejected']);
    });
  });

  describe('Markup boundaries', () => {
    it('enforces 0 to 500 range constants', () => {
      expect(MIN_MARKUP_PERCENT).toBe(0);
      expect(MAX_MARKUP_PERCENT).toBe(500);
    });
  });

  describe('WhatsAppAlreadyMappedError', () => {
    it('stores collision metadata correctly', () => {
      const err = new WhatsAppAlreadyMappedError({
        currentVendorId: 'vendor-99',
        currentVendorName: 'Other Shop',
      });
      expect(err.message).toBe('already_mapped');
      expect(err.currentVendorId).toBe('vendor-99');
      expect(err.currentVendorName).toBe('Other Shop');
      expect(err.name).toBe('WhatsAppAlreadyMappedError');
    });
  });
});
