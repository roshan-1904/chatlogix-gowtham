import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { getPaymentLinkService } from '../paymentLinkService.js';

function readOfferChanges(changes: unknown): { traceId?: string; orderNumber?: string; amountPaise?: number } {
  if (!changes || typeof changes !== 'object') return {};
  const row = changes as { traceId?: unknown; orderNumber?: unknown; amountPaise?: unknown };
  return {
    traceId: typeof row.traceId === 'string' ? row.traceId : undefined,
    orderNumber: typeof row.orderNumber === 'string' ? row.orderNumber : undefined,
    amountPaise: typeof row.amountPaise === 'number' ? row.amountPaise : undefined
  };
}

export async function getLatestPaymentLinkOfferState(orderId: string): Promise<
  | { state: 'none' }
  | { state: 'offered'; auditId: string; traceId?: string; orderNumber?: string; amountPaise?: number }
  | { state: 'accepted' }
  | { state: 'declined' }
> {
  const rows = await prisma.orderAuditLog.findMany({
    where: {
      orderId,
      action: {
        in: ['payment_link_offered', 'payment_link_accepted', 'payment_link_declined']
      }
    },
    orderBy: { timestamp: 'desc' },
    take: 1,
    select: { id: true, action: true, changes: true }
  });
  const latest = rows[0];
  if (!latest) return { state: 'none' };
  if (latest.action === 'payment_link_offered') {
    return { state: 'offered', auditId: latest.id, ...readOfferChanges(latest.changes) };
  }
  if (latest.action === 'payment_link_accepted') return { state: 'accepted' };
  return { state: 'declined' };
}

export async function offerPaymentLink(input: {
  orderId: string;
  orderNumber: string;
  amountPaise: number;
  changedBy?: string;
  traceId?: string;
}): Promise<void> {
  const now = new Date();
  await prisma.orderAuditLog.create({
    data: {
      id: randomUUID(),
      orderId: input.orderId,
      action: 'payment_link_offered',
      changes: {
        orderNumber: input.orderNumber,
        amountPaise: input.amountPaise,
        changedBy: input.changedBy ?? 'bot',
        ...(input.traceId ? { traceId: input.traceId } : {})
      },
      timestamp: now
    }
  });
}

export async function declinePaymentLinkOffer(orderId: string, changedBy?: string): Promise<void> {
  const offer = await getLatestPaymentLinkOfferState(orderId);
  if (offer.state !== 'offered') return;
  await prisma.orderAuditLog.create({
    data: {
      id: randomUUID(),
      orderId,
      action: 'payment_link_declined',
      changes: { changedBy: changedBy ?? 'customer' },
      timestamp: new Date()
    }
  });
}

export async function acceptPaymentLinkOffer(input: {
  orderId: string;
  phoneNumberId?: string;
  changedBy?: string;
}): Promise<{ sent: boolean }> {
  const offer = await getLatestPaymentLinkOfferState(input.orderId);
  if (offer.state !== 'offered') {
    return { sent: false };
  }

  const result = await getPaymentLinkService().createPaymentLinkForOrder(input.orderId, {
    sendWhatsApp: true,
    phoneNumberId: input.phoneNumberId
  });

  await prisma.orderAuditLog.create({
    data: {
      id: randomUUID(),
      orderId: input.orderId,
      action: 'payment_link_accepted',
      changes: { changedBy: input.changedBy ?? 'customer' },
      timestamp: new Date()
    }
  });
  return { sent: result.sent };
}
