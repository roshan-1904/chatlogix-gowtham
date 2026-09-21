import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { emitMetric } from '../observability/metrics.js';
import type { MessageKind } from '../services/billingService.js';
import { chargeVendor, turnEstimateCost } from '../services/pricing/pricingService.js';
import { ensurePlatformSettings, getPlatformSettings } from '../services/platformSettingsService.js';
import { paiseToMilli } from '../utils/money.js';
import { logTurnAudit, turnAuditServiceFromRuntime } from '../observability/turnAuditLog.js';

export type DebitOutcome = 'debited' | 'already_debited';

/** What this turn actually cost, in unrounded millirupees before markup. */
export interface TurnCostInputs {
  /** LLM-1 plus LLM-2, from their reported token usage. */
  aiCostMilli: number;
  /**
   * Inbound transcription already performed by the media pipeline and carried
   * on the SQS payload, so it is billed once, inside this turn's charge,
   * instead of as a second debit the vendor sees separately.
   */
  upstreamCostMilli: number;
}

export interface TurnDebitInput {
  vendorId: string;
  conversationId: string;
  whatsappMessageId: string;
  /**
   * Omitted only by the reconciliation sweep, which has no record of the
   * original token usage — see `reconcileStuckDebits`.
   */
  costs?: TurnCostInputs;
  turnAuditEnabled?: boolean;
}

/**
 * Idempotent per-turn debit, keyed on whatsappMessageId (Q8-A, spec §19.1),
 * running *after* the response is enqueued. Delegates the arithmetic and the
 * ledger writes to `pricingService.chargeVendor`, which is the only place in
 * the codebase that moves wallet money.
 */
export async function debitAfterEnqueue(input: TurnDebitInput): Promise<DebitOutcome> {
  const { vendorId, conversationId, whatsappMessageId, costs, turnAuditEnabled = false } = input;

  await ensurePlatformSettings();
  const cost = costs
    ? {
        aiCostMilli: costs.aiCostMilli + costs.upstreamCostMilli,
        platformFeeMilli: paiseToMilli(getPlatformSettings().platformFeePerTurnPaise)
      }
    : turnEstimateCost();

  if (!costs) {
    logger.warn(
      { vendorId, conversationId, whatsappMessageId },
      'Turn cost unavailable (reconciliation retry) — charging the worst-case turn estimate'
    );
  }

  const result = await chargeVendor({
    vendorId,
    source: 'conversation_turn',
    cost,
    conversationId,
    conversationType: 'text',
    idempotencyKey: whatsappMessageId,
    metadata: {
      traceId: whatsappMessageId,
      ...(costs ? { upstreamCostMilli: costs.upstreamCostMilli } : { estimated: true })
    }
  });

  // Closes out debitedAt even on the idempotent path: a prior attempt's
  // CreditUsage write may have landed while its own markDebited call didn't
  // (e.g. the process died in between), and the sweep must stop re-finding it.
  await markDebited(whatsappMessageId);

  logTurnAudit(turnAuditEnabled, {
    traceId: whatsappMessageId,
    vendorId,
    conversationId,
    service: turnAuditServiceFromRuntime()
  }, 'debit', {
    outcome: result.outcome,
    idempotencyKey: whatsappMessageId,
    cost,
    costs
  });

  return result.outcome === 'already_charged' ? 'already_debited' : 'debited';
}

const OUTBOUND_DEBIT_EXTERNAL_ID_PREFIX = 'outbound-msg:';

export function outboundMessageDebitExternalId(messageId: string): string {
  return `${OUTBOUND_DEBIT_EXTERNAL_ID_PREFIX}${messageId}`;
}

/**
 * Idempotent debit for a successfully sent outbound image/video Message row
 * (product media v1). Keyed on Message.id via CreditUsage.externalId.
 *
 * There is no AI cost on this path, so the only chargeable component is the
 * outbound-media platform fee from PlatformSettings. That is 0 today, which
 * means sending product media is free until the WhatsApp per-message rate
 * card lands (P2h) — a deliberate drop from the old flat 2/10-credit charge,
 * which was revenue unconnected to any real cost.
 */
export async function debitOutboundMessage(messageId: string): Promise<DebitOutcome> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      conversationId: true,
      type: true,
      conversation: { select: { vendorId: true } }
    }
  });
  if (!message) {
    throw new Error(`Message not found: ${messageId}`);
  }
  const vendorId = message.conversation.vendorId;
  const kind = message.type as MessageKind;
  if (kind !== 'image' && kind !== 'video') {
    throw new Error(`debitOutboundMessage expects image or video, got ${message.type}`);
  }

  await ensurePlatformSettings();
  const result = await chargeVendor({
    vendorId,
    source: 'outbound_media',
    cost: { platformFeeMilli: paiseToMilli(getPlatformSettings().platformFeeOutboundMediaPaise) },
    conversationId: message.conversationId,
    conversationType: kind,
    idempotencyKey: outboundMessageDebitExternalId(messageId),
    metadata: { messageId, kind }
  });

  return result.outcome === 'already_charged' ? 'already_debited' : 'debited';
}

async function markDebited(whatsappMessageId: string): Promise<void> {
  // `updateMany` (not `update`) because the row may not exist yet in tests
  // or in edge cases where persist.ts's upsert hasn't landed — a no-op match
  // is fine, this is a best-effort status marker, not the source of truth
  // (CreditUsage.externalId's uniqueness is what actually prevents double
  // charging).
  await prisma.messageProcessing.updateMany({
    where: { whatsappMessageId },
    data: { status: 'queued', debitedAt: new Date() }
  });
}

export interface ReconcileResult {
  retried: number;
  succeeded: number;
  failed: number;
}

/**
 * §19.1 reconciliation sweep: retries the debit for MessageProcessing rows
 * that reached 'queued' but never successfully debited, stuck long enough
 * that the inline attempt clearly already failed. Never touches
 * RESPONSE_QUEUE — the customer already has their reply, so re-running the
 * pipeline for these rows would risk a duplicate WhatsApp send.
 *
 * `debitedAt IS NULL` is the field that actually distinguishes "still owed"
 * from "already paid" — `status='queued'` alone can't, since a successfully
 * debited row has no distinct terminal status in the MessageProcessingStatus
 * enum and stays 'queued' forever. Without the `debitedAt` filter this query
 * would keep matching every message ever successfully processed, growing
 * unboundedly instead of finding only the rare stuck ones.
 *
 * The original turn's token usage is long gone by the time the sweep runs, so
 * these retries charge the worst-case turn estimate instead. That over-bills
 * a cheap turn slightly; the alternative — never charging for it — is worse.
 */
export async function reconcileStuckDebits(olderThanMs = 2 * 60_000): Promise<ReconcileResult> {
  const stuck = await prisma.messageProcessing.findMany({
    where: { status: 'queued', debitedAt: null, queuedAt: { lt: new Date(Date.now() - olderThanMs) } },
    select: { vendorId: true, conversationId: true, whatsappMessageId: true }
  });

  let succeeded = 0;
  let failed = 0;

  for (const row of stuck) {
    try {
      await debitAfterEnqueue({
        vendorId: row.vendorId,
        conversationId: row.conversationId,
        whatsappMessageId: row.whatsappMessageId
      });
      succeeded++;
    } catch (error) {
      failed++;
      logger.error({ err: error, ...row }, 'Reconciliation sweep: debit retry failed');
      emitMetric('DebitFail', 1, { dimensions: { processor: 'conversation-v1', context: 'sweep' } });
    }
  }

  logger.info({ retried: stuck.length, succeeded, failed }, 'Debit reconciliation sweep complete');
  return { retried: stuck.length, succeeded, failed };
}
