# Admin portal — product decisions

Owner decisions recorded **2026-10-17**. Engineers and writers should treat this file as authoritative when module docs disagree. Update module docs only when they still imply a different policy.

## Status legend

| Status | Meaning |
|---|---|
| **Locked** | Ship Phase 1 to this spec; do not reopen without owner sign-off. |
| **Open** | Options documented; owner has not chosen or schema not finalized. |
| **Deferred** | Optional future work; not P0 and not blocking Phase 1 exit criteria. |

## Decision summary

| # | Topic | Status | Phase 1 default |
|---|---|---|---|
| 1 | Onboarding approval (auto-approve) | **Locked** | Keep `completeOnboarding` → `approved`, `approvedBy: system` |
| 2 | Wallet-empty visibility in Reliability | **Locked** | Option A — persist `WalletBlockEvent` from pipeline |
| 3 | Staff platform tables (`StaffCase`, audit, alerts) | **Locked** | Phase 1 `full_controls`: `StaffCase` + notes + full `StaffAuditLog` (wallet, markup, chat read, settings); alerts **computed** on load; retention audit **1y**, closed cases **1y after resolve**; Phase 2: `StaffAlert` + dismiss |
| 4 | Usage / economics display (cost vs billed) | **Locked** | Both platform cost and vendor `chargedMilli`; no `GET /api/usage` |
| 5 | Meta WhatsApp cost presentation | **Locked** | Absorbed platform line; not vendor-billed in Phase 1 |

---

## 1. Onboarding approval — auto-approve (Locked)

**Decision:** Keep **auto-approval**. When a vendor finishes onboarding, `completeOnboarding` in `vendorOnboardingService.ts` continues to set `registrationStatus = approved`, `approvedAt`, and `approvedBy: 'system'`, with `subscriptionStatus: 'active'`. Do **not** build a `pending_approval` queue as P0.

**Rationale:** Speed to first AI reply and low ops headcount at current scale. Manual review adds latency and UI surface without a compliance mandate today.

**Impact on modules**

| Module | Effect |
|---|---|
| **Vendors** | Dashboard “Waiting” may stay at 0; copy should explain auto-approve. Approve/reject UI is **Deferred**, not required for Phase 1 exit. |
| **Support** | Mistaken approvals handled via cases + wallet goodwill, not a reject workflow. |
| **Controls** | If approve/reject APIs ship later, they must emit audit events. |

**Deferred (optional future):** `POST /api/admin/vendors/:id/approve` and `reject`, and changing `completeOnboarding` to land on `pending_approval`, remain valid **if compliance or fraud review** requires them — not blocking Phase 1.

**Docs to read**

- [vendors/02-instructions.md](./vendors/02-instructions.md) — registration machine, Scenario B marked deferred
- [vendors/01-overview.md](./vendors/01-overview.md) — waiting card semantics
- Backend: `backend/src/services/vendorOnboardingService.ts`, `routes/vendorOnboarding.ts`

---

## 2. Wallet-empty visibility (Locked)

**Decision:** **Option A** — persist wallet-empty blocks for **Reliability** triage. When the conversation pipeline blocks before the LLM because the vendor cannot pay for a turn, emit a durable row (e.g. **`WalletBlockEvent`** or equivalent). Reliability reads this table for the “wallet blocked” queue.

**Context:** Wallet-empty skips are **not** failed `Message` rows. Without persistence, staff cannot see per-turn payment blocks in the triage desk and must infer from wallet balance or support tickets.

**Option B (not chosen):** Do not persist wallet blocks; show only `Message.status = failed`, pauses, etc. **Deferred** — superseded by Option A for Phase 1.

**Implementation note (engineers)**

- **Emit from the pipeline** at the wallet gate — same path as today’s billing wallet check before model call. See `backend/src/conversation/pipeline.ts` and the wallet / credit guard flow in [INCOMING_RESPONSE_GENERATOR_FLOW.md](../INCOMING_RESPONSE_GENERATOR_FLOW.md) (`canProcessMessage` / insufficient balance → template, no LLM).
- **One row per blocked turn** (idempotent key TBD in schema PR — e.g. conversation + inbound message id if available).
- **Proposed fields (minimum):** `vendorId`, `conversationId`, `timestamp` (`createdAt`), `reason` (`insufficient_balance` \| `trial_expired` or equivalent from billing), optional `messageId` (inbound turn), optional **template sent** flag (whether `WALLET_EMPTY_TEMPLATE` was dispatched).
- **Not** a `CreditUsage` row — no charge occurred.
- **Retention** — **1 year** from `createdAt` (same ops window as `StaffAuditLog` per decision 3). Purge job deferred to schema PR; UI may state "kept 1 year" once the writer ships.

**Impact on modules**

| Module | Effect |
|---|---|
| **Reliability** | Phase 1 **wallet blocked** queue is backed by persisted events; empty state means no blocks in range, not “not stored.” |
| **Usage and billing** | Low balance remains visible via `walletBalanceMilli` and ledger; block events are per-turn CX signal, not billing truth. |
| **Vendors** | Recharge runbook remains the fix path. |

**Docs to read**

- [reliability/01-overview.md](./reliability/01-overview.md), [reliability/02-instructions.md](./reliability/02-instructions.md)
- [README.md](./README.md) glossary — “Wallet-empty skip”
- Pipeline: `backend/src/conversation/*`, [INCOMING_RESPONSE_GENERATOR_FLOW.md](../INCOMING_RESPONSE_GENERATOR_FLOW.md)

---

## 3. Staff platform tables (Locked)

**Decision (2026-10-17) — Phase 1 codename `full_controls`:** **Support + Controls** ship **`StaffCase`** + notes and **full `StaffAuditLog`** for wallet credits, markup changes, customer **chat read**, and **admin settings** changes (plus case lifecycle and other writers in the scope table below). **Alerts** are **computed on dashboard load** in Phase 1 (rules in [controls/02-instructions.md](./controls/02-instructions.md)); **Phase 2** adds persisted **`StaffAlert`** with dismiss/snooze (acknowledge/resolve workflow).

**Retention**

| Data | Policy |
|---|---|
| **`StaffAuditLog`** | **1 year** from `createdAt` |
| **`StaffCase`** + **`StaffCaseNote`** | **1 year after `resolved`** (closed case); open cases are not purged by age alone |

**Retention jobs:** Implement scheduled purge (or archive) matching the table above — **deferred** to the schema/migrations PR; docs lock the policy now so UI copy and compliance assumptions stay consistent.

**Schema proposal (high level — finalize in Prisma PR)**

**`StaffCase`**

- `id` (uuid), `vendorId` (FK `Vendor`), `subject` (short text), `status` (`open` \| `waiting` \| `resolved`)
- `conversationId?` (FK `Conversation`, must match `vendorId` when set)
- `openedBy` (admin user id from JWT), `createdAt`, `updatedAt`
- Assignee / SLA fields — **Deferred** (Phase 2)

**`StaffCaseNote`**

- `id`, `caseId` (FK), `authorId`, `body`, `createdAt` — **append-only** (status-change system notes may be rows or derived; either way notes are not edited in place)

**`StaffAuditLog`** (immutable append-only)

- `id`, `actorId`, `action` (enum string), `vendorId?` (null for platform-only), `summary` (no message bodies), `metadata?` (json — ids, deltas, tab names), `createdAt`

**Phase 1 audit scope (must emit before or with the mutating/read response)**

| Action key | Trigger |
|---|---|
| `wallet_credited` | Admin wallet credit / recharge success |
| `markup_changed` | Vendor markup PATCH (billing-config path) |
| `conversation_read` | Staff opens customer transcript (Support) — **fail closed** if insert fails |
| `settings_changed` | Material platform settings via `PATCH /api/admin/settings` (`/billing`) |
| `feature_flag_changed` | Per-vendor feature flags PATCH |
| `whatsapp_mapped` | Map-WA-number / connect mapping staff action |
| `case_opened`, `case_status_changed` | Support case create and status transitions |

Other actions in [controls/01-overview.md](./controls/01-overview.md) (e.g. `fx_refreshed`, `shop_viewed`, vendor approve/reject) remain **documented**; wire when those surfaces ship. Phase 1 exit for Controls audit UI requires the **scope table above** to be wired.

**`StaffAlert` — Phase 2 only**

- Persisted rows: `id`, `type`, `vendorId?`, `status`, `summary`, `openedAt`, `resolvedAt?`, plus dismiss/snooze fields TBD in schema PR
- Phase 1: evaluate rules when loading dashboard / `/controls` (and header badge count from same evaluator) — **no** `StaffAlert` table required for Phase 1 exit

**Impact on modules**

| Module | Effect |
|---|---|
| **Support** | `StaffCase` + notes in Phase 1; Reliability deep link → new case; every transcript load → `conversation_read` audit |
| **Controls** | Audit log UI backed by `StaffAuditLog`; alerts are **read-time computed** in Phase 1 |
| **Vendors / Billing** | Handlers that mutate wallet, markup, flags, WA mapping, or platform settings must call shared audit writer |

**Docs to read**

- [support/01-overview.md](./support/01-overview.md), [support/02-instructions.md](./support/02-instructions.md)
- [controls/01-overview.md](./controls/01-overview.md), [controls/02-instructions.md](./controls/02-instructions.md)
- [README.md](./README.md) — Phase P4 / P5 table

---

## 4. Usage / economics display (Locked)

**Decision:** Admin usage views must show **both**:

1. **Cost to ChatLogix** — internal economics, including:
   - OpenAI: sum / drill-down from `WalletTransaction` deductions using `metadata.aiCostMilli` (and related metadata where present on the ledger row).
   - Platform fee components as modeled in `chargeVendor` (internal; may be zero components today).
   - **Meta WhatsApp conversation cost** as a **ChatLogix-absorbed** line (see decision 5), not `CreditUsage.chargedMilli`.

2. **What we billed the vendor** — `CreditUsage.chargedMilli` aggregated and broken down by **`source`** (`conversation_turn`, `catalog_import`, etc.).

Staff must see **gross margin / markup effect** at platform level (per day) and on vendor drill-down (charged vs summed AI cost for that vendor in range).

**Explicitly out of scope for billing truth:** `GET /api/usage` — that endpoint reflects in-process **costMonitor** in the API server, not durable ledger + `CreditUsage`. **Do not** wire admin money screens to it.

**Impact on modules**

| Module | Effect |
|---|---|
| **Usage and billing** | Primary owner of aggregates UI and proposed `GET /api/admin/usage` (or equivalent). |
| **Billing (`/billing`)** | Platform knobs (markup caps, trial grant, FX) stay separate; usage page links here for fee edits. |
| **Vendors** | Detail links to `/usage/:vendorId`. |

**Implementation notes for engineers**

**Read paths (Phase 2 usage module)**

- Proposed: `GET /api/admin/usage/summary?from=&to=` (IST day boundaries) returning at minimum:
  - `chargedMilliTotal` and `bySource: Record<ChargeSource, milli>`
  - `aiCostMilliTotal` from ledger deductions in range (SQL sum of `(metadata->>'aiCostMilli')::bigint` with null-safe handling)
  - `grossMarginMilli` or `chargedMilli - aiCostMilli` with documented caveats (markup, rounding, non-turn charges)
- Proposed: `GET /api/admin/usage/vendors/:vendorId?from=&to=` — same split for one vendor.
- Optional daily series for charts: group `CreditUsage` by `createdAt` date and ledger AI cost by `WalletTransaction.createdAt` date.

**Tables**

| Table | Role |
|---|---|
| `CreditUsage` | Vendor-billed amounts — `chargedMilli`, `source`, `vendorId`, timestamps |
| `WalletTransaction` | Ledger — deductions carry `metadata.aiCostMilli` (and charge breakdown when populated) |
| `Vendor` | `markupPercent` for explaining gap between AI cost and charged |
| `PlatformSettings` | Trial grant, fee knobs — not the usage aggregate source |

**Existing routes**

- `GET /api/vendors/:id/usage-analytics` — all-time charged sum only; extend or supersede for admin drill-down, do not replace platform summary.
- `GET /api/vendors/:id/wallet-transactions` — row-level ledger for support disputes.

**Docs to read**

- [usage-and-billing/01-overview.md](./usage-and-billing/01-overview.md), [usage-and-billing/02-instructions.md](./usage-and-billing/02-instructions.md)
- [BILLING_AND_PRICING.md](../BILLING_AND_PRICING.md)
- `backend/src/services/pricing/pricingService.ts`

---

## 5. Meta WhatsApp cost (Locked)

**Decision:** Aligns with decision 4. Meta WhatsApp **conversation** cost is a **ChatLogix-absorbed** cost line in platform economics, **not** billed to vendors in Phase 1 (`platformFeePerTurnPaise` / `whatsappCostMilli` in pricing is **0** today — vendors do not see a separate Meta invoice product).

**UI**

- Show Meta alongside OpenAI in **platform cost** sections (estimate or placeholder until rate card is wired).
- Phase 1 may show **conversation counts** in range plus copy that Meta is absorbed; when a rate card exists, add estimate from `PlatformSettings` (**optional future** field — not required to lock Phase 1).

**Do not** in Phase 1: add vendor-facing Meta billing SKU, or fold Meta into `CreditUsage.chargedMilli`.

**Docs to read**

- [BILLING_AND_PRICING.md](../BILLING_AND_PRICING.md) — WhatsApp cost component
- [usage-and-billing/02-instructions.md](./usage-and-billing/02-instructions.md) — Scenario 1 Meta card
- [README.md](./README.md) — money rules paragraph on absorbed Meta

---

## Changelog

| Date | Change |
|---|---|
| 2026-10-17 | Initial owner decisions 1–5 recorded |
| 2026-10-17 | Decision 2 locked to Option A — persist `WalletBlockEvent` from pipeline |
| 2026-10-17 | Decision 3 locked — Phase 1 cases + full audit; computed alerts; 1y retention |
