import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { toVendorEnglish } from '../utils/vendorEnglish.js';
import { embedText, toVectorLiteral, FAQ_EMBEDDING_MODEL } from './faq/embedding.js';
import { looksLikeDeferral } from './orderStatusGuard.js';
import { notifyVendorOfKnowledgeGap } from './customerQueryNotify.js';
import { logCount } from './metrics.js';
import type { CartOp } from './types.js';

export { notifyVendorOfKnowledgeGap } from './customerQueryNotify.js';

const QUESTION_MAX = 1000;
const RELATED_MESSAGE_CAP = 20;
const DEDUP_THRESHOLD = Number(env.CUSTOMER_QUERY_DEDUP_THRESHOLD || '0.85');

export type KnowledgeGapCategory = 'product' | 'policy' | 'other';

export interface PersistKnowledgeGapInput {
  vendorId: string;
  conversationId: string;
  customerId: string;
  sourceMessageId?: string | null;
  customerText: string;
  ops: CartOp[];
  draftReply: string;
  orderStatusTurn: boolean;
  hasHandoff: boolean;
  sandbox?: boolean;
}

export interface UpsertKnowledgeGapInput {
  vendorId: string;
  conversationId: string;
  customerId: string;
  sourceMessageId?: string | null;
  customerText: string;
  modelQuestion?: string | null;
  category?: KnowledgeGapCategory | null;
  productId?: string | null;
}

export interface UpsertKnowledgeGapResult {
  id: string;
  deduped: boolean;
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

function asStringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function resolveCategory(value: string | null | undefined): KnowledgeGapCategory {
  if (value === 'product' || value === 'policy' || value === 'other') return value;
  return 'other';
}

async function findOpenDuplicate(
  vendorId: string,
  embedding: number[]
): Promise<{ id: string; relatedMessageIds: unknown } | null> {
  const vectorLiteral = toVectorLiteral(embedding);
  const rows = await prisma.$queryRaw<Array<{ id: string; relatedMessageIds: unknown; similarity: number }>>`
    SELECT id, "relatedMessageIds", 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM "CustomerQuery"
    WHERE "vendorId" = ${vendorId} AND status = 'open' AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT 5
  `;
  const match = rows.find((row) => row.similarity >= DEDUP_THRESHOLD);
  return match ? { id: match.id, relatedMessageIds: match.relatedMessageIds } : null;
}

async function storeEmbedding(queryId: string, embedding: number[]): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "CustomerQuery"
    SET embedding = ${toVectorLiteral(embedding)}::vector, "embeddingModel" = ${FAQ_EMBEDDING_MODEL}
    WHERE id = ${queryId}
  `;
}

export async function upsertKnowledgeGap(input: UpsertKnowledgeGapInput): Promise<UpsertKnowledgeGapResult | null> {
  const questionOriginal = truncate(input.customerText || input.modelQuestion || '', QUESTION_MAX);
  if (!questionOriginal) return null;

  const englishSource = (input.modelQuestion && input.modelQuestion.trim()) || input.customerText;
  const questionEn = truncate(await toVendorEnglish(englishSource), QUESTION_MAX);
  const category = resolveCategory(input.category);
  const productId = input.productId?.trim() || null;
  const sourceMessageId = input.sourceMessageId ?? null;

  const embedding = await embedText(questionEn);
  if (embedding) {
    try {
      const duplicate = await findOpenDuplicate(input.vendorId, embedding);
      if (duplicate) {
        const related = asStringIds(duplicate.relatedMessageIds);
        if (sourceMessageId && !related.includes(sourceMessageId)) {
          related.push(sourceMessageId);
        }
        await prisma.customerQuery.update({
          where: { id: duplicate.id },
          data: {
            hitCount: { increment: 1 },
            lastSeenAt: new Date(),
            relatedMessageIds: related.slice(-RELATED_MESSAGE_CAP),
            ...(sourceMessageId ? { quoteMessageId: sourceMessageId } : {})
          }
        });
        logCount('CustomerQueryDeduped', { vendorId: input.vendorId });
        logger.info(
          { vendorId: input.vendorId, conversationId: input.conversationId, queryId: duplicate.id },
          'CustomerQuery deduped — hitCount bumped'
        );
        return { id: duplicate.id, deduped: true };
      }
    } catch (error) {
      logger.warn({ err: error, vendorId: input.vendorId }, 'CustomerQuery dedup lookup failed — inserting new row');
    }
  }

  const createData = {
    vendorId: input.vendorId,
    conversationId: input.conversationId,
    customerId: input.customerId,
    sourceMessageId,
    quoteMessageId: sourceMessageId,
    questionOriginal,
    questionEn,
    category,
    status: 'open',
    productId
  };

  // productId is already vendor-scoped by validateProductIds against this
  // turn's compact catalog, so the Product FK here is a backstop, not the
  // guard — a violation means a genuine bug and should surface, not retry.
  const created = await prisma.customerQuery.create({ data: createData });

  if (embedding) {
    try {
      await storeEmbedding(created.id, embedding);
    } catch (error) {
      logger.warn({ err: error, queryId: created.id }, 'CustomerQuery embedding store failed');
    }
  }

  logCount('CustomerQueryOpened', { vendorId: input.vendorId, category });
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { phone: true }
  });
  void notifyVendorOfKnowledgeGap({
    vendorId: input.vendorId,
    conversationId: input.conversationId,
    queryId: created.id,
    questionEn,
    customerPhone: customer?.phone ?? null
  }).catch((error) => {
    logger.error({ err: error, vendorId: input.vendorId, queryId: created.id }, 'CustomerQuery notify failed');
  });
  return { id: created.id, deduped: false };
}

const VENDOR_ANSWER_MAX = 2000;

export async function markOpenQueriesAnswered(input: {
  conversationId: string;
  vendorId: string;
  vendorAnswerOriginal: string;
  answeredByVendorId?: string | null;
}): Promise<number> {
  const vendorAnswerOriginal = truncate(input.vendorAnswerOriginal, VENDOR_ANSWER_MAX);
  if (!vendorAnswerOriginal) return 0;

  const vendorAnswerEn = truncate(await toVendorEnglish(vendorAnswerOriginal), VENDOR_ANSWER_MAX);
  const result = await prisma.customerQuery.updateMany({
    where: { conversationId: input.conversationId, vendorId: input.vendorId, status: 'open' },
    data: {
      status: 'answered',
      vendorAnswerOriginal,
      vendorAnswerEn,
      answeredAt: new Date(),
      answeredByVendorId: input.answeredByVendorId ?? input.vendorId
    }
  });

  if (result.count > 0) {
    logCount('CustomerQueryAnswered', { vendorId: input.vendorId }, result.count);
  }
  return result.count;
}

/**
 * After CartEngine apply: persist a CustomerQuery when LLM-1 emitted
 * knowledge_gap or the draft is a deferral fallback. Never pauses AI.
 * Handoff, order-status (D6), and sandbox turns skip writes.
 */
export async function persistKnowledgeGapIfNeeded(
  input: PersistKnowledgeGapInput
): Promise<UpsertKnowledgeGapResult | null> {
  if (input.sandbox || input.hasHandoff || input.orderStatusTurn) return null;

  const gapOp = input.ops.find((op): op is Extract<CartOp, { type: 'knowledge_gap' }> => op.type === 'knowledge_gap');
  if (!gapOp && !looksLikeDeferral(input.draftReply)) return null;

  try {
    return await upsertKnowledgeGap({
      vendorId: input.vendorId,
      conversationId: input.conversationId,
      customerId: input.customerId,
      sourceMessageId: input.sourceMessageId,
      customerText: input.customerText,
      modelQuestion: gapOp?.question ?? null,
      category: gapOp?.category ?? null,
      productId: gapOp?.productId ?? null
    });
  } catch (error) {
    logger.error(
      { err: error, vendorId: input.vendorId, conversationId: input.conversationId },
      'CustomerQuery persist failed'
    );
    return null;
  }
}
