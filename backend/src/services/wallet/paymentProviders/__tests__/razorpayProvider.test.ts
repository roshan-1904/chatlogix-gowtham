import { describe, it, expect, vi, beforeEach } from 'vitest';

const walletTopUpIntentCreate = vi.fn();
const createOrder = vi.fn();

vi.mock('../../../../config/env.js', () => ({
  env: {
    RAZORPAY_KEY_ID: 'rzp_test_key',
    RAZORPAY_KEY_SECRET: 'secret',
    LOG_LEVEL: 'info'
  }
}));

vi.mock('../../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../../../../db/prisma.js', () => ({
  prisma: {
    walletTopUpIntent: {
      create: (...args: unknown[]) => walletTopUpIntentCreate(...args)
    }
  }
}));

vi.mock('../../../payments/razorpayApiClient.js', () => ({
  getRazorpayApiClient: () => ({ createOrder })
}));

import { razorpayWalletPaymentProvider } from '../razorpayProvider.js';

describe('razorpayWalletPaymentProvider.createIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    walletTopUpIntentCreate.mockImplementation(async ({ data }: { data: { id: string } }) => ({
      id: data.id,
      vendorId: 'v1',
      amountMilli: 1_000_000
    }));
    createOrder.mockResolvedValue({ id: 'order_xyz', amount: 100_000, currency: 'INR', status: 'created' });
  });

  it('creates intent and Razorpay order with wallet_topup notes', async () => {
    const result = await razorpayWalletPaymentProvider.createIntent('v1', 1_000_000);

    expect(walletTopUpIntentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: 'v1',
          amountMilli: 1_000_000,
          provider: 'razorpay',
          status: 'pending'
        })
      })
    );

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPaise: 100_000,
        notes: expect.objectContaining({
          purpose: 'wallet_topup',
          intentId: expect.any(String)
        })
      })
    );

    expect(result.clientAction).toMatchObject({
      type: 'razorpay_checkout',
      orderId: 'order_xyz',
      amountMilli: 1_000_000,
      keyId: 'rzp_test_key'
    });
  });
});
