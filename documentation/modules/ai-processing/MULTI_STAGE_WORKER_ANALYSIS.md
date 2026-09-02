# Multi-Stage AI Worker — Analysis & Gap Resolution Plan

**Date:** 2026-04-10  
**Branch:** `multi_stage_ai_worker`  
**Scope:** Full codebase analysis of the multi-stage AI processing pipeline covering workers, orchestrator, and all stage services.

> **Superseded — read before acting on anything below.** This is a point-in-time analysis from 2026-04-10 of the 14-stage `multiStageOrchestrator.ts` pipeline. That pipeline is **no longer on the hot path** for live WhatsApp messages: it was replaced by a from-scratch rewrite in `backend/src/conversation/*` (LLM-1 draft + cart ops → `CartEngine` → optional LLM-2 verifier), which runs today as the `chatlogix-incoming-response-generator` Lambda. See `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for the current design and `docs/CONVERSATION_WORKER_GAPS.md` for the current, verified gap list (a different, up-to-date document — do not confuse the two).
>
> One file reference below is now broken: `backend/src/workers/multiStageAIWorker.ts` (the entry point this analysis centers on) was **deleted as dead code on 2026-09-02** along with the other pre-Lambda PM2 worker entrypoints. `backend/src/services/multiStageOrchestrator.ts` and the stage services it names still exist in the repo, but their only remaining live caller is `catalogImportSandboxService.ts` (catalog import — unrelated to message processing), not real customer conversations.
>
> The gap analysis, fixes, and priority matrix below are left as-is as a historical record of that pipeline's known issues; none of it was verified or re-applied against the new pipeline.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Complete Pipeline Flow](#2-complete-pipeline-flow)
3. [Stage-by-Stage Breakdown](#3-stage-by-stage-breakdown)
4. [Intent Coverage](#4-intent-coverage)
5. [Early-Exit Shortcuts](#5-early-exit-shortcuts)
6. [Identified Gaps](#6-identified-gaps)
7. [Suggested Fixes](#7-suggested-fixes)
8. [Priority & Effort Matrix](#8-priority--effort-matrix)

---

## 1. System Overview

The ChatLogix multi-stage AI pipeline processes incoming WhatsApp messages through a series of specialized stages — from raw message normalization to final response queuing. The system targets <$0.0022 per message cost and aims to automate 90% of vendor customer service interactions.

**Key files:**

| File | Role |
|---|---|
| `backend/src/workers/multiStageAIWorker.ts` | Entry point — SQS polling, message grouping, feature flag routing |
| `backend/src/services/multiStageOrchestrator.ts` | Orchestrates all stages (0–9.5) |
| `backend/src/services/intentClassificationService.ts` | Stage 1 — classifies customer intent |
| `backend/src/services/contextFetcherService.ts` | Stage 2 — fetches intent-specific DB data |
| `backend/src/services/promptBuilderService.ts` | Stage 3 — constructs focused AI prompt |
| `backend/src/services/primaryAIResponseService.ts` | Stage 4 — primary OpenAI call |
| `backend/src/services/dataExtractionService.ts` | Stage 8 — extracts data and writes to DB |
| `backend/src/services/dataValidationService.ts` | Stage 7.5 — validates before DB write |
| `backend/src/services/humanHandoffService.ts` | Handles human agent escalation |
| `backend/src/services/conversationMemoryService.ts` | Maintains cross-turn conversation context |
| `backend/src/types/multiStage.ts` | TypeScript interfaces for all stage I/O |

---

## 2. Complete Pipeline Flow

```
WhatsApp Message (customer)
        │
        ▼
SQS INCOMING_QUEUE
        │
        ▼
multiStageAIWorker  (polls 10 messages at a time)
        │
        ├─ Group messages by vendorId + customerPhone
        ├─ storeIncomingMessage()  →  DB (Message table)
        ├─ isAIPaused() check      →  skip if vendor paused AI
        │
        ├─ shouldUseMultiStage()  [feature flag check]
        │       ├─ TRUE  + single message  →  MultiStageOrchestrator.execute()
        │       ├─ TRUE  + batch messages  →  LEGACY processBatchIncomingMessages()  ⚠️ GAP 1
        │       └─ FALSE               →  LEGACY processIncomingTextMessage()
        │                fallback on failure → legacy as well
        │
        ▼
MultiStageOrchestrator.execute(context)
        │
        ├─ Stage 0    Message Normalization
        ├─ Stage 0.5  Memory Retrieval
        ├─ Stage 1    Intent Classification
        │       ├─ [support intent]  →  Early exit: ask for handoff confirmation → Stage 9
        │       └─ [handoff pending] →  Early exit: execute/cancel handoff → Stage 9
        ├─ Stage 1.5  Intent Prioritization       (only if secondary intents exist)
        ├─ Stage 1.7  Correction Detection        (only if correction keywords or turn > 2)
        ├─ Stage 2    Context-Aware Data Fetching
        ├─ Stage 3    Prompt Construction
        ├─ Stage 4    Primary AI Response         ← Main OpenAI call
        │       └─ Stage 4.7 Proactive Assistance (parallel, fire-and-forget) ⚠️ GAP 2
        ├─ Stage 4.5  Order Update Validation     (only for order_update intent)
        ├─ Stage 5    Data Enrichment             (only if needsClarification = true)
        ├─ Stage 6    Response Refinement         (only if Stage 5 ran)
        ├─ Stage 7    Message Composition         (formatting only, no AI call)
        ├─ Stage 7.5  Data Validation
        ├─ Stage 8    Database Update             (orders, customer insights, memory)
        ├─ Stage 8.5  Quality Assessment          (async, non-blocking)
        ├─ Stage 9    Response Queuing            → SQS RESPONSE_QUEUE
        └─ Stage 9.5  Message Summary             (async, non-blocking)
                │
                ▼
        responseWorker
                │
                ▼
        WhatsApp Business API  →  Customer receives reply
```

---

## 3. Stage-by-Stage Breakdown

| Stage | Name | AI Model | Purpose | Always Runs |
|---|---|---|---|---|
| **0** | Message Normalization | gpt-5-nano¹ | Clean text, detect language & sentiment | ✅ Yes |
| **0.5** | Memory Retrieval | None (DB) | Fetch conversation context, turn count, preferences | ✅ Yes |
| **1** | Intent Classification | gpt-4o-mini | Classify primary + secondary intents (17 types) | ✅ Yes |
| **1.5** | Intent Prioritization | gpt-4o-mini | Handle multi-intent messages | If secondary intents exist |
| **1.7** | Correction Detection | gpt-5-nano¹ | Detect "no, I meant X" corrections | If correction keywords or turn > 2 |
| **2** | Context Fetching | None (DB) | Products, vendor config, pending order, history | ✅ Yes |
| **3** | Prompt Building | None (logic) | Build intent-focused system prompt | ✅ Yes |
| **4** | Primary AI Response | gpt-4o-mini / gpt-4o | Main AI call — generate response + extract data | ✅ Yes |
| **4.5** | Order Update Validation | None (logic) | Validate order changes, detect conflicts | Only for `order_update` |
| **4.7** | Proactive Assistance | gpt-4o-mini | Suggest reorder / upsell | Parallel, fire-and-forget |
| **5** | Data Enrichment | None (DB) | Extra context if clarification needed | Only if `needsClarification` |
| **6** | Response Refinement | gpt-4o-mini | Refine response with enrichment data | Only if Stage 5 ran |
| **7** | Message Composition | None (formatting) | Format for WhatsApp delivery | ✅ Yes |
| **7.5** | Data Validation | None (logic) | Validate extracted order data before DB write | ✅ Yes |
| **8** | Database Update | None (DB writes) | Create/update orders, customer insights, memory | ✅ Yes |
| **8.5** | Quality Assessment | gpt-5-nano¹ | Score response quality for analytics | Async, non-blocking |
| **9** | Response Queuing | None (SQS) | Push final message to response queue | ✅ Yes (critical) |
| **9.5** | Message Summary | LLM | Summarize message to improve future context | Async, non-blocking |

> ¹ `gpt-5-nano` does not exist — this is a logging bug. See **Gap 7**.

---

## 4. Intent Coverage

The system classifies 17 intent types. Coverage status per intent:

| Intent | Status | Notes |
|---|---|---|
| `greeting` | ✅ Full | Welcome message generated |
| `product_inquiry` | ✅ Full | Products fetched from DB, AI describes with prices |
| `order_new` | ✅ Full | Order created in Stage 8 |
| `order_update` | ✅ Full | Stage 4.5 validates changes, Stage 8 updates |
| `confirm_order` | ✅ Full | Stage 7.5 validates, Stage 8 confirms |
| `cancel_order` | ✅ Full | Stage 7.5 validates, Stage 8 cancels |
| `order_status` | ✅ Full | Order history fetched, AI responds |
| `repeat_order` | ✅ Full | Stage 7.5 validates previous order stock |
| `support` | ✅ Full | Human handoff flow with AI pause |
| `delivery_inquiry` | ⚠️ Partial | Area/time extracted, AI responds generically — no delivery slot data |
| `payment_inquiry` | ⚠️ Partial | Payment method extracted, AI responds generically |
| `complaint` | ⚠️ Partial | Complaint type classified, no ticket created, no vendor alert |
| `refund_request` | ⚠️ Partial | Reason + amount extracted, no refund record or vendor alert |
| `return_request` | ⚠️ Partial | Detected, no return workflow exists |
| `feedback` | ⚠️ Partial | Captured in context, no structured storage |
| `account_inquiry` | ⚠️ Partial | Detected, generic AI response |
| `other` | ✅ Fallback | Generic AI response |

**Core e-commerce journey (browse → order → track → modify → confirm → cancel → escalate) is fully automated.**  
Post-sales intents (complaint, refund, return) are recognized but produce no real downstream action.

---

## 5. Early-Exit Shortcuts

The orchestrator short-circuits the full pipeline in two specific cases to minimize latency and token cost:

### 5.1 Support / Human Handoff Request

```
Customer message → Intent = 'support'
    → Set handoffConfirmationPending = true in ConversationMemory
    → Send: "Do you want to pause the AI and connect to a human agent? Reply 'Yes' to confirm."
    → Skip Stages 1.5 through 8.5
    → Go directly to Stage 9
```

### 5.2 Handoff Confirmation Response

```
handoffConfirmationPending = true (from previous turn)
    ├─ Customer says "yes / sure / confirm"
    │       → humanHandoffService.executeHandoff()
    │       → aiPaused = true set in Conversation DB record
    │       → Send: "I've passed your message to [Vendor]. They'll get back to you soon!"
    │       → Skip to Stage 9
    │
    └─ Customer says "no / cancel"
            → Set handoffConfirmationPending = false
            → Send: "Okay, I will continue to assist you. How can I help?"
            → Skip to Stage 9

    (Any other response) → Continue normal pipeline flow
```

---

## 6. Identified Gaps

### Gap 1 — Batch Messages Bypass Multi-Stage Pipeline

**File:** `backend/src/workers/multiStageAIWorker.ts:275-290`

When 2 or more messages arrive simultaneously from the same conversation (common on slow mobile connections), they are grouped and routed to `processBatchIncomingMessages()` — the legacy processor. The multi-stage AI pipeline never runs for these messages.

This is a significant gap because batch arrival is a normal scenario, not an edge case.

---

### Gap 2 — Stage 4.7 (Proactive Assistance) Output Is Wasted

**File:** `backend/src/services/multiStageOrchestrator.ts:316-318`

Stage 4.7 runs in parallel with Stage 4, consumes tokens calling OpenAI, and returns `{ shouldInclude: boolean, suggestions: string[] }`. However, the result is never captured or merged into the final message. The `stage4_7Promise` error is swallowed and the output is discarded entirely.

Token cost is incurred with zero customer-facing benefit.

---

### Gap 3 — Complaint / Refund / Return Intents Are Detection-Only

**Files:** `backend/src/services/dataExtractionService.ts`, `backend/src/services/qualityAssessmentService.ts`

The intent classification correctly identifies `complaint`, `refund_request`, and `return_request` with relevant sub-fields extracted (complaint type, refund amount, etc.). However, Stage 8 (`extractAndSave`) has no handler for these intents. No records are created, no vendor alerts are sent, and no workflows are triggered. The customer receives a generic AI response and nothing else happens.

---

### Gap 4 — Feature Flag Defaults to OFF

**File:** `backend/src/workers/multiStageAIWorker.ts:27-59`

Unless `ENABLE_MULTI_STAGE_AI=true` is explicitly set in the environment, `shouldUseMultiStage()` returns `false` and all traffic routes to the legacy processor. The entire multi-stage pipeline is effectively dark in production without this config.

---

### Gap 5 — Vendor Notification on New Order (Unverified)

**File:** `backend/src/services/dataExtractionService.ts → extractAndSave()`

The legacy path explicitly calls `whatsappTemplateService` to notify the vendor when an order is created. It is not confirmed whether this notification call exists in the multi-stage path via `extractAndSave()` / `orderService.createOrder()`. If absent, vendors will not be notified of new orders placed through the multi-stage pipeline.

---

### Gap 6 — No Per-Stage Timeout Enforcement

**File:** `backend/src/services/multiStageOrchestrator.ts`

`StageConfig` defines a `timeout` field, but the orchestrator never uses it. If an OpenAI call in Stage 4 hangs, the entire pipeline hangs indefinitely. When the SQS visibility timeout expires, the message re-queues and the conversation retries in a loop — potentially blocking the customer from getting any response.

---

### Gap 7 — Incorrect Model Name in Stage Execution Logs

**File:** `backend/src/services/multiStageOrchestrator.ts` (Stage 0, 1.7, 8.5 `logStageExecution` calls)

Stages 0, 1.7, and 8.5 log `model: 'gpt-5-nano'` — a model name that does not exist. This corrupts cost analytics and token attribution. The actual model used by each service is not reflected in the logs.

---

### Gap 8 — Duplicate Assistant Message Race Condition

**File:** `backend/src/workers/multiStageAIWorker.ts:110-124`

After `orchestrator.execute()` completes (which includes Stage 9 queuing the response), `processWithMultiStage()` additionally calls `prisma.message.create()` to store an assistant message. The guard condition checks:

```typescript
if (existingMessage?.senderType !== 'assistant')
```

But `existingMessage` is fetched by the *customer's* `messageId`, which will always have `senderType = 'customer'` — so the guard never prevents the creation. This creates a race condition with the `responseWorker` which also creates the assistant message when it sends the WhatsApp response.

---

## 7. Suggested Fixes

### Fix 1 — Route Batch Messages Through Multi-Stage

**Approach:** Concatenate multiple messages into a single normalized input string, or process only the last (most contextually relevant) message through the orchestrator while using earlier messages as stored history (already written to DB).

```typescript
// In multiStageAIWorker.ts — replace legacy batch routing
if (conversationMessages.length > 1) {
  // Option A: Process the latest message only
  const latestMessage = conversationMessages[conversationMessages.length - 1];
  latestMessage.body.messageId = storedMessageIds[storedMessageIds.length - 1];
  latestMessage.body.conversationId = conversationId;
  latestMessage.body.customerId = conversation.customerId;
  await processWithMultiStage(latestMessage.body, conversationId, ...);

  // Option B: Merge all message content into one normalized input
  const mergedContent = conversationMessages.map(m => m.body.content).join('\n');
  const mergedBody = { ...conversationMessages[0].body, content: mergedContent };
  await processWithMultiStage(mergedBody, conversationId, ...);
}
```

---

### Fix 2 — Wire Stage 4.7 Output Into Message Composition

**Approach:** Collect the Stage 4.7 result alongside Stage 4, store it in `context`, and pass it to Stage 7's `composeMessage()`.

```typescript
// In multiStageOrchestrator.ts — replace fire-and-forget with collected result
const [aiResponse, proactiveResult] = await Promise.allSettled([
  stage4Promise,
  stage4_7Promise
]);

context.aiResponse = aiResponse.status === 'fulfilled' ? aiResponse.value : null;
context.proactiveAssistance = proactiveResult.status === 'fulfilled' ? proactiveResult.value : null;

// In Stage 7 (composeMessage), append suggestions if shouldInclude = true
if (context.proactiveAssistance?.shouldInclude && context.proactiveAssistance.suggestions?.length > 0) {
  const suggestionsText = context.proactiveAssistance.suggestions.join('\n');
  composedMessage += `\n\n${suggestionsText}`;
}
```

---

### Fix 3 — Add Action Handlers for Post-Sales Intents

**Approach:** Add intent-specific branches in Stage 8 (`extractAndSave`) to create records and notify vendors. The `OrderAlert` model already exists in the schema.

```typescript
// In dataExtractionService.ts — inside extractAndSave()

if (intent === 'complaint') {
  await prisma.orderAlert.create({
    data: {
      vendorId,
      customerId,
      conversationId,
      alertType: 'complaint',
      severity: extractedData.complaintType === 'quality' ? 'high' : 'medium',
      message: `Customer complaint: ${extractedData.complaintType} — ${rawMessage}`,
      status: 'open'
    }
  });
  await whatsappTemplateService.notifyVendorAlert(vendorId, 'complaint', extractedData);
}

if (intent === 'refund_request') {
  await prisma.orderAlert.create({
    data: {
      vendorId, customerId, conversationId,
      alertType: 'refund_request',
      severity: 'high',
      message: `Refund requested: ${extractedData.refundReason}, Amount: ${extractedData.refundAmount}`,
      status: 'open'
    }
  });
  await whatsappTemplateService.notifyVendorAlert(vendorId, 'refund_request', extractedData);
}

if (intent === 'return_request') {
  // Similar pattern
}

if (intent === 'feedback') {
  await insightsService.saveFeedback(customerId, vendorId, extractedData.feedbackText);
}
```

---

### Fix 4 — Enable Feature Flag in Production

**Approach (immediate):** Set environment variable in deployment config:

```env
ENABLE_MULTI_STAGE_AI=true
```

The legacy fallback is already in place (`processIncomingTextMessage` is called if multi-stage fails), so risk is minimal.

**Approach (long-term):** Once multi-stage is validated at 100%, remove the binary flag and deprecate the legacy path entirely. Use `MULTI_STAGE_AI_ROLLOUT_PERCENTAGE` for graduated rollout:

```
10% → monitor quality scores → 50% → monitor → 100% → retire legacy
```

---

### Fix 5 — Verify and Add Vendor Notification for New Orders

**Approach:** Trace `extractAndSave()` → `orderService.createOrder()` and confirm whether `whatsappTemplateService.notifyVendor()` is called. If not found, add explicitly in Stage 8:

```typescript
// In multiStageOrchestrator.ts — Stage 8, after extractAndSave()
if (intent === 'order_new' || intent === 'confirm_order') {
  const createdOrder = await prisma.order.findFirst({
    where: { conversationId, status: { in: ['pending', 'confirmed'] } },
    orderBy: { createdAt: 'desc' }
  });
  if (createdOrder) {
    await whatsappTemplateService.notifyVendorNewOrder(vendorId, createdOrder);
  }
}
```

---

### Fix 6 — Enforce Per-Stage Timeouts

**Approach:** Add a `withTimeout` utility to the orchestrator and wrap every AI-calling stage.

```typescript
// Add to MultiStageOrchestrator class
private async withTimeout<T>(promise: Promise<T>, ms: number, stageName: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Stage ${stageName} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Usage in Stage 4:
const aiResponse = await this.withTimeout(
  generatePrimaryAIResponse(prompt, normalizedMessage, memory, conversationId, vendorId, ...),
  15_000,
  'stage_4'
);
```

**Recommended timeouts:**

| Stage | Timeout |
|---|---|
| Stage 0 (normalization) | 5,000 ms |
| Stage 1 (intent) | 8,000 ms |
| Stage 1.7 (correction) | 5,000 ms |
| Stage 4 (primary AI) | 15,000 ms |
| Stage 6 (refinement) | 10,000 ms |
| Stage 7.5, 8 (DB logic) | 5,000 ms |
| Stage 8.5 (quality) | 8,000 ms |

On timeout, the existing `catch` block in each stage runs the fallback — so behavior degrades gracefully.

---

### Fix 7 — Fix Incorrect Model Names in Logs

**Approach:** Have each service return the model name it actually used, and log it dynamically rather than hardcoding.

```typescript
// In each service (e.g. messageNormalizationService.ts), return model used:
return {
  cleaned: normalizedText,
  tokensUsed,
  cost,
  model: 'gpt-4o-mini' // actual model used
};

// In orchestrator logStageExecution, use it:
await this.logStageExecution(stageName, context, {
  success: true,
  duration: Date.now() - stageStart,
  tokensUsed: result.tokensUsed || 0,
  cost: result.cost || 0,
  model: result.model  // ← dynamic, not hardcoded
});
```

Short-term: replace `'gpt-5-nano'` with the correct model name (`'gpt-4o-mini'`) in the three affected `logStageExecution` calls while the service-level fix is implemented.

---

### Fix 8 — Remove Duplicate Assistant Message Code

**Approach:** Delete the redundant `prisma.message.create()` block in `processWithMultiStage()`. The `responseWorker` already creates the assistant message when it delivers the WhatsApp reply.

```typescript
// DELETE lines 109–124 in multiStageAIWorker.ts:
// The block that does:
//   const existingMessage = await prisma.message.findUnique(...)
//   if (existingMessage?.senderType !== 'assistant') {
//     await prisma.message.create({ ... senderType: 'assistant' ... })
//   }
//
// Reason: responseWorker handles assistant message creation.
// This code creates a race condition and the guard is ineffective
// (it checks by customer messageId which is never senderType='assistant').
```

---

## 8. Priority & Effort Matrix

| Priority | Gap | Fix | Effort | Risk |
|---|---|---|---|---|
| 🔴 **P0** | Gap 4 — Feature flag off | Set `ENABLE_MULTI_STAGE_AI=true` in env | Minutes | Low (fallback exists) |
| 🔴 **P0** | Gap 8 — Duplicate message race | Remove 10 lines from `multiStageAIWorker.ts` | Minutes | Low |
| 🟠 **P1** | Gap 6 — No stage timeouts | Add `withTimeout()` utility + wrap AI stages | 1 day | Low |
| 🟠 **P1** | Gap 2 — Stage 4.7 output wasted | Use `Promise.allSettled`, pass result to Stage 7 | Half day | Low |
| 🟠 **P1** | Gap 1 — Batch message bypass | Route latest batch message through orchestrator | Half day | Medium |
| 🟡 **P2** | Gap 5 — Vendor notification unverified | Trace + add explicit notify call in Stage 8 | 1–2 hours | Low |
| 🟡 **P2** | Gap 7 — Wrong model name in logs | Fix 3 hardcoded strings + add dynamic model return | 1 hour | None |
| 🟢 **P3** | Gap 3 — No post-sales workflows | Add `OrderAlert` writes + vendor notify for complaint/refund/return | 1–2 weeks | Medium (schema may need changes) |

---

## Conclusion

The multi-stage AI pipeline successfully automates the **core e-commerce customer journey** end-to-end:

> Customer greets → inquires about products → places order → provides delivery details → confirms → tracks → modifies → cancels → escalates to human

This covers ~80% of typical vendor customer service interactions and meets the business goal of automating repetitive tasks.

**The 8 gaps identified do not break the core flow** — they represent missed optimizations (Gaps 2, 7), an operational oversight (Gap 4), reliability concerns (Gaps 1, 6, 8), a verification item (Gap 5), and a product feature gap (Gap 3).

P0 fixes (Gaps 4 and 8) take under 30 minutes and should be done immediately. P3 (Gap 3 — complaint/refund/return workflows) is a sprint-level feature that requires product and schema design decisions before implementation.
