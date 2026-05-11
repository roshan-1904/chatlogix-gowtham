/**
 * Response Queuing Service
 * 
 * Queues final message to response worker (Stage 9)
 * Reference: Phase 5.13: Stage 9 - Response Queuing Service (Implementation Plan)
 */

import { logger } from '../logger.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';

/**
 * Queue response to response worker
 */
export async function queueResponse(
  finalMessage: string,
  conversationId: string,
  vendorId: string,
  customerId: string,
  metadata: {
    intent: string;
    tokensUsed: number;
    stagesExecuted: string[];
    costUsd?: number;
    promptTokens?: number;
    completionTokens?: number;
    primaryModel?: string | null;
    modelBreakdown?: Record<string, unknown> | null;
    costEstimated?: boolean;
  }
): Promise<void> {
  try {
    // Get customer phone from conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true }
    });
    
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Store assistant message in DB BEFORE queuing for WhatsApp delivery.
    // This ensures the response is persisted even if WhatsApp send fails
    // (e.g., vendor messaging themselves, API outage, invalid number).
    try {
      await prisma.message.create({
        data: {
          conversationId,
          senderType: 'assistant',
          content: finalMessage,
          type: 'text',
          aiTokensUsed: metadata.tokensUsed || 0,
          aiCostUsd: metadata.costUsd || 0,
          aiPromptTokens: metadata.promptTokens || 0,
          aiCompletionTokens: metadata.completionTokens || 0,
          aiPrimaryModel: metadata.primaryModel || null,
          aiModelBreakdown: metadata.modelBreakdown ? JSON.parse(JSON.stringify(metadata.modelBreakdown)) : undefined,
          aiCostEstimated: metadata.costEstimated || false
        }
      });
      logger.info({ conversationId }, 'Assistant message stored in DB');
    } catch (dbError) {
      // Log but don't block — message delivery is more important
      logger.error({ err: dbError, conversationId }, 'Failed to store assistant message in DB');
    }

    await publishToQueue(env.RESPONSE_QUEUE_URL, {
      to: conversation.customer.phone,
      text: finalMessage,
      conversationId,
      vendorId,
      customerId,
      metadata: {
        intent: metadata.intent,
        tokensUsed: metadata.tokensUsed,
        stagesExecuted: metadata.stagesExecuted
      }
    });

    logger.info({ conversationId, messageLength: finalMessage.length }, '✅ Response queued');
  } catch (error) {
    logger.error({ err: error, conversationId }, 'Failed to queue response');
    throw error;
  }
}

