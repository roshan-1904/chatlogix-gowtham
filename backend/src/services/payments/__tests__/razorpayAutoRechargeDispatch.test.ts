import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchRazorpayWebhookTx } from '../razorpayWebhookDispatch.js';

const handleCaptured = vi.fn();
const handleTokenCancelled = vi.fn();

vi.mock('../../wallet/autoRechargeService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../wallet/autoRechargeService.js')>();
  return {
    ...actual,
    handleAutoRechargePaymentCapturedInTx: (...args: unknown[]) => handleCaptured(...args),
    handleTokenPausedOrCancelledInTx: (...args: unknown[]) => handleTokenCancelled(...args),
    handleTokenConfirmedInTx: vi.fn(),
    handleTokenRejectedInTx: vi.fn(),
    handleAutoRechargePaymentFailedInTx: vi.fn()
  };
});

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe('dispatchRazorpayWebhookTx auto-recharge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes wallet_autorecharge payment.captured to capture handler', async () => {
    const payment = {
      id: 'pay_ar',
      amount: 50_000,
      currency: 'INR',
      status: 'captured',
      notes: { purpose: 'wallet_autorecharge', vendorId: 'v1' }
    };

    await dispatchRazorpayWebhookTx({} as never, {
      eventType: 'payment.captured',
      body: { event: 'payment.captured' },
      fetched: { payment },
      providerEventId: 'evt_ar'
    });

    expect(handleCaptured).toHaveBeenCalled();
  });

  it('routes token.cancelled to mandate lifecycle handler', async () => {
    await dispatchRazorpayWebhookTx({} as never, {
      eventType: 'token.cancelled',
      body: {
        event: 'token.cancelled',
        payload: { token: { entity: { id: 'token_1', notes: { vendorId: 'v1' } } } }
      },
      fetched: {},
      providerEventId: 'evt_tok'
    });

    expect(handleTokenCancelled).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'token_1' }),
      'token.cancelled'
    );
  });
});
