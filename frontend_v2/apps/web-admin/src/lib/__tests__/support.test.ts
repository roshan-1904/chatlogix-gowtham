import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidStatusTransition,
  getStatusBadgeVariant,
  getStatusLabel,
  listCases,
  getCase,
  createCase,
  updateCaseStatus,
  addCaseNote,
  getShopContext,
  getAuditedConversation,
} from '../support';
import { apiClient } from '../api';

vi.mock('../api', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('Support module helpers and API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isValidStatusTransition', () => {
    it('allows valid forward and reopen transitions', () => {
      expect(isValidStatusTransition('open', 'waiting')).toBe(true);
      expect(isValidStatusTransition('open', 'resolved')).toBe(true);
      expect(isValidStatusTransition('waiting', 'open')).toBe(true);
      expect(isValidStatusTransition('waiting', 'resolved')).toBe(true);
      expect(isValidStatusTransition('resolved', 'open')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      expect(isValidStatusTransition('resolved', 'waiting')).toBe(false);
      expect(isValidStatusTransition('open', 'open')).toBe(false);
      expect(isValidStatusTransition('waiting', 'waiting')).toBe(false);
      expect(isValidStatusTransition('resolved', 'resolved')).toBe(false);
    });
  });

  describe('getStatusBadgeVariant & getStatusLabel', () => {
    it('maps statuses to badges and human labels correctly', () => {
      expect(getStatusBadgeVariant('open')).toBe('info');
      expect(getStatusBadgeVariant('waiting')).toBe('warning');
      expect(getStatusBadgeVariant('resolved')).toBe('success');

      expect(getStatusLabel('open')).toBe('Open');
      expect(getStatusLabel('waiting')).toBe('Waiting');
      expect(getStatusLabel('resolved')).toBe('Resolved');
    });
  });

  describe('API functions', () => {
    it('listCases calls /admin/support/cases with proper query params', async () => {
      (apiClient.get as any).mockResolvedValueOnce({
        supported: true,
        items: [],
        count: 0,
      });

      await listCases({ status: 'open', search: 'annapoorna', limit: 25, page: 1 });

      expect(apiClient.get).toHaveBeenCalledWith(
        '/admin/support/cases?status=open&search=annapoorna&limit=25&page=1'
      );
    });

    it('getCase calls /admin/support/cases/:id', async () => {
      (apiClient.get as any).mockResolvedValueOnce({ id: 'case-123' });

      const res = await getCase('case-123');
      expect(res.id).toBe('case-123');
      expect(apiClient.get).toHaveBeenCalledWith('/admin/support/cases/case-123');
    });

    it('createCase posts to /admin/support/cases', async () => {
      (apiClient.post as any).mockResolvedValueOnce({ id: 'case-new', subject: 'Subject' });

      await createCase({ vendorId: 'v-1', subject: 'New ticket' });

      expect(apiClient.post).toHaveBeenCalledWith('/admin/support/cases', {
        vendorId: 'v-1',
        subject: 'New ticket',
      });
    });

    it('updateCaseStatus patches /admin/support/cases/:id', async () => {
      (apiClient.patch as any).mockResolvedValueOnce({ id: 'case-1', status: 'waiting' });

      await updateCaseStatus('case-1', 'waiting');

      expect(apiClient.patch).toHaveBeenCalledWith('/admin/support/cases/case-1', {
        status: 'waiting',
      });
    });

    it('addCaseNote posts to /admin/support/cases/:id/notes', async () => {
      (apiClient.post as any).mockResolvedValueOnce({ id: 'note-1', body: 'Called customer' });

      await addCaseNote('case-1', 'Called customer');

      expect(apiClient.post).toHaveBeenCalledWith('/admin/support/cases/case-1/notes', {
        body: 'Called customer',
      });
    });

    it('getShopContext calls /admin/support/vendors/:vendorId/context', async () => {
      (apiClient.get as any).mockResolvedValueOnce({ vendor: { id: 'v-1' } });

      await getShopContext('v-1');

      expect(apiClient.get).toHaveBeenCalledWith('/admin/support/vendors/v-1/context');
    });

    it('getAuditedConversation calls /admin/support/conversations/:conversationId with caseId query param', async () => {
      (apiClient.get as any).mockResolvedValueOnce({ conversationId: 'c-1', messages: [] });

      await getAuditedConversation('c-1', 'case-99');

      expect(apiClient.get).toHaveBeenCalledWith(
        '/admin/support/conversations/c-1?caseId=case-99'
      );
    });
  });
});
