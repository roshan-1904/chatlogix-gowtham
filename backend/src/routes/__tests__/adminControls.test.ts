import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const vendorFindMany = vi.fn();
const messageFindMany = vi.fn();
const whatsAppNumberFindMany = vi.fn();
const platformSettingsFindFirst = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findMany: (...args: unknown[]) => vendorFindMany(...args),
    },
    message: {
      findMany: (...args: unknown[]) => messageFindMany(...args),
    },
    whatsAppNumber: {
      findMany: (...args: unknown[]) => whatsAppNumberFindMany(...args),
    },
    platformSettings: {
      findFirst: (...args: unknown[]) => platformSettingsFindFirst(...args),
    },
  },
}));

const { adminControlsRouter } = await import('../adminControls.js');
const {
  clearInMemoryAuditStoreForTest,
  seedInMemoryAuditLogForTest,
} = await import('../../services/adminControlsService.js');

const app = express();
app.use(express.json());
// Simulate authenticated admin user
app.use((req, _res, next) => {
  (req as any).user = { id: 'admin-user-1', roles: ['admin'] };
  next();
});
app.use('/admin', adminControlsRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin`;

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  clearInMemoryAuditStoreForTest();
});

describe('Admin Controls Module', () => {
  describe('GET /audit - Audit Log Viewer', () => {
    it('returns pending_migration when store is empty and table does not exist', async () => {
      const res = await fetch(`${baseUrl}/audit`);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.supported).toBe(false);
      expect(data.status).toBe('pending_migration');
    });

    it('returns audit log entries with action and search filtering', async () => {
      seedInMemoryAuditLogForTest({
        id: 'aud-1',
        actorId: 'admin-1',
        action: 'markup_changed',
        vendorId: 'v-1',
        summary: 'Markup set to 60% for Annapoorna',
        createdAt: '2026-10-17T08:55:00Z',
      });
      seedInMemoryAuditLogForTest({
        id: 'aud-2',
        actorId: 'admin-2',
        action: 'wallet_credited',
        vendorId: 'v-1',
        summary: 'Credited ₹50.00 to Annapoorna',
        createdAt: '2026-10-17T09:00:00Z',
      });

      // Filter by action
      const resAction = await fetch(`${baseUrl}/audit?action=markup_changed`);
      expect(resAction.status).toBe(200);
      const dataAction: any = await resAction.json();
      expect(dataAction.supported).toBe(true);
      expect(dataAction.items.length).toBe(1);
      expect(dataAction.items[0].action).toBe('markup_changed');

      // Filter by search
      const resSearch = await fetch(`${baseUrl}/audit?search=Credited`);
      expect(resSearch.status).toBe(200);
      const dataSearch: any = await resSearch.json();
      expect(dataSearch.items.length).toBe(1);
      expect(dataSearch.items[0].action).toBe('wallet_credited');
    });
  });

  describe('POST /audit/record - Record staff audit action', () => {
    it('validates action string and records the entry in memory', async () => {
      const resInvalid = await fetch(`${baseUrl}/audit/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(resInvalid.status).toBe(400);

      const resValid = await fetch(`${baseUrl}/audit/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'shop_viewed',
          vendorId: 'v-look',
          summary: 'Staff viewed catalog for shop v-look',
          metadata: { tab: 'catalog' },
        }),
      });
      expect(resValid.status).toBe(201);
      const dataValid: any = await resValid.json();
      expect(dataValid.recorded).toBe(true);

      // Verify it is visible in GET /audit
      const resAudit = await fetch(`${baseUrl}/audit`);
      const dataAudit: any = await resAudit.json();
      expect(dataAudit.items.length).toBe(1);
      expect(dataAudit.items[0].action).toBe('shop_viewed');
    });
  });

  describe('GET /alerts/computed - Evaluated platform & vendor alerts', () => {
    it('evaluates low_wallet, failing_replies, whatsapp_dropped, and fx_stale', async () => {
      // 1. Low wallet mock
      vendorFindMany.mockResolvedValueOnce([
        {
          id: 'v-low',
          businessName: 'Low Balance Shop',
          walletBalanceMilli: 15000, // ₹15.00 < ₹20.00 threshold
        },
      ]);

      // 2. Failing replies mock (>= 3 failed messages for one vendor)
      messageFindMany.mockResolvedValueOnce([
        {
          conversation: {
            vendorId: 'v-fail',
            vendor: { id: 'v-fail', businessName: 'Failing Shop' },
          },
        },
        {
          conversation: {
            vendorId: 'v-fail',
            vendor: { id: 'v-fail', businessName: 'Failing Shop' },
          },
        },
        {
          conversation: {
            vendorId: 'v-fail',
            vendor: { id: 'v-fail', businessName: 'Failing Shop' },
          },
        },
      ]);

      // 3. WhatsApp dropped mock
      whatsAppNumberFindMany.mockResolvedValueOnce([
        {
          vendorId: 'v-wa',
          connectStatus: 'disconnected',
          vendor: { id: 'v-wa', businessName: 'WA Dropped Shop' },
        },
      ]);

      // 4. Stale FX rate mock (>48h old)
      platformSettingsFindFirst.mockResolvedValueOnce({
        usdToInrFetchedAt: new Date(Date.now() - 50 * 60 * 60 * 1000), // 50 hours old
      });

      const res = await fetch(`${baseUrl}/alerts/computed`);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.count).toBe(4);

      const types = data.alerts.map((a: any) => a.type);
      expect(types).toContain('low_wallet');
      expect(types).toContain('failing_replies');
      expect(types).toContain('whatsapp_dropped');
      expect(types).toContain('fx_stale');

      const lowWalletAlert = data.alerts.find((a: any) => a.type === 'low_wallet');
      expect(lowWalletAlert.summary).toContain('₹15.00');

      const failingAlert = data.alerts.find((a: any) => a.type === 'failing_replies');
      expect(failingAlert.summary).toContain('3 failed outbound replies');

      const waAlert = data.alerts.find((a: any) => a.type === 'whatsapp_dropped');
      expect(waAlert.summary).toContain('disconnected');
    });
  });

  describe('GET /trials - Trial Clocks', () => {
    it('returns trial rows with correct caption based on approval and expiry', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const futureDate = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

      vendorFindMany.mockResolvedValueOnce([
        {
          id: 'v-t1',
          businessName: 'Approved Shop',
          registrationStatus: 'approved',
          trialGrantedMilli: 50000,
          walletBalanceMilli: 40000,
          trialExpiresAt: pastDate,
        },
        {
          id: 'v-t2',
          businessName: 'Expired Onboarding Shop',
          registrationStatus: 'onboarding',
          trialGrantedMilli: 50000,
          walletBalanceMilli: 25000,
          trialExpiresAt: pastDate,
        },
        {
          id: 'v-t3',
          businessName: 'Active Trial Shop',
          registrationStatus: 'onboarding',
          trialGrantedMilli: 50000,
          walletBalanceMilli: 45000,
          trialExpiresAt: futureDate,
        },
      ]);

      const res = await fetch(`${baseUrl}/trials?filter=all`);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.count).toBe(3);

      expect(data.items[0].caption).toBe('Expiry does not stop replies. This shop is approved.');
      expect(data.items[1].caption).toBe('Replies are blocked until the shop is approved.');
      expect(data.items[2].caption).toBe('Replies stop at this time if the shop is still not approved.');
    });
  });
});
