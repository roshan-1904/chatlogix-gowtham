import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { canProcessMessage } from '../services/billingService.js';
import { sendTypingIndicator } from '../services/whatsappClient.js';
import { WhatsAppTemplateService } from '../services/whatsappTemplateService.js';
import { persistTurn, markCoalescedSiblings, persistPendingOutboundMedia } from './persist.js';
import {
  collectSendProductMediaOps,
  resolveProductMediaAttachments,
  type ResolvedOutboundAttachment
} from './productMediaAttachments.js';
import { debitAfterEnqueue, type TurnCostInputs } from './billing.js';
import { resolveIdentity } from './identity.js';
import { acquireLock, releaseLock, LockContentionError, LockUnavailableError } from './lock.js';
import { upsertInboundMessage } from './idempotency.js';
import { stashForBurstMerge } from './burstMerge.js';
import { collectCoalescedInbound } from './coalesceInbound.js';
import { prefetchHotSet } from './prefetch.js';
import { resolveCatalogContextForLlm1 } from './context/resolveCatalogContext.js';
import { runLlm1 } from './llm/llm1.js';
import { apply } from './cart/engine.js';
import { runLlm2, selectFinalReply, renderRejectedOpsReply } from './llm/llm2.js';
import { triggerHandoff } from './handoff.js';
import {
  isOrderStatusTurn,
  renderOrderStatusReply,
  shouldRewriteOrderStatusReply,
  stripKnowledgeGapOps,
  stripSendProductMediaOps
} from './orderStatusGuard.js';
import { persistKnowledgeGapIfNeeded } from './customerQuery.js';
import { enrichCustomerInsightsIfNeeded } from './customerInsightsEnrichment.js';
import { notifyVendorOfPostSalesEvent } from './postSalesAlert.js';
import { WALLET_EMPTY_TEMPLATE } from './templates.js';
import { logStage, logLatency, logCount } from './metrics.js';
import { ensureMessageContentEn, normalizeSetFieldOps } from '../utils/vendorEnglish.js';
import { aiCostMilliForTokens } from '../services/pricing/pricingService.js';
import {
  isTurnAuditEnabled,
  logTurnAudit,
  turnAuditServiceFromRuntime
} from '../observability/turnAuditLog.js';
import type { CartOp, CartSnapshot, PostSalesOutcome } from './types.js';

/** Deterministic customer-facing copy for a refund/cancel outcome — never LLM-authored (same reasoning as the handoff short-circuit: money/eligibility facts must not go through a free-text model). */
function renderPostSalesReply(outcome: PostSalesOutcome): string {
  switch (outcome.type) {
    case 'refund_approved':
      return `Your refund for order ${outcome.orderNumber} has been approved. ${outcome.detail}`;
    case 'refund_denied':
      return `I'm sorry, order ${outcome.orderNumber} isn't eligible for an automatic refund — ${outcome.detail} I've let the team know to take a look.`;
    case 'order_cancelled':
      return `Order ${outcome.orderNumber} has been cancelled as requested. What would you like to add?`;
    case 'already_cancelled':
      return `Order ${outcome.orderNumber} is already cancelled.`;
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
  coalescedWhatsappMessageIds?: string[];
  snapshot: CartSnapshot;
  finalText: string;
  language: string;
  intent: string;
  tokenMeta: { model: string; promptTokens: number; completionTokens: number };
  /** LLM-1 + LLM-2 + upstream transcription cost for this turn. */
  costs: TurnCostInputs;
  sandbox?: boolean;
  pendingMedia?: ResolvedOutboundAttachment[];
  turnAuditEnabled?: boolean;
}

export interface ProcessMessageResult {
  finalText: string;
  intent: string;
  /**
   * Unrounded LLM-1 + LLM-2 API cost in millirupees, before markup. The live
   * path has already charged this inside `finalizeTurn`; the sandbox caller
   * uses it to charge the trial wallet itself (`onboardingSandboxService`).
   */
  aiCostMilli: number;
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
    coalescedWhatsappMessageIds = [whatsappMessageId],
    snapshot,
    finalText,
    language,
    intent,
    tokenMeta,
    costs,
    sandbox = false,
    pendingMedia = [],
    turnAuditEnabled = false
  } = input;

  const auditService = turnAuditServiceFromRuntime();
  const auditCtx = {
    traceId: whatsappMessageId,
    vendorId,
    conversationId,
    service: auditService
  };

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

  logTurnAudit(turnAuditEnabled, auditCtx, 'persist_turn', {
    assistantMessageId,
    intent,
    stage: 'conversation-v1',
    tokenMeta
  });

  const attachments =
    pendingMedia.length > 0
      ? await persistPendingOutboundMedia({ conversationId, attachments: pendingMedia })
      : [];

  await markCoalescedSiblings({
    vendorId,
    conversationId,
    primaryWhatsappMessageId: whatsappMessageId,
    coalescedWhatsappMessageIds,
    tokenMeta
  });

  if (sandbox) {
    await ensureMessageContentEn(assistantMessageId, finalText).catch((error) => {
      logger.warn(
        { err: error, traceId: whatsappMessageId, vendorId, conversationId, assistantMessageId },
        'ensureMessageContentEn failed for sandbox assistant message'
      );
    });
    return { publishedAt: Date.now() };
  }

  // Corrected from spec §19's example JSON, which omits both fields:
  // - phoneNumberId: without it, chatlogix-response-processor falls back to
  //   an env-default WABA number, wrong in a multi-number setup. Already on
  //   the inbound SQS TextMessage payload (§10), threaded through here.
  // - messageId: chatlogix-response-processor only marks delivery status on
  //   the assistant Message row when this is present.
  const responseQueueBody = {
    type: 'text' as const,
    to: customerPhone,
    text: finalText,
    conversationId,
    vendorId,
    customerId,
    phoneNumberId,
    messageId: assistantMessageId,
    ...(attachments.length > 0 ? { attachments } : {}),
    metadata: { intent, processor: 'conversation-v1', traceId: whatsappMessageId }
  };
  await publishToQueue(env.RESPONSE_QUEUE_URL, responseQueueBody);
  const publishedAt = Date.now(); // §19 step 9: SLA clock stops here
  logStage('response_queue_published', { traceId: whatsappMessageId, vendorId, conversationId });
  logTurnAudit(turnAuditEnabled, auditCtx, 'response_queue_published', responseQueueBody);

  await ensureMessageContentEn(assistantMessageId, finalText).catch((error) => {
    logger.warn(
      { err: error, traceId: whatsappMessageId, vendorId, conversationId, assistantMessageId },
      'ensureMessageContentEn failed for assistant message'
    );
  });

  // Marked 'queued' regardless of what happens to the debit below — the
  // §19.1 sweep's query relies on this being set the moment the customer's
  // reply is actually on its way, not on whether the debit succeeds.
  await prisma.messageProcessing.updateMany({
    where: { whatsappMessageId: { in: coalescedWhatsappMessageIds } },
    data: { status: 'queued', queuedAt: new Date() }
  });

  try {
    await debitAfterEnqueue({
      vendorId,
      conversationId,
      whatsappMessageId,
      costs,
      turnAuditEnabled
    });
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
  /** Voice-note transcript or image caption, when the TextMessage was handed off from media fetch. */
  sourceMessageType?: 'audio' | 'image';
  /**
   * Unrounded millirupees already spent upstream on this inbound message —
   * today only Whisper transcription in `mediaFetchProcessor`. Folded into
   * this turn's single charge rather than debited separately.
   */
  upstreamCostMilli?: number;
  /** Browser onboarding demo — skip WhatsApp/queue side effects; return reply synchronously. */
  sandbox?: boolean;
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
export async function processMessage(
  input: ProcessMessageInput
): Promise<ProcessMessageResult | void> {
  const sandbox = Boolean(input.sandbox);
  const traceId = input.whatsappMessageId;
  const startTime = Date.now();
  logStage('handler_start', { traceId }); // §23: "SQS receive / handler start" — the SQS-receive-to-here gap is negligible (a JSON.parse) and not separately instrumented

  // Step 1: resolve vendor -> upsert customer -> find-or-create open conversation.
  const { vendorId, customerId, conversationId } = await resolveIdentity({
    vendorId: input.vendorId,
    phoneNumberId: input.phoneNumberId,
    customerPhone: input.customerPhone
  });

  const turnAuditEnabled = await isTurnAuditEnabled(vendorId);
  const auditService = turnAuditServiceFromRuntime();
  const auditCtx = {
    traceId,
    vendorId,
    conversationId,
    service: auditService
  };

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
      const stashed = await stashForBurstMerge(conversationId, input.whatsappMessageId, input.content);
      if (stashed) {
        logger.info(
          { traceId, vendorId, conversationId, whatsappMessageId: input.whatsappMessageId },
          'Lock contention — stashed for coalesce, ACK without retry'
        );
        return;
      }
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
      if (sandbox) {
        return {
          finalText: 'This message was already answered.',
          intent: 'duplicate',
          aiCostMilli: 0,
          tokenMeta: { model: 'none', promptTokens: 0, completionTokens: 0 }
        };
      }
      return;
    }
    // Still ensures the customer Message row exists -- a no-op when the
    // webhook already created it, the only path (today) that creates it
    // when it hasn't (the legacy Express route without the parity flag).
    const { messageId: inboundMessageId } = await upsertInboundMessage({
      vendorId,
      conversationId,
      customerId,
      content: input.content,
      whatsappMessageId: input.whatsappMessageId
    });
    await ensureMessageContentEn(inboundMessageId, input.content).catch((error) => {
      logger.warn({ err: error, traceId, vendorId, conversationId, messageId: inboundMessageId }, 'ensureMessageContentEn failed for inbound message');
    });

    // Guards (§7 step 3), before any paid LLM call.
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { aiPaused: true } });
    if (conversation?.aiPaused) {
      logger.info({ traceId, vendorId, conversationId }, 'aiPaused — inbound stored, no LLM, no debit, no reply (vendor replies via dashboard)');
      if (sandbox) {
        return {
          finalText: 'Your assistant is paused in this demo.',
          intent: 'ai_paused',
          aiCostMilli: 0,
          tokenMeta: { model: 'none', promptTokens: 0, completionTokens: 0 }
        };
      }
      return;
    }

    const creditCheck = await canProcessMessage(vendorId, 'text', { assistantTurnWorstCaseMedia: true });
    if (!creditCheck.allowed) {
      if (sandbox) {
        return {
          finalText:
            creditCheck.reason === 'trial_expired'
              ? 'Your trial has expired. You can still submit for approval or contact support.'
              : 'Your trial balance is used up. You can still submit for approval — our team will review your shop.',
          intent: 'guard_no_credit',
          aiCostMilli: 0,
          tokenMeta: { model: 'none', promptTokens: 0, completionTokens: 0 }
        };
      }
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

    // Coalesce every unprocessed customer inbound for this turn (§12 rule 2/3):
    // the trigger message, siblings stashed during lock contention, and any
    // rows the webhook already persisted before this job acquired the lock.
    const coalesced = await collectCoalescedInbound(conversationId, input.whatsappMessageId, input.content);
    const mergedContent = coalesced.mergedContent;
    if (coalesced.whatsappMessageIds.length > 1) {
      logger.info(
        {
          traceId,
          vendorId,
          conversationId,
          primaryWhatsappMessageId: input.whatsappMessageId,
          coalescedCount: coalesced.whatsappMessageIds.length,
          coalescedWhatsappMessageIds: coalesced.whatsappMessageIds
        },
        'Coalesced multiple inbound messages into one turn'
      );
    }

    if (!sandbox) {
      void sendTypingIndicator(input.whatsappMessageId, input.phoneNumberId).catch((error) => {
        logger.warn({ err: error, traceId, vendorId, conversationId }, 'Typing indicator failed');
      });
    }

    // Step 2: prefetch hot set in parallel.
    const hotSet = await prefetchHotSet(vendorId, conversationId, customerId, mergedContent);
    logStage('prefetch_done', { traceId, vendorId, conversationId });

    const { plan, catalogSlice, promptCatalogSlice } = await resolveCatalogContextForLlm1({
      vendorId,
      mergedContent,
      hotSet,
      traceId,
      whatsappMessageId: input.whatsappMessageId
    });
    logStage('context_plan_done', { traceId, vendorId, conversationId }, {
      mode: plan.mode,
      fullCatalogSize: hotSet.compactCatalog.length,
      sliceSize: catalogSlice.length,
      omitCatalogTable: plan.omitCatalogTable,
      reasons: plan.reasons
    });
    logTurnAudit(turnAuditEnabled, auditCtx, 'context_plan', {
      plan,
      catalogSlice,
      promptCatalogSlice,
      catalogSliceSize: catalogSlice.length,
      promptCatalogSliceSize: promptCatalogSlice?.length ?? catalogSlice.length,
      mergedContent,
      coalescedWhatsappMessageIds: coalesced.whatsappMessageIds
    });

    // Step 4: LLM-1 -- ops + draft reply.
    const llm1StartedAt = Date.now();
    const llm1Result = await runLlm1({
      vendorId,
      hotSet,
      catalogSlice,
      promptCatalogSlice,
      mergedContent,
      traceId,
      sourceMessageType: input.sourceMessageType,
      turnAuditEnabled
    });
    logLatency('Llm1Ms', Date.now() - llm1StartedAt, { vendorId });
    logStage('llm1_done', { traceId, vendorId, conversationId }, {
      promptTokens: llm1Result.promptTokens,
      completionTokens: llm1Result.completionTokens,
      model: llm1Result.model,
      fullCatalogSize: hotSet.compactCatalog.length,
      sliceSize: catalogSlice.length,
      turnContextMode: plan.mode
    });

    const normalizedOps = await normalizeSetFieldOps(llm1Result.ops);

    // Step 5: CartEngine.apply -- the model never writes Order.items directly.
    let applyResult;
    try {
      applyResult = await apply({
        vendorId,
        conversationId,
        customerId,
        orderId: hotSet.pendingOrder?.orderId ?? null,
        ops: normalizedOps,
        traceId
      });
    } catch (error) {
      logCount('CartApplyFail', { vendorId });
      throw error;
    }
    logStage('cart_apply_done', { traceId, vendorId, conversationId }, { mutated: applyResult.mutated });
    logTurnAudit(turnAuditEnabled, auditCtx, 'cart_apply', {
      normalizedOps,
      mutated: applyResult.mutated,
      rejectedOps: applyResult.rejectedOps,
      snapshot: applyResult.snapshot,
      postSalesOutcome: applyResult.postSalesOutcome
    });

    const orderHistory = hotSet.orderHistory ?? [];
    const orderStatusTurn = isOrderStatusTurn({
      mergedContent,
      intent: llm1Result.intent,
      ops: normalizedOps,
      orderHistory
    });
    // D6: never persist knowledge_gap or send catalog media on order-status turns.
    const replyOps = orderStatusTurn
      ? stripSendProductMediaOps(stripKnowledgeGapOps(normalizedOps))
      : normalizedOps;

    const handoffOp = replyOps.find((op): op is Extract<CartOp, { type: 'handoff' }> => op.type === 'handoff');
    let finalText: string;
    let replyBranch = 'llm2_path';
    // LLM-2's tokens were never costed anywhere before the wallet rewrite;
    // they stay zero on the branches below that never call it.
    let llm2PromptTokens = 0;
    let llm2CompletionTokens = 0;

    if (handoffOp) {
      replyBranch = 'handoff';
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
      replyBranch = 'post_sales';
      // A refund/cancel decision CartEngine already made deterministically —
      // render it as-is (never through LLM-2) and, for the two outcomes that
      // need a human's call, alert the vendor with the real order + reason
      // (same helper handoff.ts uses, so both paths produce one consistent
      // vendor-facing message format).
      const outcome = applyResult.postSalesOutcome;
      finalText = renderPostSalesReply(outcome);

      if (
        !sandbox &&
        (outcome.type === 'refund_denied' || outcome.type === 'not_cancellable_at_this_stage')
      ) {
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
    } else if (applyResult.rejectedOps.length > 0) {
      replyBranch = 'rejected_ops';
      // CartEngine rejected part (or all) of what was asked -- never let
      // LLM-1's draft or LLM-2's polish claim success here. Neither is
      // grounded in whether the op actually applied (copyMatchesSnapshot only
      // catches an *omitted* snapshot line, which is vacuously satisfied by
      // an empty snapshot), so a hallucinated "added"/"confirmed" reply can
      // otherwise reach the customer even though nothing was persisted.
      logCount('RejectedOpsGrounded', { vendorId }, applyResult.rejectedOps.length);
      finalText = renderRejectedOpsReply(applyResult.rejectedOps, applyResult.snapshot, llm1Result.language, llm1Result.draftReply);
    } else if (orderStatusTurn && shouldRewriteOrderStatusReply(llm1Result.draftReply, orderHistory)) {
      replyBranch = 'order_status';
      // D6: order-status turns never defer and never invent a lookup. Skip LLM-2
      // when the draft is a "I'll check / get back" line or does not cite a real order number.
      logCount('CustomerQueryBlockedOrder', { vendorId });
      finalText = renderOrderStatusReply(orderHistory, hotSet.vendorConfig);
    } else {
      // Step 6: LLM-2, conditionally (runLlm2 checks shouldRunLlm2 internally).
      const llm2StartedAt = Date.now();
      const llm2Result = await runLlm2({
        draftReply: llm1Result.draftReply,
        snapshot: applyResult.snapshot,
        vendorId,
        language: llm1Result.language,
        model: llm1Result.model,
        ops: replyOps,
        needsVerify: llm1Result.needsVerify,
        confidence: llm1Result.confidence,
        turnAuditEnabled,
        traceId
      });

      if (llm2Result.skipped) {
        logCount('Llm2Skipped', { vendorId });
        logStage('llm2_skipped', { traceId, vendorId, conversationId });
      } else {
        llm2PromptTokens = llm2Result.promptTokens;
        llm2CompletionTokens = llm2Result.completionTokens;
        logLatency('Llm2Ms', Date.now() - llm2StartedAt, { vendorId });
        logStage('llm2_done', { traceId, vendorId, conversationId });
      }

      // Step 7: render final text -- LLM-2's copy if it ran and matches the
      // snapshot, the draft reply if LLM-2 was skipped, the deterministic
      // engine renderer if LLM-2's copy disagreed with the cart (§17's
      // correctness backstop for I1).
      const decision = selectFinalReply({
        draftReply: llm1Result.draftReply,
        llm2Result,
        snapshot: applyResult.snapshot,
        traceId,
        intent: llm1Result.intent,
        ops: replyOps,
        compactCatalog: catalogSlice,
        language: llm1Result.language,
        cartMutated: applyResult.mutated
      });
      finalText = decision.finalReply;
    }

    const tokenMeta = {
      model: llm1Result.model,
      promptTokens: llm1Result.promptTokens + llm2PromptTokens,
      completionTokens: llm1Result.completionTokens + llm2CompletionTokens,
      llm1PromptTokens: llm1Result.promptTokens,
      llm1CompletionTokens: llm1Result.completionTokens,
      llm2PromptTokens,
      llm2CompletionTokens
    };

    // Both models bill at the same per-token rate (LLM-2 reuses LLM-1's
    // model), but they are summed as two calls rather than one merged token
    // count so the numbers stay legible against the OpenAI dashboard.
    const aiCostMilli =
      aiCostMilliForTokens(llm1Result.model, llm1Result.promptTokens, llm1Result.completionTokens) +
      aiCostMilliForTokens(llm1Result.model, llm2PromptTokens, llm2CompletionTokens);

    let pendingMedia: ResolvedOutboundAttachment[] = [];
    if (!orderStatusTurn && !handoffOp && !sandbox) {
      const mediaOps = collectSendProductMediaOps(normalizedOps);
      if (mediaOps.length > 0) {
        pendingMedia = await resolveProductMediaAttachments(vendorId, mediaOps, finalText);
      }
    }

    const queueIntent = pendingMedia.length > 0 ? 'send_media' : llm1Result.intent;

    logTurnAudit(turnAuditEnabled, auditCtx, 'reply_selected', {
      finalText,
      intent: queueIntent,
      replyBranch,
      pendingMedia: pendingMedia.map((m) => ({
        productMediaId: m.productMediaId,
        kind: m.kind,
        caption: m.caption
      }))
    });

    // Steps 8-10: persist -> response queue -> debit.
    const { publishedAt } = await finalizeTurn({
      vendorId,
      conversationId,
      customerId,
      customerPhone: input.customerPhone,
      phoneNumberId: input.phoneNumberId,
      whatsappMessageId: input.whatsappMessageId,
      coalescedWhatsappMessageIds: coalesced.whatsappMessageIds,
      snapshot: applyResult.snapshot,
      finalText,
      language: llm1Result.language,
      intent: queueIntent,
      tokenMeta,
      costs: { aiCostMilli, upstreamCostMilli: input.upstreamCostMilli ?? 0 },
      sandbox,
      pendingMedia,
      turnAuditEnabled
    });
    logLatency('LatencyMs', publishedAt - startTime, { vendorId }); // §8 SLA clock: start (handler_start) -> publish, excluding the debit attempt's own duration

    // Knowledge-gap persist after the customer reply is queued (I5: never block
    // send). Handoff / D6 / sandbox no-op inside persistKnowledgeGapIfNeeded.
    // Does not set aiPaused (D1).
    await persistKnowledgeGapIfNeeded({
      vendorId,
      conversationId,
      customerId,
      sourceMessageId: inboundMessageId,
      customerText: mergedContent,
      ops: normalizedOps,
      draftReply: llm1Result.draftReply,
      orderStatusTurn,
      hasHandoff: Boolean(handoffOp),
      sandbox
    }).catch((error) => {
      logger.error({ err: error, vendorId, conversationId, traceId }, 'CustomerQuery persist failed');
    });

    await enrichCustomerInsightsIfNeeded({
      vendorId,
      conversationId,
      customerId,
      whatsappMessageId: input.whatsappMessageId,
      customerText: mergedContent,
      orderStatusTurn,
      hasHandoff: Boolean(handoffOp),
      sandbox
    }).catch((error) => {
      logger.error({ err: error, vendorId, conversationId, traceId }, 'Customer insights enrichment failed');
    });

    // Step 11 (async, fire-and-forget): vendor notify on a newly-confirmed
    // order. Reuses whatsappTemplateService.notifyVendorNewOrder exactly as
    // documented there ("fire-and-forget safe — caller should not await").
    // Handoff's own vendor notify already happened inside triggerHandoff
    // above, so this only fires for a successful `confirm`.
    const confirmOp = llm1Result.ops.find((op) => op.type === 'confirm');
    const confirmSucceeded = confirmOp && !applyResult.rejectedOps.some((r) => r.op === confirmOp);
    if (!sandbox && confirmSucceeded && applyResult.snapshot.orderId) {
      const orderId = applyResult.snapshot.orderId;
      whatsappTemplateService.notifyVendorNewOrder(vendorId, orderId).catch((error) => {
        logger.error({ err: error, vendorId, orderId, traceId }, 'Vendor new-order notify failed');
      });
    }

    logCount('ProcessorSuccess', { vendorId });

    if (sandbox) {
      return {
        finalText,
        intent: llm1Result.intent,
        aiCostMilli,
        tokenMeta
      };
    }
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
