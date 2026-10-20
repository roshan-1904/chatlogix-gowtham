import { describe, it, expect } from 'vitest';
import {
  computePaymentBadge,
  computePrefetchPaymentStatus,
  type OrderPaymentContext
} from '../orderPaymentState.js';

function ctx(partial: Partial<OrderPaymentContext> = {}): OrderPaymentContext {
  return {
    cashCollectedOrderIds: new Set(),
    upiQrSentOrderIds: new Set(),
    paymentLinkOfferOrderIds: new Set(),
    openLinkByOrderId: new Map(),
    capturedByOrderId: new Map(),
    paymentInitiatedAlertByOrderId: new Map(),
    ...partial
  };
}

const order = {
  id: 'ord-1',
  status: 'awaiting_payment',
  paymentMethod: 'razorpay' as string | null,
  totalAmount: 120000
};

describe('computePaymentBadge', () => {
  it('uses the contract priority, including cod instead of a separate cash label', () => {
    expect(computePaymentBadge(order, ctx())).toBe('unpaid');
    expect(
      computePaymentBadge(order, ctx({ openLinkByOrderId: new Map([['ord-1', { id: 'l', url: 'u', expiresAt: new Date(), amountPaise: 1 }]]) }))
    ).toBe('link_sent');
    expect(computePaymentBadge(order, ctx({ upiQrSentOrderIds: new Set(['ord-1']) }))).toBe('upi_sent');
    expect(
      computePaymentBadge(
        order,
        ctx({
          upiQrSentOrderIds: new Set(['ord-1']),
          paymentInitiatedAlertByOrderId: new Map([['ord-1', { id: 'a', createdAt: new Date(), message: 'shot' }]])
        })
      )
    ).toBe('payment_initiated');
    expect(
      computePaymentBadge(
        { ...order, paymentMethod: 'cod' },
        ctx({ paymentInitiatedAlertByOrderId: new Map([['ord-1', { id: 'a', createdAt: new Date(), message: 'shot' }]]) })
      )
    ).toBe('cod');
    expect(
      computePaymentBadge(
        { ...order, paymentMethod: 'vendor_collected' },
        ctx({ cashCollectedOrderIds: new Set(['ord-1']) })
      )
    ).toBe('paid_to_shop');
    expect(
      computePaymentBadge(
        { ...order, paymentMethod: 'cod' },
        ctx({ cashCollectedOrderIds: new Set(['ord-1']) })
      )
    ).toBe('cod');
    expect(
      computePaymentBadge(
        order,
        ctx({
          capturedByOrderId: new Map([
            ['ord-1', { status: 'captured', amountPaise: 120000, netMilli: 1n, refundedPaise: 0, capturedAt: new Date() }]
          ]),
          paymentInitiatedAlertByOrderId: new Map([['ord-1', { id: 'a', createdAt: new Date(), message: 'shot' }]])
        })
      )
    ).toBe('paid_online');
  });
});

describe('computePrefetchPaymentStatus', () => {
  it('reports upi_pending instead of cod_unpaid after a QR send', () => {
    const status = computePrefetchPaymentStatus(
      { ...order, paymentMethod: 'vendor_collected' },
      ctx({ upiQrSentOrderIds: new Set(['ord-1']) })
    );
    expect(status).toBe('upi_pending');
    expect(status).not.toBe('cod_unpaid');
  });
});
