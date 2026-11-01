import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const adminReliabilityRouter = Router();

function parseLimit(rawLimit: unknown, fallback = 50, max = 100): number {
  if (typeof rawLimit !== 'string') return fallback;
  const parsed = parseInt(rawLimit, 10);
  if (isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseDateParam(rawDate: unknown): Date | null {
  if (typeof rawDate !== 'string' || !rawDate.trim()) return null;
  const d = new Date(rawDate);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/admin/reliability/failed-messages
 * Lists outbound assistant (or delivery) messages with status = 'failed'
 */
adminReliabilityRouter.get(
  '/failed-messages',
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50, 100);
    const vendorId = typeof req.query.vendorId === 'string' && req.query.vendorId.trim()
      ? req.query.vendorId.trim()
      : undefined;

    const toDate = parseDateParam(req.query.to) ?? new Date();
    // Default range is 24 hours if `from` is not provided
    const fromDate = parseDateParam(req.query.from) ?? new Date(toDate.getTime() - 24 * 60 * 60 * 1000);

    if (fromDate > toDate) {
      return res.status(400).json({
        error: 'Invalid date range: "from" must be before or equal to "to".',
      });
    }

    const messages = await prisma.message.findMany({
      where: {
        status: 'failed',
        timestamp: {
          gte: fromDate,
          lte: toDate,
        },
        ...(vendorId ? { conversation: { vendorId } } : {}),
      },
      take: limit,
      orderBy: { timestamp: 'desc' },
      include: {
        conversation: {
          select: {
            id: true,
            vendorId: true,
            vendor: {
              select: {
                id: true,
                businessName: true,
              },
            },
            customer: {
              select: {
                id: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    const items = messages.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      timestamp: msg.timestamp.toISOString(),
      vendorId: msg.conversation.vendorId,
      businessName: msg.conversation.vendor?.businessName ?? 'Unknown Vendor',
      customerPhone: msg.conversation.customer?.phone ?? '—',
      content: (msg.content || '').slice(0, 120),
      failureReason: msg.failureReason ?? null,
      senderType: msg.senderType,
    }));

    return res.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      items,
      count: items.length,
    });
  })
);

/**
 * GET /api/admin/reliability/paused-conversations
 * Lists conversations where aiPaused = true (waiting on vendor resumption)
 */
adminReliabilityRouter.get(
  '/paused-conversations',
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50, 100);
    const vendorId = typeof req.query.vendorId === 'string' && req.query.vendorId.trim()
      ? req.query.vendorId.trim()
      : undefined;

    const conversations = await prisma.conversation.findMany({
      where: {
        aiPaused: true,
        ...(vendorId ? { vendorId } : {}),
      },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
          },
        },
        customer: {
          select: {
            id: true,
            phone: true,
          },
        },
      },
    });

    const items = conversations.map((conv) => ({
      id: conv.id,
      vendorId: conv.vendorId,
      businessName: conv.vendor?.businessName ?? 'Unknown Vendor',
      customerId: conv.customerId,
      customerPhone: conv.customer?.phone ?? '—',
      updatedAt: conv.updatedAt.toISOString(),
      hint: 'Assistant will not reply until the vendor resumes.',
    }));

    return res.json({
      items,
      count: items.length,
    });
  })
);

/**
 * GET /api/admin/reliability/wallet-blocks
 * WalletBlockEvent table requires schema migration per Decision 2 (Option A).
 * Until the migration and pipeline writer land, this returns a pending_migration status
 * to prevent misleading fake-zero counts as specified in docs/admin-portal/reliability.
 */
adminReliabilityRouter.get(
  '/wallet-blocks',
  asyncHandler(async (req, res) => {
    const toDate = parseDateParam(req.query.to) ?? new Date();
    const fromDate = parseDateParam(req.query.from) ?? new Date(toDate.getTime() - 24 * 60 * 60 * 1000);

    return res.json({
      supported: false,
      status: 'pending_migration',
      message: 'WalletBlockEvent persistence requires schema migration (Decision 2 Option A).',
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      items: [],
      count: 0,
    });
  })
);

/**
 * GET /api/admin/reliability/stuck-orders
 * Lists orders in pending or confirmed status that haven't moved in > 24 hours.
 */
adminReliabilityRouter.get(
  '/stuck-orders',
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50, 100);
    const vendorId = typeof req.query.vendorId === 'string' && req.query.vendorId.trim()
      ? req.query.vendorId.trim()
      : undefined;

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['pending', 'confirmed'] },
        updatedAt: { lt: cutoff },
        ...(vendorId ? { vendorId } : {}),
      },
      take: limit,
      orderBy: { updatedAt: 'asc' }, // Oldest stuck first
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
          },
        },
        customer: {
          select: {
            id: true,
            phone: true,
          },
        },
      },
    });

    const items = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      vendorId: o.vendorId,
      businessName: o.vendor?.businessName ?? 'Unknown Vendor',
      customerPhone: o.customer?.phone ?? '—',
      status: o.status,
      totalAmountPaise: o.totalAmount,
      updatedAt: o.updatedAt.toISOString(),
    }));

    return res.json({
      cutoff: cutoff.toISOString(),
      items,
      count: items.length,
    });
  })
);

/**
 * GET /api/admin/reliability/order-alerts
 * Lists active, unresolved OrderAlert rows.
 */
adminReliabilityRouter.get(
  '/order-alerts',
  asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, 50, 100);
    const vendorId = typeof req.query.vendorId === 'string' && req.query.vendorId.trim()
      ? req.query.vendorId.trim()
      : undefined;

    const alerts = await prisma.orderAlert.findMany({
      where: {
        resolved: false,
        ...(vendorId ? { order: { vendorId } } : {}),
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            vendorId: true,
            vendor: {
              select: {
                id: true,
                businessName: true,
              },
            },
            customer: {
              select: {
                id: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    const items = alerts.map((a) => ({
      id: a.id,
      orderId: a.orderId,
      orderNumber: a.order?.orderNumber ?? 'Unknown',
      vendorId: a.order?.vendorId ?? '',
      businessName: a.order?.vendor?.businessName ?? 'Unknown Vendor',
      customerPhone: a.order?.customer?.phone ?? '—',
      severity: a.severity,
      type: a.type,
      message: a.message,
      resolved: a.resolved,
      createdAt: a.createdAt.toISOString(),
    }));

    return res.json({
      items,
      count: items.length,
    });
  })
);
