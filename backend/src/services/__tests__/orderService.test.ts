import { describe, it, expect, vi, beforeEach } from 'vitest';

const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const orderAuditLogCreate = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    order: {
      findUnique: (...args: unknown[]) => orderFindUnique(...args),
      update: (...args: unknown[]) => orderUpdate(...args)
    },
    orderAuditLog: {
      create: (...args: unknown[]) => orderAuditLogCreate(...args)
    },
    // Array-form $transaction: each element is already a Promise (the
    // mocked order.update/orderAuditLog.create calls above run eagerly),
    // matching how orderService.ts actually calls it.
    $transaction: (ops: unknown[]) => Promise.all(ops)
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { OrderService } from '../orderService.js';

const orderService = new OrderService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OrderService.updateOrderStatus', () => {
  it('writes an OrderAuditLog row alongside the status update (regression: vendor-dashboard mutations previously left zero audit trail)', async () => {
    orderFindUnique.mockResolvedValue({ status: 'pending' });
    orderUpdate.mockResolvedValue({ id: 'order-1', status: 'confirmed' });
    orderAuditLogCreate.mockResolvedValue({});

    await orderService.updateOrderStatus('order-1', 'confirmed');

    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'order-1' } })
    );
    expect(orderAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          action: 'vendor_status_update',
          previousState: { status: 'pending' },
          newState: expect.objectContaining({ status: 'confirmed' })
        })
      })
    );
  });

  it('rejects an invalid status transition before touching the DB', async () => {
    orderFindUnique.mockResolvedValue({ status: 'delivered' }); // terminal state

    await expect(orderService.updateOrderStatus('order-1', 'confirmed')).rejects.toThrow(/Invalid status transition/);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(orderAuditLogCreate).not.toHaveBeenCalled();
  });

  it('serializes Date fields in newState to plain JSON, not raw Date objects', async () => {
    orderFindUnique.mockResolvedValue({ status: 'out_for_delivery' });
    orderUpdate.mockResolvedValue({ id: 'order-2', status: 'delivered' });
    orderAuditLogCreate.mockResolvedValue({});

    await orderService.updateOrderStatus('order-2', 'delivered');

    const call = orderAuditLogCreate.mock.calls[0][0];
    expect(typeof call.data.newState.deliveredAt).toBe('string'); // ISO string, not a Date instance
    expect(typeof call.data.newState.updatedAt).toBe('string');
  });
});
