import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchRazorpayWebhookTx } from '../razorpayWebhookDispatch.js';
import type { RazorpayPaymentEntity } from '../razorpayApiClient.js';

const creditInTx = vi.fn();
const walletTopUpIntentFindUnique = vi.fn();
const walletTopUpIntentUpdate = vi.fn();

vi.mock('../../wallet/walletTopUpService.js', () => ({
  creditWalletFromTopUpInTx: (...args: unknown[]) => creditInTx(...args)
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

function txClient() {
  return {
    walletTopUpIntent: {
      findUnique: walletTopUpIntentFindUnique,
      update: walletTopUpIntentUpdate
    }
  };
}

const INTENT_ID = '11111111-1111-4111-8111-111111111111';

describe('dispatchRazorpayWebhookTx wallet_topup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    creditInTx.mockResolvedValue({
      balanceBeforeMilli: 0,
      balanceAfterMilli: 1_000_000,
      transactionId: 'txn-1',
      idempotent: false
    });
    walletTopUpIntentFindUnique.mockResolvedValue({
      id: INTENT_ID,
      vendorId: 'v1',
      amountMilli: 1_000_000,
      status: 'pending'
    });
    walletTopUpIntentUpdate.mockResolvedValue({});
  });

  it('credits the intent amount when captured paise match', async () => {
    const payment: RazorpayPaymentEntity = {
      id: 'pay_abc',
      amount: 100_000,
      currency: 'INR',
      status: 'captured',
      order_id: 'order_1',
      notes: { purpose: 'wallet_topup', intentId: INTENT_ID }
    };

    await dispatchRazorpayWebhookTx(txClient() as never, {
      eventType: 'payment.captured',
      body: { event: 'payment.captured' },
      fetched: { payment },
      providerEventId: 'evt_1'
    });

    expect(creditInTx).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        vendorId: 'v1',
        amountMilli: 1_000_000,
        idempotencyKey: 'pay_abc'
      })
    );
    expect(walletTopUpIntentUpdate).toHaveBeenCalledWith({
      where: { id: INTENT_ID },
      data: { status: 'completed', completedAt: expect.any(Date) }
    });
  });

  it('does not credit when captured paise mismatch', async () => {
    const payment: RazorpayPaymentEntity = {
      id: 'pay_bad',
      amount: 99_000,
      currency: 'INR',
      status: 'captured',
      notes: { purpose: 'wallet_topup', intentId: INTENT_ID }
    };

    await dispatchRazorpayWebhookTx(txClient() as never, {
      eventType: 'payment.captured',
      body: { event: 'payment.captured' },
      fetched: { payment },
      providerEventId: 'evt_2'
    });

    expect(creditInTx).not.toHaveBeenCalled();
    expect(walletTopUpIntentUpdate).not.toHaveBeenCalled();
  });

  it('skips intent update when credit is idempotent replay', async () => {
    creditInTx.mockResolvedValue({
      balanceBeforeMilli: 0,
      balanceAfterMilli: 1_000_000,
      transactionId: 'txn-1',
      idempotent: true
    });
    walletTopUpIntentFindUnique.mockResolvedValue({
      id: INTENT_ID,
      vendorId: 'v1',
      amountMilli: 1_000_000,
      status: 'completed'
    });

    const payment: RazorpayPaymentEntity = {
      id: 'pay_abc',
      amount: 100_000,
      currency: 'INR',
      status: 'captured',
      notes: { purpose: 'wallet_topup', intentId: INTENT_ID }
    };

    await dispatchRazorpayWebhookTx(txClient() as never, {
      eventType: 'payment.captured',
      body: { event: 'payment.captured' },
      fetched: { payment },
      providerEventId: 'evt_3'
    });

    expect(creditInTx).toHaveBeenCalledTimes(1);
    expect(walletTopUpIntentUpdate).not.toHaveBeenCalled();
  });
});
