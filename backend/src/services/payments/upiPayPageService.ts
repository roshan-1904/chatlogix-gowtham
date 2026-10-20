import { prisma } from '../../db/prisma.js';
import { buildUpiUri } from './upiQrService.js';

export interface UpiPayPageView {
  orderNumber: string;
  payeeName: string;
  upiVpa: string;
  amountPaise: number;
  amountLabel: string;
  upiUri: string;
  shopName: string;
}

export async function loadUpiPayPageForOrder(orderId: string): Promise<UpiPayPageView | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      vendor: { select: { upiVpa: true, upiPayeeName: true, businessName: true } }
    }
  });
  if (!order || order.status === 'cancelled') return null;

  const captured = await prisma.customerPayment.findFirst({
    where: { orderId: order.id, settlementAlert: null, netMilli: { gt: 0 } }
  });
  if (captured) return null;

  const cashCollected = await prisma.orderAuditLog.findFirst({
    where: { orderId: order.id, action: 'cash_collected' }
  });
  if (cashCollected) return null;

  const vpa = order.vendor.upiVpa?.trim();
  const payeeName = order.vendor.upiPayeeName?.trim();
  if (!vpa || !payeeName) return null;

  const amountRupees = (order.totalAmount / 100).toFixed(2);
  const upiUri = buildUpiUri({
    vpa,
    payeeName,
    amountRupees,
    note: order.orderNumber
  });

  return {
    orderNumber: order.orderNumber,
    payeeName,
    upiVpa: vpa,
    amountPaise: order.totalAmount,
    amountLabel: `₹${amountRupees}`,
    upiUri,
    shopName: order.vendor.businessName
  };
}
