import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchRazorpayWebhookTx } from '../razorpayWebhookDispatch.js';

const creditShopFunding = vi.fn();
const applyRefundState = vi.fn();
const applyDispute = vi.fn();

vi.mock('../refundWebhook.js', () => ({
  handleShopFundingCapturedInTx: (...args: unknown[]) => creditShopFunding(...args),
  handleRefundStateInTx: (...args: unknown[]) => applyRefundState(...args),
  handleDisputeWebhookInTx: (...args: unknown[]) => applyDispute(...args),
  maybeFlaggedCaptureRefundInTx: vi.fn().mockResolvedValue({ submitPlatformRefund: false })
}));

vi.mock('../orderPaymentWebhook.js', () => ({
  handleOrderPaymentCapturedInTx: vi.fn(),
  handlePaymentLinkExpiredInTx: vi.fn(),
  extractPaymentIdFromPaymentLinkPaid: vi.fn()
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe('dispatchRazorpayWebhookTx refunds and disputes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes shop_funding payment.captured and queues submitRefund', async () => {
    creditShopFunding.mockResolvedValue({ submitRefundId: 'cr-1' });
    const payment = {
      id: 'pay_sf',
      amount: 40_000,
      currency: 'INR',
      status: 'captured',
      notes: { purpose: 'shop_funding', vendorId: 'v1', customerRefundId: 'cr-1' }
    };

    const result = await dispatchRazorpayWebhookTx({} as never, {
      eventType: 'payment.captured',
      body: { event: 'payment.captured' },
      fetched: { payment },
      providerEventId: 'evt_sf'
    });

    expect(creditShopFunding).toHaveBeenCalled();
    expect(result.submitRefundIds).toEqual(['cr-1']);
  });

  it('does not queue submitRefund before shop funding lands', async () => {
    creditShopFunding.mockResolvedValue({});
    const payment = {
      id: 'pay_sf2',
      amount: 10_000,
      currency: 'INR',
      status: 'captured',
      notes: { purpose: 'shop_funding', vendorId: 'v1', customerRefundId: 'cr-2' }
    };

    const result = await dispatchRazorpayWebhookTx({} as never, {
      eventType: 'payment.captured',
      body: { event: 'payment.captured' },
      fetched: { payment },
      providerEventId: 'evt_sf2'
    });

    expect(result.submitRefundIds).toEqual([]);
  });

  it('routes refund.processed to applyRefundStateTx', async () => {
    const refund = {
      id: 'rfnd_1',
      payment_id: 'pay_1',
      amount: 50_000,
      status: 'processed',
      notes: { customerRefundId: 'cr-9' }
    };

    await dispatchRazorpayWebhookTx({} as never, {
      eventType: 'refund.processed',
      body: { event: 'refund.processed', payload: { refund: { entity: refund } } },
      fetched: { refund },
      providerEventId: 'evt_rf'
    });

    expect(applyRefundState).toHaveBeenCalledWith(
      {},
      refund,
      'processed'
    );
  });

  it('routes payment.dispute.lost to dispute handler', async () => {
    const dispute = { id: 'dp_1', payment_id: 'pay_1', amount: 100_000, status: 'lost' };

    await dispatchRazorpayWebhookTx({} as never, {
      eventType: 'payment.dispute.lost',
      body: { event: 'payment.dispute.lost', payload: { dispute: { entity: dispute } } },
      fetched: { dispute },
      providerEventId: 'evt_dp'
    });

    expect(applyDispute).toHaveBeenCalledWith({}, 'payment.dispute.lost', dispute);
  });
});
