import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AddressInfo } from 'node:net';

const vendorFindUnique = vi.fn();
const creditWalletFromTopUp = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args)
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

vi.mock('../../services/wallet/walletTopUpService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/wallet/walletTopUpService.js')>();
  return {
    ...actual,
    creditWalletFromTopUp: (...args: unknown[]) => creditWalletFromTopUp(...args)
  };
});

const { vendorsRouter } = await import('../vendors.js');

const VENDOR_ID = '00000000-0000-4000-8000-000000000001';
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
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/vendors/${VENDOR_ID}/recharge-wallet`;

afterAll(() => {
  server.close();
});

describe('POST /vendors/:id/recharge-wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: 'admin-user-1', roles: ['admin'] };
    vendorFindUnique.mockResolvedValue({ id: VENDOR_ID, businessName: 'Test Shop' });
    creditWalletFromTopUp.mockResolvedValue({
      balanceBeforeMilli: 10000,
      balanceAfterMilli: 60000,
      transactionId: 'txn-recharge-123',
      idempotent: false
    });
  });

  describe('Authorization', () => {
    it('rejects non-admin users with 403 forbidden', async () => {
      currentUser = { id: 'vendor-1', roles: ['vendor'] };

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000, reason: 'Goodwill credit' })
      });

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: 'forbidden' });
      expect(creditWalletFromTopUp).not.toHaveBeenCalled();
    });
  });

  describe('Amount validation', () => {
    it('rejects missing or zero amount with 400 invalid_amount', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Goodwill credit' })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_amount' });
    });

    it('rejects negative amount with 400 invalid_amount', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: -5000, reason: 'Goodwill credit' })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_amount' });
    });

    it('rejects fractional amount with 400 invalid_amount', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000.75, reason: 'Goodwill credit' })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_amount' });
    });
  });

  describe('Reason validation', () => {
    it('rejects missing reason with 400 invalid_reason', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000 })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_reason' });
    });

    it('rejects non-string reason with 400 invalid_reason', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000, reason: 12345 })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_reason' });
    });

    it('rejects whitespace-only reason with 400 invalid_reason', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000, reason: '    ' })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_reason' });
    });

    it('rejects reason shorter than 3 characters with 400 invalid_reason', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000, reason: 'ab' })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_reason' });
    });

    it('rejects reason longer than 200 characters with 400 invalid_reason', async () => {
      const longReason = 'x'.repeat(201);
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000, reason: longReason })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_reason' });
    });
  });

  describe('Idempotency key validation', () => {
    it('rejects non-string idempotencyKey with 400 invalid_idempotency_key', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000, reason: 'Goodwill credit', idempotencyKey: 99999 })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_idempotency_key' });
    });

    it('rejects empty string idempotencyKey with 400 invalid_idempotency_key', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000, reason: 'Goodwill credit', idempotencyKey: '' })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_idempotency_key' });
    });

    it('rejects whitespace-only idempotencyKey with 400 invalid_idempotency_key', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000, reason: 'Goodwill credit', idempotencyKey: '   ' })
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid_idempotency_key' });
    });
  });

  describe('Vendor lookup & Success execution', () => {
    it('returns 404 when vendor does not exist', async () => {
      vendorFindUnique.mockResolvedValue(null);

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 50000, reason: 'Goodwill credit' })
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not_found' });
      expect(creditWalletFromTopUp).not.toHaveBeenCalled();
    });

    it('successfully credits wallet, trims reason, uses supplied idempotencyKey', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 50000,
          reason: '  Goodwill credit after outage  ',
          idempotencyKey: 'custom-key-123'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        vendorId: VENDOR_ID,
        walletBalanceMilli: 60000,
        idempotent: false
      });

      expect(creditWalletFromTopUp).toHaveBeenCalledWith({
        vendorId: VENDOR_ID,
        amountMilli: 50000,
        idempotencyKey: 'custom-key-123',
        metadata: {
          source: 'admin_recharge',
          provider: 'admin',
          idempotencyKey: 'custom-key-123',
          amountMilli: 50000,
          currency: 'INR',
          adminUserId: 'admin-user-1',
          reason: 'Goodwill credit after outage'
        }
      });
    });

    it('generates a UUID-based key when idempotencyKey is omitted', async () => {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 25000,
          reason: 'Compensation for delay'
        })
      });

      expect(res.status).toBe(200);
      expect(creditWalletFromTopUp).toHaveBeenCalledTimes(1);

      const callArgs = creditWalletFromTopUp.mock.calls[0][0];
      expect(callArgs.amountMilli).toBe(25000);
      expect(callArgs.idempotencyKey).toMatch(/^admin_recharge:[0-9a-f-]{36}$/);
      expect(callArgs.metadata.idempotencyKey).toBe(callArgs.idempotencyKey);
      expect(callArgs.metadata.reason).toBe('Compensation for delay');
    });

    it('handles idempotent replay without creating new transaction', async () => {
      creditWalletFromTopUp.mockResolvedValue({
        balanceBeforeMilli: 60000,
        balanceAfterMilli: 60000,
        transactionId: 'txn-recharge-existing',
        idempotent: true
      });

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: 50000,
          reason: 'Goodwill credit after outage',
          idempotencyKey: 'replay-key-123'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({
        vendorId: VENDOR_ID,
        walletBalanceMilli: 60000,
        idempotent: true
      });
    });
  });
});
