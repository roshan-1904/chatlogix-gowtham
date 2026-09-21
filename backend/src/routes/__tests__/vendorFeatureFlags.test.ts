import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'node:net';

const vendorFindUnique = vi.fn();
const vendorUpdate = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
      update: (...args: unknown[]) => vendorUpdate(...args)
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

const invalidateVendorFlagCache = vi.fn();
vi.mock('../../config/featureFlags.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/featureFlags.js')>();
  return {
    ...actual,
    invalidateVendorFlagCache: (...args: unknown[]) => invalidateVendorFlagCache(...args)
  };
});

const { vendorsRouter } = await import('../vendors.js');
const { enhancedGlobalErrorHandler } = await import('../../middleware/errorHandler.js');

const VENDOR_ID = '00000000-0000-4000-8000-000000000001';

let currentUser: { id: string; roles: string[] } = { id: 'admin-1', roles: ['admin'] };

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.user = currentUser;
  next();
});
app.use('/vendors', vendorsRouter);
app.use(enhancedGlobalErrorHandler);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/vendors/${VENDOR_ID}/feature-flags`;

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { id: 'admin-1', roles: ['admin'] };
  vendorFindUnique.mockResolvedValue({
    featureFlags: { whatsapp_conversation_parity: true, conversation_turn_audit: false }
  });
  vendorUpdate.mockImplementation(async ({ data }: { data: { featureFlags: Record<string, boolean> } }) => ({
    featureFlags: data.featureFlags
  }));
});

describe('GET /api/vendors/:id/feature-flags', () => {
  it('returns conversation_turn_audit false when absent or not true', async () => {
    vendorFindUnique.mockResolvedValueOnce({ featureFlags: null });

    const res = await fetch(baseUrl);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ conversation_turn_audit: false });
  });

  it('returns 403 for vendor role', async () => {
    currentUser = { id: 'user-1', roles: ['vendor'] };

    const res = await fetch(baseUrl);
    expect(res.status).toBe(403);
    expect(vendorFindUnique).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/vendors/:id/feature-flags', () => {
  it('merges into existing featureFlags without wiping other keys', async () => {
    const res = await fetch(baseUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_turn_audit: true })
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ conversation_turn_audit: true });
    expect(vendorUpdate).toHaveBeenCalledWith({
      where: { id: VENDOR_ID },
      data: {
        featureFlags: {
          whatsapp_conversation_parity: true,
          conversation_turn_audit: true
        }
      },
      select: { featureFlags: true }
    });
    expect(invalidateVendorFlagCache).toHaveBeenCalledWith(VENDOR_ID, 'conversation_turn_audit');
  });

  it('rejects unknown keys', async () => {
    const res = await fetch(baseUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_turn_audit: true, typo_flag: true })
    });

    expect(res.status).toBe(400);
    expect(vendorUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 for vendor role', async () => {
    currentUser = { id: 'user-1', roles: ['vendor'] };

    const res = await fetch(baseUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_turn_audit: true })
    });

    expect(res.status).toBe(403);
    expect(vendorUpdate).not.toHaveBeenCalled();
  });
});
