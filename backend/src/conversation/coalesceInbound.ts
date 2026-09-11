import { prisma } from '../db/prisma.js';
import { drainBurstStash } from './burstMerge.js';

export interface CoalescedInbound {
  mergedContent: string;
  whatsappMessageIds: string[];
  primaryWhatsappMessageId: string;
}

const TERMINAL_PROCESSING_STATUSES = ['applied', 'queued'] as const;

/**
 * Collect every customer inbound for this conversation turn that has not yet
 * received a reply — the trigger message, siblings stashed during lock
 * contention, and any other customer rows the webhook already persisted.
 *
 * Scoped to messages after the last assistant reply so we do not re-ingest
 * history from prior turns.
 */
export async function collectCoalescedInbound(
  conversationId: string,
  primaryWhatsappMessageId: string,
  primaryContent: string
): Promise<CoalescedInbound> {
  const stashed = await drainBurstStash(conversationId);

  const lastAssistant = await prisma.message.findFirst({
    where: { conversationId, senderType: 'assistant' },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true }
  });
  const since = lastAssistant?.timestamp ?? new Date(0);

  const processedRows = await prisma.messageProcessing.findMany({
    where: {
      conversationId,
      status: { in: [...TERMINAL_PROCESSING_STATUSES] }
    },
    select: { whatsappMessageId: true }
  });
  const processedSet = new Set(processedRows.map((row) => row.whatsappMessageId));

  const customerMsgs = await prisma.message.findMany({
    where: {
      conversationId,
      senderType: 'customer',
      timestamp: { gt: since },
      whatsappMessageId: { not: null }
    },
    orderBy: { timestamp: 'asc' },
    select: { content: true, whatsappMessageId: true }
  });

  const ordered: Array<{ whatsappMessageId: string; content: string }> = [];

  for (const msg of customerMsgs) {
    if (!msg.whatsappMessageId || processedSet.has(msg.whatsappMessageId)) continue;
    ordered.push({ whatsappMessageId: msg.whatsappMessageId, content: msg.content });
  }

  const knownIds = new Set(ordered.map((entry) => entry.whatsappMessageId));

  if (!knownIds.has(primaryWhatsappMessageId)) {
    ordered.push({ whatsappMessageId: primaryWhatsappMessageId, content: primaryContent });
    knownIds.add(primaryWhatsappMessageId);
  }

  for (const entry of stashed) {
    if (knownIds.has(entry.whatsappMessageId)) continue;
    ordered.push(entry);
    knownIds.add(entry.whatsappMessageId);
  }

  ordered.sort((a, b) => {
    const ai = customerMsgs.findIndex((m) => m.whatsappMessageId === a.whatsappMessageId);
    const bi = customerMsgs.findIndex((m) => m.whatsappMessageId === b.whatsappMessageId);
    const aIdx = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bIdx = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    return aIdx - bIdx;
  });

  const whatsappMessageIds = ordered.map((entry) => entry.whatsappMessageId);
  const mergedContent = ordered.map((entry) => entry.content).join('\n');

  return {
    mergedContent,
    whatsappMessageIds,
    primaryWhatsappMessageId
  };
}
