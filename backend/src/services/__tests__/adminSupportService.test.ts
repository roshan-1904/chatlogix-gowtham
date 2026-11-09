import { describe, it, expect, vi, beforeEach } from 'vitest';

const vendorFindUnique = vi.fn();
const whatsAppNumberFindFirst = vi.fn();
const messageFindFirst = vi.fn();
const customerQueryFindMany = vi.fn();
const staffAuditLogCreate = vi.fn();
const queryRawUnsafe = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
    },
    whatsAppNumber: {
      findFirst: (...args: unknown[]) => whatsAppNumberFindFirst(...args),
    },
    message: {
      findFirst: (...args: unknown[]) => messageFindFirst(...args),
    },
    customerQuery: {
      findMany: (...args: unknown[]) => customerQueryFindMany(...args),
    },
    staffAuditLog: {
      create: (...args: unknown[]) => staffAuditLogCreate(...args),
    },
    $queryRawUnsafe: (...args: unknown[]) => queryRawUnsafe(...args),
  },
}));

import {
  isValidCaseStatusTransition,
  recordStaffAuditLog,
  getShopContext,
  checkAuditTableExists,
  checkCaseTableExists,
  setCustomAuditWriterForTest,
  type StaffCaseStatus,
} from '../adminSupportService.js';

describe('Admin Support Service Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCustomAuditWriterForTest(null);
  });

  describe('isValidCaseStatusTransition', () => {
    it('allows valid forward and reopen transitions', () => {
      expect(isValidCaseStatusTransition('open', 'waiting')).toBe(true);
      expect(isValidCaseStatusTransition('open', 'resolved')).toBe(true);
      expect(isValidCaseStatusTransition('waiting', 'open')).toBe(true);
      expect(isValidCaseStatusTransition('waiting', 'resolved')).toBe(true);
      expect(isValidCaseStatusTransition('resolved', 'open')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      // Reopen to waiting is prohibited (resolved -> open only)
      expect(isValidCaseStatusTransition('resolved', 'waiting')).toBe(false);
      // Same status transitions
      expect(isValidCaseStatusTransition('open', 'open')).toBe(false);
      expect(isValidCaseStatusTransition('waiting', 'waiting')).toBe(false);
      expect(isValidCaseStatusTransition('resolved', 'resolved')).toBe(false);
      // Unknown status
      expect(isValidCaseStatusTransition('invalid' as StaffCaseStatus, 'open')).toBe(false);
    });
  });

  describe('checkAuditTableExists & checkCaseTableExists', () => {
    it('returns true when information_schema contains the table', async () => {
      queryRawUnsafe.mockResolvedValueOnce([{ '?column?': 1 }]);
      const exists = await checkAuditTableExists();
      expect(exists).toBe(true);
    });

    it('returns false when table does not exist or error is thrown', async () => {
      queryRawUnsafe.mockResolvedValueOnce([]);
      const exists = await checkCaseTableExists();
      expect(exists).toBe(false);

      queryRawUnsafe.mockRejectedValueOnce(new Error('DB disconnect'));
      const existsAfterError = await checkAuditTableExists();
      expect(existsAfterError).toBe(false);
    });
  });

  describe('recordStaffAuditLog', () => {
    it('delegates to customAuditWriter if registered for test', async () => {
      const mockWriter = vi.fn().mockResolvedValueOnce(true);
      setCustomAuditWriterForTest(mockWriter);

      const res = await recordStaffAuditLog({
        actorId: 'admin-1',
        action: 'case_opened',
        vendorId: 'v-1',
        summary: 'Case opened',
      });

      expect(res).toBe(true);
      expect(mockWriter).toHaveBeenCalledWith({
        actorId: 'admin-1',
        action: 'case_opened',
        vendorId: 'v-1',
        summary: 'Case opened',
      });
      expect(staffAuditLogCreate).not.toHaveBeenCalled();
    });

    it('fails closed (returns false) if audit table does not exist', async () => {
      queryRawUnsafe.mockResolvedValueOnce([]); // Table check returns false

      const res = await recordStaffAuditLog({
        actorId: 'admin-1',
        action: 'conversation_read',
        vendorId: 'v-1',
        summary: 'Read transcript',
      });

      expect(res).toBe(false);
      expect(staffAuditLogCreate).not.toHaveBeenCalled();
    });

    it('successfully creates audit entry via prisma when table exists', async () => {
      queryRawUnsafe.mockResolvedValueOnce([{ '?column?': 1 }]); // Table exists
      staffAuditLogCreate.mockResolvedValueOnce({ id: 'aud-1' });

      const res = await recordStaffAuditLog({
        actorId: 'admin-1',
        action: 'conversation_read',
        vendorId: 'v-1',
        summary: 'Staff viewed conversation conv-123 for shop Annapoorna',
        metadata: { conversationId: 'conv-123' },
      });

      expect(res).toBe(true);
      expect(staffAuditLogCreate).toHaveBeenCalledWith({
        data: {
          actorId: 'admin-1',
          action: 'conversation_read',
          vendorId: 'v-1',
          summary: 'Staff viewed conversation conv-123 for shop Annapoorna',
          metadata: { conversationId: 'conv-123' },
        },
      });
    });

    it('fails closed (returns false) if prisma insert throws', async () => {
      queryRawUnsafe.mockResolvedValueOnce([{ '?column?': 1 }]);
      staffAuditLogCreate.mockRejectedValueOnce(new Error('Insert violation'));

      const res = await recordStaffAuditLog({
        actorId: 'admin-1',
        action: 'conversation_read',
        vendorId: 'v-1',
        summary: 'Audit entry that fails',
      });

      expect(res).toBe(false);
    });
  });

  describe('getShopContext', () => {
    it('returns null if vendor not found', async () => {
      vendorFindUnique.mockResolvedValueOnce(null);

      const ctx = await getShopContext('missing-v');
      expect(ctx).toBeNull();
    });

    it('aggregates shop context with wallet, whatsapp, last failure, and open queries', async () => {
      vendorFindUnique.mockResolvedValueOnce({
        id: 'v-100',
        businessName: 'Annapoorna Supermarket',
        walletBalanceMilli: 25000,
        markupPercent: 40,
      });

      whatsAppNumberFindFirst.mockResolvedValueOnce({
        displayPhone: '+91 98765 43210',
        phoneNumberId: 'phone-id-1',
        connectStatus: 'live',
      });

      messageFindFirst.mockResolvedValueOnce({
        id: 'm-fail',
        conversationId: 'c-fail',
        timestamp: new Date('2026-10-18T10:30:00Z'),
        failureReason: 'Rate limit exceeded on Meta API',
        content: 'Failed message preview text',
      });

      customerQueryFindMany.mockResolvedValueOnce([
        {
          id: 'q-1',
          questionEn: 'What are your store hours?',
          category: 'timing',
          hitCount: 12,
          lastSeenAt: new Date('2026-10-18T09:00:00Z'),
          status: 'open',
        },
      ]);

      const ctx = await getShopContext('v-100');
      expect(ctx).not.toBeNull();
      expect(ctx?.vendor.businessName).toBe('Annapoorna Supermarket');
      expect(ctx?.vendor.walletBalanceMilli).toBe(25000);
      expect(ctx?.vendor.markupPercent).toBe(40);
      expect(ctx?.whatsapp?.phoneNumber).toBe('+91 98765 43210');
      expect(ctx?.whatsapp?.connectStatus).toBe('live');
      expect(ctx?.lastFailure?.failureReason).toBe('Rate limit exceeded on Meta API');
      expect(ctx?.lastFailure?.preview).toBe('Failed message preview text');
      expect(ctx?.openQuestions.length).toBe(1);
      expect(ctx?.openQuestions[0].hitCount).toBe(12);
    });

    it('handles gracefully when optional relations are null/empty', async () => {
      vendorFindUnique.mockResolvedValueOnce({
        id: 'v-empty',
        businessName: 'New Shop',
        walletBalanceMilli: 0,
        markupPercent: 50,
      });

      whatsAppNumberFindFirst.mockResolvedValueOnce(null);
      messageFindFirst.mockResolvedValueOnce(null);
      customerQueryFindMany.mockResolvedValueOnce([]);

      const ctx = await getShopContext('v-empty');
      expect(ctx).not.toBeNull();
      expect(ctx?.whatsapp).toBeNull();
      expect(ctx?.lastFailure).toBeNull();
      expect(ctx?.openQuestions).toEqual([]);
    });
  });
});

