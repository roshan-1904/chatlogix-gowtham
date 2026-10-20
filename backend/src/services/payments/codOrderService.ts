import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { getPaymentLinkService } from '../paymentLinkService.js';
import { isCodPaymentMethod } from './linkedAccountService.js';

function isOfflinePaymentMethod(method: string | null | undefined): boolean {
  if (!method) return false;
  if (method === 'vendor_collected') return true;
  return isCodPaymentMethod(method);
}

export async function switchAwaitingPaymentOrderToCod(input: {
  orderId: string;
  vendorId: string;
  changedBy?: string;
}): Promise<{ id: string; status: string; paymentMethod: string }> {
  const order = await prisma.order.findUnique({ where: { id: input.orderId } });
  if (!order || order.vendorId !== input.vendorId) {
    throw createError('Order not found', 404, ErrorType.NOT_FOUND);
  }
  if (order.status !== 'awaiting_payment') {
    throw createError('Only awaiting_payment orders can switch to COD', 409, ErrorType.PAYMENT);
  }

  await getPaymentLinkService().cancelOpenLinksForOrder(order.id);

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.order.update({
      where: { id: order.id },
      data: {
        status: 'confirmed',
        paymentMethod: 'cod',
        confirmedAt: order.confirmedAt ?? now
      },
      select: { id: true, status: true, paymentMethod: true }
    });
    await tx.orderAuditLog.create({
      data: {
        id: randomUUID(),
        orderId: order.id,
        action: 'switch_to_cod',
        changes: { vendorInitiated: true, changedBy: input.changedBy ?? 'vendor' },
        previousState: { status: order.status, paymentMethod: order.paymentMethod },
        newState: { status: row.status, paymentMethod: row.paymentMethod },
        timestamp: now
      }
    });
    return row;
  });

  return { ...updated, paymentMethod: updated.paymentMethod ?? 'cod' };
}

/**
 * Marks a COD / vendor-collected order as paid to the shop. Never writes
 * settlement entries or changes wallet balances.
 */
function suppliedAmountMismatches(totalAmount: number, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  return typeof value !== 'number' || !Number.isFinite(value) || value !== totalAmount;
}

export async function markOrderCashCollected(input: {
  orderId: string;
  vendorId: string;
  changedBy?: string;
  paymentMethod?: 'cod' | 'vendor_collected';
  reference?: string;
  /** Present and not equal to Order.totalAmount (paise) is rejected. */
  amount?: unknown;
  amountPaise?: unknown;
}): Promise<{ id: string; paymentMethod: string; cashCollected: true }> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      vendorId: true,
      status: true,
      paymentMethod: true,
      totalAmount: true
    }
  });
  if (!order || order.vendorId !== input.vendorId) {
    throw createError('Order not found', 404, ErrorType.NOT_FOUND);
  }
  if (order.paymentMethod === 'razorpay' && input.paymentMethod !== 'vendor_collected') {
    throw createError('Online payment orders use Razorpay capture, not cash collection', 409, ErrorType.PAYMENT);
  }

  const capturedOnline = await prisma.customerPayment.findFirst({
    where: {
      orderId: order.id,
      settlementAlert: null,
      netMilli: { gt: 0 }
    }
  });
  if (capturedOnline) {
    throw createError('Order is already paid online', 409, ErrorType.PAYMENT);
  }

  const existing = await prisma.orderAuditLog.findFirst({
    where: { orderId: order.id, action: 'cash_collected' }
  });
  if (existing) {
    throw createError('Cash already marked collected for this order', 409, ErrorType.PAYMENT);
  }

  const method =
    input.paymentMethod ??
    (order.paymentMethod === 'vendor_collected' ? 'vendor_collected' : 'cod');

  if (!isOfflinePaymentMethod(method)) {
    throw createError('Order is not a cash-on-delivery order', 400, ErrorType.VALIDATION);
  }

  if (
    suppliedAmountMismatches(order.totalAmount, input.amount) ||
    suppliedAmountMismatches(order.totalAmount, input.amountPaise)
  ) {
    throw createError('Amount must match the order total', 400, ErrorType.VALIDATION);
  }

  await getPaymentLinkService().cancelOpenLinksForOrder(order.id);

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { paymentMethod: method }
    });
    await tx.orderAuditLog.create({
      data: {
        id: randomUUID(),
        orderId: order.id,
        action: 'cash_collected',
        changes: {
          vendorInitiated: true,
          changedBy: input.changedBy ?? 'vendor',
          ...(input.reference?.trim() ? { reference: input.reference.trim() } : {})
        },
        previousState: { paymentMethod: order.paymentMethod },
        newState: { paymentMethod: method, cashCollectedAt: now.toISOString() },
        timestamp: now
      }
    });
  });

  return { id: order.id, paymentMethod: method, cashCollected: true };
}

export { isOfflinePaymentMethod };
