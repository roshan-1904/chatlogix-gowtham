import { prisma } from '../../db/prisma.js';
import { isCodPaymentMethod } from './linkedAccountService.js';

export type PaymentBadgeKey =
  | 'unpaid'
  | 'link_sent'
  | 'paid_online'
  | 'upi_sent'
  | 'paid_to_shop'
  | 'cod'
  | 'payment_initiated';

export interface OrderPaymentContext {
  cashCollectedOrderIds: Set<string>;
  upiQrSentOrderIds: Set<string>;
  paymentLinkOfferOrderIds: Set<string>;
  openLinkByOrderId: Map<string, { id: string; url: string; expiresAt: Date; amountPaise: number }>;
  capturedByOrderId: Map<
    string,
    {
      status: string;
      amountPaise: number;
      netMilli: bigint;
      refundedPaise: number;
      capturedAt: Date;
    }
  >;
  paymentInitiatedAlertByOrderId: Map<string, { id: string; createdAt: Date; message: string }>;
}

export async function loadOrderPaymentContext(orderIds: string[]): Promise<OrderPaymentContext> {
  if (orderIds.length === 0) {
    return {
      cashCollectedOrderIds: new Set(),
      upiQrSentOrderIds: new Set(),
      paymentLinkOfferOrderIds: new Set(),
      openLinkByOrderId: new Map(),
      capturedByOrderId: new Map(),
      paymentInitiatedAlertByOrderId: new Map()
    };
  }

  const [auditRows, openLinks, payments, alerts] = await Promise.all([
    prisma.orderAuditLog.findMany({
      where: {
        orderId: { in: orderIds },
        action: {
          in: [
            'cash_collected',
            'upi_qr_sent',
            'payment_link_offered',
            'payment_link_accepted',
            'payment_link_declined'
          ]
        }
      },
      orderBy: { timestamp: 'desc' },
      select: { orderId: true, action: true, timestamp: true }
    }),
    prisma.paymentLink.findMany({
      where: { orderId: { in: orderIds }, status: 'created' },
      orderBy: { createdAt: 'desc' },
      select: { orderId: true, id: true, url: true, expiresAt: true, amountPaise: true }
    }),
    prisma.customerPayment.findMany({
      where: { orderId: { in: orderIds } },
      orderBy: { capturedAt: 'desc' },
      select: {
        orderId: true,
        status: true,
        amountPaise: true,
        refundedPaise: true,
        capturedAt: true,
        settlementAlert: true,
        netMilli: true
      }
    }),
    prisma.orderAlert.findMany({
      where: { orderId: { in: orderIds }, type: 'payment_initiated', resolved: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, orderId: true, createdAt: true, message: true }
    })
  ]);

  const cashCollectedOrderIds = new Set<string>();
  const upiQrSentOrderIds = new Set<string>();
  const paymentLinkOfferOrderIds = new Set<string>();
  const offerActions = new Set([
    'payment_link_offered',
    'payment_link_accepted',
    'payment_link_declined'
  ]);

  const latestOfferByOrder = new Map<string, string>();
  for (const row of auditRows) {
    if (row.action === 'cash_collected') cashCollectedOrderIds.add(row.orderId);
    if (row.action === 'upi_qr_sent') upiQrSentOrderIds.add(row.orderId);
    if (offerActions.has(row.action) && !latestOfferByOrder.has(row.orderId)) {
      latestOfferByOrder.set(row.orderId, row.action);
    }
  }
  for (const [orderId, action] of latestOfferByOrder) {
    if (action === 'payment_link_offered') paymentLinkOfferOrderIds.add(orderId);
  }

  const openLinkByOrderId = new Map<
    string,
    { id: string; url: string; expiresAt: Date; amountPaise: number }
  >();
  for (const link of openLinks) {
    if (!openLinkByOrderId.has(link.orderId)) {
      openLinkByOrderId.set(link.orderId, {
        id: link.id,
        url: link.url,
        expiresAt: link.expiresAt,
        amountPaise: link.amountPaise
      });
    }
  }

  const capturedByOrderId = new Map<
    string,
    {
      status: string;
      amountPaise: number;
      netMilli: bigint;
      refundedPaise: number;
      capturedAt: Date;
    }
  >();
  for (const p of payments) {
    if (!capturedByOrderId.has(p.orderId) && p.netMilli > 0n && !p.settlementAlert) {
      capturedByOrderId.set(p.orderId, {
        status: p.status,
        amountPaise: p.amountPaise,
        netMilli: p.netMilli,
        refundedPaise: p.refundedPaise,
        capturedAt: p.capturedAt
      });
    }
  }

  const paymentInitiatedAlertByOrderId = new Map<
    string,
    { id: string; createdAt: Date; message: string }
  >();
  for (const alert of alerts) {
    if (!paymentInitiatedAlertByOrderId.has(alert.orderId)) {
      paymentInitiatedAlertByOrderId.set(alert.orderId, {
        id: alert.id,
        createdAt: alert.createdAt,
        message: alert.message
      });
    }
  }

  return {
    cashCollectedOrderIds,
    upiQrSentOrderIds,
    paymentLinkOfferOrderIds,
    openLinkByOrderId,
    capturedByOrderId,
    paymentInitiatedAlertByOrderId
  };
}

function isCodBadgeMethod(method: string | null): boolean {
  if (!method || method === 'vendor_collected') return false;
  return method === 'cod' || isCodPaymentMethod(method);
}

export function computePaymentBadge(
  order: {
    id: string;
    status: string;
    paymentMethod: string | null;
    totalAmount: number;
  },
  ctx: OrderPaymentContext
): PaymentBadgeKey {
  if (ctx.capturedByOrderId.has(order.id)) return 'paid_online';

  const cashCollected = ctx.cashCollectedOrderIds.has(order.id);
  if (cashCollected && order.paymentMethod === 'vendor_collected') return 'paid_to_shop';

  if (isCodBadgeMethod(order.paymentMethod) || (cashCollected && order.paymentMethod !== 'vendor_collected')) {
    return 'cod';
  }

  if (ctx.paymentInitiatedAlertByOrderId.has(order.id)) return 'payment_initiated';
  if (ctx.upiQrSentOrderIds.has(order.id)) return 'upi_sent';
  if (ctx.openLinkByOrderId.has(order.id)) return 'link_sent';
  return 'unpaid';
}

/** Prefetch paymentStatus string (includes upi_pending, payment_link_offered). */
export function computePrefetchPaymentStatus(
  order: {
    id: string;
    status: string;
    paymentMethod: string | null;
    totalAmount: number;
  },
  ctx: OrderPaymentContext
): string {
  if (ctx.cashCollectedOrderIds.has(order.id)) return 'cash_collected';

  const captured = ctx.capturedByOrderId.get(order.id);
  if (captured) return captured.status;

  if (ctx.upiQrSentOrderIds.has(order.id)) return 'upi_pending';

  if (ctx.openLinkByOrderId.has(order.id)) return 'link_pending';

  if (ctx.paymentLinkOfferOrderIds.has(order.id)) return 'payment_link_offered';

  if (isCodPaymentMethod(order.paymentMethod) || order.paymentMethod === 'vendor_collected') {
    return 'cod_unpaid';
  }

  if (order.status === 'awaiting_payment') return 'awaiting_payment';

  return 'no_payment_record';
}

export const PAYMENT_BADGE_LABELS: Record<PaymentBadgeKey, string> = {
  unpaid: 'Unpaid',
  link_sent: 'Link sent',
  paid_online: 'Paid online',
  upi_sent: 'UPI sent',
  paid_to_shop: 'Paid to shop',
  cod: 'Cash on delivery',
  payment_initiated: 'Payment initiated'
};
