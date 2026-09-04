# Incoming Response Generator — How We Prepare a WhatsApp Reply

**Living document.** This describes the **as-implemented** text path in `chatlogix-incoming-response-generator`, not the locked design spec. When the pipeline in `backend/src/conversation/` changes, update this file in the same change (see `.cursor/rules/incoming-response-generator-flow.mdc`).

| | |
|---|---|
| **AWS function** | `chatlogix-incoming-response-generator` |
| **Handler** | `backend/src/lambdas/handlers/conversationProcessor.ts` → `backend/src/conversation/handler.ts` |
| **Pipeline** | `backend/src/conversation/pipeline.ts` (`processMessage`) |
| **Consumes** | `TEXT_QUEUE_URL` (`type: TextMessage` only) |
| **Publishes** | `RESPONSE_QUEUE_URL` (finished customer text) |
| **Design spec** | `docs/CONVERSATION_PROCESSOR_LAMBDA.md` (locked design; this file follows the **code**) |
| **Last verified** | 2026-09-04 against `backend/src/conversation/` (updated same day for the phantom-mutation backstop in §9) |

**SLA clock:** Lambda start → successful `publishToQueue(RESPONSE_QUEUE_URL)`. Targets: p90 ≤ 5s, p95 ≤ 10s, p99 ≤ 15s. Meta delivery time is out of scope.

---

## Source files

| Step | File |
|---|---|
| SQS batch handler | `backend/src/conversation/handler.ts` |
| End-to-end orchestration | `backend/src/conversation/pipeline.ts` |
| Vendor / customer / conversation | `backend/src/conversation/identity.ts` |
| Redis conversation lock | `backend/src/conversation/lock.ts` |
| Inbound idempotency | `backend/src/conversation/idempotency.ts` |
| Burst merge | `backend/src/conversation/burstMerge.ts` |
| Hot-set prefetch | `backend/src/conversation/prefetch.ts` |
| LLM-1 prompt + schema | `backend/src/conversation/llm/prompts.ts` |
| LLM-1 call | `backend/src/conversation/llm/llm1.ts` |
| Cart apply | `backend/src/conversation/cart/engine.ts` |
| Availability | `backend/src/conversation/cart/availability.ts` |
| Refund eligibility | `backend/src/conversation/cart/refund.ts` |
| LLM-2 + final-text selection | `backend/src/conversation/llm/llm2.ts` |
| Handoff | `backend/src/conversation/handoff.ts` |
| Post-sales vendor alert | `backend/src/conversation/postSalesAlert.ts` |
| Persist turn | `backend/src/conversation/persist.ts` |
| Debit after enqueue | `backend/src/conversation/billing.ts` |
| Guard templates | `backend/src/conversation/templates.ts` |
| Shared types | `backend/src/conversation/types.ts` |
| Webhook enqueue | `backend/src/lambdas/handlers/webhookHandler.ts` |

---

## 0. Place in the fleet

This Lambda never talks to WhatsApp. The webhook ACKs Meta in &lt; 3s; the dispatcher sends the finished text.

```mermaid
flowchart LR
  WA[WhatsApp customer] --> WH[chatlogix-webhook-handler<br/>ACK Meta in under 3s]
  WH -->|TextMessage JSON| TQ[SQS TEXT_QUEUE]
  TQ --> IRG[chatlogix-incoming-response-generator<br/>THIS FUNCTION]
  IRG -->|finished WhatsApp text| RQ[SQS RESPONSE_QUEUE]
  RQ --> DISP[chatlogix-whatsapp-response-dispatcher]
  DISP --> WA
```

Webhook (`webhookHandler.ts`) for `type: text` only:

1. Resolve `phoneNumberId` → `vendorId` via `WhatsAppNumber`.
2. Publish `{ type: 'TextMessage', vendorId, customerPhone, content, phoneNumberId, whatsappMessageId }`.
3. Return HTTP 200 to Meta.

Audio/image are dropped at the webhook today (known gap). They must not land on this queue.

---

## 1. SQS handler

`handler.ts` implements `ReportBatchItemFailures`. All step 0–11 logic lives in `processMessage`; the handler only parses and delegates.

```mermaid
flowchart TD
  A[SQS event.Records] --> B[For each record]
  B --> C{JSON.parse body}
  C --> D{type == TextMessage?}
  D -->|No| E[Ignore record<br/>audio/image belong on other queues]
  D -->|Yes| F[processMessage]
  F -->|OK| G[ACK this record]
  F -->|throw| H[Add to batchItemFailures<br/>SQS retries this record only]
  E --> I[Return ReportBatchItemFailures]
  G --> I
  H --> I
```

---

## 2. Full `processMessage` pipeline

Actual code order (identity **before** lock — the spec’s “step 0 lock first” is not what shipped):

```mermaid
flowchart TD
  START([SQS TextMessage]) --> ID[1. resolveIdentity<br/>vendor + customer + open conversation]
  ID --> LOCK{2. acquire Redis lock<br/>lock:conv:conversationId TTL 60s}

  LOCK -->|LockContention| STASH[stashForBurstMerge<br/>Redis burst:convId 400ms]
  STASH --> RETRY[throw → SQS retry]
  LOCK -->|LockUnavailable Redis down| RETRY
  LOCK -->|OK| INB[3. upsertInboundMessage<br/>unique whatsappMessageId]

  INB -->|already exists| DUP[Success exit<br/>already processed, no second reply]
  INB -->|new row| PAUSED{4. conversation.aiPaused?}

  PAUSED -->|yes| STORE[Inbound stored, no LLM, no debit, no reply<br/>vendor answers in dashboard]
  PAUSED -->|no| CREDIT{5. canProcessMessage wallet?}

  CREDIT -->|blocked| EMPTY[Publish WALLET_EMPTY_TEMPLATE<br/>no LLM, no debit]
  CREDIT -->|allowed| BURST[6. mergeDebounced<br/>append any stashed sibling text]

  BURST --> TYPING[7. sendTypingIndicator fire-and-forget]
  TYPING --> PRE[8. prefetchHotSet in parallel]
  PRE --> LLM1[9. LLM-1: ops + draftReply]
  LLM1 --> CART[10. CartEngine.apply in one Postgres txn]
  CART --> BRANCH{11. Which reply path?}

  BRANCH -->|ops contains handoff| HO[triggerHandoff<br/>pause AI + canned customer copy]
  BRANCH -->|postSalesOutcome set| PS[renderPostSalesReply<br/>deterministic money copy]
  BRANCH -->|normal turn| LLM2[LLM-2 maybe, then selectFinalReply]

  HO --> FIN[12. finalizeTurn]
  PS --> FIN
  LLM2 --> FIN

  FIN --> PERSIST[persistTurn: assistant Message,<br/>insights, memory, MessageProcessing]
  PERSIST --> PUB[publish RESPONSE_QUEUE ★ SLA stop]
  PUB --> DEBIT[debitAfterEnqueue<br/>fail here does NOT retry the LLM]
  DEBIT --> NOTIFY[13. if confirm succeeded:<br/>notifyVendorNewOrder fire-and-forget]
  NOTIFY --> UNLOCK[finally: releaseLock]
  DUP --> UNLOCK
  STORE --> UNLOCK
  EMPTY --> UNLOCK
```

Lock is always released in `finally`. TTL (60s) is only a backstop.

---

## 3. Identity

`resolveIdentity()`:

```mermaid
flowchart TD
  IN[vendorId? + phoneNumberId + customerPhone] --> V{vendorId is a real Vendor.id?}
  V -->|yes| C[upsert Customer on phone]
  V -->|no / missing| W[WhatsAppNumber.phoneNumberId → vendorId]
  W --> C
  C --> CONV{open Conversation for vendor+customer?}
  CONV -->|yes| OUT[return vendorId, customerId, conversationId]
  CONV -->|no| NEW[create Conversation] --> OUT
```

If webhook copied Meta’s `phone_number_id` into `vendorId`, and that is not a UUID vendor row, lookup falls through to `WhatsAppNumber` instead of failing the record.

---

## 4. Guards (before any paid LLM call)

| Guard | Action |
|---|---|
| Duplicate `whatsappMessageId` | ACK. No second reply, no second debit. |
| `conversation.aiPaused` | Store inbound. Silent. Vendor replies in the dashboard. |
| Wallet empty (`canProcessMessage`) | Send `WALLET_EMPTY_TEMPLATE`. No LLM, no debit. |
| Redis lock held | `stashForBurstMerge`, then throw → SQS retry. |
| Redis down | Fail closed. Throw. SQS retry. Never mutate the cart unlocked. |

Credit is **checked** here and **debited only after** the reply is queued (`billing.ts`).

---

## 5. Burst merge

Customers often send two bubbles a second apart. Merge into one LLM turn without waiting.

```mermaid
flowchart LR
  A[Invocation A holds lock]
  B[Invocation B arrives]
  B --> C{lock taken?}
  C -->|yes| D[stash Redis burst:convId<br/>TTL 400ms then throw]
  A --> E[mergeDebounced: GET+DEL burst key]
  E --> F{stashed text?}
  F -->|yes| G[concat own content + stashed<br/>one LLM-1 call]
  F -->|no| H[proceed immediately<br/>never wait]
```

If a second message arrives *during* LLM-1, the lock forces an SQS retry; the next run sees the updated cart plus the new text.

`mergeSameBatch` exists for when SQS batch size &gt; 1; launch batch size is 1, so the active mechanism is the 400ms Redis stash.

---

## 6. Prefetch (hot set)

Intent is unknown, so everything is loaded before LLM-1. Redis first, Postgres on miss. Redis outage here degrades to cache-miss (unlike the lock).

```mermaid
flowchart TD
  MSG[mergedContent] --> P[Promise.all]
  P --> VC[vendor config<br/>name, prompts, tone, aiModel]
  P --> CAT[compact catalog<br/>active products + variants]
  P --> MEM[conversation memory]
  P --> INS[customer insights<br/>name, address, language]
  P --> REC[last 6 messages]
  P --> HIST[last 10 orders for this customer+vendor]
  P --> FAQ[FAQ vector search<br/>only if vendor has FAQs]
  INS --> PO[pending Order snapshot<br/>needs insights.name]
  VC & CAT & MEM & INS & REC & HIST & FAQ & PO --> HOT[HotSet]
```

FAQ path:

1. Cached count of active FAQs. Zero → skip embedding.
2. Embed the customer text (`faq/embedding.ts`).
3. Postgres cosine search, top-K (default 3), similarity ≥ threshold (default 0.75).

Pending cart is **prompt context only**. `CartEngine.apply` always re-reads Postgres. The 60s pending-order cache must never be trusted for a write.

After persist writes name/address, `invalidateCustomerContext` drops the insights + pending-order caches so the next turn does not re-ask.

---

## 7. LLM-1 — ops + draft, never the cart

One OpenAI call with strict structured output (`llm1JsonSchema`). Model = `Vendor.aiModel` (fallback `gpt-4.1-mini`). Temperature 0.3, `max_completion_tokens` 400.

System prompt (`buildLlm1SystemPrompt`):

- **Static** (prompt-cache prefix): bot identity, vendor rules, compact catalog table, variant SKU table, op rules.
- **Dynamic**: current cart, customer name/address, recent orders, matched FAQs, last 6 turns.

User message: merged customer text.

Required JSON (`Llm1Result`):

```ts
{
  language: 'en' | 'ta' | 'hi' | 'mixed',
  intent: string,          // telemetry only — never used to write the cart
  ops: CartOp[],
  draftReply: string,      // ~120 words, same language/script as the customer
  confidence: number,      // 0–1
  needsVerify: boolean
}
```

Ops:

| Op | Meaning |
|---|---|
| `add` | Sum qty onto that `productId` (+ `variantSku`) |
| `set_qty` | Absolute qty; `0` removes |
| `remove` | Drop the line |
| `set_field` | `name` / `address` / `notes` / `delivery_date` (advisory only; never a promised ETA) |
| `confirm` | Customer confirmed — engine still requires name + address + items |
| `cancel` | Live cart, or a past order via `orderNumber` |
| `refund_request` | Engine decides eligibility |
| `handoff` | Escalate to vendor |
| `noop` | Question / greeting / unclear product match |

After parse, ops whose `productId` is not in this turn’s compact catalog are **dropped** (`validateProductIds`). CartEngine still re-resolves every product from Postgres.

```mermaid
flowchart TD
  HS[HotSet] --> SYS[buildLlm1SystemPrompt]
  SYS --> API[OpenAI structured output]
  API --> PARSE[JSON.parse → Llm1Result]
  PARSE --> VAL[validateProductIds vs compactCatalog]
  VAL --> DROP[drop unknown productId ops]
  DROP --> OUT[ops + draftReply + confidence + needsVerify]
```

The model must not emit a full cart JSON list. It proposes **deltas**. Postgres is the only source of truth (I1).

---

## 8. CartEngine

`apply()` runs one Prisma transaction (`ReadCommitted`). Prices come from `Product` (and variants), never from the model.

```mermaid
flowchart TD
  OPS[LLM-1 ops] --> TX[Prisma transaction ReadCommitted]
  TX --> LOAD[Load pending Order + CustomerInsights.name]
  LOAD --> LOOP[For each op]

  LOOP --> ADD{add / set_qty / remove}
  ADD --> RES[resolveProduct from DB]
  RES --> VAR[resolveVariant if variantSku]
  VAR --> AVAIL[checkAvailability]
  AVAIL -->|fail| REJ[rejectedOps]
  AVAIL -->|ok| PRICE[price from Product/variant paise]
  PRICE --> LINE[mutate in-memory lines]

  LOOP --> FIELD[set_field → address/name/notes/delivery_date]
  LOOP --> CONF{confirm}
  CONF -->|missing name/address/items| REJ
  CONF -->|ok| PEND[status stays pending<br/>awaiting vendor — no ETA]
  LOOP --> CAN[cancel live or historical order]
  LOOP --> REF[refund_request + 7-day eligibility]
  LOOP --> SKIP[handoff / noop ignored here]

  LINE & FIELD & PEND & CAN & REF --> SAVE{mutated?}
  SAVE -->|yes + has items| WRITE[create/update Order + audit log]
  SAVE -->|set_field only, empty cart| NOORD[do not create a ₹0 phantom order]
  WRITE --> SNAP[CartSnapshot: items, total, missing, postSalesOutcome?]
  NOORD --> SNAP
```

**Availability:** `stock` products reject when `inStock=false` or qty &gt; stock. `made_to_order` is never blocked on stock. Both enforce min/max order quantity.

**Confirm:** requires name + address + ≥1 item. Status stays `pending`. AI never sets `estimatedDelivery`.

**Cancel / refund:** `orderNumber` is scoped to `customerId` + `vendorId`. Refund auto-approves only if status is `pending`/`confirmed` **and** placed within 7 days. Otherwise `postSalesOutcome: refund_denied`. CartEngine never sends messages; it only reports state.

`handoff` / `noop` are no-ops inside the engine. Handoff is handled in `pipeline.ts` after apply.

---

## 9. Choosing the customer-facing text

Three mutually exclusive paths. Money and handoff copy never go through a free-text rewriter.

```mermaid
flowchart TD
  A[applyResult + llm1Result.ops] --> H{ops contains handoff?}
  H -->|yes| H1[triggerHandoff]
  H1 --> H2[aiPaused = true]
  H2 --> H3[canned connecting-you-to-the-team copy]
  H3 --> H4[fire-and-forget vendor WhatsApp alert]
  H4 --> F[finalText]

  H -->|no| P{postSalesOutcome?}
  P -->|refund_approved / order_cancelled| T1[deterministic success sentence]
  P -->|refund_denied / not_cancellable| T2[deterministic denial + vendor alert]
  T1 --> F
  T2 --> F

  P -->|none| L[LLM-2 path]
  L --> Q{mutating op OR needsVerify<br/>OR confidence < VERIFY_THRESHOLD default 0.75?}
  Q -->|no| PM{ops empty AND intent is<br/>add/remove/set_qty AND draftReply<br/>names a catalog item not in snapshot?}
  PM -->|no| D[use LLM-1 draftReply as-is]
  PM -->|yes| MISS[renderPossibleMissedItemReply<br/>true cart + ask customer to repeat item]
  Q -->|yes| L2[LLM-2: rewrite wording only]
  L2 --> M{copy mentions every cart item name?}
  M -->|yes| L2OK[use LLM-2 finalReply]
  M -->|no| ENG[engine renderer from snapshot lines]
  D --> F
  MISS --> F
  L2OK --> F
  ENG --> F
```

Mutating op types that force LLM-2: `add`, `set_qty`, `remove`, `set_field`, `confirm`, `cancel`.

LLM-2 (when it runs): same vendor model, temperature 0.2, ~300 tokens. May rewrite wording only, and now also drops any claim about an item absent from CART SNAPSHOT. Cart is frozen after `apply`.

If LLM-2’s copy omits a product name, `selectFinalReply` falls back to `renderSnapshotReply` (deterministic line list + total).

**Phantom-mutation backstop** (added after a 2026-09-04 incident where LLM-1 confirmed adding an item in `draftReply` while emitting zero ops for it, and the empty-ops turn skipped LLM-2 entirely — see `docs/CONVERSATION_WORKER_GAPS.md` if a writeup exists, or the git history of `llm1.ts`/`llm2.ts`/`prompts.ts` around this date): `buildLlm1SystemPrompt` now explicitly requires every claim in `draftReply` to be backed by a matching op, and to set `needsVerify: true` whenever it isn't certain — this is the primary fix, and routes the turn through LLM-2 above via the existing `needsVerify` branch. As defense-in-depth for the case LLM-1 still doesn't set `needsVerify`, `selectFinalReply` (`llm2.ts`) also runs `isPhantomMutation` even on the `Q -->|no|` path: gated on `llm1Result.intent` being `add`/`remove`/`set_qty` (never fires on `query`-classified informational replies) and `ops.length === 0`, it checks whether `draftReply` names a vendor catalog product absent from the cart snapshot. On a hit, the reply is never trusted — the customer gets the true cart plus a prompt to repeat the item name, never a false confirmation.

---

## 10. Finalize — persist, queue, then debit

Order rows are already written by CartEngine. `finalizeTurn` is the back half.

```mermaid
flowchart TD
  FT[finalizeTurn] --> P[persistTurn transaction]
  P --> M[create assistant Message]
  P --> I[upsert CustomerInsights name/address/language]
  P --> MEM[upsert ConversationMemory stage + turn++]
  P --> MP[upsert MessageProcessing status=applied]
  M --> INV[if name/address written:<br/>invalidate insights + pending-order Redis]
  INV --> Q[publish RESPONSE_QUEUE]
  Q --> SLA[publishedAt = Date.now ★ SLA clock stop]
  SLA --> Q2[MessageProcessing status=queued]
  Q2 --> D[debitAfterEnqueue]
  D -->|ok| DONE[return publishedAt]
  D -->|fail| LOG[log DebitFail, do NOT rethrow]
  LOG --> DONE
```

Response payload includes `phoneNumberId` and `messageId` (assistant row) so the dispatcher uses the right WABA number and can mark delivery.

Debit failure must not throw: the customer already has a reply on the way; SQS retry would re-run LLM-1/CartEngine. `reconcileStuckDebits` retries `MessageProcessing` rows that are `queued` with `debitedAt = null`.

After finalize, if a `confirm` op was not rejected and the snapshot has an `orderId`, `notifyVendorNewOrder` runs fire-and-forget. Handoff already notified the vendor inside `triggerHandoff`.

---

## 11. What the customer receives, by scenario

| Customer said | LLM-1 ops | Engine | Reply source |
|---|---|---|---|
| “Hi” | `noop` | no mutation | LLM-1 draft (LLM-2 skipped) |
| “2 brownies” | `add` | new/updated line, priced from Product | LLM-2 polish, or engine list if copy disagrees |
| “Make it 5” | `set_qty` | overwrite qty | same |
| Name + address | `set_field` | insights later in persist | draft / LLM-2 |
| “Yes, place it” but missing address | `confirm` **rejected** | cart unchanged | draft should ask for the missing field |
| “Yes, place it” complete | `confirm` accepted | still `pending` | confirmation copy, **no delivery date** |
| “Where is my order?” | `noop` | none | draft grounded on RECENT ORDERS |
| “Cancel ORD-…” | `cancel` | cancel if pending/confirmed | canned `Order … has been cancelled` |
| “Refund please” ineligible | `refund_request` | `refund_denied` | canned denial + vendor alert, AI stays on |
| Complaint / return | `handoff` | ignored in engine | canned handoff + `aiPaused` + vendor alert |
| Wallet empty | — | — | `WALLET_EMPTY_TEMPLATE` |
| Vendor paused AI | — | — | **no reply** |

---

## 12. Latency budget

| Step | Budget |
|---|---|
| Identity, lock, guards, prefetch | ≤ 200ms |
| Burst merge | 0ms wait (400ms stash window only) |
| LLM-1 | ≤ 3.5s |
| Cart apply + persist | ≤ 150ms |
| LLM-2 when it runs | ≤ 1.2s |
| Enqueue | ≤ 100ms |
| Typical (LLM-2 skipped) | ~4s |

Skipping LLM-2 on greetings / thanks / high-confidence `noop` is required for p90 ≤ 5s.

---

## 13. Invariants

| # | Rule |
|---|---|
| I1 | Postgres cart is the only source of truth. Model proposes ops; code applies; WhatsApp text is built from the snapshot (or a canned template). |
| I2 | Idempotency key = `whatsappMessageId`. Redelivery must not create a second customer message, debit, or send. |
| I3 | One in-flight processor per conversation. Redis lock. Fail closed if Redis is down. |
| I4 | Fail closed on money and cart. No lock / no product match → no silent rewrite. |
| I5 | Customer send is not blocked on vendor notify or metrics. Those are fire-and-forget after enqueue. |
| I6 | Webhook returns to Meta in &lt; 3s. Never run the LLM on API Gateway. |
| I7 | Never drop a message silently. Retry, business-ACK (wallet template), or DLQ. |

---

## How to keep this doc current

Update this file in the **same change** as any behavioral edit to the files listed under [Source files](#source-files). Refresh:

1. Mermaid diagrams whose nodes/edges no longer match the code.
2. Step order in §2 if `processMessage` is reordered.
3. Tables in §4, §7, §11 if guards, ops, or reply sources change.
4. The **Last verified** date in the header.

Do **not** rewrite `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for implementation drift — that is the locked design. If code diverges from the spec, this flow doc follows the **code** and should note the divergence (as §2 already does for lock-vs-identity order).
