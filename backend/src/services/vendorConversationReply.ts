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

export interface VendorReplyUser {
  vendorId?: string | null;
  roles: string[];
}

export async function sendVendorConversationReply(input: {
  conversationId: string;
  user: VendorReplyUser;
  content: string;
}): Promise<{
  message: { id: string; conversationId: string; senderType: string; content: string };
  markedOpenQueries: number;
}> {
  const content = input.content.trim();
  if (!content) {
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

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: 'vendor',
        content,
        type: 'text'
      }
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    })
  ]);

  void ensureMessageContentEn(message.id, content).catch(() => {
    // Non-blocking — vendor typed English is a no-op; translation failure is acceptable.
  });

  await publishToQueue(env.RESPONSE_QUEUE_URL, {
    to: conversation.customer.phone,
    text: content,
    conversationId: conversation.id,
    vendorId: conversation.vendorId,
    customerId: conversation.customerId,
    phoneNumberId
  });

  let markedOpenQueries = 0;
  try {
    markedOpenQueries = await markOpenQueriesAnswered({
      conversationId: conversation.id,
      vendorId: conversation.vendorId,
      vendorAnswerOriginal: content,
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
