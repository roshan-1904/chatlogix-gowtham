# Conversation Processor Lambda

**Status:** Locked design (v1) — ready to implement  
**Date:** 2026-09-01  
**Mode:** Development / testing. No live customers. **Replace** the existing text AI processor; do not dual-run.  
**Function name:** `chatlogix-conversation-processor`  
**Queue:** `TEXT_QUEUE_URL` only (`chatlogix-text-queue-prod` in AWS, LocalStack `text-queue` locally)

This document is the source of truth for rewriting WhatsApp **text** conversation handling: latency (p90 ≤ 5s), cart correctness, and a Lambda that can later serve thousands of vendors and millions of messages.

> **Revision v1.1 (2026-09-01):** Added scale-hardening guidance after a codebase re-audit — idempotent debit reconciliation (§19.1, 5-min sweep confirmed), PgBouncer as a hard prerequisite (§22.1), Redis lock failure handling (§21 error table, single ElastiCache node confirmed for dev/test), a two-gate latency validation process (§27, Gate B confirmed to trail Gate A), multi-language product-match measurement (§11), and a quality-evaluation loop (§23.1, gpt-4.1-mini judge + weekly cadence confirmed). Does **not** reopen locked decisions Q1–Q15.

Related docs (do not contradict this spec for the **text** path):

- `docs/DEPLOYMENT.md` — current webhook → SQS → Lambda topology  
- `docs/LAMBDA_MIGRATION_PLAN.md` — VM vs Lambda; Postgres stays on Lightsail for now  
- `backend/src/services/unifiedAIProcessorService.ts` — current single-call AI (replaced for text)  
- `backend/src/services/dataExtractionService.ts` — current cart writer (replaced for text)

---

## Table of contents

1. [TL;DR](#1-tldr)
2. [Why rewrite](#2-why-rewrite)
3. [Locked product decisions (Q1–Q15)](#3-locked-product-decisions-q1q15)
4. [Invariants](#4-invariants)
5. [What this Lambda does and does not do](#5-what-this-lambda-does-and-does-not-do)
6. [Place in the existing fleet](#6-place-in-the-existing-fleet)
7. [End-to-end pipeline](#7-end-to-end-pipeline)
8. [SLA and latency budget](#8-sla-and-latency-budget)
9. [Webhook contract (Q1-A)](#9-webhook-contract-q1-a)
10. [SQS payload](#10-sqs-payload)
11. [Prefetch and retrieval (not hosted RAG)](#11-prefetch-and-retrieval-not-hosted-rag)
12. [Burst merge (Q6)](#12-burst-merge-q6)
13. [LLM-1 — draft and cart operations](#13-llm-1--draft-and-cart-operations)
14. [CartEngine](#14-cartengine)
15. [Availability: stock vs made-to-order (Q14)](#15-availability-stock-vs-made-to-order-q14)
16. [Customer confirm vs vendor confirm (Q13)](#16-customer-confirm-vs-vendor-confirm-q13)
17. [LLM-2 — verifier (Q3, Q4)](#17-llm-2--verifier-q3-q4)
18. [Language (Q12)](#18-language-q12)
19. [Persist, WhatsApp queue, credits](#19-persist-whatsapp-queue-credits)
    - [19.1 Debit reconciliation (idempotent retry)](#191-debit-reconciliation-idempotent-retry)
20. [Human handoff (Q7)](#20-human-handoff-q7)
21. [Error management](#21-error-management)
22. [Scale (1000 vendors, millions of messages)](#22-scale-1000-vendors-millions-of-messages)
    - [22.1 Connection pooling (hard prerequisite)](#221-connection-pooling-hard-prerequisite)
23. [Observability](#23-observability)
    - [23.1 Quality evaluation loop](#231-quality-evaluation-loop)
24. [Schema changes](#24-schema-changes)
25. [Code layout](#25-code-layout)
26. [Tests (gate before replacing the old worker)](#26-tests-gate-before-replacing-the-old-worker)
27. [Dev/test cutover (Q11 locked)](#27-devtest-cutover-q11-locked)
28. [Later: live production cutover](#28-later-live-production-cutover)
29. [Implementation order](#29-implementation-order)
30. [What not to do](#30-what-not-to-do)

---

## 1. TL;DR

Build a **new** SQS-triggered Lambda that:

1. Owns vendor / customer / conversation / inbound message **upserts** (webhook only ACKs Meta and enqueues).  
2. Prefetches vendor, compact catalog, cart, insights, and recent turns **in parallel** before the model.  
3. Calls the vendor’s model **once** (LLM-1) to get **cart operations** + a draft reply — never a free-form “here is the whole cart” JSON list.  
4. Applies ops in **CartEngine** (Postgres is the only source of truth).  
5. Optionally calls LLM-2 to **rewrite copy only**.  
6. Renders WhatsApp text from the **cart snapshot** so the message and the dashboard cart always match.  
7. Persists order / insights / assistant message, **then** publishes `RESPONSE_QUEUE`, **then** deducts credits.  
8. Handles handoff (pause AI + notify vendor), metrics, and retries without dropping messages.

**Replace** `chatlogix-multi-stage-processor` **for text** in this development environment. Do not run the old multi-stage worker and the new processor on the same text queue (duplicate replies). Audio and image stay on other queues and are **out of scope** for this Lambda.

**RAG** is **keyword + compact catalog retrieval** inside this function. It is not a hosted agent that “calls APIs for us,” and it does not replace CartEngine.

---

## 2. Why rewrite

### 2.1 Latency (customers wait 20–40s)

The 14-stage pipeline already collapsed most AI stages into **one** OpenAI call (`unifiedAIProcessorService.ts`). Remaining delay is not “we need more GPT stages”:

| Cause | Effect |
|---|---|
| Incoming worker and AI worker sharing the text queue; incoming **does not delete** when multi-stage is on | Up to **30s visibility timeout** before AI starts |
| Full catalog with ~2000-character descriptions + `json_object` + `max_completion_tokens: 900` | 6–18s for a single completion |
| Order writes, validation, `StageExecutionLog` **before** WhatsApp enqueue | Extra 0.5–3s on the customer clock |
| Webhook → SQS → AI → SQS → WhatsApp | Extra hops; acceptable if the AI path is short |

Target: **p90 ≤ 5s, p95 ≤ 10s, p99 ≤ 15s** from SQS receive → publish on the response queue (not Meta’s delivery time).

### 2.2 Cart bugs (reply ≠ database)

Two sources of truth today:

1. LLM `response` text (what the customer sees).  
2. LLM `orderItems` interpreted by `extractAndSave` with a guessed `orderUpdateType`.

The unified schema does **not** require `orderUpdateType` or `quantityChanges`. Missing type defaults to `add_items` (quantities **sum** onto existing lines, or a “full cart” JSON is added again). Fallback `updateOrCreateOrder` **replaces** `Order.items` with this turn’s extract. `change_quantity` looks at `quantityChanges`, which the unified call often does not emit.

Typical failures:

- “Make it 5” → add 5 to 2, or wipe other products.  
- “Also add cookies” while the model listed the whole cart → doubled lines.  
- WhatsApp lists A, B; dashboard shows only B (or A, A, B).

**Fix:** the model proposes **ops** (`add` / `set_qty` / `remove`). Code applies them. The reply is rendered from the snapshot **after** apply.

### 2.3 Why not patch `extractAndSave`

The writer is already full of “CRITICAL FIX” branches that fight each other (AI as full cart vs add_items default vs replace). A new `backend/src/conversation/` runtime is cheaper than making that file the system of record.

---

## 3. Locked product decisions (Q1–Q15)

| ID | Decision |
|---|---|
| **Q1** | **A.** Webhook = ACK + enqueue. **This Lambda owns** vendor, customer, conversation, and inbound message upserts. Webhook keeps SQS-failure fallbacks (DB / file) as today. |
| **Q2** | **p90 ≤ 5s, p95 ≤ 10s, p99 ≤ 15s** to `RESPONSE_QUEUE` publish. |
| **Q3** | LLM-2 only if cart **mutated** OR `needsVerify` OR LLM-1 **confidence below threshold**. |
| **Q4** | LLM-2 may **rewrite copy only**. Never change the cart after `CartEngine.apply`. |
| **Q5** | **Text only.** Audio / image use other queues and other processors. |
| **Q6** | **A.** Merge burst messages into one turn (short window — see [§12](#12-burst-merge-q6)). |
| **Q7** | Handoff = `aiPaused = true` **and** notify the vendor. |
| **Q8** | **A.** Deduct credits **after** the reply is queued. Idempotent on `whatsappMessageId`. |
| **Q9** | Day-1 retrieval = **keyword + compact catalog**. No vector database. |
| **Q10** | Model = `Vendor.aiModel` (schema default `gpt-4.1-mini`). |
| **Q11** | **Dev/test, no live customers: replace the existing text processor.** No shadow queue, no vendor allowlist, no percentage rollout. |
| **Q12** | Reply in the **language/script of the customer’s latest message**. |
| **Q13** | Customer confirm requires **name + address + non-empty cart**. AI **never** sends an expected delivery date. ETA is sent **after the vendor confirms** in the dashboard. |
| **Q14** | Availability from **product** config: stock vs made-to-order (see [§15](#15-availability-stock-vs-made-to-order-q14)). |
| **Q15** | **Lightsail Postgres + VPC peering** now. RDS later. A **connection pooler** (PgBouncer on the VM) is still required in v1 so Lambda does not exhaust Postgres. |

---

## 4. Invariants

| # | Invariant |
|---|---|
| I1 | **Postgres cart is the only source of truth.** The model proposes operations. Code applies them. WhatsApp text is built from the snapshot after apply. |
| I2 | **Idempotency key = `whatsappMessageId`.** Redelivery must not create a second customer row, second debit, or second WhatsApp enqueue. |
| I3 | **One in-flight processor per conversation.** Redis lock. Two Lambdas must not mutate the same pending order. |
| I4 | **Fail closed on money and cart.** No credits / no lock / no product match → no silent cart rewrite. Prefer a customer-visible message over silence. |
| I5 | **Customer send is not blocked on metrics.** Quality scores, traces, and extra notifies run after (or parallel after) enqueue. |
| I6 | **Webhook returns to Meta in &lt; 3 seconds.** Never run the LLM on API Gateway. |
| I7 | **Never drop a message silently.** Retry, business-ACK with a reply, or DLQ + alarm. |

---

## 5. What this Lambda does and does not do

### Does (v1)

- Consume **text** SQS messages only.  
- Upsert vendor (lookup), customer, conversation, inbound `Message`.  
- Prefetch context, LLM-1, CartEngine, optional LLM-2, persist, enqueue WhatsApp, debit credits.  
- Handoff: pause AI + vendor notify.  
- Keyword product search for grounding.

### Does not (v1)

- Whisper / image caption (media worker + audio/image queues).  
- Import or call `multiStageOrchestrator.ts` on the hot path.  
- Hosted RAG / Assistants API as the cart database.  
- RDS migration.  
- Promise a delivery date at customer confirm.  
- Serve the vendor dashboard (dashboard **reads** the same `Order` rows).

### Reuse as-is

- `billingService.canProcessMessage` / `deductCredits` (extend for idempotency — [§24](#24-schema-changes)).  
- `humanHandoffService` (extend with vendor notify).  
- `whatsappTemplateService` (vendor notify pattern, e.g. `notifyVendorNewOrder`).  
- `publishToQueue` + `chatlogix-response-processor`.  
- Prisma `Order`, `Message`, `Vendor`, `Product`, `CustomerInsights`, `ConversationMemory`.  
- `productMatcher` **only** to resolve a name → `productId` before apply — not to invent cart lines from prose.

---

## 6. Place in the existing fleet

Keep the topology from `docs/DEPLOYMENT.md`. Swap **only** the text AI box.

```
WhatsApp
  → chatlogix-webhook-handler     (API Gateway + Lambda, ACK < 3s)
       publish TextMessage
  → SQS  TEXT_QUEUE_URL
  → ★ chatlogix-conversation-processor   (this spec)
       CartEngine + LLM-1 + optional LLM-2
  → SQS  RESPONSE_QUEUE_URL
  → chatlogix-response-processor
  → WhatsApp send

Audio / image
  → media-fetch → Whisper / caption → AUDIO / IMAGE queues
  → existing or future processors (NOT this Lambda)

DLQ: chatlogix-text-dlq-prod (maxReceiveCount = 3)
```

**Dev replace (Q11):**

1. Stop PM2 `chatlogix-multi-stage-ai-worker` and `chatlogix-incoming-worker` if they poll the text queue.  
2. Disable the **text** SQS trigger on `chatlogix-multi-stage-processor`. Leave audio/image triggers on the old function until those processors exist.  
3. Attach the text queue **only** to `chatlogix-conversation-processor` (or run the new worker locally against LocalStack).

Running both consumers on the text queue produces duplicate replies and/or the 30s visibility handoff delay.

---

## 7. End-to-end pipeline

Intent is unknown at the start. Prefetch the **hot set** immediately. Intent-specific extras run after LLM-1 only if needed.

```
SQS text record
  0. Parse + idempotency + Redis conversation lock
  1. Upsert vendor, customer, conversation, inbound Message
  2. Prefetch in parallel (Redis → Postgres)
  3. Guards: aiPaused | wallet ≤ 0 | duplicate whatsappMessageId
  3b. Burst merge (same conversation, ≤ 400ms)
  4. LLM-1  ops + draftReply + confidence + needsVerify
     model = Vendor.aiModel
  5. CartEngine.apply (transaction) → CartSnapshot
  6. LLM-2 if (mutation || needsVerify || confidence < T)
  7. Render final WhatsApp text from snapshot + last-message language
  8. Persist: order, insights, memory, assistant Message
  9. Publish RESPONSE_QUEUE          ★ SLA clock stops
 10. deductCredits
 11. Async: metrics, vendor notify (handoff / new order), sampled quality
```

### Step 0 — SQS → Lambda

AWS owns the subscription. The handler does not poll.

| Setting | v1 value | Why |
|---|---|---|
| Trigger | Text queue only | Q5 |
| Batch size | **1** at launch; max 5 after soak | One slow conversation must not stall others |
| Timeout | **60s** (finish target ≪ 15s) | 300s hides hangs |
| Visibility timeout | **360s** (6× 60s) | SQS + Lambda guidance |
| Partial failures | `ReportBatchItemFailures` | Don’t retry a whole batch |
| Runtime | Node.js 20 | Match deploy docs |
| Memory | **1536 MB** (tune later) | Prisma + OpenAI SDK |

### Step 1 — Identity and inbound message

Idempotent upserts:

1. Resolve vendor via `vendorId` or `WhatsAppNumber.phoneNumberId`.  
2. Upsert `Customer` on `phone`.  
3. Upsert open `Conversation` for that vendor + customer.  
4. Insert `Message` (`senderType = customer`, unique `whatsappMessageId`). Duplicate key → **success exit** (already processed or in flight).

Do not insert a second customer message on SQS retry.

### Step 3 — Guards (before paid LLM)

| Guard | Action |
|---|---|
| `conversation.aiPaused` | Store inbound, no LLM, no debit, ACK. Vendor replies in dashboard. |
| `walletBalance <= 0` | Template: service paused / vendor will reply. No LLM, no debit, ACK. |
| Redis `lock:conv:{id}` TTL 60s | If locked, throw → SQS retry. Do not interleave cart writes. |
| `whatsappMessageId` already `queued` / `processed` | ACK, no work. |

Credit **check** here; **debit** in step 10.

---

## 8. SLA and latency budget

**Clock:** start = Lambda invocation (SQS receive). Stop = successful `publishToQueue(RESPONSE_QUEUE_URL)`.

| Percentile | Target |
|---|---|
| p90 | ≤ 5s |
| p95 | ≤ 10s |
| p99 | ≤ 15s |

**Warm-path budget:**

| Step | Budget |
|---|---|
| 0–3 + prefetch | ≤ 200ms |
| Burst wait | ≤ **400ms** (never 2s) |
| LLM-1 | ≤ 3.5s |
| Cart apply + persist | ≤ 150ms |
| LLM-2 when it runs | ≤ 1.2s |
| Enqueue | ≤ 100ms |
| **Typical (LLM-2 skipped)** | **~4s** |
| **With LLM-2** | **~5–6s** (p95/p99; p90 depends on skip rate) |

p90 ≤ 5s **requires** skipping LLM-2 on greetings, thanks, and high-confidence `noop` (Q3). Provisioned concurrency is required in AWS so cold start does not dominate p90. Locally, ignore cold start; still log the same timestamps.

---

## 9. Webhook contract (Q1-A)

`chatlogix-webhook-handler` for **text**:

1. Verify Meta signature (unless local `DISABLE_WEBHOOK_SIGNATURE`).  
2. Resolve `phoneNumberId` → `vendorId` (cache).  
3. Publish `TextMessage` to the text queue. **`whatsappMessageId` is required.**  
4. Return HTTP 200 to Meta.  
5. If publish fails: existing fallbacks (`ensureConversation` + `Message` insert, then file log).

When SQS succeeds, the webhook **does not** create the canonical inbound `Message`. This Lambda is the writer. If fallback already inserted a row, upsert on `whatsappMessageId` is a no-op.

Optional (latency UX, not in SLA): Meta typing indicator / mark-as-read on webhook. This Lambda does not wait on it.

---

## 10. SQS payload

Compatible with current `TextMessage` bodies:

```json
{
  "type": "TextMessage",
  "vendorId": "uuid",
  "customerPhone": "+91...",
  "content": "make it 5 boxes",
  "phoneNumberId": "meta-phone-number-id",
  "whatsappMessageId": "wamid.xxx",
  "conversationId": null,
  "customerId": null,
  "messageId": null,
  "sourceMessageType": "text",
  "timestamp": "2026-09-01T06:00:00.000Z"
}
```

`conversationId` / `customerId` / `messageId` may be present if a fallback path already persisted. The processor **upserts**; it never assumes they are absent or present.

Ignore records that are not `type: TextMessage`. Audio/image must not be published to this queue.

---

## 11. Prefetch and retrieval (not hosted RAG)

### Hot set (always, in parallel)

Redis first, Postgres on miss:

| Cache key | TTL | Contents |
|---|---|---|
| `vendor:{id}:config` | 5–15 min | name, prompts, tone, delivery copy, timezone, `aiModel` |
| `vendor:{id}:catalog_compact` | invalidate on product write | `id, name, price, unit, minQty, maxQty, keywords, fulfillmentType, inStock, stockQuantity` — **no** long descriptions |
| `conv:{id}:memory` | 5 min | stage, facts, language |
| `conv:{id}:pending_order` | 60s | items, totals, address, name, status |
| `customer:{id}:{vendorId}:insights` | 15 min | name, address, preferred language |
| `conv:{id}:recent_messages` | 60s | last 6 turns |

After LLM-1, fetch extra only if needed: recent order history (`order_status` / `repeat_order`), extra SKUs from keyword search.

### Day-1 “RAG” (Q9)

- Keyword / trigram / existing matcher against the compact catalog (top 8–15 rows into the prompt or a `search_products` tool).  
- Optional: vendor FAQ / delivery policy **snippets** already stored on the vendor (not a vector index).  
- **No** Pinecone, OpenAI embeddings store, or “agent that calls all APIs” in v1.

**Multi-language matching is a Day-1 quality concern, not deferrable.** `productMatcher.findBestProductMatch` already has an AI multi-language fallback in production — before cutover, measure its hit rate against real (or representative synthetic) Tamil/Hindi/English customer phrasing, per language. Emit `ProductMatchMiss{language}` (EMF, see [§23.1](#231-quality-evaluation-loop)) from day one so the embeddings decision below is made from fleet data, not anecdote. Cheapest first mitigation: encourage/default vendors to populate multilingual `keywords` per SKU in the compact catalog (already a field above) — no infra change required.

Embeddings are a later phase, revisited only if the measured miss rate stays high after the keywords mitigation.

---

## 12. Burst merge (Q6)

Customers often send “hi” and “2 brownies” a second apart. Merge into **one** LLM turn.

A **2s** debounce would break p90 ≤ 5s. v1 rules:

1. **Same SQS batch, same `vendorId + customerPhone`:** concatenate `content` in timestamp order; one pipeline.  
2. **Debounce cap 400ms:** after lock, if Redis `burst:{convId}` has another body, append and consume it (the other record ACKs as merged).  
3. **Do not wait** if nothing is pending.  
4. If a second message arrives **during** LLM-1: lock → SQS retry → second run sees updated cart + new text.

---

## 13. LLM-1 — draft and cart operations

**One** chat completion (or Responses API equivalent). **Model:** `Vendor.aiModel`.

**Forbidden:** free-form `orderItems[]` as “the new full cart.”

**Required output** (strict JSON schema or tools):

```ts
type CartOp =
  | { type: 'add'; productId: string; qty: number; notes?: string }
  | { type: 'set_qty'; productId: string; qty: number } // absolute; 0 = remove
  | { type: 'remove'; productId: string }
  | { type: 'set_field'; field: 'address' | 'name' | 'notes' | 'delivery_date'; value: string }
  | { type: 'confirm' }
  | { type: 'cancel' }
  | { type: 'handoff' }
  | { type: 'noop' };

type Llm1Result = {
  language: 'en' | 'ta' | 'hi' | 'mixed';
  intent: string; // telemetry only — engine does not trust this for writes
  ops: CartOp[];
  draftReply: string;
  confidence: number; // 0–1
  needsVerify: boolean;
};
```

Rules:

- `productId` must come from the compact catalog or keyword search. Unmatched names → `noop` + clarify; **never** write a fuzzy unmatched line into `Order.items`.  
- `confirm` is still rejected by the engine if name, address, or items are missing.  
- `draftReply` ≤ ~120 words. Cap completion tokens (~400).  
- **Never** invent a calendar delivery date or “arrives on Tuesday.” Do not quote a promised ETA. Vendor-set ETA only ([§16](#16-customer-confirm-vs-vendor-confirm-q13)).  
- Preparation copy may use vendor `orderPreparationConfig.message` / generic “we’ll confirm timing” — still not a date.  
- Product names in the reply stay as cataloged (do not translate brand names).

Prompt contents: compact catalog or top-K hits, pending `CartSnapshot`, insights, last 6 turns, vendor tone/system prompt, last customer language.

---

## 14. CartEngine

Pure TypeScript, one Prisma transaction, heavily unit-tested. The LLM never writes `Order.items` JSON.

### Semantics

| Op | Effect |
|---|---|
| `add` | Same `productId` → **add** quantities. New id → new line. |
| `set_qty` | **Overwrite** quantity. `0` removes the line. |
| `remove` | Drop the line. |
| `set_field` | Name, address, notes (and stored preferred delivery **request** only if you persist it — still not `estimatedDelivery` from the model). |
| `confirm` | Allowed only if ≥ 1 item, customer name, and delivery address. |
| `cancel` | Only `pending` or `confirmed`. |
| — | **No** model-driven replace-all of `items`. |

Prices and units come from `Product` (and variants when present), not from the model.

Always write `OrderAuditLog` on mutation.

Return `CartSnapshot`:

```ts
type CartLine = {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPricePaise: number;
  lineTotalPaise: number;
  notes?: string;
};

type CartSnapshot = {
  orderId: string | null;
  status: string;
  items: CartLine[];
  totalPaise: number;
  customerName: string | null;
  address: string | null;
  missing: Array<'name' | 'address' | 'items'>;
};
```

WhatsApp product list **must** be generated from `items` after apply. That is how reply and dashboard stay aligned.

---

## 15. Availability: stock vs made-to-order (Q14)

Today `Product` has `inStock` and `stockQuantity`. Vendor-level `orderPreparationConfig` (`after_order` | `fixed_minutes` | `variable` | `ready_to_ship`) is **not** per SKU.

**v1 additive column:**

```text
Product.fulfillmentType   'stock' | 'made_to_order'   default 'made_to_order'
```

Default `made_to_order` matches bakeries and made-after-confirm vendors. Grocery-style vendors set `stock` on product details in the dashboard.

| `fulfillmentType` | On `add` / `set_qty` |
|---|---|
| `stock` | If `inStock === false` or `stockQuantity` is set and `< qty` → **reject the op**, tell the customer that item isn’t available. Do not write the line. |
| `made_to_order` | Do **not** block on `inStock`. Still enforce `minOrderQuantity` / `maxOrderQuantity`. |

The model must not claim “in stock / ships today” unless `fulfillmentType === 'stock' && inStock`. For `made_to_order`, use preparation wording without a date.

---

## 16. Customer confirm vs vendor confirm (Q13)

Two different events.

| Stage | Actor | Recommended `Order.status` | Customer WhatsApp |
|---|---|---|---|
| Building cart | Customer | `pending` | Snapshot; ask for missing name/address |
| Customer confirm | Customer said yes **and** name + address + items | `pending` (awaiting shop) **or** a dedicated customer-placed flag — **do not** set `estimatedDelivery` from AI | “Order placed. The shop will confirm and share delivery timing.” **No date.** |
| Vendor confirm | Vendor in dashboard | `confirmed` / `preparing` + vendor-set `estimatedDelivery` | Template / notify with **vendor** date or window |

v1 AI **must not** write `estimatedDelivery`. Only the vendor (or a later job after vendor confirm) sets it and triggers the ETA message.

Engine rejects `confirm` if `missing` is non-empty.

---

## 17. LLM-2 — verifier (Q3, Q4)

Run **if and only if**:

```
ops include add | set_qty | remove | set_field | confirm | cancel
OR needsVerify === true
OR confidence < VERIFY_THRESHOLD
```

Start `VERIFY_THRESHOLD` at **0.75**; tune from logs.

**Input:** draft reply, `CartSnapshot`, compact catalog facts.  
**Output:** `{ finalReply: string }` only.

If the verifier’s copy disagrees with snapshot lines or prices, **discard the copy** and use the engine renderer (list from `items`, totals from `totalPaise`).

LLM-2 must not emit ops and must not be parsed for cart fields.

Skip LLM-2 for greetings, thanks, and high-confidence `noop` so p90 can hit 5s.

---

## 18. Language (Q12)

Detect language/script from the **latest customer message**. Reply in that language (English, Tamil / Tanglish, Hindi / Hinglish, mixed → follow the last message’s dominant script).

`CustomerInsights.preferredLanguage` and memory are **fallback** only.

Keep catalog product names in their stored form.

---

## 19. Persist, WhatsApp queue, credits

### Step 8 — persist (before WhatsApp)

In one transaction (preferred):

- `Order` as applied  
- `CustomerInsights` (name, address, language)  
- `ConversationMemory` (stage, turn++, facts)  
- Assistant `Message` (`senderType = assistant`, token/cost fields)  
- Processing row: `queued` (see [§24](#24-schema-changes))

If enqueue (step 9) fails after persist, retry **must not** re-apply cart ops (idempotency).

### Step 9 — response queue

Same shape as `responseQueuingService` so `chatlogix-response-processor` stays unchanged:

```json
{
  "to": "+91...",
  "text": "finalText",
  "conversationId": "...",
  "vendorId": "...",
  "customerId": "...",
  "metadata": {
    "intent": "telemetry-intent",
    "processor": "conversation-v1",
    "traceId": "wamid.xxx"
  }
}
```

If the assistant row was already created in step 8, **do not** insert a second assistant message in the queuing helper (today’s helper also inserts — adjust so only one writer exists).

### Step 10 — credits (Q8-A)

Reuse `creditsForKind`:

| `sourceMessageType` | Credits (env defaults) |
|---|---|
| text / interactive | 1 |

This Lambda is text-only; audio (3) and image (2) belong to other processors.

- Guard already blocked `walletBalance <= 0`.  
- Debit **after** successful response-queue publish.  
- Unique on `whatsappMessageId` (additive schema) so retries do not double-charge.  
- Failed LLM / failed apply: **no debit**.  
- Queued then debit fail: see [§19.1](#191-debit-reconciliation-idempotent-retry) — do not hand-wave this as "retry debit," it needs an owner.

### 19.1 Debit reconciliation (idempotent retry)

Today `deductCredits` runs **before** AI generation and `CreditUsage` has no idempotency key — this Lambda reverses that ordering (Q8-A), so the retry-safety has to be built, not assumed:

1. **Idempotency key:** add `CreditUsage.externalId @unique` (schema change, see [§24](#24-schema-changes)), value = `whatsappMessageId`. Debit = `create`, catch the unique-violation, treat as already-debited (no-op, not an error).
2. **Inline attempt:** debit synchronously in the same invocation, immediately after the response-queue publish succeeds. This is the common path — a single cheap write, no async machinery needed for the happy case.
3. **Reconciliation sweep (confirmed: every 5 min):** if the inline debit write fails (Postgres blip), leave `MessageProcessing.status = 'queued'`. A scheduled sweep (cron / small Lambda, every 5 min) finds rows `status = 'queued' AND queuedAt < now - 2min` and retries the debit only — it must never re-enqueue WhatsApp, since the customer already received the reply.
4. **Alarm:** wire the existing `DebitFail` EMF metric ([§23](#23-observability)) to a real CloudWatch alarm (any sustained non-zero rate). At fleet scale, a silently stuck debit failure is compounding, invisible revenue leakage across thousands of vendors — this must page, not just log.

---

## 20. Human handoff (Q7)

Triggers:

- LLM-1 `handoff` op (customer asked for a human).  
- Policy: e.g. two consecutive hard processor failures on the same conversation.

Actions:

1. `Conversation.aiPaused = true`.  
2. Customer template (existing `humanHandoffService` copy).  
3. **Notify vendor** (WhatsApp template and/or existing notify path used for new orders) + dashboard sees paused conversation. Notify is fire-and-forget **after** customer enqueue.  
4. Later inbound messages: persist, **no LLM**, no debit.

---

## 21. Error management

**Highest priority** means: never drop, never double-send, never corrupt the cart. It does not mean unbounded GPT retries on the customer’s clock.

| Class | Examples | SQS / customer |
|---|---|---|
| Retryable | OpenAI 429/500, Postgres deadlock, lock not acquired | Throw → retry. Backoff via visibility. |
| Lock backend down | Redis connection error / timeout acquiring `lock:conv:{id}` | **Fail closed (I4)** — same as "lock not acquired": throw → SQS retry. Never fail open and skip locking; at fleet concurrency that risks two Lambdas mutating the same cart simultaneously. Alarm if sustained — this is a fleet-wide dependency, not a per-vendor one. |
| Business | Unknown product, confirm missing fields, stock reject | Reply explaining the issue. **ACK.** |
| Guard | `aiPaused`, no credits | Template. **ACK.** |
| Poison | Invalid JSON, unknown vendor | After 3 receives → **text DLQ** + alarm. Optional fallback customer text if identity is known. |
| LLM-1 timeout | &gt; 8s | If ops not applied: retry. If applied: render from snapshot, skip LLM-2 if needed. |
| WhatsApp send fail | Response Lambda | Existing retry. Assistant row already in DB. |

**Lock design detail (I3):** `SET lock:conv:{id} <token> NX PX 60000` — TTL matches the 60s Lambda timeout, so a crashed invocation's lock self-expires with no manual cleanup needed at fleet scale. Release only if the stored token matches the caller's, so a slow invocation can't delete a different invocation's lock after its own TTL lapsed. Redis used for locking should not share capacity with unrelated heavy workloads (e.g. rate-limiting) without explicit headroom. **Confirmed: single ElastiCache node for dev/test scope (Q11); revisit Multi-AZ before the [§28](#28-later-live-production-cutover) live production cutover.** See [§22.1](#221-connection-pooling-hard-prerequisite) for the equivalent Postgres-side call.

**Fallback copy** (processor failed after inbound stored, business path not available):

> Sorry — I’m having trouble right now. Please send that again, or wait for the shop to reply.

---

## 22. Scale (1000 vendors, millions of messages)

Worked example: **3M text messages/month** ≈ 1.2/s average. Peak 30–50× ≈ **40–60/s**. At ~8s duration that is **~320–480 concurrent Lambdas**.

| Risk | v1 mitigation |
|---|---|
| Prisma × N Lambdas exhausts Lightsail Postgres | **PgBouncer** (or RDS Proxy after RDS move). Prisma `connection_limit=1`. |
| VPC + OpenAI via NAT | Size NAT; keep prompts small (compact catalog). |
| Cold start vs p90 | Provisioned concurrency in AWS (start 5–10 in dev if needed; more in prod). |
| One vendor floods | Redis `inflight:{vendorId}` cap; excess stays in SQS. |
| Same customer double-tap | Conversation lock + burst merge. |
| Metric table explosion | Do **not** write 14 `StageExecutionLog` rows per message. Sampled quality (5–10%). EMF metrics. |

**Fairness:** Standard SQS (existing queues). Ordering via **per-conversation lock**, not FIFO.

**Q15:** stay on Lightsail Postgres + VPC peering. RDS is a later project; the pooler is still mandatory.

### 22.1 Connection pooling (hard prerequisite)

Confirmed against the codebase: PgBouncer does not exist anywhere in this repo or infra today, and `docs/LAMBDA_MIGRATION_PLAN.md` still lists the Postgres connection model as an **open, undecided** question. Given the ~320–480 peak concurrent Lambda estimate above, this is the single largest risk to the latency goal this rewrite exists to fix — an unpooled Postgres under that concurrency reintroduces the same customer-facing stall this document is meant to eliminate.

- **Sequence early.** Stand up PgBouncer before burst-merge/lock work ([§29](#29-implementation-order) — treat it as step 1, not a step-11-adjacent detail).
- **Config:** PgBouncer in **transaction pooling** mode; Prisma `connection_limit=1` per Lambda instance; PgBouncer's own pool sized against Lightsail Postgres's real `max_connections`, minus headroom for the dashboard API and any remaining PM2 workers. Verify the multiplex ratio (many Lambda-side connections → few real Postgres backends) empirically, not by assumption.
- **Fail fast, don't hang:** set a short Prisma connection-acquire timeout (2–3s). A DB slowdown under peak load must fail into an SQS retry, not hold a Lambda open to its 60s timeout — holding connections longer under load is exactly the thundering-herd pattern that makes an already-slow DB slower.
- **Gate:** dev cutover ([§27](#27-devtest-cutover-q11-locked)) requires PgBouncer live **and** a concurrency smoke test passing — not just single-message correctness tests.

---

## 23. Observability

Every log line includes `traceId = whatsappMessageId`, `vendorId`, `conversationId`.

**Timestamps to log (required for SLA):**

1. SQS receive / handler start  
2. Prefetch done  
3. LLM-1 done (`prompt_tokens`, `completion_tokens`, `model`)  
4. Cart apply done  
5. LLM-2 skipped | done  
6. Response queue published  

**CloudWatch / EMF:** `ProcessorSuccess`, `ProcessorError{class}`, `LatencyMs`, `Llm1Ms`, `Llm2Ms`, `Llm2Skipped`, `CartApplyFail`, `LockContention`, `LockUnavailable`, `DebitFail`, `DLQDepth`, `ProductMatchMiss{language}`.

**Alarms (when in AWS):** p90 &gt; 6s, p95 &gt; 10s, error rate &gt; 1%, DLQ &gt; 0, Lambda throttles, Postgres connection errors, `DebitFail` sustained non-zero, `LockUnavailable` sustained non-zero.

**Sampling:** `QualityMetrics` 5–10%. No per-stage DB log on the hot path.

### 23.1 Quality evaluation loop

Sampling alone (5–10% of millions of messages/month is still hundreds of thousands of transcripts) isn't a process by itself — it needs a defined loop so "quality improved" stays a measurable claim, not an impression:

1. **Always include** every `needsVerify = true` and below-`VERIFY_THRESHOLD` transcript in the judged set — smaller and higher-signal than the full sample.
2. **LLM-as-judge (confirmed: gpt-4.1-mini)** scores the full sampled set against a fixed rubric: cart-accuracy-vs-DB, correct language, no invented ETA/date, tone fit. Only judge-flagged failures escalate to human review — full manual review does not scale to thousands of vendors.
3. **Cadence (confirmed: weekly):** findings feed back into `VERIFY_THRESHOLD` tuning and prompt iteration ([§29](#29-implementation-order) step 14) on a recurring basis, not a one-time pre-launch pass.
4. **Per-vendor breakdown, not just fleet aggregate.** A healthy fleet-wide average can hide a subset of vendors (unusual catalog, heavier Tamil/Hindi mix) with a consistently bad AI experience — that's invisible in an aggregate number and a real churn risk at thousands-of-vendors scale.

---

## 24. Schema changes

Additive only. Dashboard continues to read `Order.items` JSON.

| Change | Why |
|---|---|
| `Product.fulfillmentType` `'stock' \| 'made_to_order'` default `'made_to_order'` | Q14 |
| `CreditUsage.externalId @unique` (value = `whatsappMessageId`) | Q8 retries — makes debit idempotent, see [§19.1](#191-debit-reconciliation-idempotent-retry) |
| `MessageProcessing` (recommended) | `status`: received \| locked \| llm1 \| applied \| verified \| queued \| failed; `attempt`; `errorClass`; `latencyMs`; token fields. `status='queued'` rows past a threshold drive the [§19.1](#191-debit-reconciliation-idempotent-retry) reconciliation sweep. |

Do not change `OrderStatus` enum in v1 unless product requires an explicit `awaiting_vendor` value; document the chosen mapping in code comments (`pending` = awaiting vendor is acceptable for v1).

Invalidate Redis `vendor:{id}:catalog_compact` on product create/update/delete.

---

## 25. Code layout

```
backend/src/conversation/
  handler.ts                 # SQS batch, ReportBatchItemFailures
  pipeline.ts                # steps 0–11
  prefetch.ts
  burstMerge.ts
  lock.ts
  idempotency.ts
  llm/
    llm1.ts
    llm2.ts
    prompts.ts
  cart/
    engine.ts
    snapshot.ts
    availability.ts          # stock vs made_to_order
    productResolve.ts        # name → productId
  persist.ts
  billing.ts                 # deduct after queue, idempotent
  handoff.ts                 # pause + vendor notify
  metrics.ts
  templates.ts               # no-credit, paused, fallback, handoff, confirm wait

backend/src/lambdas/handlers/conversationProcessor.ts   # re-export handler

backend/src/conversation/__tests__/
  cartEngine.test.ts
  availability.test.ts
  idempotency.test.ts
  goldenTranscripts.test.ts
```

**Do not** import `multiStageOrchestrator.ts`, `unifiedAIProcessorService.ts` (except as a temporary reference while writing prompts), or `extractAndSave` for cart writes.

Local run: a worker loop can call the same `pipeline.ts` against LocalStack `TEXT_QUEUE_URL` (same as today’s `npm run worker:multi-stage`, new entrypoint).

---

## 26. Tests (gate before replacing the old worker)

Must pass:

1. Existing cart has Brownie ×2 and Cookies ×1. Customer: “make the brownies 5.” → Brownie **5**, Cookies **1**. Reply lists both.  
2. Customer: “also add 2 cookies” with Cookies already 1 → Cookies **3**, other lines unchanged.  
3. Model emits a full cart as if it were `add` → engine still **adds** only the op’s `productId`s, does not replace.  
4. Confirm without address → rejected; customer asked for address; status stays `pending`.  
5. Confirm with name + address + items → placed; reply has **no** delivery date.  
6. `fulfillmentType = stock`, `inStock = false` → add rejected with unavailable copy.  
7. `fulfillmentType = made_to_order`, `inStock = false` → add allowed.  
8. Same `whatsappMessageId` twice → one inbound row, one assistant row, one enqueue, one debit.  
9. LLM-2 returns a list that omits a snapshot line → renderer uses snapshot, not LLM-2 list.  
10. `aiPaused` → no LLM, no debit.  
11. `walletBalance = 0` → template, no LLM, no debit.  
12. Burst two texts in one batch → one LLM-1 call, combined content.  
13. Inline debit write fails after successful enqueue → `MessageProcessing` stays `queued`; sweep retries debit once, exactly once (no double-charge, no second WhatsApp send).  
14. Redis lock backend unreachable → processor throws (fails closed), SQS retries; no cart mutation happens without a held lock.  
15. Same conversation, two concurrent invocations (simulated) → only one acquires the lock; the other retries and sees the post-apply snapshot.  
16. Product name in Tamil/Hindi script, present in catalog `keywords` → resolves to correct `productId` (regression guard for [§11](#11-prefetch-and-retrieval-not-hosted-rag) multi-language matching).

---

## 27. Dev/test cutover (Q11 locked)

This environment has **no live customers**. Replace, don’t dual-run.

Split into two gates — correctness is cheap to verify locally; latency-at-scale can only be verified on real AWS infrastructure, so don't let one block reporting on the other.

**Gate A — correctness (blocks cutover):**

- [ ] New pipeline + tests green (§26, including 13–16).  
- [ ] Stop `chatlogix-incoming-worker` and `chatlogix-multi-stage-ai-worker` (or disable their text poll).  
- [ ] Disable **text** trigger on `chatlogix-multi-stage-processor`.  
- [ ] Enable text trigger on `chatlogix-conversation-processor` **or** run the new local worker on `TEXT_QUEUE_URL`.  
- [ ] Send test WhatsApp texts.  
- [ ] Confirm **one** assistant message and **one** Meta send per inbound.  
- [ ] Confirm dashboard cart matches WhatsApp list.  
- [ ] Confirm credits move only after response enqueue (and the [§19.1](#191-debit-reconciliation-idempotent-retry) sweep recovers a simulated inline-debit failure).  
- [ ] Confirm handoff pauses AI and notifies the test vendor.  
- [ ] PgBouncer live; Prisma `connection_limit=1` confirmed ([§22.1](#221-connection-pooling-hard-prerequisite)).

**Gate B — latency-at-scale (confirmed: trails Gate A; does not block the dev/test cutover since Q11 is dev/test only — required before any [§28](#28-later-live-production-cutover) live production cutover):**

- [ ] Deployed to real AWS Lambda (not just local worker) with provisioned concurrency configured.  
- [ ] Synthetic load test: many distinct `vendorId`/`conversationId` pairs, ~40–60 msgs/sec sustained 10–15 min, p90/p95/p99 measured off real `RESPONSE_QUEUE` publish timestamps (not a handful of manual test messages).  
- [ ] Load test confirms no Postgres connection exhaustion and no Redis lock starvation under that concurrency.  
- [ ] p90 ≤ 5s / p95 ≤ 10s / p99 ≤ 15s confirmed on the load test, not just ad hoc samples.

**Rollback:** re-enable the old multi-stage text trigger / PM2 worker; disable the new one.

---

## 28. Later: live production cutover

When real vendors exist, do **not** replace 100% on day one. Use:

1. Webhook branch: allowlist vendor ids → new queue **or** percent hash of `conversationId`.  
2. Optional **shadow** (process, do not send) for 24–72h.  
3. Ramp 10% → 50% → 100%.  
4. Then disable the old text trigger.

That design is **out of scope** until there is production traffic. See conversation history / this section when going live.

---

## 29. Implementation order

1. **PgBouncer live** on the Lightsail VM + Prisma `connection_limit=1` verified ([§22.1](#221-connection-pooling-hard-prerequisite)) — sequenced first because every later concurrency test is invalid without it.  
2. Prisma: `fulfillmentType`, `CreditUsage.externalId`, `MessageProcessing` ([§24](#24-schema-changes)).  
3. `CartEngine` + availability + tests ([§26](#26-tests-gate-before-replacing-the-old-worker) 1–7).  
4. Prefetch + Redis keys + compact catalog builder; measure multi-language product-match rate ([§11](#11-prefetch-and-retrieval-not-hosted-rag)).  
5. LLM-1 schema/tools + prompts (language, no ETA, ops only).  
6. `pipeline.ts` persist → response queue → debit + [§19.1](#191-debit-reconciliation-idempotent-retry) reconciliation sweep.  
7. LLM-2 skip logic + copy-only parse.  
8. Burst merge, lock (fail-closed on Redis-down, [§21](#21-error-management)), idempotency tests ([§26](#26-tests-gate-before-replacing-the-old-worker) 13–16).  
9. Handoff + vendor notify.  
10. SQS handler / local worker entrypoint.  
11. Metrics timestamps + `LockUnavailable` / `ProductMatchMiss{language}` EMF.  
12. Gate A dev replace ([§27](#27-devtest-cutover-q11-locked)).  
13. Gate B latency-at-scale load test ([§27](#27-devtest-cutover-q11-locked)).  
14. Quality evaluation loop live ([§23.1](#231-quality-evaluation-loop)); tighten prompts from real test transcripts.

Do not start with embeddings, RDS, or audio/image.

---

## 30. What not to do

- Do not re-enable sequential stages 0, 1, 1.5, 4, 6 as separate OpenAI calls.  
- Do not treat RAG/LangChain/Assistants as the order system.  
- Do not let LLM-2 (or LLM-1 `orderItems`) overwrite `Order.items`.  
- Do not debit credits before a successful response enqueue.  
- Do not attach audio/image queues to this function.  
- Do not wait 2s to merge bursts.  
- Do not invent delivery dates at customer confirm.  
- Do not write full `StageExecutionLog` for every stage on every message.  
- Do not run incoming-worker and this processor on the same text queue.  
- Do not put the LLM on the webhook’s API Gateway timeout.  
- Do not skip PgBouncer or the Gate B load test before declaring the latency SLA met — a manual sample of test messages does not prove p90 ≤ 5s under fleet concurrency.  
- Do not fail open on a Redis lock error — an unreachable lock backend must retry via SQS, never proceed without a held lock.

---

## Appendix A — Credits (existing env)

From `backend/.env.example` / `env.ts`:

```
BILLING_TEXT_CREDIT=1
BILLING_AUDIO_CREDIT=3
BILLING_IMAGE_CREDIT=2
```

This Lambda charges **text** only, after enqueue.

---

## Appendix B — Current vs new (text path)

| | Current | v1 |
|---|---|---|
| AI calls | 1 fat JSON (+ unused stage code) | LLM-1 + optional LLM-2 |
| Cart write | `extractAndSave` interprets `orderItems` | `CartEngine.apply(ops)` |
| Reply | Model prose | Snapshot + optional polish |
| Persist inbound | Worker and/or webhook, duplicated | This Lambda (idempotent) |
| Credits | Often before AI (`messageProcessor`) | After response enqueue |
| Text consumer | `multiStageAIWorker` / multi-stage Lambda | `conversationProcessor` only |
| Catalog in prompt | Long descriptions | Compact / top-K |

---

## Appendix C — Open implementation details (not product questions)

These do not reopen Q1–Q15. Implementers may choose and document in code:

- Exact `VERIFY_THRESHOLD` after first test traces.  
- Whether customer-placed orders stay `pending` until vendor confirm (recommended) vs `confirmed` immediately.  
- Redis host (local / ElastiCache) for lock and catalog.  
- OpenAI JSON schema vs tool calling for LLM-1 (tools preferred if the SDK path is clean).  
- PgBouncer listen address on the Lightsail VM.
