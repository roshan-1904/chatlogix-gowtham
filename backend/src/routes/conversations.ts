import express from 'express';
import { prisma } from '../db/prisma.js';
import { 
  asyncHandlerWithContext,
  createValidationError,
  CustomError,
  ErrorType,
  ErrorSeverity
} from '../middleware/errorHandler.js';
import { requireVendorAccess } from '../middleware/authorize.js';
import { hydrateMessagesContentEn } from '../utils/vendorEnglish.js';
import { sendVendorConversationReply } from '../services/vendorConversationReply.js';

export const conversationsRouter = express.Router();

// PUT /api/conversations/:id/ai-pause - Toggle AI pause status
conversationsRouter.put(
  '/:id/ai-pause',
  asyncHandlerWithContext(async (req: any, res: any) => {
    const conversationId = req.params.id;
    const user = req.user;
    const { paused } = req.body;

    if (!user) {
      throw new CustomError(
        'Authentication required',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    if (typeof paused !== 'boolean') {
      throw createValidationError('paused must be a boolean', 'paused', paused);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { vendorId: true }
    });

    if (!conversation) {
      throw createValidationError('Conversation not found', 'id', conversationId);
    }

    // Check vendor access
    if (
      !user.roles.includes('admin') &&
      user.vendorId !== conversation.vendorId
    ) {
      throw new CustomError(
        'You are not authorized to modify this conversation',
        403,
        ErrorType.AUTHORIZATION,
        ErrorSeverity.MEDIUM,
        true,
        { conversationId, vendorId: conversation.vendorId }
      );
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { aiPaused: paused },
      select: { id: true, aiPaused: true }
    });

    res.json(updated);
  }, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM)
);

// POST /api/conversations/:id/messages - Send message from vendor
conversationsRouter.post(
  '/:id/messages',
  asyncHandlerWithContext(async (req: any, res: any) => {
    const conversationId = req.params.id;
    const user = req.user;
    const { content, replyToMessageId } = req.body;

    if (!user) {
      throw new CustomError(
        'Authentication required',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      throw createValidationError('Message content is required', 'content', content);
    }

    const replyTo =
      typeof replyToMessageId === 'string' && replyToMessageId.trim().length > 0
        ? replyToMessageId.trim()
        : undefined;

    const { message, markedOpenQueries } = await sendVendorConversationReply({
      conversationId,
      user,
      content,
      replyToMessageId: replyTo
    });

    res.json({ ...message, markedOpenQueries });
  }, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM)
);

// Conversation Parity DTO helpers
const NO_LIMIT_CAP = 500;
const REPLY_PREVIEW_CHARS = 80;

export const enrichedInclude = (includeStatusHistory: boolean) => ({
  media: true,
  reactions: { where: { active: true } },
  replyToMessage: {
    select: { id: true, content: true, contentEn: true, type: true, senderType: true, timestamp: true }
  },
  statusEvents: includeStatusHistory
    ? ({ orderBy: { occurredAt: 'asc' as const } } as const)
    : (false as const)
});

export function shapeMessageMedia(messageId: string, media: any): any {
  if (!media) return null;
  return {
    state: media.fetchState,
    mimeType: media.mimeType,
    filename: media.filename,
    caption: media.caption,
    durationSec: media.durationSec,
    width: media.width,
    height: media.height,
    fileSizeBytes: media.fileSizeBytes,
    mediaUrl: media.fetchState === 'ready' ? `/api/messages/${messageId}/media` : null
  };
}

export function shapeMessage(row: any): any {
  type ReactionGroup = { emoji: string; count: number; reactorIds: string[] };
  const reactionGroups = new Map<string, ReactionGroup>();
  for (const r of row.reactions ?? []) {
    const existing = reactionGroups.get(r.emoji);
    const group: ReactionGroup = existing ?? {
      emoji: r.emoji,
      count: 0,
      reactorIds: [] as string[]
    };
    group.count += 1;
    group.reactorIds.push(r.reactorId);
    reactionGroups.set(r.emoji, group);
  }

  const reactions = Array.from(reactionGroups.values());

  let replyTo: any = null;
  if (row.replyToMessage) {
    const r = row.replyToMessage;
    const previewSource = r.contentEn ?? r.content ?? '';
    const preview = previewSource.slice(0, REPLY_PREVIEW_CHARS);
    replyTo = {
      id: r.id,
      contentPreview: preview,
      type: r.type,
      senderType: r.senderType,
      timestamp: r.timestamp
    };
  }

  const media = shapeMessageMedia(row.id, row.media);

  // Strip the joined relations from the row before merging the shaped extras.
  const { reactions: _r, replyToMessage: _rt, media: _m, statusEvents, ...base } = row;

  return {
    ...base,
    contentEn: row.contentEn ?? null,
    replyTo,
    media,
    reactions,
    ...(Array.isArray(statusEvents) ? { statusEvents } : {})
  };
}

// GET /api/conversations/:id/messages - Get messages for a conversation (with optional cursor pagination)
conversationsRouter.get(
  '/:id/messages',
  asyncHandlerWithContext(async (req: any, res: any) => {
    const conversationId = req.params.id;
    const user = req.user;
    const limitParam = req.query.limit as string | undefined;
    const beforeMessageId = req.query.beforeMessageId as string | undefined;
    const includeStatusHistory = req.query.includeStatusHistory === 'true';

    if (!user) {
      throw new CustomError(
        'Authentication required',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    // First check if conversation exists and get vendorId and aiPaused for authorization
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { vendorId: true, aiPaused: true }
    });

    if (!conversation) {
      throw createValidationError('Conversation not found', 'id', conversationId);
    }

    if (
      !user.roles.includes('admin') &&
      user.vendorId !== conversation.vendorId
    ) {
      throw new CustomError(
        'You are not authorized to access this conversation',
        403,
        ErrorType.AUTHORIZATION,
        ErrorSeverity.MEDIUM,
        true,
        { conversationId, vendorId: conversation.vendorId }
      );
    }

    const requestedLimit = Number.parseInt(limitParam || '0', 10) || 0;
    const aiPaused = conversation.aiPaused === true;
    const include = enrichedInclude(includeStatusHistory);

    // No-limit branch: enforce a 500-message hard cap and always report hasMore.
    if (!requestedLimit) {
      const rawMessages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'desc' },
        take: NO_LIMIT_CAP + 1,
        include
      });
      const hasMore = rawMessages.length > NO_LIMIT_CAP;
      const pagedNewestFirst = rawMessages.slice(0, NO_LIMIT_CAP);
      const hydrated = await hydrateMessagesContentEn(pagedNewestFirst);
      const messages = hydrated.slice().reverse().map(shapeMessage);
      const oldestMessageId = messages.length > 0 ? messages[0].id : null;

      return res.json({
        messages,
        hasMore,
        oldestMessageId,
        aiPaused
      });
    }

    // Cursor-based pagination using beforeMessageId
    let anchorTimestamp: Date | undefined;
    if (beforeMessageId) {
      const anchor = await prisma.message.findUnique({
        where: { id: beforeMessageId },
        select: { timestamp: true, conversationId: true }
      });

      if (!anchor || anchor.conversationId !== conversationId) {
        throw createValidationError('Invalid beforeMessageId', 'beforeMessageId', beforeMessageId);
      }

      anchorTimestamp = anchor.timestamp;
    }

    const pageSize = Math.min(requestedLimit, NO_LIMIT_CAP);

    const where: any = { conversationId };
    if (anchorTimestamp) {
      where.timestamp = { lt: anchorTimestamp };
    }

    // Fetch one extra message to detect if there are more
    const rawMessages = await prisma.message.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: pageSize + 1,
      include
    });

    const hasMore = rawMessages.length > pageSize;
    const pagedNewestFirst = rawMessages.slice(0, pageSize);
    const hydrated = await hydrateMessagesContentEn(pagedNewestFirst);
    const pagedMessages = hydrated.slice().reverse().map(shapeMessage);

    const oldestMessageId = pagedMessages.length > 0 ? pagedMessages[0].id : null;

    return res.json({
      messages: pagedMessages,
      hasMore,
      oldestMessageId,
      aiPaused
    });
  }, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM)
);

// GET /api/conversations/:id - Get conversation details
conversationsRouter.get(
  '/:id',
  asyncHandlerWithContext(async (req: any, res: any) => {
    const conversationId = req.params.id;
    const user = req.user;

    if (!user) {
      throw new CustomError(
        'Authentication required',
        401,
        ErrorType.AUTHENTICATION,
        ErrorSeverity.MEDIUM
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: true,
        vendor: {
          select: {
            id: true,
            businessName: true
          }
        }
      }
    });

    if (!conversation) {
      throw createValidationError('Conversation not found', 'id', conversationId);
    }

    if (
      !user.roles.includes('admin') &&
      user.vendorId !== conversation.vendorId
    ) {
      throw new CustomError(
        'You are not authorized to access this conversation',
        403,
        ErrorType.AUTHORIZATION,
        ErrorSeverity.MEDIUM,
        true,
        { conversationId, vendorId: conversation.vendorId }
      );
    }

    res.json(conversation);
  }, ErrorType.AUTHORIZATION, ErrorSeverity.MEDIUM)
);

