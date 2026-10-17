# Controls — overview

## Problem statement

Every allowlisted admin can change money, platform fees, and read customer chats. Controls adds **accountability** (audit), **attention management** (alerts), **trial visibility**, and **read-only shop inspection** without vendor credentials — while keeping `AUTH_ADMIN_PHONES` as the sole access gate until a future role split.

## Business depth

**Why it exists**

- **Risk:** Fraud/error detection on wallet credits and markup changes.
- **Cost control:** `fx_stale` prevents billing drift; `low_wallet` prompts before pipeline blocks.
- **Ops efficiency:** Header notification badge → alerts queue.
- **Vendor success:** Trials list explains why unapproved shop stopped replying at `trialExpiresAt`.

**Personas**

| Persona | Uses |
|---|---|
| Founder | Audit + FX stale |
| Ops | Alerts → Vendors / Reliability / Billing |
| Support | Look-inside before accusing vendor of empty catalog |

**KPIs**

| Metric | Definition |
|---|---|
| Audit coverage | % money actions with audit row within 60s |
| Open alerts age | Phase 2: `now - openedAt` for persisted `status=open` |
| Trials expiring 7d | count `trialExpiresAt` in window, not approved |

**Ties to pipeline**

- `low_wallet` (₹20) ≠ wallet gate worst-case — Reliability wallet queue when implemented.
- `failing_replies` uses `Message.status=failed` count 24h — Lambda path.
- Turn-audit changes affect Lambdas within ~30s.

## Scope / non-goals

**In scope (Phase 1):** **`StaffAuditLog`** UI with full P1 audit scope (see below), **computed alerts** on dashboard load (rules below — no `StaffAlert` table yet), trials list, look-inside tabs, templates explanation, header badge from same evaluator. **Phase 2:** persisted `StaffAlert` + dismiss/snooze. Authority: [DECISIONS.md](../DECISIONS.md) §3.

**Out of scope:** allowlist editor; `Admin` table login; vendor impersonation; edit catalog/orders; CloudWatch; second billing form.

## StaffAuditLog (Phase 1 — locked scope)

**Retention:** 1 year from `createdAt` ([DECISIONS.md](../DECISIONS.md) §3). Scheduled purge job deferred to implementation PR.

| Column | Purpose |
|---|---|
| id | uuid |
| actorId | admin user id |
| action | enum string (see tables below) |
| vendorId? | null for platform |
| summary | short text, no message bodies |
| metadata? | json — e.g. transaction id |
| createdAt | |

**Phase 1 required actions** (emit on success path; `conversation_read` before returning messages):

| Action | When |
|---|---|
| `wallet_credited` | Admin wallet credit / recharge |
| `markup_changed` | Vendor markup PATCH |
| `conversation_read` | Support transcript load (fail closed) |
| `settings_changed` | `PATCH /api/admin/settings` — material platform knobs on `/billing` |
| `feature_flag_changed` | Per-vendor feature flags PATCH |
| `whatsapp_mapped` | Map-WA-number staff action |
| `case_opened` / `case_status_changed` | Support case lifecycle |

**Also documented** (wire when surface ships):

| Action | When |
|---|---|
| `vendor_approved` / `vendor_rejected` | onboarding decision (deferred approve/reject UI) |
| `fx_refreshed` | refresh-fx ok |
| `shop_viewed` | look-inside tab open |
| `alert_acknowledged` / `alert_resolved` | **Phase 2** — persisted `StaffAlert` UI only |

**Backfill:** show `WalletTransaction` `admin_recharge` as "Ledger" lines not linked to audit id.

## Alerts — Phase 1 computed / Phase 2 stored

**Phase 1:** On dashboard and `/controls` load (and header badge), **evaluate rules in memory** — no `StaffAlert` table. UI may show ephemeral rows with deep links; staff actions do not persist alert state.

| Type | Raise when (evaluator) |
|---|---|
| `low_wallet` | `walletBalanceMilli < 20000` |
| `failing_replies` | ≥3 failed assistant messages / shop / 24h |
| `whatsapp_dropped` | `connectStatus` in `disconnected`, `error` |
| `fx_stale` | `usdToInrFetchedAt` null or >48h old |

**Phase 2:** **`StaffAlert`** table — `id`, `type`, `vendorId?`, `status`, `summary`, `openedAt`, `resolvedAt?`, dismiss/snooze fields TBD. Idempotent raise while `open` or `acknowledged` exists for same type+vendor (or platform for `fx_stale`). Audit `alert_acknowledged` / `alert_resolved` when that UI ships.

## Already built

| Item | Evidence |
|---|---|
| Allowlist | `roleService.ts`, `ProtectedRoute.tsx` |
| Header notifications stub | `Header.tsx` |
| Low balance in vendor stats | `LOW_BALANCE_THRESHOLD_MILLI` in `dashboardStatsService.ts` |
| Look-inside APIs | products, orders, customer-queries routes + admin access |
| Templates stub | `App.tsx` |

## Dependencies

- Writers on Vendors, Billing, Support emit audit events.
- Reliability feeds `failing_replies`.

## Success criteria

- Markup save → audit row with actor + shop.
- Phase 1: recomputed alerts reflect current wallet/failure/WA/FX state on each load; no persisted acknowledge.
- Phase 2: resolve `low_wallet` does not change balance; new alert if still low on next scan.
- Look-inside shows paise as rupees; audit `shop_viewed`.
- Templates page explains P0.3 — no CRUD.

## Risks and open questions

| Risk | Note |
|---|---|
| Audit table never wired | Ledger backfill only partial history |
| Alert fatigue | 3-failure threshold is tunable |

| Open question | |
|---|---|
| Auto-resolve alerts? | v1: human resolve only |
| Separate support role? | Future env split |
