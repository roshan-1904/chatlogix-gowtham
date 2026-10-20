import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleOrderPaymentLinksAfterCartApply } from '../orderPaymentPipeline.js';

const orderFindUnique = vi.fn();
const vendorFindUnique = vi.fn();
const createPaymentLinkForOrder = vi.fn();
const offerPaymentLink = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    order: { findUnique: (...args: unknown[]) => orderFindUnique(...args) },
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) }
  }
}));

vi.mock('../../services/paymentLinkService.js', () => ({
  getPaymentLinkService: () => ({ createPaymentLinkForOrder })
}));

vi.mock('../../services/payments/orderPaymentOffer.js', () => ({
  offerPaymentLink: (...args: unknown[]) => offerPaymentLink(...args),
  acceptPaymentLinkOffer: vi.fn().mockResolvedValue({ sent: false }),
  declinePaymentLinkOffer: vi.fn(),
  getLatestPaymentLinkOfferState: vi.fn()
}));

describe('handleOrderPaymentLinksAfterCartApply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPaymentLinkForOrder.mockResolvedValue({ sent: false });
  });

  it('offers link instead of auto-send when paymentLinkAutoSend is on', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'ord_1',
      status: 'awaiting_payment',
      totalAmount: 1000,
      paymentMethod: 'razorpay',
      orderNumber: 'ORD-1'
    });
    vendorFindUnique.mockResolvedValue({
      paymentsManagedByChatlogix: true,
      paymentLinkAutoSend: true
    });
    offerPaymentLink.mockResolvedValue(undefined);

    const result = await handleOrderPaymentLinksAfterCartApply({
      vendorId: 'v1',
      conversationId: 'c1',
      orderId: 'ord_1',
      mutated: true,
      ops: [{ type: 'confirm' }]
    });

    expect(createPaymentLinkForOrder).not.toHaveBeenCalled();
    expect(offerPaymentLink).toHaveBeenCalled();
    expect(result.paymentLinkOffered?.orderNumber).toBe('ORD-1');
  });

  it('does not auto-send when paymentLinkAutoSend is off', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'ord_1',
      status: 'awaiting_payment',
      totalAmount: 1000,
      paymentMethod: 'razorpay'
    });
    vendorFindUnique.mockResolvedValue({
      paymentsManagedByChatlogix: true,
      paymentLinkAutoSend: false
    });

    await handleOrderPaymentLinksAfterCartApply({
      vendorId: 'v1',
      conversationId: 'c1',
      orderId: 'ord_1',
      mutated: true,
      ops: [{ type: 'confirm' }]
    });

    expect(createPaymentLinkForOrder).not.toHaveBeenCalled();
  });
});
