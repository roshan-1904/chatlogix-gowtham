import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'node:net';

const vendorFindUnique = vi.fn();
const whatsAppNumberFindMany = vi.fn();
const whatsAppNumberFindUnique = vi.fn();
const whatsAppNumberUpsert = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args)
    },
    whatsAppNumber: {
      findMany: (...args: unknown[]) => whatsAppNumberFindMany(...args),
      findUnique: (...args: unknown[]) => whatsAppNumberFindUnique(...args),
      upsert: (...args: unknown[]) => whatsAppNumberUpsert(...args)
    }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../../middleware/authorize.js', () => ({
  requireRole: (...allowedRoles: string[]) => (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user?.roles?.some((role: string) => allowedRoles.includes(role))) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  },
  requireVendorAccess: () => (_req: Request, _res: Response, next: NextFunction) => next()
}));

const { vendorsRouter } = await import('../vendors.js');

const VENDOR_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_VENDOR_ID = '00000000-0000-4000-8000-000000000002';
let currentUser: { id: string; roles: string[] } | null = { id: 'admin-user-1', roles: ['admin'] };

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (currentUser) {
    req.user = currentUser;
  }
  next();
});
app.use('/vendors', vendorsRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const port = (server.address() as AddressInfo).port;
const listUrl = `http://127.0.0.1:${port}/vendors/${VENDOR_ID}/whatsapp-numbers`;
const mapUrl = `http://127.0.0.1:${port}/vendors/${VENDOR_ID}/map-wa-number`;

afterAll(() => {
  server.close();
});

describe('Admin WhatsApp Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: 'admin-user-1', roles: ['admin'] };
    vendorFindUnique.mockResolvedValue({ id: VENDOR_ID, businessName: 'Prime Store' });
  });

  describe('GET /vendors/:id/whatsapp-numbers', () => {
    it('rejects non-admin with 403 forbidden', async () => {
      currentUser = { id: 'user-2', roles: ['vendor'] };

      const res = await fetch(listUrl);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'forbidden' });
      expect(whatsAppNumberFindMany).not.toHaveBeenCalled();
    });

    it('returns 404 when vendor is not found', async () => {
      vendorFindUnique.mockResolvedValue(null);

      const res = await fetch(listUrl);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
      expect(whatsAppNumberFindMany).not.toHaveBeenCalled();
    });

    it('returns empty array when vendor has no WhatsApp numbers mapped', async () => {
      whatsAppNumberFindMany.mockResolvedValue([]);

      const res = await fetch(listUrl);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
      expect(whatsAppNumberFindMany).toHaveBeenCalledWith({
        where: { vendorId: VENDOR_ID },
        select: expect.objectContaining({
          phoneNumberId: true,
          wabaId: true,
          connectStatus: true
        }),
        orderBy: { createdAt: 'desc' }
      });
    });

    it('returns mapped numbers with safe fields and strictly omits accessTokenEncrypted', async () => {
      const mockNumbers = [
        {
          id: 'wa-1',
          vendorId: VENDOR_ID,
          phoneNumberId: 'phone-id-123',
          wabaId: 'waba-id-456',
          connectStatus: 'live',
          connectPath: 'cloud',
          displayPhone: '+919876543210',
          displayName: 'Prime Store Support',
          primaryFundingId: 'credit-line-1',
          lastErrorCode: null,
          lastErrorMessage: null,
          connectedAt: new Date('2026-10-01T10:00:00Z').toISOString(),
          liveAt: new Date('2026-10-01T10:05:00Z').toISOString(),
          metaBusinessId: 'bm-789',
          createdAt: new Date('2026-10-01T09:55:00Z').toISOString()
        }
      ];
      whatsAppNumberFindMany.mockResolvedValue(mockNumbers);

      const res = await fetch(listUrl);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual(mockNumbers[0]);
      expect(data[0].accessTokenEncrypted).toBeUndefined();

      const callArgs = whatsAppNumberFindMany.mock.calls[0][0];
      expect(callArgs.select.accessTokenEncrypted).toBeUndefined();
    });
  });

  describe('POST /vendors/:id/map-wa-number', () => {
    it('rejects non-admin with 403 forbidden', async () => {
      currentUser = { id: 'user-2', roles: ['vendor'] };

      const res = await fetch(mapUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: '1001', wabaId: '2001' })
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'forbidden' });
      expect(whatsAppNumberUpsert).not.toHaveBeenCalled();
    });

    it('returns 404 when vendor does not exist', async () => {
      vendorFindUnique.mockResolvedValue(null);

      const res = await fetch(mapUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: '1001', wabaId: '2001' })
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
      expect(whatsAppNumberUpsert).not.toHaveBeenCalled();
    });

    it('rejects missing or non-string fields with 400 missing_fields', async () => {
      const payloads = [
        {},
        { phoneNumberId: '1001' },
        { wabaId: '2001' },
        { phoneNumberId: '', wabaId: '2001' },
        { phoneNumberId: '1001', wabaId: '   ' },
        { phoneNumberId: 12345, wabaId: '2001' },
        { phoneNumberId: '1001', wabaId: null }
      ];

      for (const body of payloads) {
        const res = await fetch(mapUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'missing_fields' });
      }

      expect(whatsAppNumberUpsert).not.toHaveBeenCalled();
    });

    it('returns 409 already_mapped when number belongs to another vendor and confirmMove is not true', async () => {
      whatsAppNumberFindUnique.mockResolvedValue({
        id: 'wa-existing',
        vendorId: OTHER_VENDOR_ID,
        phoneNumberId: '1001',
        wabaId: '2001',
        vendor: {
          id: OTHER_VENDOR_ID,
          businessName: 'Other Shop'
        }
      });

      const res = await fetch(mapUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: '1001', wabaId: '2001' })
      });

      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: 'already_mapped',
        currentVendorId: OTHER_VENDOR_ID,
        currentVendorName: 'Other Shop'
      });
      expect(whatsAppNumberUpsert).not.toHaveBeenCalled();
    });

    it('successfully maps an unowned number and sanitizes response', async () => {
      whatsAppNumberFindUnique.mockResolvedValue(null);
      whatsAppNumberUpsert.mockResolvedValue({
        id: 'wa-new',
        vendorId: VENDOR_ID,
        phoneNumberId: '1001',
        wabaId: '2001',
        connectStatus: null,
        connectPath: null,
        displayPhone: null,
        displayName: null,
        primaryFundingId: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        connectedAt: null,
        liveAt: null,
        metaBusinessId: null,
        createdAt: new Date().toISOString()
      });

      const res = await fetch(mapUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: '  1001  ',
          wabaId: '  2001  '
        })
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.phoneNumberId).toBe('1001');
      expect(data.wabaId).toBe('2001');
      expect(data.accessTokenEncrypted).toBeUndefined();

      expect(whatsAppNumberUpsert).toHaveBeenCalledWith({
        where: { phoneNumberId: '1001' },
        update: { vendorId: VENDOR_ID, wabaId: '2001' },
        create: { vendorId: VENDOR_ID, phoneNumberId: '1001', wabaId: '2001' },
        select: expect.objectContaining({
          id: true,
          phoneNumberId: true,
          wabaId: true
        })
      });

      const upsertArgs = whatsAppNumberUpsert.mock.calls[0][0];
      expect(upsertArgs.select.accessTokenEncrypted).toBeUndefined();
    });

    it('successfully reassigns an existing number when confirmMove is true', async () => {
      whatsAppNumberFindUnique.mockResolvedValue({
        id: 'wa-existing',
        vendorId: OTHER_VENDOR_ID,
        phoneNumberId: '1001',
        wabaId: '2001',
        vendor: {
          id: OTHER_VENDOR_ID,
          businessName: 'Other Shop'
        }
      });

      whatsAppNumberUpsert.mockResolvedValue({
        id: 'wa-existing',
        vendorId: VENDOR_ID,
        phoneNumberId: '1001',
        wabaId: '2001',
        connectStatus: 'not_started',
        connectPath: null,
        displayPhone: '+919999999999',
        displayName: 'Other Shop Support',
        primaryFundingId: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        connectedAt: null,
        liveAt: null,
        metaBusinessId: null,
        createdAt: new Date().toISOString()
      });

      const res = await fetch(mapUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId: '1001',
          wabaId: '2001',
          confirmMove: true
        })
      });

      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.vendorId).toBe(VENDOR_ID);
      expect(data.accessTokenEncrypted).toBeUndefined();
      expect(whatsAppNumberUpsert).toHaveBeenCalledWith({
        where: { phoneNumberId: '1001' },
        update: { vendorId: VENDOR_ID, wabaId: '2001' },
        create: { vendorId: VENDOR_ID, phoneNumberId: '1001', wabaId: '2001' },
        select: expect.any(Object)
      });
    });

    it('handles Prisma errors safely without exposing internal details', async () => {
      whatsAppNumberFindUnique.mockResolvedValue(null);
      whatsAppNumberUpsert.mockRejectedValue(new Error('P2002: Unique constraint failed'));

      const res = await fetch(mapUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumberId: '1001', wabaId: '2001' })
      });

      expect(res.status).toBe(500);
      const body: any = await res.json();
      expect(body).toEqual({ error: 'failed_to_map_number' });
      expect(body.message).toBeUndefined();
    });
  });
});
