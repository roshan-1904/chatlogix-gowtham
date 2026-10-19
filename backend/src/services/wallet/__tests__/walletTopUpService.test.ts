import { describe, it, expect, vi, beforeEach } from 'vitest';

const vendorFindUnique = vi.fn();
const walletTransactionFindFirst = vi.fn();
const vendorUpdate = vi.fn();
const walletTransactionCreate = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args)
    },
    walletTransaction: {
      findFirst: (...args: unknown[]) => walletTransactionFindFirst(...args)
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $executeRaw: vi.fn().mockResolvedValue(undefined),
        vendor: {
          findUnique: (...args: unknown[]) => vendorFindUnique(...args),
          update: (...args: unknown[]) => vendorUpdate(...args)
        },
        walletTransaction: {
          findFirst: (...args: unknown[]) => walletTransactionFindFirst(...args),
          create: (...args: unknown[]) => walletTransactionCreate(...args)
        }
      })
  }
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { assertVendorCanTopUp, creditWalletFromTopUp } from '../walletTopUpService.js';

describe('assertVendorCanTopUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows approved vendors', async () => {
    vendorFindUnique.mockResolvedValue({ id: 'v1', registrationStatus: 'approved' });
    await expect(assertVendorCanTopUp('v1')).resolves.toBeUndefined();
  });

  it('rejects onboarding vendors with 403', async () => {
    vendorFindUnique.mockResolvedValue({ id: 'v1', registrationStatus: 'pending_approval' });
    await expect(assertVendorCanTopUp('v1')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 when vendor missing', async () => {
    vendorFindUnique.mockResolvedValue(null);
    await expect(assertVendorCanTopUp('missing')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('creditWalletFromTopUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletTransactionFindFirst.mockResolvedValue(null);
    vendorFindUnique.mockResolvedValue({ walletBalanceMilli: 5000 });
    vendorUpdate.mockResolvedValue({});
    walletTransactionCreate.mockResolvedValue({ id: 'txn-1' });
  });

  it('increments balance and records recharge metadata', async () => {
    const result = await creditWalletFromTopUp({
      vendorId: 'v1',
      amountMilli: 100000,
      idempotencyKey: 'intent:abc',
      metadata: {
        source: 'wallet_topup',
        provider: 'mock',
        intentId: 'abc',
        idempotencyKey: 'intent:abc',
        amountMilli: 100000,
        currency: 'INR'
      }
    });

    expect(result).toEqual({
      balanceBeforeMilli: 5000,
      balanceAfterMilli: 105000,
      transactionId: 'txn-1',
      idempotent: false
    });
    expect(vendorUpdate).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { walletBalanceMilli: 105000 }
    });
  });

  it('does not double-credit when idempotencyKey already exists', async () => {
    walletTransactionFindFirst.mockResolvedValue({
      id: 'txn-existing',
      balanceBeforeMilli: 0,
      balanceAfterMilli: 100000
    });

    const result = await creditWalletFromTopUp({
      vendorId: 'v1',
      amountMilli: 100000,
      idempotencyKey: 'intent:dup',
      metadata: {
        source: 'wallet_topup',
        provider: 'mock',
        idempotencyKey: 'intent:dup',
        amountMilli: 100000,
        currency: 'INR'
      }
    });

    expect(result.idempotent).toBe(true);
    expect(result.balanceAfterMilli).toBe(100000);
    expect(vendorUpdate).not.toHaveBeenCalled();
    expect(walletTransactionCreate).not.toHaveBeenCalled();
  });
});
