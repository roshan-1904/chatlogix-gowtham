import { describe, it, expect, beforeEach, vi } from 'vitest';
import { acceptPaymentLinkOffer, declinePaymentLinkOffer } from '../orderPaymentOffer.js';

const orderAuditLogFindMany = vi.fn();
const orderAuditLogCreate = vi.fn();
const createPaymentLinkForOrder = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    orderAuditLog: {
      findMany: (...args: unknown[]) => orderAuditLogFindMany(...args),
      create: (...args: unknown[]) => orderAuditLogCreate(...args)
    }
  }
}));

vi.mock('../../paymentLinkService.js', () => ({
  getPaymentLinkService: () => ({ createPaymentLinkForOrder })
}));

describe('payment link offer accept and decline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderAuditLogCreate.mockResolvedValue({});
    createPaymentLinkForOrder.mockResolvedValue({ sent: true });
  });

  it('a yes creates the link only while the offer is still open', async () => {
    orderAuditLogFindMany.mockResolvedValue([
      { id: 'audit-1', action: 'payment_link_offered', changes: { orderNumber: 'ORD-1', amountPaise: 25000 } }
    ]);

    const result = await acceptPaymentLinkOffer({ orderId: 'ord_1', phoneNumberId: 'pn' });

    expect(result.sent).toBe(true);
    expect(createPaymentLinkForOrder).toHaveBeenCalledWith('ord_1', {
      sendWhatsApp: true,
      phoneNumberId: 'pn'
    });
    expect(orderAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'payment_link_accepted' })
      })
    );
    const linkOrder = createPaymentLinkForOrder.mock.invocationCallOrder[0];
    const auditOrder = orderAuditLogCreate.mock.invocationCallOrder[0];
    expect(linkOrder).toBeLessThan(auditOrder);
  });

  it('a no clears the offer and does not create a link', async () => {
    orderAuditLogFindMany.mockResolvedValue([
      { id: 'audit-1', action: 'payment_link_offered', changes: {} }
    ]);

    await declinePaymentLinkOffer('ord_1');

    expect(createPaymentLinkForOrder).not.toHaveBeenCalled();
    expect(orderAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'payment_link_declined' })
      })
    );
  });

  it('does not send a link after the offer was declined', async () => {
    orderAuditLogFindMany.mockResolvedValue([
      { id: 'audit-2', action: 'payment_link_declined', changes: {} }
    ]);

    const result = await acceptPaymentLinkOffer({ orderId: 'ord_1' });

    expect(result.sent).toBe(false);
    expect(createPaymentLinkForOrder).not.toHaveBeenCalled();
  });
});
