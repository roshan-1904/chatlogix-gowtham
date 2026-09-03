import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { canProcessMessage } from '../services/billingService.js';
import { sendTypingIndicator } from '../services/whatsappClient.js';
import { WhatsAppTemplateService } from '../services/whatsappTemplateService.js';
import { persistTurn } from './persist.js';
import { debitAfterEnqueue } from './billing.js';
import { resolveIdentity } from './identity.js';
import { acquireLock, releaseLock, LockContentionError, LockUnavailableError } from './lock.js';
import { upsertInboundMessage } from './idempotency.js';
import { stashForBurstMerge, mergeDebounced } from './burstMerge.js';
import { prefetchHotSet } from './prefetch.js';
import { runLlm1 } from './llm/llm1.js';
import { apply } from './cart/engine.js';
import { runLlm2, selectFinalReply } from './llm/llm2.js';
import { triggerHandoff } from './handoff.js';
import { notifyVendorOfPostSalesEvent } from './postSalesAlert.js';
import { WALLET_EMPTY_TEMPLATE } from './templates.js';
import { logStage, logLatency, logCount } from './metrics.js';
import type { CartOp, CartSnapshot, PostSalesOutcome } from './types.js';

/** Deterministic customer-facing copy for a refund/cancel outcome — never LLM-authored (same reasoning as the handoff short-circuit: money/eligibility facts must not go through a free-text model). */
function renderPostSalesReply(outcome: PostSalesOutcome): string {
  switch (outcome.type) {
    case 'refund_approved':
      return `Your refund for order ${outcome.orderNumber} has been approved. ${outcome.detail}`;
    case 'refund_denied':
      return `I'm sorry, order ${outcome.orderNumber} isn't eligible for an automatic refund — ${outcome.detail} I've let the team know to take a look.`;
    case 'order_cancelled':
      return `Order ${outcome.orderNumber} has been cancelled as requested.`;
    case 'not_cancellable_at_this_stage':
      return `I can't cancel order ${outcome.orderNumber} automatically — ${outcome.detail} I've flagged this for the team to review right away.`;
  }
}

export interface FinalizeTurnInput {
  vendorId: string;
  conversationId: string;
  customerId: string;
  customerPhone: string;
  phoneNumberId: string;
  whatsappMessageId: string;
  snapshot: CartSnapshot;
  finalText: string;
  language: string;
  intent: string;
  tokenMeta: { model: string; promptTokens: number; completionTokens: number };
}

export interface FinalizeTurnResult {
  publishedAt: number; // Date.now() right after publishToQueue resolves — the §8 SLA clock's actual stop point
}

/**
 * Persist -> response queue -> debit (spec §7 steps 8-10, §19) — the "back
 * half" of the pipeline, called by processMessage() below once the front
 * half (guards, burst merge, lock, LLM-1, CartEngine.apply, LLM-2) has
 * produced a final reply. Kept as its own exported function (rather than
 * inlined into processMessage) because Step 6's tests already exercise it in
 * isolation and there's no reason to duplicate that coverage.
 *
 * Returns `publishedAt` rather than `void` (a Step 11 addition) so
 * processMessage can compute `LatencyMs` against the actual §8 SLA clock —
 * start-to-publish — without the inline debit attempt's own duration
 * (a real Postgres transaction) padding the number. The debit still runs
 * and is still awaited before this function returns; only the *timestamp
 * returned* is captured earlier, right after the publish.
 */
export async function finalizeTurn(input: FinalizeTurnInput): Promise<FinalizeTurnResult> {
  const {
    vendorId,
    conversationId,
    customerId,
    customerPhone,
    phoneNumberId,
    whatsappMessageId,
    snapshot,
    finalText,
    language,
    intent,
    tokenMeta
  } = input;

  const { assistantMessageId } = await persistTurn({
    vendorId,
    conversationId,
    customerId,
    snapshot,
    finalText,
    language,
    intent,
    tokenMeta,
    whatsappMessageId
  });

  // Corrected from spec §19's example JSON, which omits both fields:
  // - phoneNumberId: without it, chatlogix-response-processor falls back to
  //   an env-default WABA number, wrong in a multi-number setup. Already on
  //   the inbound SQS TextMessage payload (§10), threaded through here.
  // - messageId: chatlogix-response-processor only marks delivery status on
  //   the assistant Message row when this is present.
  await publishToQueue(env.RESPONSE_QUEUE_URL, {
    type: 'text',
    to: customerPhone,
    text: finalText,
    conversationId,
    vendorId,
    customerId,
    phoneNumberId,
    messageId: assistantMessageId,
    metadata: { intent, processor: 'conversation-v1', traceId: whatsappMessageId }
  });
  const publishedAt = Date.now(); // §19 step 9: SLA clock stops here
  logStage('response_queue_published', { traceId: whatsappMessageId, vendorId, conversationId });

  // Marked 'queued' regardless of what happens to the debit below — the
  // §19.1 sweep's query relies on this being set the moment the customer's
  // reply is actually on its way, not on whether the debit succeeds.
  await prisma.messageProcessing.updateMany({
    where: { whatsappMessageId },
    data: { status: 'queued', queuedAt: new Date() }
  });

  try {
    await debitAfterEnqueue(vendorId, conversationId, whatsappMessageId);
  } catch (error) {
    // Must NOT rethrow: the customer already has their reply, so the SQS
    // message must not retry (that would re-run LLM-1/CartEngine). The
    // §19.1 sweep recovers this — the row is already 'queued' from above.
    logger.error({ err: error, vendorId, conversationId, whatsappMessageId }, 'Inline debit failed, deferring to reconciliation sweep');
    logCount('DebitFail', { vendorId, context: 'inline' });
  }

  return { publishedAt };
}

export interface ProcessMessageInput {
  vendorId?: string | null;
  phoneNumberId: string;
  customerPhone: string;
  content: string;
  whatsappMessageId: string;
}

const whatsappTemplateService = new WhatsAppTemplateService(); // no exported singleton on this service; matches every other call site's `new WhatsAppTemplateService()`

function classifyError(error: unknown): string {
  if (error instanceof LockContentionError) return 'lock_contention';
  if (error instanceof LockUnavailableError) return 'lock_unavailable';
  return 'unknown';
}

/**
 * The full pipeline (spec §7 steps 0-11), tying together every module built
 * in Steps 3-9, instrumented per §23 (Step 11): the 6 required timestamp
 * checkpoints, plus ProcessorSuccess/ProcessorError{class}/LatencyMs/
 * Llm1Ms/Llm2Ms/Llm2Skipped/CartApplyFail/LockContention/LockUnavailable/
 * DebitFail (DebitFail lives in finalizeTurn/billing.ts's sweep;
 * ProductMatchMiss{language} lives in cart/candidateSearch.ts, Step 4).
 * `DLQDepth` is deliberately not emitted here — see this plan's Step 11
 * status note for why that one isn't a per-invocation code concern.
 */
export async function processMessage(input: ProcessMessageInput): Promise<void> {
  const traceId = input.whatsappMessageId;
  const startTime = Date.now();
  logStage('handler_start', { traceId }); // §23: "SQS receive / handler start" — the SQS-receive-to-here gap is negligible (a JSON.parse) and not separately instrumented

  // Step 1: resolve vendor -> upsert customer -> find-or-create open conversation.
  const { vendorId, customerId, conversationId } = await resolveIdentity({
    vendorId: input.vendorId,
    phoneNumberId: input.phoneNumberId,
    customerPhone: input.customerPhone
  });

  // Step 0 (lock): fail closed (I3, I4) -- a Redis outage or lock contention
  // both throw, so the caller's SQS message retries rather than proceeding
  // without a held lock. On contention specifically (not on Redis being
  // fully down), stash this message for the lock-holder to pick up via
  // mergeDebounced (spec §12 rule 2/4) before giving up.
  let lock;
  try {
    lock = await acquireLock(conversationId);
  } catch (error) {
    if (error instanceof LockContentionError) {
      logCount('LockContention', { vendorId });
      await stashForBurstMerge(conversationId, input.content);
    } else if (error instanceof LockUnavailableError) {
      logCount('LockUnavailable', { vendorId });
    }
    throw error;
  }

  try {
    // Idempotency (I2): a redelivery of an already-processed whatsappMessageId
    // is a success exit -- the reply was already sent, do not reprocess.
    // Gated on MessageProcessing (written only once persist.ts has actually
    // generated a reply for this whatsappMessageId), not on the customer
    // Message row existing -- that row is now also created upfront by the
    // webhook handler before this pipeline ever sees the job, so its mere
    // existence no longer means "already handled by this pipeline".
    const priorProcessing = await prisma.messageProcessing.findUnique({
      where: { whatsappMessageId: input.whatsappMessageId },
      select: { id: true }
    });
    if (priorProcessing) {
      logger.info({ traceId, vendorId, conversationId }, 'Duplicate whatsappMessageId — already processed, ACK without reprocessing');
      return;
    }
    // Still ensures the customer Message row exists -- a no-op when the
    // webhook already created it, the only path (today) that creates it
    // when it hasn't (the legacy Express route without the parity flag).
    await upsertInboundMessage({ vendorId, conversationId, customerId, content: input.content, whatsappMessageId: input.whatsappMessageId });

    // Guards (§7 step 3), before any paid LLM call.
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { aiPaused: true } });
    if (conversation?.aiPaused) {
      logger.info({ traceId, vendorId, conversationId }, 'aiPaused — inbound stored, no LLM, no debit, no reply (vendor replies via dashboard)');
      return;
    }

    const creditCheck = await canProcessMessage(vendorId, 'text');
    if (!creditCheck.allowed) {
      await publishToQueue(env.RESPONSE_QUEUE_URL, {
        type: 'text',
        to: input.customerPhone,
        text: WALLET_EMPTY_TEMPLATE,
        vendorId,
        customerId,
        conversationId,
        phoneNumberId: input.phoneNumberId,
        metadata: { intent: 'guard_no_credit', processor: 'conversation-v1', traceId }
      });
      logger.info({ traceId, vendorId, conversationId, reason: creditCheck.reason }, 'Credit guard blocked — templated reply sent, no LLM, no debit');
      return;
    }

    // Burst merge (§12 rule 2/3): non-blocking check for a sibling
    // invocation's stashed content; proceeds immediately either way.
    const mergedContent = await mergeDebounced(conversationId, input.content);

    void sendTypingIndicator(input.whatsappMessageId, input.phoneNumberId).catch((error) => {
      logger.warn({ err: error, traceId, vendorId, conversationId }, 'Typing indicator failed');
    });

    // Step 2: prefetch hot set in parallel.
    const hotSet = await prefetchHotSet(vendorId, conversationId, customerId, mergedContent);
    logStage('prefetch_done', { traceId, vendorId, conversationId });

    // Step 4: LLM-1 -- ops + draft reply.
    const llm1StartedAt = Date.now();
    const llm1Result = await runLlm1({ vendorId, hotSet, mergedContent, traceId });
    logLatency('Llm1Ms', Date.now() - llm1StartedAt, { vendorId });
    logStage('llm1_done', { traceId, vendorId, conversationId }, {
      promptTokens: llm1Result.promptTokens,
      completionTokens: llm1Result.completionTokens,
      model: llm1Result.model
    });

    // Step 5: CartEngine.apply -- the model never writes Order.items directly.
    let applyResult;
    try {
      applyResult = await apply({
        vendorId,
        conversationId,
        customerId,
        orderId: hotSet.pendingOrder?.orderId ?? null,
        ops: llm1Result.ops,
        traceId
      });
    } catch (error) {
      logCount('CartApplyFail', { vendorId });
      throw error;
    }
    logStage('cart_apply_done', { traceId, vendorId, conversationId }, { mutated: applyResult.mutated });

    const handoffOp = llm1Result.ops.find((op): op is Extract<CartOp, { type: 'handoff' }> => op.type === 'handoff');
    let finalText: string;

    if (handoffOp) {
      // §20: handoff wins over the normal LLM-2/render path -- the customer
      // gets the "connecting you to the team" copy, not a possibly-unrelated
      // polished reply about cart contents. LLM-2 never runs on this branch.
      const handoffResult = await triggerHandoff({
        conversationId,
        vendorId,
        customerId,
        phoneNumberId: input.phoneNumberId,
        traceId,
        category: handoffOp.category ?? null,
        details: handoffOp.details ?? null,
        orderNumber: handoffOp.orderNumber ?? null
      });
      finalText = handoffResult.customerMessage;
    } else if (applyResult.postSalesOutcome) {
      // A refund/cancel decision CartEngine already made deterministically —
      // render it as-is (never through LLM-2) and, for the two outcomes that
      // need a human's call, alert the vendor with the real order + reason
      // (same helper handoff.ts uses, so both paths produce one consistent
      // vendor-facing message format).
      const outcome = applyResult.postSalesOutcome;
      finalText = renderPostSalesReply(outcome);

      if (outcome.type === 'refund_denied' || outcome.type === 'not_cancellable_at_this_stage') {
        notifyVendorOfPostSalesEvent({
          vendorId,
          phoneNumberId: input.phoneNumberId,
          conversationId,
          traceId,
          orderId: outcome.orderId,
          orderNumber: outcome.orderNumber,
          category: outcome.type === 'refund_denied' ? 'refund_denied' : 'cancel_in_progress',
          detail: outcome.detail,
          aiPaused: false
        }).catch((error) => {
          logger.error({ err: error, vendorId, conversationId, traceId }, 'Post-sales vendor notify failed');
        });
      }
    } else {
      // Step 6: LLM-2, conditionally (runLlm2 checks shouldRunLlm2 internally).
      const llm2StartedAt = Date.now();
      const llm2Result = await runLlm2({
        draftReply: llm1Result.draftReply,
        snapshot: applyResult.snapshot,
        vendorId,
        language: llm1Result.language,
        model: llm1Result.model,
        ops: llm1Result.ops,
        needsVerify: llm1Result.needsVerify,
        confidence: llm1Result.confidence
      });

      if (llm2Result.skipped) {
        logCount('Llm2Skipped', { vendorId });
        logStage('llm2_skipped', { traceId, vendorId, conversationId });
      } else {
        logLatency('Llm2Ms', Date.now() - llm2StartedAt, { vendorId });
        logStage('llm2_done', { traceId, vendorId, conversationId });
      }

      // Step 7: render final text -- LLM-2's copy if it ran and matches the
      // snapshot, the draft reply if LLM-2 was skipped, the deterministic
      // engine renderer if LLM-2's copy disagreed with the cart (§17's
      // correctness backstop for I1).
      const decision = selectFinalReply({ draftReply: llm1Result.draftReply, llm2Result, snapshot: applyResult.snapshot, traceId });
      finalText = decision.finalReply;
    }

    // Steps 8-10: persist -> response queue -> debit.
    const { publishedAt } = await finalizeTurn({
      vendorId,
      conversationId,
      customerId,
      customerPhone: input.customerPhone,
      phoneNumberId: input.phoneNumberId,
      whatsappMessageId: input.whatsappMessageId,
      snapshot: applyResult.snapshot,
      finalText,
      language: llm1Result.language,
      intent: llm1Result.intent,
      tokenMeta: { model: llm1Result.model, promptTokens: llm1Result.promptTokens, completionTokens: llm1Result.completionTokens }
    });
    logLatency('LatencyMs', publishedAt - startTime, { vendorId }); // §8 SLA clock: start (handler_start) -> publish, excluding the debit attempt's own duration

    // Step 11 (async, fire-and-forget): vendor notify on a newly-confirmed
    // order. Reuses whatsappTemplateService.notifyVendorNewOrder exactly as
    // documented there ("fire-and-forget safe — caller should not await").
    // Handoff's own vendor notify already happened inside triggerHandoff
    // above, so this only fires for a successful `confirm`.
    const confirmOp = llm1Result.ops.find((op) => op.type === 'confirm');
    const confirmSucceeded = confirmOp && !applyResult.rejectedOps.some((r) => r.op === confirmOp);
    if (confirmSucceeded && applyResult.snapshot.orderId) {
      const orderId = applyResult.snapshot.orderId;
      whatsappTemplateService.notifyVendorNewOrder(vendorId, orderId).catch((error) => {
        logger.error({ err: error, vendorId, orderId, traceId }, 'Vendor new-order notify failed');
      });
    }

    logCount('ProcessorSuccess', { vendorId });
  } catch (error) {
    logCount('ProcessorError', { vendorId, class: classifyError(error) });
    throw error;
  } finally {
    // Always released, success or failure -- the lock's own TTL is a backstop,
    // this is what lets the *next* message for this conversation proceed
    // immediately rather than waiting out the full TTL.
    await releaseLock(conversationId, lock.token);
  }
}
