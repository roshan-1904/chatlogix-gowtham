# Incoming Response Generator — How We Prepare a WhatsApp Reply

<!-- DOC_SYNC
  last_verified_commit: 6797be1dcc141df16144a5ef8373e935ed14722a
  last_verified_at: 2026-09-14
  scope: As-implemented incoming-response-generator pipeline (language, LLM-2 reply selection, D6 order-status rewrite, knowledge_gap CustomerQuery persist, send_product_media outbound attachments, contentEn, voice-note ASR, compact-catalog paise heal, catalog baseQty pack pricing)
-->

**Living document.** This describes the **as-implemented** text path in `chatlogix-incoming-response-generator`, not the locked design spec. When the pipeline in `backend/src/conversation/` changes, update this file in the same change (see `.cursor/rules/incoming-response-generator-flow.mdc`).

| | |
|---|---|
| **AWS function** | `chatlogix-incoming-response-generator` |
| **Handler** | `backend/src/lambdas/handlers/conversationProcessor.ts` → `backend/src/conversation/handler.ts` |
| **Pipeline** | `backend/src/conversation/pipeline.ts` (`processMessage`) |
| **Consumes** | `TEXT_QUEUE_URL` (`type: TextMessage` only) |
| **Publishes** | `RESPONSE_QUEUE_URL` (finished customer text) |
| **Design spec** | `docs/CONVERSATION_PROCESSOR_LAMBDA.md` (locked design; this file follows the **code**) |
| **Doc sync index** | `docs/DOC_SYNC_INDEX.md` |

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
| Language helpers (English vs regional) | `backend/src/conversation/language.ts` |
| D6 order-status rewrite | `backend/src/conversation/orderStatusGuard.ts` |
| Knowledge-gap persist | `backend/src/conversation/customerQuery.ts` |
| Handoff | `backend/src/conversation/handoff.ts` |
| Post-sales vendor alert | `backend/src/conversation/postSalesAlert.ts` |
| Persist turn | `backend/src/conversation/persist.ts` |
| Product media resolve (PM6) | `backend/src/conversation/productMediaAttachments.ts` |
| Debit after enqueue | `backend/src/conversation/billing.ts` |
| Guard templates | `backend/src/conversation/templates.ts` |
| Shared types | `backend/src/conversation/types.ts` |
| Vendor English display | `backend/src/utils/vendorEnglish.ts` |
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

When the body is `type: TextMessage` and `sourceMessageType` is `audio` or `image` (media-fetch handoff of a voice transcript or caption), that field is forwarded to `processMessage` → LLM-1. Typed WhatsApp text omits it.

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
  ID --> LOCK{2. acquire Redis lock<br/>lock:conv:conversationId TTL 300s}

  LOCK -->|LockContention| STASH[stashForBurstMerge<br/>Redis list TTL 300s]
  STASH -->|stash ok| ACK[ACK SQS — lock-holder will coalesce]
  STASH -->|Redis down| RETRY[throw → SQS retry]
  LOCK -->|LockUnavailable Redis down| RETRY
  LOCK -->|OK| INB[3. upsertInboundMessage<br/>unique whatsappMessageId]
  INB --> EN[3b. ensureMessageContentEn<br/>fire-and-forget → Message.contentEn]

  EN -->|already exists| DUP[Success exit<br/>already processed, no second reply]
  EN -->|new row| PAUSED{4. conversation.aiPaused?}

  PAUSED -->|yes| STORE[Inbound stored, no LLM, no debit, no reply<br/>vendor answers in dashboard]
  PAUSED -->|no| CREDIT{5. canProcessMessage wallet?}

  CREDIT -->|blocked| EMPTY[Publish WALLET_EMPTY_TEMPLATE<br/>no LLM, no debit]
  CREDIT -->|allowed| BURST[6. collectCoalescedInbound<br/>merge unprocessed customer inbounds since last assistant reply]

  BURST --> TYPING[7. sendTypingIndicator fire-and-forget]
  TYPING --> PRE[8. prefetchHotSet in parallel]
  PRE --> LLM1[9. LLM-1: ops + draftReply]
  LLM1 --> NORM[9b. normalizeSetFieldOps<br/>name/address/notes → English/Latin]
  NORM --> CART[10. CartEngine.apply in one Postgres txn]
  CART --> BRANCH{11. Which reply path?}

  BRANCH -->|ops contains handoff| HO[triggerHandoff<br/>pause AI + canned customer copy]
  BRANCH -->|postSalesOutcome set| PS[renderPostSalesReply<br/>deterministic money copy]
  BRANCH -->|rejectedOps.length > 0| REJ[renderRejectedOpsReply<br/>skip LLM-2]
  BRANCH -->|order-status + deferral or no order number| D6[renderOrderStatusReply<br/>skip LLM-2, no CustomerQuery]
  BRANCH -->|normal turn| LLM2[LLM-2 maybe, then selectFinalReply]

  HO --> FIN[12. finalizeTurn]
  PS --> FIN
  REJ --> FIN
  D6 --> FIN
  LLM2 --> MEDIA[11b. resolve send_product_media<br/>PM6 caps + pending image/video Messages]
  MEDIA --> FIN

  FIN --> PERSIST[persistTurn: assistant text Message,<br/>insights, memory, MessageProcessing]
  PERSIST --> PMEDIA[persistPendingOutboundMedia if any]
  PMEDIA --> PUB[publish RESPONSE_QUEUE text + attachments[] ★ SLA stop]
  PUB --> DEBIT[debitAfterEnqueue text credits<br/>fail here does NOT retry the LLM]
  DEBIT --> KG[12b. persistKnowledgeGapIfNeeded<br/>after publish; no aiPaused]
  KG --> NOTIFY[13. if confirm succeeded:<br/>notifyVendorNewOrder fire-and-forget]
  NOTIFY --> UNLOCK[finally: releaseLock]
  DUP --> UNLOCK
  STORE --> UNLOCK
  EMPTY --> UNLOCK
```

Lock is always released in `finally`. TTL (300s, matches processor Lambda timeout) is only a backstop.

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
| Wallet insufficient (`canProcessMessage` with worst-case assistant turn: 1 text + max(3 images, 1 video)) | Send `WALLET_EMPTY_TEMPLATE`. No LLM, no debit. |
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

Compact catalog is loaded by `loadCompactCatalog` (its own cache, not the generic `cacheAside` helper). Cached compact prices that look like a 100× double conversion — every priced item ≥ ₹5,000 and a round hundred rupees (`paise >= 500_000` and `paise % 10_000 === 0`) — are ignored. Matching Postgres `Product.basePrice` rows are divided by 100 and persisted before the cache is rewritten. Prompt-only repair is not enough: CartEngine re-resolves prices from Postgres.

```mermaid
flowchart TD
  MSG[mergedContent] --> P[Promise.all]
  P --> VC[vendor config<br/>name, prompts, tone, aiModel]
  P --> CAT[compact catalog<br/>active products + variants]
  P --> MEM[conversation memory]
  P --> INS[customer insights<br/>name, address, language]
  P --> REC[last 6 messages]
  P --> HIST[last 10 orders for this customer+vendor]
  P --> FAQ[FAQ lexical + optional vector search]
  INS --> PO[pending Order snapshot<br/>needs insights.name]
  VC & CAT & MEM & INS & REC & HIST & FAQ & PO --> HOT[HotSet]
```

FAQ path:

1. Cached count of active FAQs. Zero → skip.
2. Lexical token overlap against the vendor's FAQ questions (always; works even if embeddings are missing).
3. Embed the customer text (`faq/embedding.ts`) and Postgres cosine search when pgvector is available.
4. Merge vector + lexical, top-K (default 3). Vector hits still need similarity ≥ threshold (default 0.75); lexical needs ≥ 0.34 token overlap.

`POST /api/faqs/reindex` backfills null embeddings. Create/update swallows embedding failures so the FAQ row still saves — the list API sets `embeddingPending` when `embedding IS NULL`.

Pending cart is **prompt context only**. `CartEngine.apply` always re-reads Postgres. The 60s pending-order cache must never be trusted for a write.

After persist writes name/address, `invalidateCustomerContext` drops the insights + pending-order caches so the next turn does not re-ask.

---

## 7. LLM-1 — ops + draft, never the cart

One OpenAI call with strict structured output (`llm1JsonSchema`). Model = `Vendor.aiModel` (fallback `gpt-4.1-mini`). Temperature 0.3, `max_completion_tokens` 400.

System prompt (`buildLlm1SystemPrompt`):

- **Static** (prompt-cache prefix): bot identity, vendor rules, compact catalog table (`id,name,price,unit,baseQty,…` — `price` is for `baseQty` of `unit`, not per gram when `baseQty` > 1), variant SKU table, op rules.
- **Dynamic**: current cart, customer name/address, recent orders, matched FAQs, last 6 turns. When `sourceMessageType` is `audio`, a **VOICE NOTE** block is appended: treat the user text as ASR, ask a clarifying question if it is garbled or off-catalog, and prefer CURRENT CART / RECENT ORDERS when the transcript is close (cake, brownie, kg).

User message: merged customer text.

Required JSON (`Llm1Result`):

```ts
{
  language: string,        // free-form ISO 639-1 (en, hi, ta, ml, kn, te, bn, gu, …) or "mixed"
  intent: string,          // telemetry only — never used to write the cart
  ops: CartOp[],
  draftReply: string,      // ~120 words, same language/script as the customer
  confidence: number,      // 0–1
  needsVerify: boolean
}
```

The JSON schema in `prompts.ts` uses `language: { type: 'string' }` — not a fixed enum. `conversation/language.ts` provides `isEnglishLanguage()` (pipeline branches on English vs non-English only) and `detectLanguageFromText()` (Unicode script detection: hi, ta, te, ml, kn, bn, gu, pa, or, si → en fallback). LLM-1 sets `language` from the customer message; insights/memory language is prompt context only.

Ops:

| Op | Meaning |
|---|---|
| `add` | Sum qty onto that `productId` (+ `variantSku`) |
| `set_qty` | Absolute qty; `0` removes |
| `remove` | Drop the line |
| `set_field` | `name` / `address` / `notes` / `delivery_date` (advisory only; never a promised ETA). **Values must be English/Latin script** — LLM-1 is prompted accordingly, and `normalizeSetFieldOps` transliterates before CartEngine so `CustomerInsights` / `Order` stay English-only for the vendor portal. |
| `confirm` | Customer confirmed — engine still requires name + address + items |
| `cancel` | Live cart, or a past order via `orderNumber` |
| `refund_request` | Engine decides eligibility |
| `handoff` | Escalate to vendor |
| `knowledge_gap` | Ungrounded product/policy fact — persist `CustomerQuery`, do **not** pause AI |
| `send_product_media` | Customer asked for photo/video — CartEngine no-op; pipeline resolves `ProductMedia` and enqueues native WA attachments (not on D6 order-status turns) |
| `noop` | Question / greeting / unclear product match |

After parse, ops whose `productId` is not in this turn’s compact catalog are **dropped** (`validateProductIds`) — including `send_product_media`. CartEngine still re-resolves every product from Postgres.

`knowledge_gap` is the one exception: its `productId` is advisory (it only links the `CustomerQuery` row to a catalog item), so an unknown id nulls the field instead of dropping the op — dropping it would lose the gap itself. Because the compact catalog is vendor-scoped, this is also what keeps a *real but other-vendor* product id out of `CustomerQuery.productId`; the `Product` FK on that column would happily accept one.

`validateProductIds` also drops an `add`/`set_qty` op for a product that has variants when `variantSku` is missing or names a variant not on that product — *unless* the compact catalog entry’s `isDivisible` is `true`, in which case a missing `variantSku` is a legitimate “add by base unit” op (e.g. a product sold both loose by weight and as fixed variants), not a hallucination. An explicitly wrong/invented `variantSku` is still always dropped regardless of `isDivisible`. (Fixed 2026-09-04: before this, `isDivisible` wasn’t in the compact catalog at all, so the prompt could never tell the model a divisible product’s base id was directly orderable, and this guard silently dropped every base-unit `add` for any variant-bearing product — see `prompts.ts`’s `baseOrderable` catalog column and its variant-table rules.)

```mermaid
flowchart TD
  HS[HotSet] --> SYS[buildLlm1SystemPrompt]
  SYS --> API[OpenAI structured output]
  API --> PARSE[JSON.parse → Llm1Result]
  PARSE --> VAL[validateProductIds vs compactCatalog]
  VAL --> DROP[drop unknown productId ops]
  DROP --> NORM[normalizeSetFieldOps for set_field values]
  NORM --> OUT[ops + draftReply + confidence + needsVerify]
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
  LOOP --> SKIP[handoff / knowledge_gap / noop ignored here]

  LINE & FIELD & PEND & CAN & REF --> SAVE{mutated?}
  SAVE -->|yes + has items| WRITE[create/update Order + audit log]
  SAVE -->|set_field only, empty cart| NOORD[do not create a ₹0 phantom order]
  WRITE --> SNAP[CartSnapshot: items, total, missing, postSalesOutcome?]
  NOORD --> SNAP
```

**Availability:** `stock` products reject when `inStock=false` or qty &gt; stock. `made_to_order` is never blocked on stock. Both enforce min/max order quantity.

**Confirm:** requires name + address + ≥1 item. Status stays `pending`. AI never sets `estimatedDelivery`.

**Cancel / refund:** `orderNumber` is scoped to `customerId` + `vendorId`. Refund auto-approves only if status is `pending`/`confirmed` **and** placed within 7 days. Otherwise `postSalesOutcome: refund_denied`. CartEngine never sends messages; it only reports state.

`handoff` / `knowledge_gap` / `noop` are no-ops inside the engine. Handoff and knowledge-gap persist are handled in `pipeline.ts` after apply.

---

## 9. Choosing the customer-facing text

Five mutually exclusive paths after `CartEngine.apply`. Money, handoff, rejection copy, and D6 order-status rewrites never go through a free-text rewriter.

```mermaid
flowchart TD
  A[applyResult + llm1Result] --> H{ops contains handoff?}
  H -->|yes| H1[triggerHandoff → canned copy + vendor alert]
  H1 --> F[finalText]

  H -->|no| P{postSalesOutcome?}
  P -->|yes| T[renderPostSalesReply deterministic]
  T --> F

  P -->|no| R{rejectedOps.length > 0?}
  R -->|yes| RJ[renderRejectedOpsReply<br/>English opener or draftReply + cart block]
  RJ --> F

  R -->|no| D6{order-status turn and<br/>draft is deferral or omits order number?}
  D6 -->|yes| D6R[renderOrderStatusReply from RECENT ORDERS<br/>log CustomerQueryBlockedOrder]
  D6R --> F

  D6 -->|no| L2[runLlm2 — may skip internally]
  L2 --> SEL[selectFinalReply]

  SEL --> S1{LLM-2 skipped?}
  S1 -->|yes + set_field only| SF[renderSetFieldConfirmation]
  S1 -->|yes + phantom mutation| PM[renderPossibleMissedItemReply]
  S1 -->|yes| D[use LLM-1 draftReply]
  S1 -->|no + copyMatchesSnapshot| OK[use LLM-2 finalReply]
  S1 -->|no + query/no mutation| Q[keep conversational reply — no cart dump]
  S1 -->|no + set_field only| SF2[renderSetFieldConfirmation]
  S1 -->|no + item mutation| MERGE[mergeLeadWithSnapshot<br/>draft/LLM-2 lead + grounded cart]

  SF --> F
  PM --> F
  D --> F
  OK --> F
  Q --> F
  SF2 --> F
  MERGE --> F
```

### When LLM-2 runs (`shouldRunLlm2`)

Runs when **any** of: mutating ops present (and not **set_field-only**), `needsVerify === true`, or `confidence < VERIFY_THRESHOLD` (default 0.75).

Mutating op types: `add`, `set_qty`, `remove`, `set_field`, `confirm`, `cancel`. **`set_field`-only turns skip LLM-2** — `shouldRunLlm2` returns false when every mutating op is `set_field`.

LLM-2 (when it runs): same vendor model, temperature 0.2, ~300 tokens. Rewrites wording only; drops claims about items absent from CART SNAPSHOT. Cart is frozen after `apply`. Prompt includes the LLM-1 `language` string and tells the model to answer the customer's question first, listing cart lines only when items changed or they asked to review the order.

### `selectFinalReply` branches (after LLM-2)

| Condition | Reply |
|---|---|
| LLM-2 skipped + `set_field` only | `renderSetFieldConfirmation` — English deterministic strings, or LLM-1 `draftReply` for non-English |
| LLM-2 skipped + phantom mutation (`intent` add/remove/set_qty, `ops` empty, draft names catalog item not in snapshot) | `renderPossibleMissedItemReply` — English prompt + true cart |
| LLM-2 skipped (otherwise) | LLM-1 `draftReply` as-is |
| LLM-2 ran + `copyMatchesSnapshot` | LLM-2 `finalReply` |
| LLM-2 ran + disagree + `query`/noop (no mutating ops) | Conversational LLM-2 or draft text — **no cart dump** |
| LLM-2 ran + disagree + `set_field` only | `renderSetFieldConfirmation` |
| LLM-2 ran + disagree + item mutation or `cartMutated` | `mergeLeadWithSnapshot` — conversational lead from draft or LLM-2, plus grounded cart block |

### `copyMatchesSnapshot` (English vs non-English)

- **English** (`isEnglishLanguage`): every catalog product name must appear in the reply text.
- **Non-English**: relaxed — snapshot total amount **and** all line quantities must appear (catalog names stay English in the product table, so name matching alone would false-reject valid regional replies).

### Deterministic renderers (no per-language string tables)

`renderSnapshotReply`, rejection openers, and phantom-mutation prompts use **English-only** deterministic strings. Non-English conversational prose always comes from LLM-1/LLM-2 `draftReply`. Pipeline logic uses `isEnglishLanguage()` only — not separate Tamil/Hindi/etc. template tables.

`renderSnapshotReply` always uses catalog English product names + `Total: Rs…`. For non-English customers, `mergeLeadWithSnapshot` appends the cart block without an English header; English customers get `Here's your updated order:` before the lines.

### D6 order-status path (`orderStatusGuard.ts`)

After apply, **before** LLM-2, if the turn is order-status (keywords such as status / where is it / last order / already ordered / eappo kidaikum / tracking, or cancel/refund ops) **and** `draftReply` looks like a deferral (“I’ll check / get back / still checking / Kanmani will confirm”) **or** does not cite an order number from `hotSet.orderHistory`:

1. Strip any `knowledge_gap` op (no-op until that CartOp exists).
2. Replace `finalText` with `renderOrderStatusReply` (order number + `ORDER_STATUS_LABELS` + English item names, or “no order on file”).
3. Skip LLM-2. Never create a Customer Query. Metric: `CustomerQueryBlockedOrder`.

Handoff still wins. Hypothetical prep (“how long if I order today”) with empty history is **not** D6.

### Knowledge-gap persist (`customerQuery.ts`)

After finalize (customer reply already queued), if there is **no** handoff and the turn is **not** D6 order-status:

- LLM-1 emitted `knowledge_gap`, **or** `draftReply` matches deferral phrasing (fallback).
- `toVendorEnglish` on the model question / customer text → `questionEn`. Dedup open rows for this vendor at cosine ≥ 0.85 (`hitCount++`); else insert.
- Never sets `Conversation.aiPaused`. Sandbox skips DB writes. After a new insert (not a hitCount bump), fire-and-forget WhatsApp ping to the vendor (Redis throttle: 1 / 15 min / vendor). Does **not** write `OrderAlert`.

Handoff + `knowledge_gap` on the same turn: handoff wins, no query.

### Rejected ops path (`renderRejectedOpsReply`)

When CartEngine rejects part or all of what was asked, the pipeline **never** runs LLM-2. Non-English customers with a usable `draftReply` get that lead plus a grounded cart block; English customers get a deterministic rejection opener plus cart lines.

**Phantom-mutation backstop** (defense-in-depth when LLM-1 claims an add in `draftReply` but emits zero ops): `buildLlm1SystemPrompt` requires ops to back every cart claim and sets `needsVerify: true` when uncertain. `selectFinalReply` also runs `isPhantomMutation` on the LLM-2-skipped path when `intent` is `add`/`remove`/`set_qty` and `ops` is empty.

---

## 10. Finalize — persist, queue, then debit

Order rows are already written by CartEngine. `finalizeTurn` is the back half.

```mermaid
flowchart TD
  FT[finalizeTurn] --> P[persistTurn transaction]
  P --> M[create assistant text Message content=finalText]
  P --> PM[persistPendingOutboundMedia<br/>pending image/video rows + productMediaId]
  M --> EN2[ensureMessageContentEn → contentEn if needed]
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

Response payload includes `phoneNumberId` and `messageId` (assistant text row) so the dispatcher uses the right WABA number and can mark delivery. Optional `attachments[]` (`messageId`, `productMediaId`, `kind`, `caption?`) — one pre-created `Message` per attachment; `chatlogix-whatsapp-response-dispatcher` presigns S3 and sends native image/video (see `docs/PRODUCT_MEDIA.md`). **`contentEn` is never sent to the customer** — only `finalText` (original language) goes on `RESPONSE_QUEUE` for the text bubble.

### Vendor portal English (`Message.contentEn`)

- **Inbound customer text:** after `upsertInboundMessage`, `ensureMessageContentEn` writes `contentEn` asynchronously (including when `aiPaused` — inbound is stored but no LLM runs). Original stays in `content`; LLM-1 and the response queue always use the original.
- **Assistant replies:** `persistTurn` sets `content` to `finalText` (customer language), then `ensureMessageContentEn` for the vendor thread.
- **Media:** `mediaFetchProcessor` transcribes voice notes with `gpt-4o-transcribe` (retry with a domain prompt if the transcript is implausibly short for the audio size; otherwise a typed-reply template and no AI enqueue). It sets `contentEn` from the transcript with the audio translation prompt (do not invent addresses/medical facts from garbled ASR) and from image/video/document captions (captions often never hit `TEXT_QUEUE`).
- **Vendor typed send:** `POST /api/conversations/:id/messages` triggers the same helper after creating the row.

Debit failure must not throw: the customer already has a reply on the way; SQS retry would re-run LLM-1/CartEngine. `reconcileStuckDebits` retries `MessageProcessing` rows that are `queued` with `debitedAt = null`. Outbound product media uses separate idempotent `debitOutboundMessage(messageId)` in the response dispatcher after each successful image/video send (`CreditUsage.externalId` = `outbound-msg:{messageId}`).

After finalize, if a `confirm` op was not rejected and the snapshot has an `orderId`, `notifyVendorNewOrder` runs fire-and-forget. Handoff already notified the vendor inside `triggerHandoff`.

---

## 11. What the customer receives, by scenario

| Customer said | LLM-1 ops | Engine | Reply source |
|---|---|---|---|
| “Hi” | `noop` | no mutation | LLM-1 draft (LLM-2 skipped) |
| “2 brownies” | `add` | new/updated line, priced from Product | LLM-2 polish, or engine list if copy disagrees |
| “Make it 5” | `set_qty` | overwrite qty | same |
| Name + address | `set_field` | insights later in persist | `renderSetFieldConfirmation` or draft (LLM-2 skipped) |
| “Yes, place it” but missing address | `confirm` **rejected** | cart unchanged | `renderRejectedOpsReply` — explains rejection + true cart |
| “Yes, place it” complete | `confirm` accepted | still `pending` | confirmation copy, **no delivery date** |
| “Where is my order?” / “Eappo kidaikum?” with a pending order | `noop` | none | `renderOrderStatusReply` if draft deferred or omitted the order number; otherwise LLM-1 draft |
| “Cancel ORD-…” | `cancel` | cancel if pending/confirmed | canned `Order … has been cancelled` |
| “Refund please” ineligible | `refund_request` | `refund_denied` | canned denial + vendor alert, AI stays on |
| “Does it include dividers?” (not in FAQ/desc) | `knowledge_gap` | ignored in engine | customer deferral + `CustomerQuery` row (AI stays on) |
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
3. Tables in §4, §7, §9, §11 if guards, ops, or reply sources change.
4. The `DOC_SYNC` HTML comment at the top (`last_verified_commit`, `last_verified_at`) and the matching row in `docs/DOC_SYNC_INDEX.md`.

Do **not** rewrite `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for implementation drift — that is the locked design. If code diverges from the spec, this flow doc follows the **code** and should note the divergence (as §2 already does for lock-vs-identity order).
