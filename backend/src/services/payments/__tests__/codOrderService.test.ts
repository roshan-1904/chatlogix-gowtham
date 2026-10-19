import { describe, it, expect, beforeEach, vi } from 'vitest';
import { markOrderCashCollected, switchAwaitingPaymentOrderToCod } from '../codOrderService.js';

const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const orderAuditLogFindFirst = vi.fn();
const orderAuditLogCreate = vi.fn();
const customerPaymentFindFirst = vi.fn();
const vendorFindUnique = vi.fn();
const cancelOpenLinksForOrder = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => orderFindUnique(...args),
      update: (...args: unknown[]) => orderUpdate(...args)
    },
    orderAuditLog: {
      findFirst: (...args: unknown[]) => orderAuditLogFindFirst(...args),
      create: (...args: unknown[]) => orderAuditLogCreate(...args)
    },
    customerPayment: { findFirst: (...args: unknown[]) => customerPaymentFindFirst(...args) },
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: { update: (...args: unknown[]) => orderUpdate(...args) },
        orderAuditLog: { create: (...args: unknown[]) => orderAuditLogCreate(...args) }
      })
    )
  }
}));

vi.mock('../../paymentLinkService.js', () => ({
  getPaymentLinkService: () => ({ cancelOpenLinksForOrder })
}));

describe('switchAwaitingPaymentOrderToCod', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelOpenLinksForOrder.mockResolvedValue(undefined);
    orderUpdate.mockResolvedValue({ id: 'ord_1', status: 'confirmed', paymentMethod: 'cod' });
    orderAuditLogCreate.mockResolvedValue({});
  });

  it('cancels open links and confirms as COD', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'ord_1',
      vendorId: 'v1',
      status: 'awaiting_payment',
      paymentMethod: 'razorpay',
      confirmedAt: null
    });

    const result = await switchAwaitingPaymentOrderToCod({ orderId: 'ord_1', vendorId: 'v1' });

    expect(cancelOpenLinksForOrder).toHaveBeenCalledWith('ord_1');
    expect(result.paymentMethod).toBe('cod');
    expect(result.status).toBe('confirmed');
  });
});

describe('markOrderCashCollected', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderAuditLogFindFirst.mockResolvedValue(null);
    customerPaymentFindFirst.mockResolvedValue(null);
    orderUpdate.mockResolvedValue({});
    orderAuditLogCreate.mockResolvedValue({});
    vendorFindUnique.mockResolvedValue({ walletBalanceMilli: 50_000, settlementBalanceMilli: 0n });
  });

  it('writes audit only and does not touch settlement or wallet', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'ord_1',
      vendorId: 'v1',
      status: 'confirmed',
      paymentMethod: 'cod',
      totalAmount: 12_000
    });

    const result = await markOrderCashCollected({ orderId: 'ord_1', vendorId: 'v1' });

    expect(result.cashCollected).toBe(true);
    expect(orderAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'cash_collected' }) })
    );
    expect(vendorFindUnique).not.toHaveBeenCalled();
  });
});
