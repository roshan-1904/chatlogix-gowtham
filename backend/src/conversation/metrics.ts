import { emitMetric, emitDuration } from '../observability/metrics.js';
import { logger } from '../logger.js';

export interface StageContext {
  traceId: string;
  vendorId?: string;
  conversationId?: string;
}

/**
 * One of the §23-required timestamp checkpoints (SQS receive/handler start,
 * prefetch done, LLM-1 done, cart apply done, LLM-2 skipped|done, response
 * queue published). `vendorId`/`conversationId` are optional because the
 * very first checkpoint genuinely happens before identity resolution in the
 * common case (only `traceId`/whatsappMessageId is known that early) — §23
 * says every line "includes" these fields, not that every line must have
 * them populated before they exist.
 */
export function logStage(stage: string, ctx: StageContext, extra: Record<string, unknown> = {}): void {
  logger.info({ traceId: ctx.traceId, vendorId: ctx.vendorId, conversationId: ctx.conversationId, ...extra }, `stage: ${stage}`);
}

/**
 * Thin wrapper around observability/metrics.ts's emitDuration/emitMetric —
 * that file already provides everything §23 needs (structured Pino line
 * always, best-effort CloudWatch forwarding when enabled, never throws).
 * Every conversation-v1 metric shares its existing namespace (default
 * ChatLogix/ConversationParity) rather than getting one of its own — tagged
 * with `processor:'conversation-v1'` to stay distinguishable within it, the
 * simpler of the two options this plan's Step 11 section already decided
 * between (a namespace override vs. a shared-namespace dimension).
 */
export function logLatency(name: string, ms: number, dimensions: Record<string, string | number | undefined | null> = {}): void {
  emitDuration(name, ms, { dimensions: { processor: 'conversation-v1', ...dimensions } });
}

export function logCount(name: string, dimensions: Record<string, string | number | undefined | null> = {}, value = 1): void {
  emitMetric(name, value, { dimensions: { processor: 'conversation-v1', ...dimensions } });
}
