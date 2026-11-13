import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatAuditAction,
  listAuditLogs,
  recordStaffAudit,
  getComputedAlerts,
  getTrialClocks,
} from '../controls';

const mockGet = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockPost = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../api', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

describe('Controls module helpers and API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatAuditAction', () => {
    it('maps known actions to badges and labels correctly', () => {
      expect(formatAuditAction('wallet_credited')).toEqual({
        label: 'Wallet Credited',
        variant: 'success',
      });
      expect(formatAuditAction('markup_changed')).toEqual({
        label: 'Markup Changed',
        variant: 'warning',
      });
      expect(formatAuditAction('conversation_read')).toEqual({
        label: 'Transcript Read',
        variant: 'info',
      });
      expect(formatAuditAction('settings_changed')).toEqual({
        label: 'Settings Changed',
        variant: 'warning',
      });
      expect(formatAuditAction('shop_viewed')).toEqual({
        label: 'Shop Inspected',
        variant: 'default',
      });
      expect(formatAuditAction('fx_refreshed')).toEqual({
        label: 'FX Refreshed',
        variant: 'success',
      });
    });

    it('formats unknown actions safely by replacing underscores', () => {
      expect(formatAuditAction('custom_admin_event')).toEqual({
        label: 'custom admin event',
        variant: 'default',
      });
    });
  });

  describe('API functions', () => {
    it('listAuditLogs calls /admin/audit with query parameters', async () => {
      mockGet.mockResolvedValueOnce({
        supported: true,
        items: [],
        count: 0,
      });

      await listAuditLogs({
        action: 'markup_changed',
        search: 'annapoorna',
        limit: 25,
        page: 2,
      });

      expect(mockGet).toHaveBeenCalledWith(
        '/admin/audit?action=markup_changed&search=annapoorna&limit=25&page=2'
      );
    });

    it('recordStaffAudit posts to /admin/audit/record', async () => {
      mockPost.mockResolvedValueOnce({ recorded: true });

      const res = await recordStaffAudit(
        'shop_viewed',
        'v-1',
        'Staff viewed catalog',
        { tab: 'catalog' }
      );

      expect(res.recorded).toBe(true);
      expect(mockPost).toHaveBeenCalledWith('/admin/audit/record', {
        action: 'shop_viewed',
        vendorId: 'v-1',
        summary: 'Staff viewed catalog',
        metadata: { tab: 'catalog' },
      });
    });

    it('getComputedAlerts calls /admin/alerts/computed', async () => {
      mockGet.mockResolvedValueOnce({ alerts: [], count: 0 });

      await getComputedAlerts();
      expect(mockGet).toHaveBeenCalledWith('/admin/alerts/computed');
    });

    it('getTrialClocks calls /admin/trials with filter parameter', async () => {
      mockGet.mockResolvedValueOnce({ filter: 'past', items: [], count: 0 });

      await getTrialClocks('past');
      expect(mockGet).toHaveBeenCalledWith('/admin/trials?filter=past');
    });
  });
});
