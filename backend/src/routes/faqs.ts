import express from 'express';
import { prisma } from '../db/prisma.js';
import { requireRole } from '../middleware/authorize.js';
import { logger } from '../logger.js';
import { z } from 'zod';
import { invalidateFaqs } from '../conversation/prefetch.js';
import { embedText, toVectorLiteral, FAQ_EMBEDDING_MODEL } from '../conversation/faq/embedding.js';
import { normalizeFaqEnglish } from '../utils/englishStorage.js';

export const faqsRouter = express.Router();

const FaqCreateSchema = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(1500),
  isActive: z.boolean().optional().default(true)
});

/**
 * Embeds `question` and writes it onto an already-created Faq row. Separate
 * from prisma.faq.create/update because `embedding` is Unsupported("vector")
 * in schema.prisma — Prisma Client's generated types exclude it entirely, so
 * it can only be read/written via raw SQL. Best-effort: a failure here is
 * logged and swallowed, never thrown — the FAQ row itself already saved
 * successfully, and a null embedding just makes the row invisible to
 * retrieval (prefetch.ts's loadFaqs filters `embedding IS NOT NULL`) until
 * the vendor edits the question again.
 */
async function embedAndStore(faqId: string, question: string): Promise<boolean> {
  const embedding = await embedText(question);
  if (!embedding) return false;
  await prisma.$executeRaw`
    UPDATE "Faq" SET embedding = ${toVectorLiteral(embedding)}::vector, "embeddingModel" = ${FAQ_EMBEDDING_MODEL}
    WHERE id = ${faqId}
  `;
  return true;
}

// GET /api/faqs - List FAQs for vendor
faqsRouter.get('/', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const where: any = { vendorId };
    if (req.query.isActive !== undefined) {
      where.isActive = req.query.isActive === 'true';
    }

    const faqs = await prisma.faq.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ faqs });
  } catch (error) {
    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to fetch FAQs');
    res.status(500).json({ error: 'Failed to fetch FAQs' });
  }
});

// GET /api/faqs/:id - Get single FAQ
faqsRouter.get('/:id', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;

    const faq = await prisma.faq.findFirst({
      where: {
        id: req.params.id,
        ...(vendorId && !req.user?.roles?.includes('admin') ? { vendorId } : {})
      }
    });

    if (!faq) {
      return res.status(404).json({ error: 'FAQ not found' });
    }

    res.json(faq);
  } catch (error) {
    logger.error({ error, faqId: req.params.id }, 'Failed to fetch FAQ');
    res.status(500).json({ error: 'Failed to fetch FAQ' });
  }
});

// POST /api/faqs - Create FAQ
faqsRouter.post('/', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const validated = FaqCreateSchema.parse(req.body);
    const english = await normalizeFaqEnglish(validated);

    const faq = await prisma.faq.create({
      data: { ...validated, ...english, vendorId }
    });

    const embedded = await embedAndStore(faq.id, english.question ?? validated.question);

    // FAQ retrieval's cheap existence gate (prefetch.ts's loadFaqs) must not
    // serve a stale "vendor has zero FAQs" count after a write.
    await invalidateFaqs(vendorId);

    res.status(201).json({ ...faq, embeddingPending: !embedded });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }

    logger.error({ error, vendorId: req.user?.vendorId }, 'Failed to create FAQ');
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
});

// PUT /api/faqs/:id - Update FAQ
faqsRouter.put('/:id', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId && !req.user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const existing = await prisma.faq.findFirst({
      where: {
        id: req.params.id,
        ...(vendorId && !req.user?.roles?.includes('admin') ? { vendorId } : {})
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'FAQ not found' });
    }

    const validated = FaqCreateSchema.partial().parse(req.body);
    const english = await normalizeFaqEnglish(validated);

    const faq = await prisma.faq.update({
      where: { id: req.params.id },
      data: { ...validated, ...english }
    });

    // Re-embed only on a question change — matching is question-to-question,
    // so an answer/isActive-only edit doesn't need a new OpenAI call.
    const embedded = english.question !== undefined ? await embedAndStore(faq.id, english.question) : true;

    await invalidateFaqs(existing.vendorId);

    res.json({ ...faq, embeddingPending: !embedded });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }

    logger.error({ error, faqId: req.params.id }, 'Failed to update FAQ');
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});

// DELETE /api/faqs/:id - Delete FAQ (soft delete by setting isActive=false)
faqsRouter.delete('/:id', requireRole('vendor', 'admin'), async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId && !req.user?.roles?.includes('admin')) {
      return res.status(403).json({ error: 'Vendor context required' });
    }

    const existing = await prisma.faq.findFirst({
      where: {
        id: req.params.id,
        ...(vendorId && !req.user?.roles?.includes('admin') ? { vendorId } : {})
      }
    });

    if (!existing) {
      return res.status(404).json({ error: 'FAQ not found' });
    }

    const faq = await prisma.faq.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    await invalidateFaqs(existing.vendorId);

    res.json(faq);
  } catch (error) {
    logger.error({ error, faqId: req.params.id }, 'Failed to delete FAQ');
    res.status(500).json({ error: 'Failed to delete FAQ' });
  }
});
