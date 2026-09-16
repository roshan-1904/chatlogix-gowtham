# Implementation Plan — `chatlogix-conversation-processor`

<!-- DOC_SYNC
  last_verified_commit: d16210b3664a8211a9dd31421c8dceadf0ee4def
  last_verified_at: 2026-09-11
  scope: Build plan and progress tracker for conversation processor; post-ship enhancements section tracks language/contentEn/LLM-2 updates
-->

## Context

`docs/CONVERSATION_PROCESSOR_LAMBDA.md` (v1.1, locked design) specifies a full rewrite of the WhatsApp **text** conversation processor to fix two problems: (1) latency — a dual-poller SQS race between `incomingMessageWorker.ts` and `multiStageAIWorker.ts` causes up to a 30s stall before the AI even starts, and (2) cart correctness — today's writer (`dataExtractionService.ts`) lets the LLM's free-form JSON overwrite `Order.items` directly, guarded by a pile of "CRITICAL FIX" branches that fight each other, causing quantities to double or lines to vanish. The fix is a new Lambda that has the model emit **ops** (`add`/`set_qty`/`remove`/etc.) which a new deterministic `CartEngine` applies transactionally — the model never touches `Order.items` directly, and the WhatsApp reply is always rendered from the post-apply snapshot so the customer's chat and the vendor's dashboard cart can never disagree.

This plan translates that spec (plus the v1.1 scale-hardening addendum already agreed with the user: idempotent debit reconciliation, PgBouncer as a hard prerequisite, fail-closed Redis locking, a two-gate latency validation process, Day-1 multi-language match measurement, and a weekly quality-eval loop) into an ordered, file-by-file build sequence, grounded against the actual current codebase — every reuse point below was verified against real file:line references, not assumed from the spec's prose. It follows §29's 14-step order exactly.

**Confirmed operational facts for this environment** (from the user): no live audio/image traffic today (safe to stop `worker:multi-stage` outright for cutover); `worker:text` (`textWorker.ts`) **is** actively running and must also be stopped at cutover; the two new periodic jobs (debit sweep, quality judge) will run as EventBridge-scheduled Lambdas; the two webhook DB-fallback paths will be patched to set `whatsappMessageId` so §9's idempotency invariant holds even on that rare path.

---

## Progress

| Step | Status | Notes |
|---|---|---|
| 1 — PgBouncer | **Done** (2026-09-04 install; Lambda cutover 2026-09-11) | Installed on the Lightsail box (transaction-pooling mode, port 6432). All five Lambda functions' `DATABASE_URL` points at **6432** with `?pgbouncer=true` and `connection_limit=1` (AWS CLI verified 2026-09-11). PM2 `chatlogix-backend` also uses PgBouncer. Confirm `default_pool_size` under load before Phase 2 — see `docs/LOAD_TESTING.md` §0. |
| 2 — Schema | **Code done, DB not migrated** | `schema.prisma` edited, `prisma validate` + `prisma:generate` both pass, new types confirmed in generated client. Migration SQL written but **not yet applied to any database** — deferred to deploy time per user decision, not blocking further implementation. |
| 3 — CartEngine | **Done** | `cart/{engine,snapshot,availability,productResolve}.ts` + `types.ts` written. 16/16 tests passing (`availability.test.ts` 8, `cartEngine.test.ts` 8, covering §26 tests 1–7 plus two extra correctness checks). `tsc --noEmit` clean. |
| 4 — Prefetch/compact catalog | **Done** | `prefetch.ts` + `cart/candidateSearch.ts` written. Cache invalidation wired into `routes/products.ts` (create/update/delete/bulk) and `catalogCommitService.ts` (bulk import commit). 28/28 tests passing across the whole `conversation/` module. `tsc --noEmit` clean. |
| 5 — LLM-1 | **Done** | `llm/{prompts,llm1}.ts` written; `cart/productResolve.ts` gained `validateProductIds`. 41/41 tests passing across the whole `conversation/` module. `tsc --noEmit` clean. |
| 6 — Persist/publish/debit + sweep | **Done** | `persist.ts`, `billing.ts`, `pipeline.ts` (skeleton — see status note), `lambdas/handlers/debitReconciliationSweep.ts` written. Schema gained one more additive field (`MessageProcessing.debitedAt`) beyond Step 2's original migration, not yet applied to any DB. 58/58 tests passing across the whole `conversation/` module. `tsc --noEmit` clean. |
| 7 — LLM-2 | **Done** (+ enhanced 2026-09-05) | `llm/llm2.ts` — see [Post-ship enhancements](#post-ship-enhancements-2026-09) for `selectFinalReply` / language / `set_field` skip updates beyond the original Step 7 scope. |
| 8 — Burst/lock/idempotency | **Done** | `burstMerge.ts`, `lock.ts`, `idempotency.ts` written; `sqsClient.ts`'s `receiveMessages` gained the planned optional `visibilityTimeout` param. 95/95 tests passing across the whole `conversation/` module, including a new `goldenTranscripts.test.ts` replaying spec §2.2's two motivating bugs end-to-end. `tsc --noEmit` clean. |
| 9 — Handoff | **Done** | `handoff.ts` written (`triggerHandoff` + internal `notifyVendor`). 100/100 tests passing across the whole `conversation/` module. `tsc --noEmit` clean. |
| 10 — Full orchestrator + SQS handler/worker | **Done** | `identity.ts` + `templates.ts` (new, not in the original file list — see status note), `pipeline.ts` gained the full `processMessage` orchestrator (spec §7 steps 0-11), `handler.ts`, `lambdas/handlers/conversationProcessor.ts`, `workers/conversationWorker.ts`, `worker:conversation` npm script. 122/122 tests passing across the whole `conversation/` module. `tsc --noEmit` clean. |
| 11 — Metrics/timestamps | **Done** | `metrics.ts` (thin wrapper over `observability/metrics.ts`) written; `pipeline.ts`'s `processMessage`/`finalizeTurn` retrofitted with all 6 required §23 timestamp checkpoints and the remaining metrics (`LatencyMs`, `Llm1Ms`, `Llm2Ms`/`Llm2Skipped`, `CartApplyFail`, `LockContention`, `LockUnavailable`, `ProcessorError{class}`). 129/129 tests passing across the whole `conversation/` module. `tsc --noEmit` clean. |
| 12–14 | Not started | |

---

## Step 1 — PgBouncer live (prerequisite, no application code)

Sequenced first because every later concurrency/latency claim is invalid without it (§22.1).

- Install PgBouncer in **transaction pooling** mode in front of the existing Lightsail Postgres.
- New Lambda's runtime env: `DATABASE_URL` → PgBouncer's listen port (not Postgres directly); `DATABASE_CONNECTION_LIMIT=1`; `DATABASE_POOL_TIMEOUT=2` or `3` (short fail-fast — `backend/src/db/prisma.ts:14-31` already reads both vars and injects them into the connection string as `connection_limit`/`pool_timeout` query params, but the *default* pool timeout is 20s, which does not give you fail-fast behavior — it must be explicitly overridden).
- Size PgBouncer's pool against Postgres's real `max_connections`, leaving headroom for `chatlogix-backend`, `chatlogix-media-worker` (the only two apps in `ecosystem.config.js`), and any manually-run `npm run worker:*` processes.
- Keep this env config scoped to the new Lambda/worker only — do not repoint the existing `backend/.env` used by `npm run dev` at PgBouncer with `connection_limit=1`, or the main API server starves.
- **Gate:** Gate A (step 12) requires PgBouncer live + a basic concurrency smoke test before cutover, not just single-message correctness tests.

---

## Step 2 — Prisma schema changes

### New migration file
`backend/prisma/migrations/add_conversation_processor_v1_schema.sql` — this repo does **not** use `prisma migrate dev`'s timestamped-folder history; `backend/prisma/migrations/` is a flat directory of hand-named `add_<description>.sql` files (e.g. `add_ai_paused_column.sql`), applied via `psql $DATABASE_URL -f <file>.sql` because this Supabase/Lightsail Postgres setup doesn't reliably grant shadow-DB permissions for `prisma migrate dev` (documented in `documentation/modules/features/multi-stage-ai/DATABASE_MIGRATION_MULTI_STAGE.md`). `npm run prisma:migrate` is hardcoded to `--name init` in `backend/package.json` — don't rely on it. Run `npm run prisma:generate` after applying.

### `schema.prisma` edits
1. **`Product`** (lines 330-363): add `fulfillmentType FulfillmentType @default(made_to_order)` near `inStock`/`stockQuantity` (lines 343-346).
2. New enum, matching the exact `OrderStatus` convention (lines 603-613 — PascalCase name, lowercase members, `@@map` same name):
   ```prisma
   enum FulfillmentType {
     stock
     made_to_order
     @@map("FulfillmentType")
   }
   ```
3. **`CreditUsage`** (lines 146-159, currently no unique constraint at all): add `externalId String? @unique` — nullable-but-unique, matching the `Message.whatsappMessageId String? @unique` precedent at line 125.
4. New model `MessageProcessing` + new enum `MessageProcessingStatus`:
   ```prisma
   model MessageProcessing {
     id                String                  @id @default(uuid())
     whatsappMessageId String                  @unique
     vendorId          String
     conversationId    String
     status            MessageProcessingStatus @default(received)
     attempt           Int                     @default(0)
     errorClass        String?
     errorMessage       String?
     latencyMs         Int?
     promptTokens      Int                     @default(0)
     completionTokens  Int                     @default(0)
     model             String?
     queuedAt          DateTime?
     createdAt         DateTime                @default(now())
     updatedAt         DateTime                @updatedAt
     vendor            Vendor       @relation(fields: [vendorId], references: [id], onDelete: Cascade)
     conversation       Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

     @@index([status, queuedAt], map: "idx_messageprocessing_status_queued")
     @@map("MessageProcessing")
   }

   enum MessageProcessingStatus {
     received
     locked
     llm1
     applied
     verified
     queued
     failed
     @@map("MessageProcessingStatus")
   }
   ```
   Field naming follows `StageExecutionLog`'s `promptTokens`/`completionTokens` convention (a per-attempt row), not `Message`'s `aiPromptTokens` naming (a per-turn row). **`queuedAt` is a deliberate addition beyond §24's literal field list** — §19.1's sweep query (`status='queued' AND queuedAt < now-2min`) needs a timestamp that moves only on the queued-transition; reusing `updatedAt` would also drift on unrelated retries, so it's not safe for the sweep predicate. Add back-relations `Vendor.messageProcessing MessageProcessing[]` and `Conversation.messageProcessing MessageProcessing[]`.
5. Do not touch `OrderStatus`. `pending` = awaiting-vendor for v1 (comment this in `persist.ts`, not in the schema).

### Migration SQL shape (native Postgres, matching repo convention)
**Correction from the original plan draft:** the repo's real precedent for this exact shape (new enums + new table + new columns + indexes) is `add_notification_system_simple.sql`, not a `DO $$ ... EXCEPTION` guard. It uses plain `CREATE TYPE` (with a comment noting "if it fails with already exists, that's okay — just continue," i.e. meant to be run once, not re-run), `IF NOT EXISTS` on tables/columns/indexes, and plain `ADD CONSTRAINT` for FKs (same "skip if it already exists" comment, no guard). The actual migration file was written to match this precedent exactly:
```sql
CREATE TYPE "FulfillmentType" AS ENUM ('stock', 'made_to_order');
CREATE TYPE "MessageProcessingStatus" AS ENUM ('received', 'locked', 'llm1', 'applied', 'verified', 'queued', 'failed');

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'made_to_order';

ALTER TABLE "CreditUsage" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CreditUsage_externalId_key" ON "CreditUsage"("externalId");

CREATE TABLE IF NOT EXISTS "MessageProcessing" ( /* full column list per model above */ );

ALTER TABLE "MessageProcessing" ADD CONSTRAINT "MessageProcessing_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageProcessing" ADD CONSTRAINT "MessageProcessing_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "MessageProcessing_whatsappMessageId_key" ON "MessageProcessing"("whatsappMessageId");
CREATE INDEX IF NOT EXISTS "idx_messageprocessing_status_queued" ON "MessageProcessing"("status","queuedAt");
```

### Status
- [x] `schema.prisma` edited: `Product.fulfillmentType`, `FulfillmentType` enum, `CreditUsage.externalId`, `MessageProcessing` model, `MessageProcessingStatus` enum, back-relations on `Vendor`/`Conversation`.
- [x] `npx prisma validate` passes.
- [x] Migration file written: `backend/prisma/migrations/add_conversation_processor_v1_schema.sql`.
- [x] `npm run prisma:generate` succeeded — the earlier `EPERM` lock was the `worker:multi-stage` process (3 chained node.exe PIDs) holding the query engine DLL open; stopped with the user's confirmation, then generate succeeded. New `MessageProcessing`/`FulfillmentType` types confirmed present in `node_modules/.prisma/client/index.d.ts`.
- [ ] **Next:** Migration SQL not yet applied to any database — that's a separate step (`psql $DATABASE_URL -f backend/prisma/migrations/add_conversation_processor_v1_schema.sql`) that touches real DB state and should be confirmed with the user before running, not bundled into writing the file. Note also: `worker:multi-stage` was stopped as a side effect of unblocking this step — restart it (`npm run worker:multi-stage`) if it's needed before Gate A cutover.

### Test coverage
None yet — confirm `npm run prisma:generate` produces the new client types before step 3.

---

## Step 3 — CartEngine + availability + tests

### New files
`backend/src/conversation/cart/{engine.ts, snapshot.ts, availability.ts, productResolve.ts}`
`backend/src/conversation/__tests__/{cartEngine.test.ts, availability.test.ts}`

### Signatures
```ts
// cart/engine.ts
export interface ApplyOpsInput {
  vendorId: string; conversationId: string; customerId: string;
  orderId: string | null;   // null → engine creates a new Order on first mutating op
  ops: CartOp[];
  traceId: string;          // whatsappMessageId, written into OrderAuditLog
}
export interface ApplyOpsResult {
  snapshot: CartSnapshot;
  mutated: boolean;
  rejectedOps: Array<{ op: CartOp; reason: string }>;
}
export async function apply(input: ApplyOpsInput): Promise<ApplyOpsResult>;
```
```ts
// cart/snapshot.ts
export function toCartSnapshot(order: { id: string; status: string; items: unknown } | null,
                                customerName: string | null, address: string | null): CartSnapshot;
```
```ts
// cart/availability.ts
export function checkAvailability(
  product: { fulfillmentType: 'stock'|'made_to_order'; inStock: boolean; stockQuantity: unknown;
             minOrderQuantity: unknown; maxOrderQuantity: unknown },
  requestedQty: number
): { allowed: boolean; reason?: 'out_of_stock'|'insufficient_stock'|'below_min_qty'|'above_max_qty' };
```
`CartOp`, `CartSnapshot`, `CartLine`, `Llm1Result` types are copied verbatim from spec §13/§14.

### Reuse
- Prisma transaction pattern — copy the **interactive-callback-with-options** shape exactly from `dataExtractionService.ts`'s `updateOrCreateOrder` (~lines 1782-1941): `prisma.$transaction(async (tx) => {...}, {isolationLevel:'ReadCommitted', maxWait:5000, timeout:10000}).catch(err => {logger.error(...); throw err;})`. Do not use `billingService.ts`'s simpler options-less form.
- `OrderAuditLog` model exists but has **zero** current writers anywhere in the codebase — `CartEngine.apply` is the first real one, write it fresh (`action`, `changes`, `previousState`, `newState`, `intent`) inside the same transaction.
- `Product.stockQuantity`/`minOrderQuantity`/`maxOrderQuantity` are Prisma `Decimal` — convert via `Number(...)` before comparing; `null` means "no limit," not zero.
- `generateOrderNumber(vendorId)` is duplicated privately in 4 files (`dataExtractionService.ts`, `aiService.ts`, `orderService.ts`, `orderEventProcessor.ts`) and never exported — add a small local copy inside `cart/engine.ts` rather than importing from any of those (avoids coupling to files this rewrite is explicitly replacing).

### What's new vs. adapted
100% new logic — none of `dataExtractionService.ts`'s mutator functions (`addItemsToOrder`, `removeItemsFromOrder`, `updateOrCreateOrder`, etc.) are called; only the transaction-wrapper *shape* is copied. `Order.items` today is written as `{product, quantity, unit, unitPrice, totalPrice, matchedProductId, notes}` — `CartLine`'s `{productId, name, quantity, unit, unitPricePaise, lineTotalPaise, notes}` is a renamed-but-equivalent shape in the same untyped `Json` column, so no migration is needed, but **old orders keep old key names with no discriminator field**. Accepted as a known, documented risk for this dev/test environment (no live customers per Q11); `whatsappTemplateService.ts:539` already degrades gracefully (`item.name || item.productName`) for mixed-shape rows, but don't assume every other `Order.items` reader does.

**Known v1 scope limit:** `CartOp.add`/`set_qty` carry only `productId`, with no variant selector, even though `Product.variants` (JSON) can hold multiple priced sub-items with no stable `id`. CartEngine prices strictly from `Product.basePrice`/`baseQuantity` in v1 and ignores `variants` — document this explicitly in code comments as an intentional out-of-scope call-out rather than a bug.

### Test coverage (§26 tests 1–7)
Existing cart mutation semantics (add sums quantities, set_qty overwrites, model-emitted "full cart" still only adds the op's own productIds), confirm-without-address rejected, confirm-with-all-three succeeds with no `estimatedDelivery` write, stock-vs-made_to_order availability gating. Follow `backend/src/utils/__tests__/productMatcher.test.ts`'s exact conventions: `vi.mock('../../logger.js', () => ({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn(),debug:vi.fn()}}))`, `vi.mock('../../db/prisma.js', () => ({prisma:{order:{...}, product:{...}, orderAuditLog:{...}, $transaction:vi.fn(...)}}))` stubbing only what's called, `beforeEach(() => vi.clearAllMocks())`.

### Status — Done
- [x] `backend/src/conversation/types.ts` — `CartOp`, `Llm1Result`, `CartLine`, `CartSnapshot`, `ProductForPricing`, shared by every file below.
- [x] `cart/availability.ts`, `cart/snapshot.ts`, `cart/productResolve.ts`, `cart/engine.ts` written per the signatures above.
- [x] `__tests__/availability.test.ts` (8 tests) + `__tests__/cartEngine.test.ts` (8 tests) — all 16 passing. Mock pattern for `prisma.$transaction` copied from the real precedent found in `backend/src/services/__tests__/catalogCommitService.dryRun.test.ts` (individual `vi.fn()`s wired into a `txStub`, `vi.mock` calls before the module-under-test import — `productMatcher.test.ts`'s simpler no-transaction pattern doesn't cover this case).
- [x] `npx tsc --noEmit` clean after one fix: `OrderAuditLog.previousState`/`newState` needed `Prisma.JsonNull` (a runtime value, not a bare `null`) for the "no previous state yet" case — a real Prisma quirk for nullable `Json` columns (`null` is ambiguous between "set JSON null" and "skip the field"), not something either the design doc or prior research called out.

**Two design decisions made during implementation, filling gaps the spec left implicit** (worth flagging since they weren't pre-agreed):
1. **Where `name`/`address` actually live.** `Order` has no `customerName` column (only `CustomerInsights.customerName` does), while `deliveryAddress` **is** an Order column. So `CartEngine.apply` reads the current name from `CustomerInsights` (read-only — `persist.ts` in Step 6 still owns writing it back, per §19) and writes/reads address directly on `Order.deliveryAddress`. `set_field field:'name'` updates the in-memory value used for this turn's snapshot and confirm-validation, but the actual `CustomerInsights` row isn't touched until Step 6.
2. **`cancel` on a nonexistent order is rejected**, not silently "succeeded" — the original sketch would have let `status` default to `'pending'` → `'cancelled'` even with no `Order` row to cancel, which is wrong. Added an explicit `no_order_to_cancel` rejection reason and a regression test for it.

---

## Step 4 — Prefetch, Redis keys, compact catalog, multi-language measurement

### New file
`backend/src/conversation/prefetch.ts`

```ts
export interface HotSet {
  vendorConfig: VendorConfig;
  compactCatalog: CompactCatalogEntry[];
  memory: ConvMemory | null;
  pendingOrder: CartSnapshot | null;
  insights: { name: string|null; address: string|null; language: string|null } | null;
  recentMessages: Array<{ role: 'customer'|'assistant'; content: string }>;
}
export async function prefetchHotSet(vendorId: string, conversationId: string, customerId: string): Promise<HotSet>;
```

### Reuse
- `getRedisClient()` (`backend/src/utils/redis.ts:10`) plus its `getCached`/`setCached`/`deleteCached` helpers for all 6 keys in spec §11's table. `getRedisClient()` never throws — returns `null` on failure — and `prefetch.ts` should treat that the same as a cache miss and fall through to Postgres (this is the one place in the new module where the codebase's existing graceful-degrade convention is correct to keep; contrast with `lock.ts` in step 8, where it must be inverted).
- The new `vendor:{id}:catalog_compact` cache is a **different** cache from `getCachedProductCatalog`/`cacheProductCatalog` (`backend/src/utils/cacheStrategy.ts:65-79`, key `product_catalog:{vendorId}`, TTL 3600s) — that one caches full product objects for `productMatcher`. Both coexist; comment the distinction in code so a future edit doesn't conflate them.
- Compact catalog builder: use `unifiedAIProcessorService.ts`'s `toonTable()`/`buildProductSection` (lines 73-129) as a **structural reference only**, not an import (that file is explicitly off-limits for reuse per §25 except as a prompt-writing reference). It's missing `id`, `fulfillmentType`, `inStock`, `stockQuantity` and formats price as a display string (`Rs600`) rather than raw paise — the new builder must include all of §11's listed fields and never be used by CartEngine for pricing (CartEngine always resolves prices from `Product` records directly, per §14).

### Cache invalidation (cross-cutting, not in §25's file list)
§24 requires invalidating `vendor:{id}:catalog_compact` on product create/update/delete. Locate the existing product CRUD route/service (likely `backend/src/routes/products.ts` or a `productService.ts`) and add a call to a new `invalidateCompactCatalog(vendorId)` helper there — this is a small edit outside `backend/src/conversation/`, easy to miss since §25 doesn't list it.

### Multi-language measurement (Day-1, not deferred — §11)
- Reuse `productMatcher.findBestProductMatch` (line 444) as-is — it already has an AI multi-language fallback (`config.enableAIMatching` + `config.customerLanguage`).
- Emit `ProductMatchMiss{language}` (via the metrics wrapper from step 11) whenever product resolution fails for a detected non-English message — wire this in `cart/productResolve.ts`, not `prefetch.ts`.
- Before Gate A: run a representative sample of Tamil/Hindi/English test phrases against a real vendor catalog's `keywords` field and record the miss rate as part of Gate A evidence.

### Gotcha
`conv:{id}:pending_order`'s 60s TTL is prompt context only, never the transaction input — on cache miss, rebuild from `Order` via `toCartSnapshot`; CartEngine always reads Postgres directly, never trusts a cached snapshot for the write path.

### Status — Done
- [x] `types.ts` extended with `VendorConfig`, `CompactCatalogEntry`, `ConvMemory`, `HotSet`.
- [x] `prefetch.ts` — `prefetchHotSet` (5 parallel cache-aside loaders + a 6th, `pendingOrder`, run after since it depends on `insights.name`), plus `invalidateCompactCatalog`. Exact key names/TTLs from §11's table; the `aiModel || 'gpt-4.1-mini'` fallback (Q10) is applied once here, so every downstream reader gets a valid model string.
- [x] Cache invalidation wired into all 4 product-write paths: `routes/products.ts`'s create/update/delete/bulk-action handlers, and `catalogCommitService.ts`'s `commit()` (bulk catalog import), guarded to skip dry runs and no-op commits.
- [x] Multi-language measurement: `cart/candidateSearch.ts`'s `searchCandidateProducts` wraps `productMatcher.findBestProductMatch` and emits `ProductMatchMiss` (dimensions: `language`, `processor`) on a miss for a non-English query — Day-1, not deferred, per §11.
- [x] 28/28 tests passing across the whole `conversation/` module (`prefetch.test.ts` 6, `candidateSearch.test.ts` 4, `productResolve.test.ts` 2, plus the 16 from Step 3). `tsc --noEmit` clean.
- [ ] **Not done, deliberately out of scope for this step:** the actual "run a representative Tamil/Hindi/English sample and record the miss rate" measurement (§11's Gate A evidence requirement) is an operational task for closer to Gate A, not code — `ProductMatchMiss` is now wired to make that measurement possible, but no sample has been run yet.

**One design correction made during implementation, worth flagging:** the first draft of `searchCandidateProducts` lived inside `cart/productResolve.ts` (matching this step's plan text literally). Running the test suite surfaced a real problem — `productMatcher.ts` pulls in `cacheStrategy.js` → `redis.js` (a real, eager Redis connection at import time) and `config/env.js` (real Firebase-config-check logging), so **every** `cartEngine.test.ts` run was transitively opening a live Redis connection and loading unrelated config, purely because `productResolve.ts` (imported by `cart/engine.ts`) now also imported `productMatcher.ts`. Split into a separate `cart/candidateSearch.ts` file so `CartEngine.apply` — which never calls `searchCandidateProducts` — keeps a minimal dependency footprint (Prisma types only) and its test suite stays hermetic. Also applied the same mock to the pre-existing `catalogCommitService.dryRun.test.ts` (which now transitively imports `prefetch.ts` via the new `invalidateCompactCatalog` call) for the same reason.

**Also confirmed while running the full suite:** 16 pre-existing test failures in `productMatcher.test.ts`, `conversationMemoryService.test.ts`, `memoryExtraction.integration.test.ts`, `messageSummaryService.test.ts`, and `dateRange.test.ts` are unrelated to this work — none of those files or their subjects were touched this session (`git status` confirms zero overlap). Not fixed as part of this step; flagged here so they aren't mistaken for a regression introduced by Step 4.

---

## Step 5 — LLM-1 schema/tools + prompts

### New files
`backend/src/conversation/llm/{llm1.ts, prompts.ts}`

```ts
export interface Llm1Input { vendorId: string; hotSet: HotSet; mergedContent: string; traceId: string; }
export async function runLlm1(input: Llm1Input): Promise<Llm1Result & { model: string; promptTokens: number; completionTokens: number }>;
```

### Reuse — with one important correction
- **Model resolution must follow `aiService.ts`'s pattern, not `unifiedAIProcessorService.ts`'s.** Confirmed bug: `unifiedAIProcessorService.ts` hardcodes `model: 'gpt-4o-mini'` at every call site and never reads `Vendor.aiModel`, despite Q10/§7 requiring `model = Vendor.aiModel`. `aiService.ts`'s (unexported, private) pattern is correct: fetch `vendor.aiModel` via Prisma, fall back with `vendorConfig?.aiModel || 'gpt-4.1-mini'`, pass the resolved string into `model:`. Reimplement this 3-line fallback locally in `llm1.ts` (it's private in `aiService.ts`, can't be imported).
- OpenAI client: `const openai = env.OPENAI_API_KEY ? new OpenAI({apiKey: env.OPENAI_API_KEY}) : null;` — same module-level-singleton pattern used at every other OpenAI call site in the codebase.
- Response format: use OpenAI structured outputs (`response_format: {type:'json_schema', json_schema:{...}, strict:true}`) rather than `json_object` mode — `json_object` is what `unifiedAIProcessorService.ts` uses today and is part of why untyped cart JSON became a problem; a strict schema enforces `Llm1Result`'s shape at the API level. (Appendix C leaves this open; this is the recommended choice, not a re-litigation of a locked decision.)
- Prompt structure: copy the **static-block (vendor identity + compact catalog + rules, cacheable) / dynamic-block (turn-specific context)** split from `unifiedAIProcessorService.ts` (lines 242-486) — structure only, not content.
- `cart/productResolve.ts` (from step 3) adds a hallucination guard: `validateProductIds(ops, compactCatalog)` — reject/`noop` any op whose `productId` isn't in the vendor's active catalog, even though the schema already constrains the shape. Never trust the model's IDs blindly.

### Test coverage
No dedicated §26 test targets LLM-1 in isolation (it's exercised via mocks inside `goldenTranscripts.test.ts` in step 8). Enforce `draftReply`'s ~120-word cap via `max_completion_tokens` (~400) in the API call itself, not just prompt instruction, to protect the ≤3.5s LLM-1 budget (§8).

### Status — Done
- [x] `llm/prompts.ts` — `buildCatalogTable` (TOON-style, includes `id` unlike `unifiedAIProcessorService.ts`'s builder), `buildLlm1SystemPrompt` (static vendor/catalog/rules block + dynamic per-turn block), `llm1JsonSchema` (OpenAI Structured Outputs, `strict: true`, `anyOf`-discriminated `CartOp` union).
- [x] `llm/llm1.ts` — `runLlm1`: builds the prompt, calls the model with the strict schema and a 400-token completion cap (spec §13's literal number), parses the response, runs the hallucination guard, returns `Llm1Output` (parsed result + `model`/`promptTokens`/`completionTokens`).
- [x] `cart/productResolve.ts` gained `validateProductIds(ops, compactCatalog)` — pure, dependency-free (no risk of repeating Step 4's Redis-leak problem), drops any `add`/`set_qty`/`remove` op whose `productId` isn't in the turn's compact catalog, before the ops ever reach the pipeline. `runLlm1` logs + emits `Llm1HallucinatedProductId` when this fires. `CartEngine.apply`'s own DB-level `resolveProduct` check (Step 3) remains the real backstop (I4) — this is a cheap pre-filter, not a replacement.
- [x] `types.ts`: widened `CartOp`'s `add.notes` and `CartLine.notes` from `string | undefined` to `string | null | undefined` — OpenAI's strict JSON Schema mode has no concept of a truly optional property (every property must be listed in `required`), only nullable, so the model always returns `notes: null` rather than omitting the key. Low-risk: existing `if (op.notes)`/truthy-check code in `cart/engine.ts` (Step 3) already treats `null` and `undefined` identically.
- [x] 41/41 tests passing across the whole `conversation/` module (`prompts.test.ts` 8, `llm1.test.ts` 5, plus the 28 from Steps 3–4). `tsc --noEmit` clean. Full backend suite re-run: same 5 pre-existing failing files / 16 failing tests as before this step (confirmed unrelated), 197 passing overall (up by exactly the 13 new tests here).

**One simplification enabled by Step 4, worth flagging since it changes what this step's plan text originally said:** the plan called for `llm1.ts` to "reimplement the 3-line `aiModel || 'gpt-4.1-mini'` fallback locally, since it's private in `aiService.ts`." That's no longer necessary — Step 4's `prefetch.ts` already resolves `hotSet.vendorConfig.aiModel` with that exact fallback applied once, so `llm1.ts` just reads `hotSet.vendorConfig.aiModel` directly. One fewer duplicated fallback in the codebase.

**Model/SDK details confirmed directly against the installed `openai@6.5.0` package** (not assumed from older examples elsewhere in the codebase, since a pre-existing test using this SDK for chat completions — `messageSummaryService.test.ts` — turned out to be one of the 5 pre-existing-broken files): `response_format: { type: 'json_schema', json_schema: { name, schema, strict } }` confirmed via `node_modules/openai/resources/shared.d.ts`; `max_completion_tokens` confirmed still the correct (non-deprecated) param name; `message.refusal?: string | null` confirmed present on the completion choice. The test file's own OpenAI mock (`vi.mock('openai', () => ({ default: vi.fn().mockImplementation(...) }))`) was written and verified to actually pass under this SDK version, rather than copied from the broken example.

**Vitest hoisting gotcha hit and fixed:** a `const` declared between two separate `vi.mock()` calls (or even before all of them, it turned out) can still throw `ReferenceError: Cannot access '...' before initialization` if a hoisted mock factory reads it — `vi.mock()` factories are hoisted and invoked at import time, ahead of ordinary top-level statements, in a way plain `const` hoisting doesn't protect against. Fixed by using `vi.hoisted(() => ({...}))` for every mock-fn declaration `llm1.test.ts` needs inside its `vi.mock()` factories, which is Vitest's documented mechanism for exactly this. Worth using `vi.hoisted()` by default in future test files here that mock more than one module with cross-referenced fixtures, rather than relying on declaration order.

---

## Step 6 — `pipeline.ts`: persist → response queue → debit + §19.1 reconciliation sweep

### New files
`backend/src/conversation/{persist.ts, billing.ts, pipeline.ts}`
`backend/src/lambdas/handlers/debitReconciliationSweep.ts` (EventBridge-scheduled Lambda, per the confirmed scheduling choice)

```ts
// persist.ts
export interface PersistInput {
  vendorId: string; conversationId: string; customerId: string;
  snapshot: CartSnapshot; finalText: string; language: string; intent: string;
  tokenMeta: { model: string; promptTokens: number; completionTokens: number };
  whatsappMessageId: string;
}
export async function persistTurn(input: PersistInput): Promise<{ assistantMessageId: string }>;
```
```ts
// billing.ts
export async function debitAfterEnqueue(vendorId: string, conversationId: string, whatsappMessageId: string): Promise<'debited'|'already_debited'>;
export async function reconcileStuckDebits(olderThanMs?: number): Promise<{ retried: number; succeeded: number; failed: number }>;
```

### Reuse
- `billingService.creditsForKind('text')` (line 48) — reuse as-is.

> **Implementation note (2026-09-16, millirupee rework):** `creditsForKind` and `deductCredits` were both deleted in the billing rework, so the "reuse" and "intentional short-term duplication" notes in this section are historical. `debitAfterEnqueue` now calls `pricingService.chargeVendor` (`backend/src/services/pricing/pricingService.ts`), the single writer of `Vendor.walletBalanceMilli`, and charges the turn's real cost in millirupees rather than a flat per-kind credit. The `externalId` + Prisma `P2002` idempotency pattern described below survived unchanged. Current model: [BILLING_AND_PRICING.md](./BILLING_AND_PRICING.md).
- `billingService.deductCredits` (line 141) is transactional but has **no idempotency key today**. `billing.ts`'s `debitAfterEnqueue` copies that transaction body and adds `externalId: whatsappMessageId` on the `creditUsage.create`, catching the Prisma `P2002` unique-violation as the "already debited" no-op branch. This is intentional short-term duplication of `deductCredits`, not a call to it.
- `Order`, `CustomerInsights`, `ConversationMemory`, `Message` — write directly via Prisma. **Do not call `responseQueuingService.queueResponse`** — confirmed it both creates the assistant `Message` row (lines 48-62) *and* publishes to `RESPONSE_QUEUE_URL` (lines 69-80), which is exactly the double-writer bug `multiStageAIWorker.ts:~108` has a comment documenting a prior fix for. `persist.ts` owns the single assistant-`Message.create` (mapping the same token/cost fields `queueResponse` uses: `aiTokensUsed`, `aiCostUsd`, `aiPromptTokens`, `aiCompletionTokens`, `aiPrimaryModel`, `aiModelBreakdown`, `aiCostEstimated`); a separate new publish step builds its own SQS payload.
- `publishToQueue` (`backend/src/queue/sqsClient.ts:15`) for the `RESPONSE_QUEUE` publish.

### RESPONSE_QUEUE payload — two corrections to spec §19's example JSON
Verified against `responseProcessor.ts`'s handler logic: §19's example is missing two fields that are required for correct downstream behavior.
1. **`phoneNumberId`** — without it, `responseProcessor.ts` falls back to an env default WABA number, which is wrong in a multi-number setup. It's already available on the inbound SQS `TextMessage` payload (§10) — thread it straight through, no extra lookup.
2. **`messageId`** (the assistant `Message.id` just created in `persist.ts`) — `responseProcessor.ts` only calls `markAssistantMessageSent`/`markAssistantMessageFailed` when this is present; omitting it silently loses delivery-status tracking.

```json
{
  "type": "text", "to": "+91...", "text": "finalText",
  "conversationId": "...", "vendorId": "...", "customerId": "...",
  "phoneNumberId": "meta-phone-number-id",
  "messageId": "assistant-message-uuid",
  "metadata": { "intent": "...", "processor": "conversation-v1", "traceId": "wamid.xxx" }
}
```

### §19.1 reconciliation sweep (EventBridge Lambda, per confirmed choice)
- **Inline attempt:** `pipeline.ts` calls `debitAfterEnqueue` synchronously right after publish succeeds. On failure: log `DebitFail` metric, leave `MessageProcessing.status='queued'` (already set during persist), do **not** rethrow — the customer already has their reply, so the SQS message must not retry (that would re-run LLM-1/CartEngine).
- **`debitReconciliationSweep.ts`**: new Lambda, triggered by an EventBridge scheduled rule (every 5 min, provisioned outside the repo same as the existing SQS trigger wiring) that queries `MessageProcessing.findMany({where:{status:'queued', queuedAt:{lt: new Date(Date.now()-2*60_000)}}})` and calls `reconcileStuckDebits` — retries the debit only, never touches `RESPONSE_QUEUE`.
- Wire the `DebitFail` EMF metric to a real CloudWatch alarm (infra step, alongside step 11).

### Test coverage (§26 tests 8, 13)
Idempotent on `whatsappMessageId` (one inbound row, one assistant row, one enqueue, one debit); inline debit failure → stays `queued`, sweep retries exactly once, no double-charge/no second WhatsApp send. Lands in `backend/src/conversation/__tests__/idempotency.test.ts` (created in step 8).

### Gotcha — accepted, not solved in v1
`Order.items` key rename (see step 3) applies here too: rows this pipeline writes use the new `CartLine` keys; rows written before cutover use the old ones. No discriminator field. Accepted for dev/test.

### Status — Done
- [x] `persist.ts` — `persistTurn`: one batched `prisma.$transaction([...])` (array form, not the interactive-callback form — no cross-statement reads needed here) writing the assistant `Message` (via `costCalculator.ts`'s `calculateCost`, already existing in the codebase, for `aiCostUsd`/`aiCostEstimated`), a `CustomerInsights` upsert (only overwrites `customerName`/`deliveryAddress`/`primaryDeliveryAddress` when the snapshot actually has them, always refreshes `preferredLanguage`), a `ConversationMemory` upsert (`turnNumber` starts at 1 on create, `{increment: 1}` on update; a small `deriveConversationStage` helper for an advisory stage label only — no write-path decision depends on it), and a `MessageProcessing` upsert to `status: 'applied'`.
- [x] `billing.ts` — `debitAfterEnqueue` (idempotent via `CreditUsage.externalId`, catching `Prisma.PrismaClientKnownRequestError` code `P2002` as the no-op branch) and `reconcileStuckDebits` (the §19.1 sweep query).
- [x] `pipeline.ts` — `finalizeTurn`: persist → publish (corrected payload, see below) → mark `queued`+`queuedAt` → debit (catches and does not rethrow, emits `DebitFail`). Explicitly a **skeleton**, not the full 11-step orchestrator — the front half (guards, burst merge, lock, LLM-2) doesn't exist yet (Steps 7–8), and wiring a full `processMessage()` now would mean forward-referencing functions that don't exist. The full orchestrator lands once Step 8's lock/idempotency and Step 10's handler exist.
- [x] `lambdas/handlers/debitReconciliationSweep.ts` — thin EventBridge-scheduled handler calling `reconcileStuckDebits()`. No `ScheduledEvent`/`EventBridgeEvent` type exists in the installed `@types/aws-lambda` version, so the handler takes no typed event parameter rather than depend on a type that isn't there.
- [x] RESPONSE_QUEUE payload corrected exactly as flagged in this plan: `phoneNumberId` and `messageId` both included, verified via a test that asserts the full publish payload shape.
- [x] 58/58 tests passing across the whole `conversation/` module (`persist.test.ts` 6, `billing.test.ts` 6, `pipeline.test.ts` 5, plus the 41 from Steps 3–5). `tsc --noEmit` clean. Full-suite regression check: same 5 pre-existing failing files as before (their exact failure count fluctuates ±1 between runs — confirmed by re-running twice unchanged — due to `messageSummaryService.test.ts` crashing as a whole file rather than failing individual assertions; unrelated to this work either way).

**One real correctness gap found and fixed while building this step, not just planned around:** the original design (both the spec and this plan's own earlier draft) had the reconciliation sweep query on `status = 'queued' AND queuedAt < threshold` alone. Building `reconcileStuckDebits` against `MessageProcessingStatus`'s actual enum values (`received|locked|llm1|applied|verified|queued|failed`) surfaced the problem directly: **there is no distinct terminal status for "successfully debited."** A row stays `'queued'` forever after a successful debit — so that query would keep re-matching every message ever successfully processed, forever, not just the rare stuck ones. Fixed by adding one more additive column, **`MessageProcessing.debitedAt DateTime?`** (schema.prisma + the still-unapplied migration file both updated, `prisma generate` re-run), set only on a successful debit; the sweep query is now `status='queued' AND debitedAt IS NULL AND queuedAt < threshold`. This is exactly the kind of gap the "flag anywhere the spec has an implicit assumption" instruction from the original planning phase was meant to catch — it just wasn't visible until the actual query got written against the actual enum.

**Two dependency-bleed leaks (same class as Step 4/5's, caught the same way — by watching test output, not by inspection):** `billing.ts` imports `services/billingService.js` for `creditsForKind`, which pulls in real `config/env.js` (Firebase-config-check logging at import time) — mocked out in `billing.test.ts`. No new Redis-connection leak this time; `billingService.ts` doesn't import `redis.ts`.

---

## Step 7 — LLM-2 skip logic + copy-only parse

### New file
`backend/src/conversation/llm/llm2.ts`

```ts
export function shouldRunLlm2(ops: CartOp[], needsVerify: boolean, confidence: number, threshold?: number): boolean;
export async function runLlm2(input: { draftReply: string; snapshot: CartSnapshot; vendorId: string; language: string }):
  Promise<{ finalReply: string; skipped: false } | { skipped: true }>;
```
- Mutation-triggering ops per §17: `add | set_qty | remove | set_field | confirm | cancel`. `VERIFY_THRESHOLD` default `0.75`, sourced from a new `EnvSchema` entry in `backend/src/config/env.ts` (default `'0.75'`) so it's tunable without a redeploy, per Appendix C ("tune from logs").
- Same OpenAI client / `Vendor.aiModel` resolution pattern as `llm1.ts`.

### Critical invariant — implement in code, not just prompt
"If the verifier's copy disagrees with snapshot lines or prices, discard the copy and use the engine renderer" (§17) must be an explicit post-parse validation in `pipeline.ts`'s render step (e.g. checking LLM-2's text against `snapshot.items` for line/price consistency), not just an instruction trusted at face value — this is the actual correctness backstop for invariant I1 and is easy to under-build as "just use LLM-2's text."

### Test coverage (§26 test 9)
"LLM-2 returns a list that omits a snapshot line → renderer uses snapshot, not LLM-2's list" — in `goldenTranscripts.test.ts` (step 8), with `llm2.ts` mocked to return a deliberately wrong list.

### Status — Done
- [x] `config/env.ts` gained `VERIFY_THRESHOLD: z.string().default('0.75')`, in its own "Conversation processor LLM-2 verifier" section, matching the existing "(Conversation Parity)" env-var grouping convention.
- [x] `llm/llm2.ts` — `shouldRunLlm2` (exported standalone, per the plan's signature) and `runLlm2` (calls `shouldRunLlm2` internally and short-circuits to `{skipped: true}`, so pipeline code has one call site instead of duplicating the skip decision). Same OpenAI client / strict structured-output pattern as `llm1.ts`, `max_completion_tokens: 300` for the §8 ≤1.2s budget.
- [x] The §17 correctness backstop is real code: `renderSnapshotReply`, `copyMatchesSnapshot`, and `selectFinalReply`. **Updated 2026-09-05:** on LLM-2 disagreement, `selectFinalReply` now branches on intent/ops (`query` → no cart dump; item mutation → `mergeLeadWithSnapshot`; `set_field`-only → `renderSetFieldConfirmation`) instead of always falling back to bare `renderSnapshotReply`. `copyMatchesSnapshot` uses English (all names) vs non-English (total + quantities) rules via `isEnglishLanguage`. `shouldRunLlm2` skips when every mutating op is `set_field`. See `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md` §9.
- [x] §26 test 9's exact scenario ("LLM-2 returns a list that omits a snapshot line") is directly covered now, in `llm2.test.ts`, rather than deferred to `goldenTranscripts.test.ts` in Step 8 — consistent with this plan's pattern (Steps 4–6 also added coverage beyond §26's literal minimum). Step 8's `goldenTranscripts.test.ts` can reference this instead of re-testing it in isolation.
- [x] 72/72 tests passing across the whole `conversation/` module (`llm2.test.ts` 14, plus the 58 from Steps 3–6). `tsc --noEmit` clean. Full-suite regression check: same 5 pre-existing failing files, 228 passing overall (up by exactly the 14 new tests).

**One scope decision worth flagging:** the plan's original sketch for `runLlm2`'s input didn't include a `model` field (spec text said "same `Vendor.aiModel` resolution pattern as `llm1.ts`" without spelling out exactly how that reaches the function). Since `llm1.ts`'s model resolution is just `hotSet.vendorConfig.aiModel` (already resolved with fallback by Step 4's `prefetch.ts`), the simplest, most consistent choice was to add `model: string` directly to `Llm2Input` rather than pass the whole `HotSet` in — the caller (the full pipeline orchestrator, not yet built) will pass `hotSet.vendorConfig.aiModel` through. Also skipped passing the compact catalog into LLM-2 (present in the spec's "Input" list) since `CartSnapshot.items` already carries every name/unit/price the verifier could need — it's a copy-editor, not a product-matcher.

---

## Step 8 — Burst merge, lock (fail-closed), idempotency tests

### New files
`backend/src/conversation/{burstMerge.ts, lock.ts, idempotency.ts}`
`backend/src/conversation/__tests__/{idempotency.test.ts, goldenTranscripts.test.ts}`

```ts
// lock.ts
export async function acquireLock(conversationId: string, ttlMs?: number): Promise<{ token: string }>; // throws on failure — fail-closed
export async function releaseLock(conversationId: string, token: string): Promise<void>;                // no-op on token mismatch
```
```ts
// idempotency.ts
export async function upsertInboundMessage(input: {
  vendorId: string; conversationId: string; customerId: string; content: string; whatsappMessageId: string;
}): Promise<{ messageId: string; alreadyProcessed: boolean }>;
```
```ts
// burstMerge.ts
export function mergeSameBatch(records: Array<{vendorId:string; customerPhone:string; content:string; timestamp:string}>): Map<string,string>;
export async function mergeDebounced(conversationId: string, content: string, capMs?: number): Promise<string>;
```

### Reuse / confirmed 100%-new
- **No lock/mutex helper exists anywhere in the repo** (confirmed by grep for `lock:conv`, `acquireLock`, `redlock`). `lock.ts` is entirely new: `SET lock:conv:{id} <token> NX PX 60000` via `getRedisClient()`'s raw `ioredis` instance, token via `crypto.randomUUID()`, release via a Lua script (GET+compare+DEL, atomic) so a slow invocation can't delete a different invocation's lock after its own TTL lapsed.
- **Fail-closed inversion (important):** `getRedisClient()` never throws — it returns `null` on failure, and the rest of the codebase treats `null` as "gracefully degrade." `lock.ts` must invert this: treat both `client === null` and a `SET`-command error/timeout as "Redis unreachable" → **throw** (fail closed per I4/§21), not silently proceed as if no lock were needed. Flag this prominently in code comments since it goes against the grain of every other Redis call site in the repo.
- **No existing helper does inbound idempotency correctly today.** `messageProcessor.ts`'s `storeIncomingMessage` creates a `Message` row **without ever setting `whatsappMessageId`** — confirmed by reading the `prisma.message.create` call directly. `duplicateMessageService.ts` is an in-memory `Set`, useless across Lambda invocations. `idempotency.ts`'s `upsertInboundMessage` must attempt `prisma.message.create({data:{...whatsappMessageId}})`, catch the `P2002` unique-violation, and on conflict `findUnique` the existing row, returning `alreadyProcessed:true`.

### Test coverage (§26 tests 12, 14, 15, 16, plus 8/13 from step 6)
Burst merge (one LLM-1 call for a merged batch); Redis lock backend unreachable → throws, SQS retries, no mutation; two concurrent invocations on the same conversation → only one acquires the lock; Tamil/Hindi product name in catalog `keywords` resolves correctly (exercises `productResolve.ts`/`findBestProductMatch` against a multilingual fixture catalog).

### Gotcha — `receiveMessages`'s hardcoded visibility timeout
`sqsClient.ts:41`'s `receiveMessages` hardcodes `VisibilityTimeout: 30` with no override param (LocalStack's `text-queue` is also created at 30s default in `scripts/init-queues.ts:94`). This is a non-issue for the real deployed Lambda (its SQS trigger manages visibility natively via the queue/event-source-mapping config, independent of this helper) but is tight for the **local worker** under a burst-merge+lock-retry+LLM sequence that could approach 15-30s at p99. Fix: add an optional `visibilityTimeout` param to `receiveMessages(queueUrl, maxMessages, visibilityTimeout?)` (additive, no existing caller breaks) and have the new local worker (step 10) pass e.g. 120s.

**Also note (informational, not a bug to fix):** with SQS batch size 1 at launch (§7 Step 0's table), burst-merge rule 1 ("same SQS batch") never actually triggers until batch size is later raised "after soak" — only the 400ms Redis-debounce rule (rule 2) is reachable at launch. Don't mistake the same-batch code path for dead code; it activates later.

### Status — Done
- [x] `sqsClient.ts`'s `receiveMessages` gained the planned optional `visibilityTimeout` param, defaulting to the prior hardcoded `30` so no existing caller's behavior changes.
- [x] `lock.ts` — `acquireLock`/`releaseLock`, `SET ... PX ... NX` + a token-checked Lua release script. Fail-closed as specified: both "no Redis client" and a `SET` command error throw. **Refinement beyond the plan's literal signature:** added two distinct error classes, `LockUnavailableError` (Redis down) and `LockContentionError` (Redis fine, key already held) — not in the original sketch, but necessary to make the already-planned `LockContention` vs `LockUnavailable` EMF metrics (§23, referenced in this plan's own Step 11 section) actually distinguishable by a caller via `instanceof`, rather than string-matching an error message.
- [x] `idempotency.ts` — `upsertInboundMessage`, create-then-catch-`P2002`-then-`findUnique` (not a Prisma `upsert`, since there's nothing to *update* on conflict — the original row is already correct in place).
- [x] `burstMerge.ts` — `mergeSameBatch` (pure, dormant until SQS batch size > 1) plus a **new pair not in the original plan's function list**, `stashForBurstMerge`/`mergeDebounced`. The plan only named `mergeDebounced`, but §12 rule 2 ("if Redis `burst:{convId}` has another body, append and consume it") has no mechanism to *populate* that key without a second function — the natural owner is the invocation that *lost* the lock race, stashing its content (short-TTL, matching the 400ms debounce cap) for the lock-holder to pick up. Documented in code as an explicit interpretation of an underspecified part of the spec; full wiring (an invocation calling `stashForBurstMerge` right before giving up on `LockContentionError`) happens in the full pipeline orchestrator, not yet built.
- [x] `goldenTranscripts.test.ts` — genuinely new value, not just a restatement of Step 3's per-op tests: replays spec §2.2's two motivating bugs ("make it 5", "also add cookies") as real **multi-turn** conversations against a small in-memory fake `Order` store, so state actually carries across successive `CartEngine.apply()` calls the way a real conversation would, rather than asserting against a single isolated call each time.
- [x] 95/95 tests passing across the whole `conversation/` module (`lock.test.ts` 8, `idempotency.test.ts` 4, `burstMerge.test.ts` 7, `goldenTranscripts.test.ts` 4, plus the 72 from Steps 3–7). `tsc --noEmit` clean. Full-suite regression check: same 5 pre-existing failing files, 251 passing overall (up by exactly the 23 new tests).

**Two fixes needed to make the code actually typecheck, both instructive:**
1. `LockUnavailableError` originally tried to attach the underlying Redis error via `this.cause = cause` (the standard `Error.cause`, ES2022) — this repo's `tsconfig.json` targets ES2021, so the built-in `Error` type has no `.cause` property here. Rather than widen the project's global `lib` setting for one file, dropped `cause` entirely — the underlying error is already captured via `logger.error` at the throw site, so nothing was actually lost.
2. `goldenTranscripts.test.ts`'s Prisma-transaction mocks were declared with explicit narrow implementations (e.g. `vi.fn(() => Promise.resolve(fakeOrder))`, zero args) rather than bare `vi.fn()` like every earlier test file's `txStub` — wrapping those in the usual `(...args: unknown[]) => mock(...args)` indirection doesn't typecheck once the mock's own inferred signature has zero parameters (spreading an unbounded array into a fixed-arity call). Fixed by referencing the mocks directly in `txStub` instead of through that wrapper, which was unnecessary indirection to begin with — a `vi.fn()` instance is already independently callable and reconfigurable.

**Two more dependency-bleed leaks caught the same way as Steps 4-7 (by reading test stdout, not by inspection):** none needed fixing in the new files themselves this time — `lock.ts`/`idempotency.ts`/`burstMerge.ts` are all appropriately narrow-dependency already — but `goldenTranscripts.test.ts` imports `llm2.js` (for `selectFinalReply`), which pulls in real `config/env.js` at import time (Firebase-config-check logging) purely because `llm2.ts`'s module-level `const openai = env.OPENAI_API_KEY ? new OpenAI(...) : null;` line runs on import even though `selectFinalReply` itself never touches the OpenAI client. Fixed with the same `vi.mock('../../config/env.js', ...)` pattern used in `llm1.test.ts`/`billing.test.ts`.

---

## Step 9 — Handoff + vendor notify

### New file
`backend/src/conversation/handoff.ts`

```ts
export async function triggerHandoff(input: {
  conversationId: string; vendorId: string; phoneNumberId: string; traceId: string;
}): Promise<{ customerMessage: string }>;
```

### Reuse
- `humanHandoffService.executeHandoff(conversationId, vendorId)` (`services/humanHandoffService.ts:18`) — reuse as-is for `aiPaused=true` + the canned customer message. Confirmed it does **not** notify the vendor today — only sets the flag.
- **Do not call `whatsappTemplateService.notifyVendorNewOrder`** — it's hardwired to an `orderId` (`prisma.order.findUnique`), which doesn't exist for a handoff event. Build a standalone `publishToQueue(env.RESPONSE_QUEUE_URL, {...metadata:{notificationType:'handoff_alert'}})` call instead, following that function's *pattern* (not calling it): `prisma.vendor.findUnique({select:{phone:true}})` for the destination number. `phoneNumberId` (the sending WABA number) doesn't need a fresh lookup — it's already available from the inbound SQS payload, threaded through pipeline context.

### Ordering (§20)
1. `aiPaused=true` via `humanHandoffService.executeHandoff`.
2. Customer template goes out as this turn's normal reply.
3. Vendor notify — fire-and-forget, *after* customer enqueue (I5: never block the SLA clock on this).
4. Subsequent inbound messages: `pipeline.ts`'s own `aiPaused` guard (step 3 of §7) stops LLM/debit — implemented fresh, not imported from the old worker.

### Test coverage
No dedicated §26 number, but Gate A's checklist (§27) requires manually confirming handoff pauses AI and notifies the test vendor — add a lightweight unit test for `triggerHandoff`'s payload shape as cheap insurance.

### Status — Done
- [x] `handoff.ts` — `triggerHandoff` reuses `humanHandoffService.executeHandoff` as-is for the `aiPaused=true` + canned customer message; a new internal `notifyVendor` builds a standalone `publishToQueue` payload (not a call to `notifyVendorNewOrder`, which is hardwired to an `orderId`), resolving only the vendor's own phone fresh (`phoneNumberId` — the sending WABA number — is already available from the inbound payload, threaded through as an argument).
- [x] **One correctness refinement beyond the plan's literal ordering:** `executeHandoff` can itself fail internally (it catches its own errors and returns `{success:false, message:"..."}` rather than throwing). `triggerHandoff` now only fires the vendor notify when `result.success === true` — notifying a vendor "conversation paused, check your dashboard" when the pause didn't actually take effect (AI would still be replying) would be actively misleading. Not explicitly called out in the plan's ordering list, but a direct consequence of reading `humanHandoffService.ts`'s real return contract rather than assuming it always succeeds.
- [x] 5 new tests in `handoff.test.ts`, including one exercising the fire-and-forget notify path (flushing a macrotask tick after `await triggerHandoff(...)` before asserting on `publishToQueue`, since the notify intentionally isn't awaited by the caller) and one confirming a notify failure never rejects `triggerHandoff` itself (I5).
- [x] 100/100 tests passing across the whole `conversation/` module. `tsc --noEmit` clean. Full-suite regression check: same 5 pre-existing failing files, 255 passing overall (up by exactly the 5 new tests).

**Process note, not a code issue:** hit the same "shell working directory silently reset to the repo root between Bash calls" problem from earlier in this session, which briefly made 3 of the 5 new tests appear to fail (a completely different, unmocked `humanHandoffService` ran for real against an incomplete Prisma mock). Re-ran with an explicit `cd .../backend &&` prefix and all 5 passed — confirmed via the second run that this was an environment artifact, not a bug in `handoff.ts` or its test. Worth remembering for the remaining steps: always prefix Bash commands with an explicit `cd` rather than trust persisted working directory.

---

## Step 10 — SQS handler / local worker entrypoint

### New files
`backend/src/conversation/handler.ts`
`backend/src/lambdas/handlers/conversationProcessor.ts` (thin re-export: `export { handler } from '../../conversation/handler.js';`)
`backend/src/workers/conversationWorker.ts` (new local entrypoint)
`backend/package.json` new script: `"worker:conversation": "cross-env WORKER_TYPE=conversation node --import tsx src/workers/conversationWorker.ts"` (matches `worker:multi-stage`'s `--import tsx` convention, not the older `--loader ts-node/esm` style).

```ts
// handler.ts
export const handler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse>; // implements ReportBatchItemFailures
```

### What's new vs. adapted
- **Deliberately does not copy `multiStageProcessor.ts`'s pattern.** That handler (385 lines) implements zero `ReportBatchItemFailures` anywhere (confirmed by repo-wide grep) — it's all-or-nothing via `Promise.allSettled` + throw-if-all-failed, with all logic inline in the handler file rather than delegated. The new `handler.ts` must return `{batchItemFailures: [{itemIdentifier: messageId}, ...]}` per-record — genuinely new ground for this codebase, follow the AWS `SQSBatchResponse` contract directly. Keep the handler thin: parse each record → call `pipeline.ts`'s single-message entrypoint → collect failures. All step 0-11 logic lives in `pipeline.ts`.
- **Local worker (`conversationWorker.ts`):** mirror `multiStageAIWorker.ts`'s polling-loop *shape* (receive → group-by-conversation → process → delete-on-success → sleep 1000ms if empty → outer catch sleeps 5000ms on error → `loop().catch(err => {logger.error(...); process.exit(1)})`), but call `pipeline.ts` directly instead of the old orchestrator+fallback chain. Only ever poll `getTextQueueUrl()` — unlike `multiStageAIWorker.ts`, never conditionally add audio/image queues (this worker is text-only per §5/§25).

### Test coverage
No dedicated §26 test; spot-check `ReportBatchItemFailures` behavior during Gate A. A light test asserting the batch-response shape given a mixed success/failure `pipeline.ts` mock is cheap insurance if time allows.

### Status — Done
This was the largest step so far — it's where every module from Steps 3-9 actually gets wired together for the first time.

- [x] **`pipeline.ts` gained `processMessage`**, the full orchestrator (spec §7 steps 0-11): resolve identity → acquire lock (fail-closed, stashing for burst-merge on contention specifically, not on a bare Redis outage) → idempotent inbound insert (success-exit on redelivery) → `aiPaused`/wallet guards → burst-merge debounce → prefetch → LLM-1 → `CartEngine.apply` → handoff-or-(LLM-2 + render) branch → `finalizeTurn` (persist/publish/debit) → fire-and-forget new-order vendor notify → lock released in a `finally`, always.
- [x] **`identity.ts` (new file, not in the plan's original list)** — `resolveIdentity`: vendor via `vendorId` or `WhatsAppNumber.phoneNumberId`, then customer + open-conversation upsert. **Deliberately not built by reusing the existing, functionally-identical `ensureConversation` in `messageProcessor.ts`** — that file instantiates `new AIService()` and `new EventOrchestrator()` at module load, and `AIService` alone pulls in a live OpenAI client plus `OrderService`/`ConversationStateService`/`CustomerInsightsService`. Importing it would have dragged that entire chain into this module's dependency graph — the same class of problem fixed in Steps 4/5/6/7/8, caught this time by inspection before writing a single test, rather than by watching test output.
- [x] **`templates.ts` (new file, but already named in the original spec's §25 code layout — just not called out in this plan's own Step 10 text)** — `WALLET_EMPTY_TEMPLATE`, `PROCESSOR_FALLBACK_TEMPLATE` (the latter not yet wired to a call site — no code path hits the generic fallback yet, kept for the day one does). No `aiPaused` template: §21's guard table is explicit that the pipeline sends **no** reply at all while paused — the vendor replies manually via the dashboard.
- [x] **The "vendor notify on new order" half of spec §7 step 11** (listed as "vendor notify (handoff / new order)") — not explicitly assigned to any single step in this plan, so it would have been silently dropped without deliberately pulling it in here. Reuses `whatsappTemplateService.notifyVendorNewOrder(vendorId, orderId)` exactly as-is (confirmed lightweight — only `prisma`/`sqsClient`/`env`/`logger`, no heavy chain like `messageProcessor.ts`), fire-and-forget, gated on `ops` actually containing a `confirm` that is **not** present in `rejectedOps` (i.e. it really succeeded, not just attempted).
- [x] `handler.ts` + `lambdas/handlers/conversationProcessor.ts` (thin re-export) — implements `ReportBatchItemFailures` for real, the AWS `SQSBatchResponse` contract this codebase had zero prior examples of (confirmed by grep against `multiStageProcessor.ts`, which is all-or-nothing).
- [x] `workers/conversationWorker.ts` + `worker:conversation` npm script — mirrors `multiStageAIWorker.ts`'s polling-loop shape (receive → process → delete-on-success → sleep-if-empty → outer-catch-sleeps-longer), calling `pipeline.processMessage` directly, text-only, using Step 8's new `visibilityTimeout` override (120s).
- [x] 122/122 tests passing across the whole `conversation/` module (`identity.test.ts` 7, `handler.test.ts` 5, 10 new `processMessage` tests folded into `pipeline.test.ts` alongside the existing 5 `finalizeTurn` tests). `tsc --noEmit` clean on the first pass this time. Full-suite regression check: same 5 pre-existing failing files, 278 passing overall.

**Known gaps deliberately deferred, not silently dropped — flagged here so they're tracked rather than forgotten:**
1. **LLM-1's explicit ≤8s timeout handling (§21's "LLM-1 timeout" error class)** isn't implemented as its own wrapper — the OpenAI call in `llm1.ts` has no explicit `AbortSignal`/timeout race. In practice a hang still eventually surfaces via the Lambda's own 60s timeout or the OpenAI SDK's default timeout, just not exactly at the spec's 8s mark with the specific "if applied, render from snapshot" branch. Worth a dedicated pass once real latency data exists (Gate B), not before.
2. **No customer-facing explanation for rejected ops** (e.g. a `stock` product rejected as unavailable, or `confirm` rejected for missing fields). `CartEngine.apply` already reports these via `rejectedOps`, but `processMessage` doesn't currently feed that back into what the customer sees this turn — the *next* turn's prefetch will show the true post-rejection cart state, so nothing is silently corrupted, but the current turn's reply may not explain *why* something didn't happen. Spec doesn't fully resolve this either (LLM-2 is a verifier, not a rejection-explainer) — accepted as a v1 gap, not attempted here.
3. **`PROCESSOR_FALLBACK_TEMPLATE` has no call site yet** — nothing in `processMessage` currently catches a mid-pipeline failure and sends this copy back to the customer; an unhandled error today just propagates to `handler.ts`'s per-record failure, which retries via SQS silently (no customer-visible message until/unless it eventually succeeds or DLQs). Matches §21's "Poison" and "Retryable" rows reasonably well, but the specific business-error-with-explanation path isn't built.

**One test-setup mistake, not a code bug:** the first `processMessage` test run had exactly one failure — a `notifyVendorNewOrderMock` with no default resolved value, so `.catch()` was called on `undefined`. Fixed in the test's `beforeEach`, not in `pipeline.ts` itself.

---

## Step 11 — Metrics timestamps + new EMF metrics

### New file
`backend/src/conversation/metrics.ts`

**Reuse (not previously known, found during research):** `backend/src/observability/metrics.ts` already provides exactly what §23 needs:
```ts
export function emitMetric(name: string, value?: number, opts?: {unit?: StandardUnit; dimensions?: Record<string,string|number|null|undefined>}): void;
export function emitDuration(name: string, milliseconds: number, opts?: MetricOptions): void;
```
It always logs a structured Pino line and best-effort-forwards to real CloudWatch (`PutMetricDataCommand`) when `CLOUDWATCH_METRICS_ENABLED=true`, never throwing on failure. `conversation/metrics.ts` should be a thin wrapper around this (e.g. `logLatency(stage, ms, traceId)` → `emitDuration('Llm1Ms', ms, {dimensions:{vendorId}})`) rather than a new CloudWatch client. Namespace is currently fixed at module load (`ChatLogix/ConversationParity` by default) — rather than adding a namespace override, tag new metrics with a `{processor:'conversation-v1'}` dimension to distinguish them within the shared namespace; simpler, zero changes to the existing file.

**Timestamps required (§23):** SQS receive/handler start, prefetch done, LLM-1 done (with `prompt_tokens`/`completion_tokens`/`model`), cart apply done, LLM-2 skipped|done, response queue published — every line carrying `traceId=whatsappMessageId`, `vendorId`, `conversationId`, via `logger.info({...ids}, 'short message')` (`backend/src/logger.ts`, same convention used everywhere else in the codebase).

**Metrics:** `ProcessorSuccess`, `ProcessorError{class}`, `LatencyMs`, `Llm1Ms`, `Llm2Ms`, `Llm2Skipped`, `CartApplyFail`, `LockContention`, `LockUnavailable`, `DebitFail`, `DLQDepth`, `ProductMatchMiss{language}`.

### Status — Done
- [x] `metrics.ts` — `logStage` (the 6 required timestamp checkpoints, `traceId`/`vendorId`/`conversationId` — the latter two optional since the very first checkpoint genuinely predates identity resolution), `logLatency`/`logCount` (thin wrappers over `observability/metrics.ts`'s `emitDuration`/`emitMetric`, tagging every metric with `processor:'conversation-v1'` inside the shared namespace, per this plan's own already-made Step 11 decision not to add a namespace override).
- [x] `pipeline.ts` retrofitted throughout: all 6 §23 checkpoints now fire in `processMessage`/`finalizeTurn` (`handler_start`, `prefetch_done`, `llm1_done` — carrying `promptTokens`/`completionTokens`/`model` — `cart_apply_done`, `llm2_skipped`|`llm2_done`, `response_queue_published`); `Llm1Ms`/`Llm2Ms` timed around their respective calls; `Llm2Skipped` counted; `CartApplyFail` counted (via a dedicated try/catch around just the `apply()` call, so it's attributed precisely, then rethrown); `LockContention`/`LockUnavailable` counted in the lock-acquisition catch block (now checking both error classes, not just `LockContentionError`); `ProcessorError` gained a `class` dimension via a small `classifyError` helper.
- [x] `DebitFail` and `ProductMatchMiss{language}` (already emitted since Steps 4/6) now route through the same `metrics.ts` wrapper for consistency, replacing their direct `observability/metrics.ts` calls.
- [x] 129/129 tests passing across the whole `conversation/` module, including new coverage asserting the exact checkpoint order, the `llm1_done` payload shape, `Llm1Ms`/`Llm2Ms`/`Llm2Skipped` branching, `LatencyMs`, and both lock-error classifications. `tsc --noEmit` clean. Full-suite regression check: same 5 pre-existing failing files, 285 passing overall.

**One real correctness fix made while building this, not just planned around — `LatencyMs`'s actual definition.** §8 defines the SLA clock as "start = SQS receive, stop = successful `publishToQueue`." The original `finalizeTurn` (Step 6) returned `void`, and its own inline debit attempt (a full Postgres transaction) is *awaited* before it returns — so naively timing `processMessage`'s total duration would have padded `LatencyMs` by the debit's own duration, measuring something other than what §8 actually defines. Fixed by changing `finalizeTurn`'s return type to `{ publishedAt: number }`, capturing that timestamp immediately after `publishToQueue` resolves and before the debit attempt even starts, so `processMessage` computes `LatencyMs = publishedAt - startTime` — precisely the §8 clock, unaffected by whatever the debit takes. This is a breaking change to `finalizeTurn`'s signature; all 5 of Step 6's original tests needed updating (one now asserts the returned `publishedAt`, none anymore assert `resolves.toBeUndefined()`).

**One scope decision, not an oversight:** `DLQDepth` is **not** emitted anywhere in this module. It isn't a per-invocation measurement — a Lambda/worker that's actively processing a message doesn't know how many *other* messages are sitting in its DLQ. AWS already publishes this natively as a CloudWatch SQS metric (`ApproximateNumberOfMessagesVisible` on the DLQ) with zero application code required, so a CloudWatch alarm can be wired directly to the queue rather than reimplementing that count here. If a custom EMF metric is ever wanted instead, `sqsClient.ts`'s existing `getApproxQueueSize(queueUrl)` (unused by this module today) is the natural building block for a small separate scheduled check — but that would need its own EventBridge-scheduled Lambda, the same pattern as Step 6's debit-reconciliation sweep, not something that belongs inside `processMessage`.

**Process note, not a code issue (third time this has happened, see Steps 9/10):** the first full test run again silently picked up a different vitest install by running from the repo root instead of `backend/`, this time hitting a *real* (unmigrated) Postgres database directly — confirmed by the exact error surfaced (`Product.fulfillmentType` column not found, since the Step 2 migration was deliberately deferred to deploy time and never applied to any real database). No data was written; the connection just failed loudly. Re-running with the established explicit `cd .../backend &&` prefix fixed it immediately, confirming — again — this is an environment artifact, not a bug in the Step 11 code itself.

---

## Step 12 — Gate A dev cutover

No new backend files — this is §27's checklist, executed with the environment facts already confirmed:

- **`worker:multi-stage` (`multiStageAIWorker.ts`)**: no live audio/image traffic in this environment, so it's safe to stop this process outright for cutover — no `DISABLE_TEXT_POLL` flag needed.
- **`worker:text` (`textWorker.ts`)**: confirmed active — must also be stopped, alongside `worker:incoming` and `worker:multi-stage`. §27's checklist as written only names two workers; add `worker:text` explicitly.
- Disable the text SQS trigger on `chatlogix-multi-stage-processor` (or simply don't run its process-equivalent, if that's the actual dev/test topology — there's no serverless.yml/CDK/Terraform in this repo controlling SQS event-source-mappings, so this is done outside the repo either way).
- Enable the text trigger on `chatlogix-conversation-processor`, or run `conversationWorker.ts` against `TEXT_QUEUE_URL`.
- All 16 §26 tests green, plus manual verification: one assistant message + one Meta send per inbound; dashboard cart == WhatsApp list; credits move only after enqueue (simulate an inline-debit failure and confirm the sweep recovers it); handoff pauses AI + notifies the test vendor; PgBouncer live + `connection_limit=1` confirmed.

---

## Step 13 — Gate B latency-at-scale load test

No new `backend/src/conversation/` files. Optionally a `scripts/loadTestConversationProcessor.ts` synthetic multi-vendor/multi-conversation burst generator (akin to the existing `scripts/test-multi-stage-worker.ts`), publishing many distinct `vendorId`/`conversationId` pairs at ~40-60 msgs/sec sustained for 10-15 min against a **real deployed AWS Lambda** with provisioned concurrency configured, measuring p90/p95/p99 off actual `RESPONSE_QUEUE` publish timestamps. Confirmed to trail Gate A — does not block the dev/test cutover, but is required before any future live production cutover (§28).

---

## Step 14 — Quality evaluation loop live

### New files
`backend/src/lambdas/handlers/qualityJudgeSweep.ts` (EventBridge-scheduled Lambda, weekly — same scheduling mechanism chosen for step 6's debit sweep)

Runs gpt-4.1-mini as LLM-judge over the full sampled `QualityMetrics` set plus every `needsVerify=true`/below-threshold transcript, scoring against the fixed rubric from §23.1 (cart-accuracy-vs-DB, correct language, no invented ETA/date, tone fit). Findings feed back into `VERIFY_THRESHOLD` tuning (the env var added in step 7) and prompt iteration. Per-vendor breakdown (§23.1.4) implies a small reporting query — flag as a follow-on outside this Lambda's own code, not part of this module.

---

## Post-ship enhancements (2026-09)

Changes after Steps 7–11 shipped, verified at commit `547b10e`:

| Area | Files | Behavior |
|---|---|---|
| **Language model** | `conversation/language.ts`, `types.ts`, `llm/prompts.ts` | `Llm1Result.language` is `string` (ISO 639-1, not en/ta/hi/mixed enum). `isEnglishLanguage()` drives pipeline branching; `detectLanguageFromText()` detects hi/ta/te/ml/kn/bn/gu/pa/or/si from Unicode ranges. |
| **LLM-2 skip** | `llm/llm2.ts` | `set_field`-only turns skip LLM-2 (name/address/notes/delivery_date). |
| **Reply selection** | `llm/llm2.ts`, `pipeline.ts` | `selectFinalReply` takes `language`, `cartMutated`, `compactCatalog`; merges conversational lead + cart on item mutations; `renderRejectedOpsReply` path when `rejectedOps.length > 0`. No per-language string tables — English deterministic strings only. |
| **Vendor English** | `utils/vendorEnglish.ts`, `pipeline.ts` | `ensureMessageContentEn` on inbound + assistant messages; `normalizeSetFieldOps` transliterates set_field values before CartEngine; `hydrateMessagesContentEn` on vendor read paths. `content` stays customer language; `contentEn` is vendor-portal only. |

Living walkthrough: `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`.

---

## Resolved cross-cutting decisions

These were open questions surfaced during research; each has an explicit resolution baked into the steps above so implementation doesn't stall on them:

- **`queuedAt` field**: added to `MessageProcessing` explicitly (step 2), not inferred from `updatedAt`.
- **Scheduling infra**: EventBridge-scheduled Lambdas for both the 5-min debit sweep (step 6) and the weekly quality judge (step 14) — confirmed with the user.
- **Webhook DB-fallback idempotency**: `routes/webhook.ts` and `workers/responseProcessor.ts`'s fallback `Message.create` calls (used only when the SQS publish itself fails) will be patched to also set `whatsappMessageId` — confirmed with the user. This is a small edit outside `backend/src/conversation/`, required for §9's stated invariant ("upsert on `whatsappMessageId` is a no-op") to actually hold on that rare path.
- **Gate A worker topology**: `worker:multi-stage` stops outright (no live audio/image traffic to protect); `worker:text` is confirmed active and added to the stop-list alongside `worker:incoming` and `worker:multi-stage`.
- **`Order.items` key rename / backward compatibility**: accepted as-is for this dev/test environment (no live customers, Q11) — no migration, no discriminator field, documented in code.
- **`CartOp` variant pricing**: out of scope for v1 — CartEngine prices strictly from `Product.basePrice`/`baseQuantity`; documented in code, not a schema change.
- **`set_field type:'delivery_date'`**: persist into the existing `Order.deliveryInstructions` free-text field (no new column) — advisory copy only, never surfaced as a promised date.
- **`receiveMessages` visibility timeout**: add an optional `visibilityTimeout` param (additive, non-breaking) for the new local worker to pass a longer value than the SQS/LocalStack default of 30s.
- **Compact-catalog invalidation**: located and wired into existing product CRUD code as part of step 4, not deferred.
- **Metrics namespace**: shared `ChatLogix/ConversationParity` namespace with a `{processor:'conversation-v1'}` dimension, rather than a new CloudWatch client.

---

## Verification — how to test end to end

1. **Unit/integration gate:** `cd backend && npm test` — all `backend/src/conversation/__tests__/*.test.ts` files green, covering all 16 cases from §26.
2. **Schema:** `npm run prisma:generate` succeeds after applying the new migration SQL via `psql $DATABASE_URL -f backend/prisma/migrations/add_conversation_processor_v1_schema.sql`; spot-check the new `MessageProcessing`/`FulfillmentType` types exist in the generated client.
3. **Local end-to-end (Gate A):** run `npm run worker:conversation` against LocalStack `TEXT_QUEUE_URL`, send test WhatsApp texts through the webhook, and manually walk §27's Gate A checklist — one assistant message + one Meta send per inbound, dashboard cart matches the WhatsApp list, credits move only after enqueue, a simulated inline-debit failure is recovered by the sweep, handoff pauses AI and notifies the test vendor.
4. **Cart correctness regression:** manually replay the two motivating bugs from spec §2.2 ("make it 5" on an existing multi-item cart; "also add cookies" after the model lists the whole cart) and confirm the reply and `Order.items` agree.
5. **Latency (Gate B, post-AWS-deploy):** run the synthetic load generator against the real deployed Lambda with provisioned concurrency, confirm p90 ≤ 5s / p95 ≤ 10s / p99 ≤ 15s measured off real `RESPONSE_QUEUE` publish timestamps, and confirm no Postgres connection exhaustion or Redis lock starvation under that concurrency.
6. **Cutover safety:** before stopping `worker:incoming`/`worker:text`/`worker:multi-stage`, confirm no other process is still publishing to or consuming `TEXT_QUEUE_URL` — check for orphaned `npm run worker:*` processes in this environment (none are PM2-managed per `ecosystem.config.js`, so they're likely running as manual/screen-session processes that need to be found and killed directly).
