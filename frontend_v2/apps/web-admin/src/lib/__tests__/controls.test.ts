import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  formatAuditAction,
  listAuditLogs,
  recordStaffAudit,
  getComputedAlerts,
  getTrialClocks,
  generateAuditLogsCsv,
  exportAuditLogsCsv,
  type StaffAuditLogEntry,
} from '../controls';
import * as usageModule from '../usage';
import { apiClient } from '../api';

vi.mock('../api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
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
      (apiClient.get as any).mockResolvedValueOnce({
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

      expect(apiClient.get).toHaveBeenCalledWith(
        '/admin/audit?action=markup_changed&search=annapoorna&limit=25&page=2'
      );
    });

    it('recordStaffAudit posts to /admin/audit/record', async () => {
      (apiClient.post as any).mockResolvedValueOnce({ recorded: true });

      const res = await recordStaffAudit(
        'shop_viewed',
        'v-1',
        'Staff viewed catalog',
        { tab: 'catalog' }
      );

      expect(res.recorded).toBe(true);
      expect(apiClient.post).toHaveBeenCalledWith('/admin/audit/record', {
        action: 'shop_viewed',
        vendorId: 'v-1',
        summary: 'Staff viewed catalog',
        metadata: { tab: 'catalog' },
      });
    });

    it('getComputedAlerts calls /admin/alerts/computed', async () => {
      (apiClient.get as any).mockResolvedValueOnce({ alerts: [], count: 0 });

      await getComputedAlerts();
      expect(apiClient.get).toHaveBeenCalledWith('/admin/alerts/computed');
    });

    it('getTrialClocks calls /admin/trials with filter parameter', async () => {
      (apiClient.get as any).mockResolvedValueOnce({ filter: 'past', items: [], count: 0 });

      await getTrialClocks('past');
      expect(apiClient.get).toHaveBeenCalledWith('/admin/trials?filter=past');
    });
  });
  describe('generateAuditLogsCsv and exportAuditLogsCsv', () => {
    const mockLogs: StaffAuditLogEntry[] = [
      {
        id: 'log-1',
        actorId: 'admin-1',
        action: 'wallet_credited',
        vendorId: 'vendor-123',
        summary: 'Credited ₹50.00 to wallet',
        metadata: { amountMilli: 50000, reason: 'Trial top-up' },
        createdAt: '2026-11-09T10:00:00.000Z',
      },
      {
        id: 'log-2',
        actorId: 'admin-2',
        action: 'settings_changed',
        vendorId: null,
        summary: 'Platform markup updated to 20%',
        metadata: null,
        createdAt: '2026-11-09T09:30:00.000Z',
      },
    ];

    it('generates standard RFC-4180 CSV header and rows', () => {
      const csv = generateAuditLogsCsv(mockLogs);
      expect(csv).toContain('Time (UTC),Actor,Action,Vendor,Summary,Metadata');
      expect(csv).toContain('2026-11-09T10:00:00.000Z,admin-1,wallet_credited,vendor-123,Credited ₹50.00 to wallet');
      expect(csv).toContain('2026-11-09T09:30:00.000Z,admin-2,settings_changed,Platform,Platform markup updated to 20%');
    });

    it('calls triggerBlobDownload with CSV blob and filename', () => {
      const triggerSpy = vi.spyOn(usageModule, 'triggerBlobDownload').mockImplementation(() => {});

      exportAuditLogsCsv(mockLogs, 'custom-audit.csv');

      expect(triggerSpy).toHaveBeenCalledWith(
        expect.any(Blob),
        'custom-audit.csv'
      );
      triggerSpy.mockRestore();
    });
  });
});