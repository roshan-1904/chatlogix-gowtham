import express, { type Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireRole } from '../middleware/authorize.js';
import { logger } from '../logger.js';
import { sendVendorConversationReply } from '../services/vendorConversationReply.js';
import { buildPromotionDraft, promoteCustomerQuery } from '../conversation/customerQueryPromotion.js';

export const customerQueriesRouter = express.Router();

const ReplySchema = z.object({
  content: z.string().min(1).max(2000)
});

const PromoteSchema = z.object({
  action: z.enum(['faq', 'catalog', 'dismiss']),
  question: z.string().max(300).optional(),
  answer: z.string().max(1500).optional(),
  productId: z.string().nullable().optional(),
  dismissReason: z.string().max(500).optional()
});

const ListQuerySchema = z.object({
  status: z.string().optional(),
  category: z.enum(['product', 'policy', 'other']).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
  vendorId: z.string().optional()
});

function resolveVendorId(req: Request): string | null {
  const user = req.user as { vendorId?: string; roles?: string[] } | undefined;
  const isAdmin = user?.roles?.includes('admin') ?? false;
  if (isAdmin && typeof req.query.vendorId === 'string' && req.query.vendorId) {
    return req.query.vendorId;
  }
  return user?.vendorId ?? null;
}

function toListItem(row: {
  id: string;
  conversationId: string;
  questionEn: string;
  questionOriginal: string;
  category: string;
  status: string;
  hitCount: number;
  lastSeenAt: Date;
  createdAt: Date;
  productId: string | null;
  customer: { phone: string; customerInsights?: Array<{ customerName: string | null }> };
}) {
  return {
    id: row.id,
    customerName: row.customer.customerInsights?.[0]?.customerName ?? null,
    customerPhone: row.customer.phone,
    conversationId: row.conversationId,
    questionEn: row.questionEn,
    questionOriginal: row.questionOriginal,
    category: row.category,
    status: row.status,
    hitCount: row.hitCount,
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    productId: row.productId
  };
}

customerQueriesRouter.get('/', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveVendorId(req);
    if (!vendorId) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const parsed = ListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const { status, category, search, page, pageSize } = parsed.data;
    const where: Record<string, unknown> = { vendorId };
    if (status && status !== 'all') where.status = status;
    else if (!status) where.status = 'open';
    if (category) where.category = category;
    if (search?.trim()) {
      where.questionEn = { contains: search.trim(), mode: 'insensitive' };
    }

    const [total, rows] = await Promise.all([
      prisma.customerQuery.count({ where }),
      prisma.customerQuery.findMany({
        where,
        orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: {
            select: {
              phone: true,
              customerInsights: {
                where: { vendorId },
                select: { customerName: true },
                take: 1
              }
            }
          }
        }
      })
    ]);

    res.json({
      queries: rows.map(toListItem),
      page,
      pageSize,
      total
    });
  } catch (error) {
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to list customer queries');
    res.status(500).json({ error: 'Failed to list customer queries' });
  }
});

customerQueriesRouter.get('/summary', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveVendorId(req);
    if (!vendorId) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const openCount = await prisma.customerQuery.count({ where: { vendorId, status: 'open' } });
    res.json({ openCount });
  } catch (error) {
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to summarize customer queries');
    res.status(500).json({ error: 'Failed to summarize customer queries' });
  }
});

customerQueriesRouter.get('/:id', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveVendorId(req);
    if (!vendorId) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const row = await prisma.customerQuery.findFirst({
      where: { id: req.params.id, vendorId },
      include: {
        customer: {
          select: {
            phone: true,
            customerInsights: {
              where: { vendorId },
              select: { customerName: true },
              take: 1
            }
          }
        }
      }
    });

    if (!row) {
      return res.status(404).json({ error: 'Query not found' });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: row.conversationId },
      orderBy: { timestamp: 'desc' },
      take: 8,
      select: { id: true, senderType: true, content: true, contentEn: true, timestamp: true }
    });

    res.json({
      ...toListItem(row),
      vendorAnswerOriginal: row.vendorAnswerOriginal,
      vendorAnswerEn: row.vendorAnswerEn,
      faqId: row.faqId,
      dismissReason: row.dismissReason,
      answeredAt: row.answeredAt?.toISOString() ?? null,
      messages: messages.reverse()
    });
  } catch (error) {
    logger.error({ error, queryId: req.params.id }, 'Failed to fetch customer query');
    res.status(500).json({ error: 'Failed to fetch customer query' });
  }
});

customerQueriesRouter.post('/:id/promotion-draft', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveVendorId(req);
    if (!vendorId) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const query = await prisma.customerQuery.findFirst({
      where: { id: req.params.id, vendorId },
      include: { product: { select: { name: true } } }
    });
    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }
    if (query.status !== 'answered') {
      return res.status(409).json({ error: 'Query must be answered before promotion' });
    }

    const draft = await buildPromotionDraft({
      questionOriginal: query.questionOriginal,
      questionEn: query.questionEn,
      vendorAnswerOriginal: query.vendorAnswerOriginal,
      vendorAnswerEn: query.vendorAnswerEn,
      category: query.category,
      productName: query.product?.name ?? null
    });
    res.json(draft);
  } catch (error) {
    logger.error({ error, queryId: req.params.id }, 'Failed to draft customer query promotion');
    res.status(500).json({ error: 'Failed to draft promotion' });
  }
});

customerQueriesRouter.post('/:id/promote', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveVendorId(req);
    if (!vendorId) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const validated = PromoteSchema.parse(req.body);
    const result = await promoteCustomerQuery({
      queryId: req.params.id,
      vendorId,
      action: validated.action,
      question: validated.question,
      answer: validated.answer,
      productId: validated.productId,
      dismissReason: validated.dismissReason
    });
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const typed = error as { statusCode: number; message: string };
      return res.status(typed.statusCode).json({ error: typed.message });
    }
    logger.error({ error, queryId: req.params.id }, 'Failed to promote customer query');
    res.status(500).json({ error: 'Failed to promote customer query' });
  }
});

customerQueriesRouter.post('/:id/reply', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = resolveVendorId(req);
    if (!vendorId) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const validated = ReplySchema.parse(req.body);
    const query = await prisma.customerQuery.findFirst({
      where: { id: req.params.id, vendorId },
      select: {
        id: true,
        conversationId: true,
        vendorId: true,
        quoteMessageId: true,
        sourceMessageId: true,
        questionOriginal: true
      }
    });

    if (!query) {
      return res.status(404).json({ error: 'Query not found' });
    }

    const { message, markedOpenQueries } = await sendVendorConversationReply({
      conversationId: query.conversationId,
      user: { vendorId: req.user?.vendorId ?? null, roles: req.user?.roles ?? [] },
      content: validated.content,
      customerQueryReply: {
        quoteMessageId: query.quoteMessageId,
        sourceMessageId: query.sourceMessageId,
        questionOriginal: query.questionOriginal
      }
    });

    res.json({ message, markedOpenQueries });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const typed = error as { statusCode: number; message: string };
      return res.status(typed.statusCode).json({ error: typed.message });
    }
    logger.error({ error, queryId: req.params.id }, 'Failed to reply to customer query');
    res.status(500).json({ error: 'Failed to reply to customer query' });
  }
});
