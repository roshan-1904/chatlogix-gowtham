import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { calculateCost } from '../utils/costCalculator.js';
import type { CartSnapshot } from './types.js';

export interface PersistInput {
  vendorId: string;
  conversationId: string;
  customerId: string;
  snapshot: CartSnapshot;
  finalText: string;
  language: string;
  intent: string;
  tokenMeta: { model: string; promptTokens: number; completionTokens: number };
  whatsappMessageId: string;
}

export interface PersistResult {
  assistantMessageId: string;
}

/**
 * Advisory conversation-stage label (not used for any write-path decision —
 * CartEngine.apply already owns the actual Order.status transitions). Kept
 * intentionally simple; the old pipeline's AI-driven stage/key-fact
 * extraction (conversationMemoryService.ts) is out of scope for this
 * rewrite's v1.
 */
function deriveConversationStage(snapshot: CartSnapshot): string {
  if (snapshot.status === 'cancelled') return 'cancelled';
  if (snapshot.status === 'confirmed' || (snapshot.status === 'pending' && snapshot.missing.length === 0 && snapshot.items.length > 0)) {
    return 'confirming';
  }
  if (snapshot.items.length > 0) return 'ordering';
  return 'greeting';
}

/**
 * Persist step (spec §19 step 8): CustomerInsights, ConversationMemory, the
 * assistant Message, and a MessageProcessing row tracking this attempt.
 * `Order` itself is already written by CartEngine.apply (Step 3) — this
 * function never touches it. Runs as one batched transaction so a partial
 * failure here doesn't leave, say, an assistant Message with no matching
 * MessageProcessing row.
 */
export async function persistTurn(input: PersistInput): Promise<PersistResult> {
  const { vendorId, conversationId, customerId, snapshot, finalText, language, intent, tokenMeta, whatsappMessageId } = input;

  const cost = calculateCost(tokenMeta.model, tokenMeta.promptTokens, tokenMeta.completionTokens);
  const stage = deriveConversationStage(snapshot);

  const [assistantMessage] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId,
        senderType: 'assistant',
        content: finalText,
        type: 'text',
        aiTokensUsed: tokenMeta.promptTokens + tokenMeta.completionTokens,
        aiPromptTokens: tokenMeta.promptTokens,
        aiCompletionTokens: tokenMeta.completionTokens,
        aiPrimaryModel: tokenMeta.model,
        aiCostUsd: cost.costUsd,
        aiCostEstimated: cost.isEstimated
      }
    }),
    prisma.customerInsights.upsert({
      where: { customerId_vendorId: { customerId, vendorId } },
      create: {
        customerId,
        vendorId,
        customerName: snapshot.customerName ?? undefined,
        deliveryAddress: snapshot.address ?? undefined,
        primaryDeliveryAddress: snapshot.address ?? undefined,
        preferredLanguage: language
      },
      update: {
        ...(snapshot.customerName ? { customerName: snapshot.customerName } : {}),
        ...(snapshot.address ? { deliveryAddress: snapshot.address, primaryDeliveryAddress: snapshot.address } : {}),
        preferredLanguage: language
      }
    }),
    prisma.conversationMemory.upsert({
      where: { conversationId },
      create: { conversationId, vendorId, conversationStage: stage, turnNumber: 1 },
      update: { conversationStage: stage, turnNumber: { increment: 1 } }
    }),
    prisma.messageProcessing.upsert({
      where: { whatsappMessageId },
      create: {
        whatsappMessageId,
        vendorId,
        conversationId,
        status: 'applied',
        promptTokens: tokenMeta.promptTokens,
        completionTokens: tokenMeta.completionTokens,
        model: tokenMeta.model
      },
      update: {
        status: 'applied',
        promptTokens: tokenMeta.promptTokens,
        completionTokens: tokenMeta.completionTokens,
        model: tokenMeta.model
      }
    })
  ]);

  logger.info(
    { traceId: whatsappMessageId, vendorId, conversationId, assistantMessageId: assistantMessage.id, intent, stage },
    'Persisted turn'
  );

  return { assistantMessageId: assistantMessage.id };
}
