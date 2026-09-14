import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { logCount } from '../conversation/metrics.js';
import { QUOTED_REPLY_FALLBACK_INTRO_EN } from '../conversation/quotedReplyTemplates.js';

export const FALLBACK_QUESTION_MAX_CHARS = 400;

export interface ResolvedQuoteTarget {
  internalMessageId: string;
  whatsappMessageId: string | null;
  fallbackQuestionOriginal: string;
}

export function truncateForFallbackPrefix(questionOriginal: string, max = FALLBACK_QUESTION_MAX_CHARS): string {
  const trimmed = questionOriginal.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

export function buildQuotedReplyFallbackBody(
  intro: string,
  questionOriginal: string,
  vendorReply: string
): string {
  const question = truncateForFallbackPrefix(questionOriginal);
  const reply = vendorReply.trim();
  const lead = intro.trim();
  return `${lead}\n\n"${question}"\n\n${reply}`;
}

export function quotedReplyFallbackIntro(_preferredLanguage?: string | null): string {
  return QUOTED_REPLY_FALLBACK_INTRO_EN;
}

/**
 * Resolve the wamid to quote for a Customer Query reply.
 *
 * `expectedConversationId` scopes the anchor to the conversation we are about to
 * send into. A row that is missing, not the customer's, or from another thread is
 * never quoted — we degrade to the inline fallback prefix instead of asking Graph
 * to quote a bubble that is not in this chat.
 */
export async function resolveQuoteWamid(
  quoteMessageId: string | null | undefined,
  fallbackQuestionOriginal: string,
  expectedConversationId?: string
): Promise<ResolvedQuoteTarget | null> {
  const questionFallback = fallbackQuestionOriginal.trim();

  if (!quoteMessageId) {
    if (questionFallback) {
      logCount('CustomerQueryReplyQuoteMissingWamid', {});
      return {
        internalMessageId: '',
        whatsappMessageId: null,
        fallbackQuestionOriginal: questionFallback
      };
    }
    logCount('CustomerQueryReplyQuoteMissingWamid', {});
    return null;
  }

  const row = await prisma.message.findUnique({
    where: { id: quoteMessageId },
    select: {
      id: true,
      conversationId: true,
      senderType: true,
      whatsappMessageId: true,
      content: true
    }
  });

  const question = questionFallback || row?.content.trim() || '';
  const wrongConversation =
    !!row && !!expectedConversationId && row.conversationId !== expectedConversationId;

  if (!row || row.senderType !== 'customer' || wrongConversation) {
    logger.info(
      { quoteMessageId, hasRow: !!row, senderType: row?.senderType, wrongConversation },
      'CustomerQueryReplyQuoteMissingWamid'
    );
    logCount('CustomerQueryReplyQuoteMissingWamid', {});
    if (question) {
      return { internalMessageId: quoteMessageId, whatsappMessageId: null, fallbackQuestionOriginal: question };
    }
    return null;
  }

  if (!row.whatsappMessageId) {
    logger.info({ quoteMessageId }, 'CustomerQueryReplyQuoteMissingWamid');
    logCount('CustomerQueryReplyQuoteMissingWamid', {});
    return {
      internalMessageId: row.id,
      whatsappMessageId: null,
      fallbackQuestionOriginal: question
    };
  }

  return {
    internalMessageId: row.id,
    whatsappMessageId: row.whatsappMessageId,
    fallbackQuestionOriginal: question
  };
}

export function planOutboundTextForQuote(
  vendorReply: string,
  quote: ResolvedQuoteTarget | null,
  intro: string
): { text: string; useQuoteContext: boolean } {
  if (!quote) {
    return { text: vendorReply, useQuoteContext: false };
  }
  if (quote.whatsappMessageId) {
    return { text: vendorReply, useQuoteContext: true };
  }
  const body = buildQuotedReplyFallbackBody(intro, quote.fallbackQuestionOriginal, vendorReply);
  return { text: body, useQuoteContext: false };
}

export async function resolveConversationReplyQuote(
  conversationId: string,
  replyToMessageId?: string | null
): Promise<ResolvedQuoteTarget | null> {
  if (replyToMessageId) {
    const row = await prisma.message.findFirst({
      where: { id: replyToMessageId, conversationId, senderType: 'customer' },
      select: { id: true, whatsappMessageId: true, content: true }
    });
    if (!row) return null;
    if (!row.whatsappMessageId) {
      logCount('CustomerQueryReplyQuoteMissingWamid', {});
    }
    return {
      internalMessageId: row.id,
      whatsappMessageId: row.whatsappMessageId,
      fallbackQuestionOriginal: row.content.trim()
    };
  }
  return null;
}
