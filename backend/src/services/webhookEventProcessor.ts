import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env, getTextQueueUrl } from '../config/env.js';
import { logger, StepLogger, createOperationId, logWhatsAppOperation } from '../logger.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { getRedisClient } from '../utils/redis.js';
import { emitMetric } from '../observability/metrics.js';
import { DuplicateMessageService } from './duplicateMessageService.js';
import { ensureConversation, ensureCustomer } from './messageProcessor.js';
import {
  MessageCreatedEvent,
  ParsedMessageType,
  ParsedWAEvent,
  ReactionEvent,
  StatusEvent
} from './waParser.js';

const ORPHAN_TTL_SECONDS = 5 * 60; // 5 minutes
const MEDIA_TYPES: ReadonlyArray<ParsedMessageType> = [
  'audio',
  'image',
  'video',
  'document',
  'sticker'
];
const AI_QUEUE_TYPES: ReadonlyArray<ParsedMessageType> = ['text', 'interactive'];

const STATUS_RANK: Record<string, number> = {
  pending: 0,
  processing: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 99
};

type VendorContext = { vendorId: string; phoneNumberId: string };

function shouldUpgradeStatus(current: string | null | undefined, next: string): boolean {
  if (!current) return true;
  return (STATUS_RANK[next] ?? -1) > (STATUS_RANK[current] ?? -1);
}

function orphanKey(whatsappMessageId: string): string {
  return `wa:orphan:${whatsappMessageId}`;
}

function timestampToDate(ts?: string): Date {
  if (!ts) return new Date();
  // WhatsApp timestamps are unix seconds as a string
  const num = Number(ts);
  if (Number.isFinite(num) && num > 0) return new Date(num * 1000);
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

async function bufferOrphan(parentWhatsappMessageId: string, event: ParsedWAEvent): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    logger.warn(
      { parentWhatsappMessageId, kind: event.kind },
      'Redis unavailable; dropping orphan webhook event'
    );
    return;
  }
  try {
    await client.rpush(orphanKey(parentWhatsappMessageId), JSON.stringify(event));
    await client.expire(orphanKey(parentWhatsappMessageId), ORPHAN_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, parentWhatsappMessageId }, 'Failed to buffer orphan event');
  }
}

async function drainOrphanBuffer(parentWhatsappMessageId: string): Promise<ParsedWAEvent[]> {
  const client = getRedisClient();
  if (!client) return [];
  try {
    const key = orphanKey(parentWhatsappMessageId);
    const raw = await client.lrange(key, 0, -1);
    if (!raw.length) return [];
    await client.del(key);
    const events: ParsedWAEvent[] = [];
    for (const item of raw) {
      try {
        events.push(JSON.parse(item));
      } catch {
        // ignore corrupt entries
      }
    }
    events.sort((a, b) => {
      const at = a.timestamp ? Number(a.timestamp) : 0;
      const bt = b.timestamp ? Number(b.timestamp) : 0;
      return at - bt;
    });
    return events;
  } catch (err) {
    logger.warn({ err, parentWhatsappMessageId }, 'Failed to drain orphan buffer');
    return [];
  }
}

async function resolveReplyToMessageId(
  conversationId: string,
  replyToWhatsappMessageId?: string
): Promise<string | undefined> {
  if (!replyToWhatsappMessageId) return undefined;
  const parent = await prisma.message.findUnique({
    where: { whatsappMessageId: replyToWhatsappMessageId },
    select: { id: true, conversationId: true }
  });
  if (!parent) return undefined;
  if (parent.conversationId !== conversationId) return undefined;
  return parent.id;
}

function bodyContentForCreate(event: MessageCreatedEvent): string {
  if (event.text) return event.text;
  if (event.caption) return event.caption;
  if (event.messageType === 'location') {
    const lat = event.structuredPayload?.latitude;
    const lng = event.structuredPayload?.longitude;
    return lat != null && lng != null ? `📍 ${lat}, ${lng}` : '📍 Location';
  }
  if (event.messageType === 'contact') return '👤 Contact card';
  if (event.messageType === 'sticker') return '🟦 Sticker';
  return '';
}

interface PersistedMessage {
  id: string;
  conversationId: string;
  customerId: string;
  alreadyExisted: boolean;
}

async function persistInboundMessage(
  vendor: VendorContext,
  event: MessageCreatedEvent
): Promise<PersistedMessage> {
  const { conversation, customer } = await ensureConversation(vendor.vendorId, event.from);
  const replyToMessageId = await resolveReplyToMessageId(
    conversation.id,
    event.replyToWhatsappMessageId
  );

  const baseData: Prisma.MessageUncheckedCreateInput = {
    conversationId: conversation.id,
    senderType: 'customer',
    content: bodyContentForCreate(event),
    type: event.messageType,
    timestamp: timestampToDate(event.timestamp),
    whatsappMessageId: event.whatsappMessageId,
    replyToMessageId: replyToMessageId ?? null,
    structuredPayload: event.structuredPayload
      ? (event.structuredPayload as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    status: 'delivered'
  };

  let alreadyExisted = false;
  let messageId: string;
  try {
    const created = await prisma.message.create({ data: baseData, select: { id: true } });
    messageId = created.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      // Race with another delivery — fetch the row that already won.
      const existing = await prisma.message.findUnique({
        where: { whatsappMessageId: event.whatsappMessageId },
        select: { id: true }
      });
      if (!existing) throw err;
      messageId = existing.id;
      alreadyExisted = true;
    } else {
      throw err;
    }
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() }
  });

  return {
    id: messageId,
    conversationId: conversation.id,
    customerId: customer.id,
    alreadyExisted
  };
}

async function ensureMediaPlaceholder(
  messageId: string,
  event: MessageCreatedEvent
): Promise<boolean> {
  if (!MEDIA_TYPES.includes(event.messageType)) return false;
  if (!event.mediaId) return false;

  const existing = await prisma.messageMedia.findUnique({
    where: { messageId },
    select: { id: true }
  });
  if (existing) return false;

  await prisma.messageMedia.create({
    data: {
      messageId,
      whatsappMediaId: event.mediaId,
      mimeType: event.mimeType ?? null,
      filename: event.filename ?? null,
      caption: event.caption ?? null,
      fetchState: 'pending'
    }
  });
  return true;
}

async function enqueueMediaFetch(
  messageId: string,
  event: MessageCreatedEvent,
  vendor: VendorContext
): Promise<void> {
  if (!env.MEDIA_FETCH_QUEUE_URL) {
    logger.warn(
      { messageId, mediaId: event.mediaId },
      'MEDIA_FETCH_QUEUE_URL not configured; media fetch deferred'
    );
    return;
  }
  await publishToQueue(env.MEDIA_FETCH_QUEUE_URL, {
    type: 'MediaFetchJob',
    messageId,
    whatsappMediaId: event.mediaId,
    mimeType: event.mimeType,
    vendorId: vendor.vendorId,
    phoneNumberId: vendor.phoneNumberId,
    customerPhone: event.from,
    messageType: event.messageType,
    whatsappMessageId: event.whatsappMessageId
  });
}

async function enqueueForAI(
  vendor: VendorContext,
  event: MessageCreatedEvent,
  persisted: PersistedMessage
): Promise<void> {
  if (!AI_QUEUE_TYPES.includes(event.messageType)) return;
  const content = (event.text ?? '').trim();
  if (!content) return;
  await publishToQueue(getTextQueueUrl(), {
    type: 'TextMessage',
    messageId: persisted.id,
    conversationId: persisted.conversationId,
    customerId: persisted.customerId,
    vendorId: vendor.vendorId,
    customerPhone: event.from,
    content,
    phoneNumberId: vendor.phoneNumberId,
    whatsappMessageId: event.whatsappMessageId,
    sourceMessageType: event.messageType
  });
  logWhatsAppOperation('ai_enqueued', vendor.phoneNumberId, event.from, {
    vendorId: vendor.vendorId,
    messageType: event.messageType
  });
}

async function applyReactionToMessage(
  parentMessageId: string,
  parentConversationId: string,
  vendor: VendorContext,
  event: ReactionEvent
): Promise<void> {
  const reactor = await ensureCustomer(event.from);
  const occurredAt = timestampToDate(event.timestamp);

  if (event.kind === 'message_reaction_removed' || !event.emoji) {
    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_reactorId: { messageId: parentMessageId, reactorId: reactor.id } }
    });
    if (existing && existing.active) {
      await prisma.messageReaction.update({
        where: { id: existing.id },
        data: { active: false }
      });
    }
    await prisma.messageReactionHistory.create({
      data: {
        messageId: parentMessageId,
        reactorId: reactor.id,
        emoji: existing?.emoji ?? null,
        action: 'removed',
        occurredAt
      }
    });
    logWhatsAppOperation('reaction_removed', vendor.phoneNumberId, event.from, {
      vendorId: vendor.vendorId,
      messageId: parentMessageId
    });
    return;
  }

  const previous = await prisma.messageReaction.findUnique({
    where: { messageId_reactorId: { messageId: parentMessageId, reactorId: reactor.id } }
  });

  await prisma.messageReaction.upsert({
    where: { messageId_reactorId: { messageId: parentMessageId, reactorId: reactor.id } },
    create: {
      messageId: parentMessageId,
      reactorId: reactor.id,
      emoji: event.emoji,
      active: true
    },
    update: {
      emoji: event.emoji,
      active: true
    }
  });

  const action: 'added' | 'changed' = previous && previous.active ? 'changed' : 'added';
  await prisma.messageReactionHistory.create({
    data: {
      messageId: parentMessageId,
      reactorId: reactor.id,
      emoji: event.emoji,
      action,
      occurredAt
    }
  });
  logWhatsAppOperation(`reaction_${action}`, vendor.phoneNumberId, event.from, {
    vendorId: vendor.vendorId,
    messageId: parentMessageId,
    emoji: event.emoji
  });
}

async function processReaction(vendor: VendorContext, event: ReactionEvent): Promise<void> {
  const parent = await prisma.message.findUnique({
    where: { whatsappMessageId: event.parentWhatsappMessageId },
    select: { id: true, conversationId: true }
  });
  if (!parent) {
    await bufferOrphan(event.parentWhatsappMessageId, event);
    return;
  }
  await applyReactionToMessage(parent.id, parent.conversationId, vendor, event);
}

async function applyStatusToMessage(
  messageId: string,
  currentStatus: string | null | undefined,
  event: StatusEvent
): Promise<void> {
  const occurredAt = timestampToDate(event.timestamp);
  try {
    await prisma.messageStatusEvent.create({
      data: {
        messageId,
        status: event.status,
        occurredAt,
        rawPayload: event.raw ? (event.raw as Prisma.InputJsonValue) : Prisma.JsonNull
      }
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
      throw err;
    }
    // duplicate event; ignore
  }

  if (shouldUpgradeStatus(currentStatus, event.status)) {
    const data: Prisma.MessageUpdateInput = { status: event.status };
    if (event.status === 'failed' && event.errorMessage) {
      data.failureReason = event.errorMessage;
    }
    await prisma.message.update({ where: { id: messageId }, data });
  }
}

async function processStatus(vendor: VendorContext, event: StatusEvent): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { whatsappMessageId: event.whatsappMessageId },
    select: { id: true, status: true }
  });
  if (!message) {
    await bufferOrphan(event.whatsappMessageId, event);
    return;
  }
  await applyStatusToMessage(message.id, message.status, event);
}

async function replayOrphans(
  vendor: VendorContext,
  parentWhatsappMessageId: string,
  parent: { id: string; conversationId: string }
): Promise<void> {
  const events = await drainOrphanBuffer(parentWhatsappMessageId);
  if (!events.length) return;
  for (const ev of events) {
    try {
      if (ev.kind === 'message_reaction_added' || ev.kind === 'message_reaction_removed') {
        await applyReactionToMessage(parent.id, parent.conversationId, vendor, ev);
      } else if (ev.kind === 'message_status_updated') {
        const current = await prisma.message.findUnique({
          where: { id: parent.id },
          select: { status: true }
        });
        await applyStatusToMessage(parent.id, current?.status, ev);
      }
    } catch (err) {
      logger.warn(
        { err, kind: ev.kind, parentWhatsappMessageId },
        'Orphan replay failed for event'
      );
    }
  }
}

export async function processMessageCreated(
  vendor: VendorContext,
  event: MessageCreatedEvent,
  stepLogger: StepLogger
): Promise<void> {
  stepLogger.step('Persisting inbound message', {
    messageType: event.messageType,
    whatsappMessageId: event.whatsappMessageId
  });
  const persisted = await persistInboundMessage(vendor, event);

  if (persisted.alreadyExisted) {
    stepLogger.step('Message already persisted (race), skipping side effects', {
      messageId: persisted.id
    });
    return;
  }

  if (MEDIA_TYPES.includes(event.messageType)) {
    const created = await ensureMediaPlaceholder(persisted.id, event);
    if (created) {
      stepLogger.step('Enqueuing media fetch job', { mediaId: event.mediaId });
      await enqueueMediaFetch(persisted.id, event, vendor);
    }
  }

  await replayOrphans(vendor, event.whatsappMessageId, {
    id: persisted.id,
    conversationId: persisted.conversationId
  });

  if (AI_QUEUE_TYPES.includes(event.messageType)) {
    await enqueueForAI(vendor, event, persisted);
  } else {
    logWhatsAppOperation('non_ai_persisted', vendor.phoneNumberId, event.from, {
      vendorId: vendor.vendorId,
      messageType: event.messageType
    });
  }
}

export async function processWebhookEvent(
  vendor: VendorContext,
  event: ParsedWAEvent,
  parentOperationId: string
): Promise<void> {
  const stepLogger = new StepLogger(
    createOperationId('webhook_event_dispatch'),
    `Webhook ${event.kind}`,
    {
      parentOperationId,
      vendorId: vendor.vendorId,
      phoneNumberId: vendor.phoneNumberId
    }
  );
  try {
    if (event.kind === 'message_created') {
      await processMessageCreated(vendor, event, stepLogger);
    } else if (
      event.kind === 'message_reaction_added' ||
      event.kind === 'message_reaction_removed'
    ) {
      await processReaction(vendor, event);
    } else if (event.kind === 'message_status_updated') {
      await processStatus(vendor, event);
    }
    stepLogger.success({ kind: event.kind });
  } catch (err) {
    stepLogger.error(err as Error, { kind: event.kind });
    logger.error({ err, kind: event.kind }, 'Webhook event processing failed');
  }
}

function rankEvent(event: ParsedWAEvent): number {
  if (event.kind === 'message_created') return 0;
  if (event.kind === 'message_reaction_added' || event.kind === 'message_reaction_removed') {
    return 1;
  }
  return 2;
}

function dedupeKeyFor(event: ParsedWAEvent): string | null {
  if (event.kind === 'message_status_updated') {
    return `${event.whatsappMessageId}:${event.status}`;
  }
  return event.whatsappMessageId ?? null;
}

function eventActor(event: ParsedWAEvent): string {
  if (event.kind === 'message_status_updated') return event.recipientId;
  return event.from;
}

/**
 * Orders a batch of events for one vendor (message_created before reactions/status
 * so same-payload children resolve without the orphan-buffer path), skips duplicate
 * deliveries, and dispatches each event via processWebhookEvent. Shared by the Express
 * webhook route and the API Gateway Lambda so both entry points see identical behavior.
 */
export async function processWebhookEventBatch(
  vendor: VendorContext,
  events: ParsedWAEvent[],
  parentOperationId: string,
  stepLogger: StepLogger
): Promise<void> {
  const ordered = [...events].sort((a, b) => rankEvent(a) - rankEvent(b));

  for (const event of ordered) {
    const dedupeKey = dedupeKeyFor(event);
    if (dedupeKey && DuplicateMessageService.isDuplicate(dedupeKey)) {
      emitMetric('webhook.duplicate_skipped', 1, {
        dimensions: { vendorId: vendor.vendorId, kind: event.kind }
      });
      stepLogger.warn('Skipping duplicate event', { dedupeKey, kind: event.kind });
      logWhatsAppOperation('duplicate_skipped', vendor.phoneNumberId, eventActor(event), {
        vendorId: vendor.vendorId,
        kind: event.kind,
        dedupeKey
      });
      continue;
    }
    emitMetric('webhook.event_processed', 1, {
      dimensions: { vendorId: vendor.vendorId, kind: event.kind }
    });
    await processWebhookEvent(vendor, event, parentOperationId);
  }
}
