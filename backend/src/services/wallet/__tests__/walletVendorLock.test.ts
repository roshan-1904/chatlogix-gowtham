import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeRaw = vi.fn();
const vendorFindUnique = vi.fn();
const vendorUpdate = vi.fn();
const walletTransactionFindFirst = vi.fn();
const walletTransactionCreate = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $executeRaw: executeRaw,
        vendor: {
          findUnique: vendorFindUnique,
          update: vendorUpdate
        },
        walletTransaction: {
          findFirst: walletTransactionFindFirst,
          create: walletTransactionCreate
        }
      })
  }
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { creditWalletFromTopUp } from '../walletTopUpService.js';

describe('creditWalletFromTopUp vendor lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeRaw.mockResolvedValue(undefined);
    walletTransactionFindFirst.mockResolvedValue(null);
    vendorFindUnique.mockResolvedValue({ walletBalanceMilli: 1000 });
    vendorUpdate.mockResolvedValue({});
    walletTransactionCreate.mockResolvedValue({ id: 'txn-1' });
  });

  it('acquires pg_advisory_xact_lock before reading balance', async () => {
    await creditWalletFromTopUp({
      vendorId: 'vendor-a',
      amountMilli: 500,
      idempotencyKey: 'pay_1',
      metadata: {
        source: 'wallet_topup',
        provider: 'razorpay',
        idempotencyKey: 'pay_1',
        amountMilli: 500,
        currency: 'INR'
      }
    });

    expect(executeRaw).toHaveBeenCalled();
    const lockCallOrder = executeRaw.mock.invocationCallOrder[0];
    const readCallOrder = vendorFindUnique.mock.invocationCallOrder[0];
    expect(lockCallOrder).toBeLessThan(readCallOrder);
  });
});
