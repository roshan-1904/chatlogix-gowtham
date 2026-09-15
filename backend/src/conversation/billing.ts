import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { emitMetric } from '../observability/metrics.js';
import { creditsForKind, type MessageKind } from '../services/billingService.js';

export type DebitOutcome = 'debited' | 'already_debited';

/**
 * Idempotent debit, keyed on whatsappMessageId (Q8-A, spec §19.1). Copies
 * billingService.deductCredits's transaction body rather than calling it —
 * that function has no idempotency key (CreditUsage had no unique
 * constraint until this rewrite added `externalId`), and this pipeline
 * debits *after* the response is enqueued, the opposite of today's
 * before-AI-runs ordering. Intentional short-term duplication, not an
 * oversight — unifying the two would mean changing billingService.ts's
 * behavior for the old pipeline too, which this rewrite doesn't touch.
 */
export async function debitAfterEnqueue(vendorId: string, conversationId: string, whatsappMessageId: string): Promise<DebitOutcome> {
  const credits = creditsForKind('text');

  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { walletBalance: true } });
      if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);

      const before = vendor.walletBalance;
      const after = before - credits;

      await tx.vendor.update({ where: { id: vendorId }, data: { walletBalance: after } });
      await tx.walletTransaction.create({
        data: { vendorId, transactionType: 'deduction', amount: credits, balanceBefore: before, balanceAfter: after }
      });
      await tx.creditUsage.create({
        data: { vendorId, conversationId, creditsConsumed: credits, conversationType: 'text', externalId: whatsappMessageId }
      });
    });

    await markDebited(whatsappMessageId);
    return 'debited';
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.info({ vendorId, conversationId, whatsappMessageId }, 'Debit already applied (idempotent no-op)');
      // Idempotent by design: if a prior attempt's CreditUsage write landed
      // but its own markDebited call didn't (e.g. process died in between),
      // this call still closes out debitedAt so the sweep stops re-finding it.
      await markDebited(whatsappMessageId);
      return 'already_debited';
    }
    throw error;
  }
}

const OUTBOUND_DEBIT_EXTERNAL_ID_PREFIX = 'outbound-msg:';

export function outboundMessageDebitExternalId(messageId: string): string {
  return `${OUTBOUND_DEBIT_EXTERNAL_ID_PREFIX}${messageId}`;
}

/**
 * Idempotent debit for a successfully sent outbound image/video Message row
 * (product media v1). Keyed on Message.id via CreditUsage.externalId.
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

  const credits = creditsForKind(kind);
  const externalId = outboundMessageDebitExternalId(messageId);

  try {
    await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { walletBalance: true } });
      if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);

      const before = vendor.walletBalance;
      const after = before - credits;

      await tx.vendor.update({ where: { id: vendorId }, data: { walletBalance: after } });
      await tx.walletTransaction.create({
        data: {
          vendorId,
          transactionType: 'deduction',
          amount: credits,
          balanceBefore: before,
          balanceAfter: after
        }
      });
      await tx.creditUsage.create({
        data: {
          vendorId,
          conversationId: message.conversationId,
          creditsConsumed: credits,
          conversationType: kind,
          externalId
        }
      });
    });

    return 'debited';
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.info({ messageId, externalId, kind }, 'Outbound media debit already applied (idempotent no-op)');
      return 'already_debited';
    }
    throw error;
  }
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
      await debitAfterEnqueue(row.vendorId, row.conversationId, row.whatsappMessageId);
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
