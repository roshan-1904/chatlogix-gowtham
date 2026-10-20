import { prisma } from '../../db/prisma.js';
import {
  computePaymentBadge,
  loadOrderPaymentContext,
  PAYMENT_BADGE_LABELS,
  type PaymentBadgeKey
} from './orderPaymentState.js';

function readReference(changes: unknown): string | null {
  if (!changes || typeof changes !== 'object' || !('reference' in changes)) return null;
  const value = (changes as { reference?: unknown }).reference;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPayeeName(changes: unknown): string | null {
  if (!changes || typeof changes !== 'object' || !('payeeName' in changes)) return null;
  const value = (changes as { payeeName?: unknown }).payeeName;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function buildOrderPaymentPayload(order: {
  id: string;
  status: string;
  paymentMethod: string | null;
  totalAmount: number;
  conversationId?: string;
}) {
  const ctx = await loadOrderPaymentContext([order.id]);
  const badge = computePaymentBadge(order, ctx);
  const cashCollected = await prisma.orderAuditLog.findFirst({
    where: { orderId: order.id, action: 'cash_collected' },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true, changes: true }
  });
  const upiSent = await prisma.orderAuditLog.findFirst({
    where: { orderId: order.id, action: 'upi_qr_sent' },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true, changes: true }
  });

  const captured = ctx.capturedByOrderId.get(order.id);
  const openLink = ctx.openLinkByOrderId.get(order.id);
  const alert = ctx.paymentInitiatedAlertByOrderId.get(order.id);
  const reference = readReference(cashCollected?.changes);

  let payment: Record<string, unknown> | null = null;

  if (captured) {
    const row = await prisma.customerPayment.findFirst({
      where: { orderId: order.id, settlementAlert: null, netMilli: { gt: 0 } },
      orderBy: { capturedAt: 'desc' },
      include: {
        settlementTransfers: {
          orderBy: { createdAt: 'asc' },
          take: 1
        }
      }
    });
    const transfer = row?.settlementTransfers[0];
    payment = {
      status: captured.status,
      amountPaise: captured.amountPaise,
      netMilli: captured.netMilli.toString(),
      transferStatus: transfer?.status ?? null,
      eligibleAt: transfer?.eligibleAt?.toISOString() ?? null,
      refundedPaise: captured.refundedPaise
    };
  } else if (cashCollected) {
    payment = {
      status: 'cash_collected',
      amountPaise: order.totalAmount,
      netMilli: null,
      transferStatus: null,
      eligibleAt: null,
      refundedPaise: 0,
      collectedAt: cashCollected.timestamp.toISOString(),
      reference: reference ?? undefined
    };
  } else if (openLink) {
    payment = {
      status: 'pending',
      amountPaise: openLink.amountPaise ?? order.totalAmount,
      netMilli: null,
      transferStatus: null,
      eligibleAt: null,
      refundedPaise: 0,
      paymentLinkId: openLink.id,
      paymentLinkUrl: openLink.url,
      expiresAt: openLink.expiresAt.toISOString()
    };
  } else if (upiSent) {
    const changes = upiSent.changes as { payeeName?: string; amountPaise?: number } | null;
    payment = {
      status: 'upi_pending',
      amountPaise: changes?.amountPaise ?? order.totalAmount,
      netMilli: null,
      transferStatus: null,
      eligibleAt: null,
      refundedPaise: 0,
      upiPayeeName: changes?.payeeName,
      upiSentAt: upiSent.timestamp.toISOString()
    };
  }

  return {
    paymentBadge: badge,
    paymentBadgeLabel: PAYMENT_BADGE_LABELS[badge],
    payment,
    upiQrSentAt: upiSent ? upiSent.timestamp.toISOString() : null,
    cashCollectedAt: cashCollected ? cashCollected.timestamp.toISOString() : null,
    paymentReference: reference,
    upiPayeeName: readPayeeName(upiSent?.changes),
    paymentInitiatedAlert: alert
      ? {
          id: alert.id,
          message: alert.message,
          createdAt: alert.createdAt.toISOString()
        }
      : null
  };
}

export async function attachListPaymentBadges<
  T extends { id: string; status: string; paymentMethod: string | null; totalAmount: number }
>(orders: T[]) {
  const ctx = await loadOrderPaymentContext(orders.map((o) => o.id));
  return orders.map((order) => {
    const badge = computePaymentBadge(order, ctx);
    return {
      ...order,
      paymentBadge: badge,
      paymentBadgeLabel: PAYMENT_BADGE_LABELS[badge],
      hasPaymentInitiatedAlert: ctx.paymentInitiatedAlertByOrderId.has(order.id)
    };
  });
}

export type { PaymentBadgeKey };
