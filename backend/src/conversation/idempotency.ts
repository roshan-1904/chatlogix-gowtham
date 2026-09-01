import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

export interface UpsertInboundMessageInput {
  vendorId: string;
  conversationId: string;
  customerId: string;
  content: string;
  whatsappMessageId: string;
}

export interface UpsertInboundMessageResult {
  messageId: string;
  alreadyProcessed: boolean;
}

/**
 * Idempotent inbound-message insert, keyed on whatsappMessageId (I2). This
 * is a "create, then find on conflict" rather than a Prisma `upsert` because
 * there is nothing to *update* on a redelivery -- the original row is
 * already correct in place; a conflict just means "return what's there."
 *
 * No existing helper does this correctly today: messageProcessor.ts's
 * storeIncomingMessage creates a Message row without ever setting
 * whatsappMessageId (confirmed by reading that create call directly), and
 * duplicateMessageService.ts is an in-memory Set, useless across separate
 * Lambda invocations/cold starts. `vendorId`/`customerId` aren't Message
 * columns (only `conversationId` is) -- they're accepted here purely for
 * log context, keeping this function's contract self-describing for callers
 * that already have them on hand from earlier in the pipeline.
 */
export async function upsertInboundMessage(input: UpsertInboundMessageInput): Promise<UpsertInboundMessageResult> {
  const { vendorId, conversationId, customerId, content, whatsappMessageId } = input;

  try {
    const message = await prisma.message.create({
      data: {
        conversationId,
        senderType: 'customer',
        content,
        type: 'text',
        whatsappMessageId
      }
    });
    return { messageId: message.id, alreadyProcessed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.message.findUnique({ where: { whatsappMessageId } });
      if (existing) {
        logger.info({ vendorId, conversationId, customerId, whatsappMessageId, messageId: existing.id }, 'Inbound message already processed (idempotent no-op)');
        return { messageId: existing.id, alreadyProcessed: true };
      }
      // Extremely unlikely race: the unique-violation fired but the row is
      // now gone (e.g. deleted between the insert attempt and this lookup).
      // Surface the original conflict rather than fabricating a result.
      throw new Error(`Message with whatsappMessageId=${whatsappMessageId} conflicted but could not be found`);
    }
    throw error;
  }
}
