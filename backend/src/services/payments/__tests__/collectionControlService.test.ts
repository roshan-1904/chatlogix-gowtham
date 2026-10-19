import { describe, it, expect, beforeEach, vi } from 'vitest';
import { disablePaymentCollection } from '../collectionControlService.js';

const vendorFindUnique = vi.fn();
const vendorUpdate = vi.fn();
const paymentLinkFindMany = vi.fn();
const auditCreate = vi.fn();
const cancelOpenLinksForOrder = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
      update: (...args: unknown[]) => vendorUpdate(...args)
    },
    paymentLink: { findMany: (...args: unknown[]) => paymentLinkFindMany(...args) },
    vendorSettlementControlAudit: { create: (...args: unknown[]) => auditCreate(...args) }
  }
}));

vi.mock('../../paymentLinkService.js', () => ({
  getPaymentLinkService: () => ({ cancelOpenLinksForOrder })
}));

describe('disablePaymentCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vendorUpdate.mockResolvedValue({});
    auditCreate.mockResolvedValue({});
    cancelOpenLinksForOrder.mockResolvedValue(undefined);
  });

  it('turns collection off and cancels open links', async () => {
    vendorFindUnique.mockResolvedValue({ id: 'v1', paymentsManagedByChatlogix: true });
    paymentLinkFindMany.mockResolvedValue([
      { orderId: 'ord_1' },
      { orderId: 'ord_1' },
      { orderId: 'ord_2' }
    ]);

    const result = await disablePaymentCollection({ vendorId: 'v1', changedBy: 'admin' });

    expect(result.paymentsManagedByChatlogix).toBe(false);
    expect(result.cancelledLinkCount).toBe(3);
    expect(cancelOpenLinksForOrder).toHaveBeenCalledTimes(2);
    expect(vendorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentsManagedByChatlogix: false } })
    );
  });
});
