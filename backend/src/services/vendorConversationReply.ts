import { prisma } from '../db/prisma.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { env } from '../config/env.js';
import { ensureMessageContentEn } from '../utils/vendorEnglish.js';
import { logger } from '../logger.js';
import {
  createValidationError,
  CustomError,
  ErrorSeverity,
  ErrorType
} from '../middleware/errorHandler.js';
import { markOpenQueriesAnswered } from '../conversation/customerQuery.js';
import { logCount } from '../conversation/metrics.js';
import {
  planOutboundTextForQuote,
  quotedReplyFallbackIntro,
  resolveConversationReplyQuote,
  resolveQuoteWamid,
  type ResolvedQuoteTarget
} from './quotedReplyHelpers.js';

export interface VendorReplyUser {
  vendorId?: string | null;
  roles: string[];
}

export type CustomerQueryReplyContext = {
  quoteMessageId: string | null;
  sourceMessageId: string | null;
  questionOriginal: string;
};

export async function sendVendorConversationReply(input: {
  conversationId: string;
  user: VendorReplyUser;
  content: string;
  replyToMessageId?: string | null;
  customerQueryReply?: CustomerQueryReplyContext;
}): Promise<{
  message: { id: string; conversationId: string; senderType: string; content: string };
  markedOpenQueries: number;
}> {
  const vendorReply = input.content.trim();
  if (!vendorReply) {
    throw createValidationError('Message content is required', 'content', input.content);
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    include: {
      customer: true,
      vendor: {
        include: {
          whatsappNumbers: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      }
    }
  });

  if (!conversation) {
    throw createValidationError('Conversation not found', 'id', input.conversationId);
  }

  if (!input.user.roles.includes('admin') && input.user.vendorId !== conversation.vendorId) {
    throw new CustomError(
      'You are not authorized to send messages in this conversation',
      403,
      ErrorType.AUTHORIZATION,
      ErrorSeverity.MEDIUM,
      true,
      { conversationId: input.conversationId, vendorId: conversation.vendorId }
    );
  }

  const phoneNumberId = conversation.vendor.whatsappNumbers[0]?.phoneNumberId || undefined;

  let quoteTarget: ResolvedQuoteTarget | null = null;
  const intro = quotedReplyFallbackIntro();

  if (input.customerQueryReply) {
    const anchorId =
      input.customerQueryReply.quoteMessageId ?? input.customerQueryReply.sourceMessageId;
    quoteTarget = await resolveQuoteWamid(
      anchorId,
      input.customerQueryReply.questionOriginal,
      conversation.id
    );
  } else if (input.replyToMessageId) {
    quoteTarget = await resolveConversationReplyQuote(input.conversationId, input.replyToMessageId);
  }

  const { text: outboundText, useQuoteContext } = planOutboundTextForQuote(vendorReply, quoteTarget, intro);
  if (quoteTarget && !useQuoteContext) {
    logCount('CustomerQueryReplyFallback', {});
  }

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'vendor',
        content: outboundText,
        type: 'text'
      }
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    })
  ]);

  void ensureMessageContentEn(message.id, outboundText).catch(() => {
    // Non-blocking — vendor typed English is a no-op; translation failure is acceptable.
  });

  const queuePayload: Record<string, unknown> = {
    type: 'text',
    to: conversation.customer.phone,
    text: outboundText,
    conversationId: conversation.id,
    vendorId: conversation.vendorId,
    customerId: conversation.customerId,
    phoneNumberId,
    messageId: message.id
  };

  if (quoteTarget && useQuoteContext && quoteTarget.whatsappMessageId) {
    queuePayload.replyToWhatsappMessageId = quoteTarget.whatsappMessageId;
    queuePayload.replyToInternalMessageId = quoteTarget.internalMessageId;
    queuePayload.fallbackQuestionText = quoteTarget.fallbackQuestionOriginal;
  } else if (quoteTarget && !useQuoteContext) {
    queuePayload.fallbackQuestionText = quoteTarget.fallbackQuestionOriginal;
  }

  try {
    await publishToQueue(env.RESPONSE_QUEUE_URL, queuePayload);
  } catch (error) {
    // The Message row is already committed, so an unhandled publish failure leaves it
    // on `pending` forever — the composer shows "Sending…" for a message that never
    // reached the dispatcher. Mark it failed so the UI can surface the error tick.
    await prisma.message
      .update({
        where: { id: message.id },
        data: {
          status: 'failed',
          failureReason: `Could not queue for delivery: ${
            error instanceof Error ? error.message : String(error)
          }`.slice(0, 500)
        }
      })
      .catch((updateError: unknown) => {
        logger.error(
          { err: updateError, messageId: message.id },
          'Failed to mark vendor reply as failed after response queue publish error'
        );
      });

    logger.error(
      { err: error, conversationId: conversation.id, messageId: message.id },
      'Failed to publish vendor reply to response queue'
    );

    throw new CustomError(
      'Could not queue the reply for delivery. Please try again.',
      502,
      ErrorType.QUEUE,
      ErrorSeverity.HIGH,
      true,
      { conversationId: conversation.id, messageId: message.id }
    );
  }

  let markedOpenQueries = 0;
  try {
    markedOpenQueries = await markOpenQueriesAnswered({
      conversationId: conversation.id,
      vendorId: conversation.vendorId,
      vendorAnswerOriginal: vendorReply,
      answeredByVendorId: conversation.vendorId
    });
  } catch (error) {
    logger.error(
      { err: error, conversationId: conversation.id, vendorId: conversation.vendorId },
      'Failed to mark open CustomerQueries answered after vendor reply'
    );
  }

  return { message, markedOpenQueries };
}
