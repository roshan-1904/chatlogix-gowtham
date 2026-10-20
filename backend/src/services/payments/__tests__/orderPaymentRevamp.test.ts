import { describe, it, expect, beforeEach, vi } from 'vitest';
import { computePrefetchPaymentStatus, loadOrderPaymentContext } from '../orderPaymentState.js';
import { offerPaymentLink, acceptPaymentLinkOffer, getLatestPaymentLinkOfferState } from '../orderPaymentOffer.js';
import { markOrderCashCollected } from '../codOrderService.js';

const auditCreate = vi.fn();
const auditFindMany = vi.fn();
const auditFindFirst = vi.fn();
const orderFindUnique = vi.fn();
const paymentFindFirst = vi.fn();
const paymentLinkFindMany = vi.fn();
const customerPaymentFindMany = vi.fn();
const orderAlertFindMany = vi.fn();
const cancelOpenLinks = vi.fn();
const createPaymentLinkForOrder = vi.fn();
const transaction = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    orderAuditLog: {
      create: (...args: unknown[]) => auditCreate(...args),
      findMany: (...args: unknown[]) => auditFindMany(...args),
      findFirst: (...args: unknown[]) => auditFindFirst(...args)
    },
    order: { findUnique: (...args: unknown[]) => orderFindUnique(...args) },
    customerPayment: {
      findFirst: (...args: unknown[]) => paymentFindFirst(...args),
      findMany: (...args: unknown[]) => customerPaymentFindMany(...args)
    },
    paymentLink: { findMany: (...args: unknown[]) => paymentLinkFindMany(...args) },
    orderAlert: { findMany: (...args: unknown[]) => orderAlertFindMany(...args) },
    $transaction: (...args: unknown[]) => transaction(...args)
  }
}));

vi.mock('../../paymentLinkService.js', () => ({
  getPaymentLinkService: () => ({
    cancelOpenLinksForOrder: cancelOpenLinks,
    createPaymentLinkForOrder
  })
}));

describe('order payment revamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditFindMany.mockResolvedValue([]);
    paymentLinkFindMany.mockResolvedValue([]);
    customerPaymentFindMany.mockResolvedValue([]);
    orderAlertFindMany.mockResolvedValue([]);
  });

  it('prefetch reports upi_pending after QR send without cash collected', async () => {
    auditFindMany.mockResolvedValue([
      { orderId: 'o1', action: 'upi_qr_sent', timestamp: new Date() }
    ]);
    const ctx = await loadOrderPaymentContext(['o1']);
    const status = computePrefetchPaymentStatus(
      { id: 'o1', status: 'awaiting_payment', paymentMethod: 'razorpay', totalAmount: 1000 },
      ctx
    );
    expect(status).toBe('upi_pending');
  });

  it('offerPaymentLink writes payment_link_offered audit', async () => {
    auditCreate.mockResolvedValue({});
    await offerPaymentLink({ orderId: 'o1', orderNumber: 'ORD-1', amountPaise: 500 });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'payment_link_offered', orderId: 'o1' })
      })
    );
  });

  it('acceptPaymentLinkOffer sends link only when offer is pending', async () => {
    auditFindMany.mockResolvedValueOnce([{ id: 'a1', action: 'payment_link_offered' }]);
    auditCreate.mockResolvedValue({});
    createPaymentLinkForOrder.mockResolvedValue({ sent: true });
    const result = await acceptPaymentLinkOffer({ orderId: 'o1' });
    expect(result.sent).toBe(true);
    expect(createPaymentLinkForOrder).toHaveBeenCalled();
  });

  it('getLatestPaymentLinkOfferState returns none when no audits', async () => {
    auditFindMany.mockResolvedValueOnce([]);
    await expect(getLatestPaymentLinkOfferState('o1')).resolves.toEqual({ state: 'none' });
  });

  it('markOrderCashCollected rejects mismatched amount and cancels open links', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'o1',
      vendorId: 'v1',
      status: 'awaiting_payment',
      paymentMethod: 'vendor_collected',
      totalAmount: 1000
    });
    paymentFindFirst.mockResolvedValue(null);
    auditFindFirst.mockResolvedValue(null);
    cancelOpenLinks.mockResolvedValue(undefined);
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn({}));

    await expect(
      markOrderCashCollected({
        orderId: 'o1',
        vendorId: 'v1',
        amountPaise: 900
      })
    ).rejects.toMatchObject({ message: 'Amount must match the order total' });

    expect(cancelOpenLinks).not.toHaveBeenCalled();
  });
});
