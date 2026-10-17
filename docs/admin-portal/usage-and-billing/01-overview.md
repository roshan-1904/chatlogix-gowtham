# Money and usage — overview

## Problem statement

ChatLogix must know whether **vendor wallet charges** cover **OpenAI spend** and platform fees, while Meta WhatsApp costs are still **absorbed**. Finance and founders need a trustworthy rollup; support needs per-shop drill-down when a vendor disputes a balance. This module is **reporting** — not a second settings UI (`/billing` already patches `PlatformSettings`).

## Business depth

**Why it exists**

- **Revenue quality:** `CreditUsage.chargedMilli` is what shops pay; compare to `WalletTransaction.metadata.aiCostMilli` for margin.
- **Cost control:** Catalog import/enhance caps (`catalogImportDailyPaiseCap`) show up as charge sources — detect runaway jobs.
- **Vendor success:** Shops see spend in web-vendor dashboard stats; admin view must reconcile to same ledger.
- **Investor / ops narrative:** Trial grants (`trial_grant` recharges) separated from usage; Meta estimate labeled absorbed.

**Personas**

| Persona | Question | KPI on screen |
|---|---|---|
| Founder | Are we profitable per day? | Charged − OpenAI cost (approx margin before infra) |
| Finance | Trial burn rate? | Sum trial `recharge` in range |
| Support | Why was shop X charged ₹0.39? | Per-charge list with `source` |

**Pipeline tie-in**

- Every debit: `chargeVendor` in Lambda conversation path → `CreditUsage` + `WalletTransaction` deduction (`pricingService.ts`).
- `Message.aiCostUsd` on assistant messages is informational; prefer ledger `aiCostMilli` for platform OpenAI line.
- `GET /api/usage` is **wrong data** — in-memory `costMonitor`, not Postgres.

**Decision rules**

| Situation | Act | Wait |
|---|---|---|
| Charged up, OpenAI flat | Check catalog_enhance jobs | Blame vendor markup change |
| OpenAI total "Incomplete" | Engineer backfill metadata | Hide gap silently |
| Vendor asks for Meta fee | Point to absorbed card + BILLING §7 | Add to `chargedMilli` without product sign-off |

## Scope / non-goals

**In scope:** platform + per-vendor usage views; source breakdown; Meta conversation **count** + absorbed estimate; link to `/billing`.

**Out of scope:** redesign Billing; monthly quotas; markup edit; OpenAI dashboard import; `POST /api/usage/reset`; charging Meta to vendors.

## Definitions

| Term | Storage |
|---|---|
| Charged | `CreditUsage.chargedMilli` (integer milli) |
| OpenAI cost (our) | `WalletTransaction.metadata.aiCostMilli` on `deduction` rows (fractional) |
| Trial credit granted | `recharge` + `metadata.source = trial_grant` |
| Platform fee | From `PlatformSettings.platformFeePerTurnPaise` ×10 at charge time — often 0 |
| Meta absorbed | Not in `chargedMilli`; `whatsappCostMilli` = 0 today |

Charge formula (summary): see [BILLING_AND_PRICING.md](../../BILLING_AND_PRICING.md) §2 — single `ceil` after markup on sum of cost components.

**Charge sources (`ChargeSource` in `pricingService.ts`)**

`conversation_turn`, `legacy_conversation_turn`, `outbound_media`, `catalog_import`, `catalog_enhance`, `catalog_enhance_transcribe`, `sandbox_chat`, `sandbox_transcribe`.

Staff labels — map in UI; never rename DB strings.

## Already built / API only / net new

| Job | State | Evidence |
|---|---|---|
| Billing settings | **Built** | `pages/Billing.tsx`, `routes/adminSettings.ts`, `PlatformSettings` |
| Per-vendor all-time charged | **API only** | `GET /api/vendors/:id/usage-analytics` |
| Per-vendor windows | **API only** | `GET /api/vendors/:id/dashboard-stats` — `dashboardStatsService.ts`, `NON_SPEND_SOURCES` |
| Platform rollup | **Proposed** | `GET /api/admin/usage?from&to` aggregating `CreditUsage` index `idx_creditusage_vendor_date` |
| Meta rate field | **Proposed** | Optional `PlatformSettings` column + Billing field — not in schema today |
| Usage UI | **Net new** | `/usage`, `/usage/:vendorId` |

**Prisma models**

- `CreditUsage` — `vendorId`, `chargedMilli`, `usageDate`, `source`, `externalId` (idempotency), `conversationId?`
- `WalletTransaction` — `transactionType`, `amountMilli`, `metadata` JSON, `transactionDate`
- `Conversation` — count for Meta volume proxy
- `PlatformSettings` — fees, trial, caps (paise)

**Security:** `requireRole('admin')` on admin routes; vendor stats use `requireVendorAccess` — admin passes.

## Dependencies

- Vendors module for shop names and deep links.
- Controls for `fx_stale` alert when Billing refresh fails.
- BILLING doc for charge source list §4.

## Success criteria

- For shop S and day D (IST), UI charged = SQL `SUM(chargedMilli)` on `CreditUsage` for S and D.
- Source breakdown sums to total charged in range.
- Trial line counts grants only, not remaining balance.
- Meta card never adds to "Charged to shops".
- Settings changes only via `/billing` link.

## Risks and open questions

| Risk | Note |
|---|---|
| Join CreditUsage ↔ WalletTransaction for OpenAI | Use `externalId` / metadata keys if present; else show Incomplete |
| 31-day max range | Protect DB; document in UI |
| Conversation count ≠ Meta billable conversations | Label "platform conversation rows" |

| Open question | |
|---|---|
| Show gross margin % on platform card? | Product |
| Export CSV? | Phase 2 |
