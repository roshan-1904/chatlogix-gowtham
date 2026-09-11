/**
 * Send-schedule construction for the load-test generator
 * (docs/LOAD_TESTING.md §3 "Pacing").
 *
 * Split out of generate.ts so the ordering invariants can be unit tested —
 * if turn N+1 of a conversation ever preceded turn N, the run would feed the
 * pipeline an incoherent dialogue and every cost and quality number from it
 * would be meaningless.
 */
import type { ManifestConversation } from './config.js';

export interface ScheduledMessage {
  /** Milliseconds after run start. */
  atMs: number;
  conversation: ManifestConversation;
  turnIndex: number;
  text: string;
  whatsappMessageId: string;
}

/**
 * Conversation start times are spread uniformly, then every event is re-paced
 * onto an exact 1/rate grid. The sort is stable and re-pacing preserves order,
 * so turn N+1 always follows turn N and the inter-turn gap stays proportional
 * to what was planned.
 *
 * The gap is sized to the run duration — roughly 90-120s on a full run at
 * 1.5 msg/s, versus the ~17s a 120s run would have used. That is deliberately
 * far clear of the 400ms burst-merge window (burstMerge.ts:49) and the 60s
 * conversation lock TTL (conversation/lock.ts:5), so the run measures
 * throughput rather than lock contention.
 */
export function buildSchedule(
  conversations: ManifestConversation[],
  rate: number,
  runId: string
): ScheduledMessage[] {
  if (conversations.length === 0) return [];
  if (rate <= 0) throw new Error('rate must be greater than zero');

  const turnsPer = conversations[0]!.turns.length;
  const totalMessages = conversations.length * turnsPer;
  const durationSec = totalMessages / rate;

  // Three quarters of the window goes to inter-turn spacing, the rest to
  // staggering conversation starts.
  const gapSec = Math.max(10, (durationSec * 0.75) / Math.max(1, turnsPer - 1));
  const startWindowSec = Math.max(1, durationSec - gapSec * (turnsPer - 1));

  const planned: Array<{ plannedSec: number; conversation: ManifestConversation; turnIndex: number }> = [];
  conversations.forEach((conversation, i) => {
    const startSec = (i / conversations.length) * startWindowSec;
    conversation.turns.forEach((_, turnIndex) => {
      planned.push({ plannedSec: startSec + turnIndex * gapSec, conversation, turnIndex });
    });
  });

  planned.sort((a, b) => a.plannedSec - b.plannedSec);

  return planned.map((item, i) => ({
    atMs: Math.round((i / rate) * 1000),
    conversation: item.conversation,
    turnIndex: item.turnIndex,
    text: item.conversation.turns[item.turnIndex]!,
    // Unique per message. A reused id gets silently dropped by
    // DuplicateMessageService, the Message.whatsappMessageId unique
    // constraint, or the MessageProcessing idempotency gate
    // (pipeline.ts:252) — the run would measure the dedup layer.
    whatsappMessageId: `wamid.LOADTEST.${runId}.${String(i).padStart(5, '0')}`
  }));
}
