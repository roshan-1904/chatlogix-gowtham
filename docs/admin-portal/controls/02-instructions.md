# Controls — operating instructions

Phase 1: **`StaffAuditLog`** table + **computed alerts** on load (no `StaffAlert` yet). Phase 2: persisted alerts. See [DECISIONS.md](../DECISIONS.md) §3. Trials and look-inside use existing `Vendor` + read APIs.

Money: wallet **milli**; catalog/order **paise**.

---

## Admin access runbook

**Preconditions:** Phone on `AUTH_ADMIN_PHONES` (comma-separated digits in env — **do not read `.env` in docs tooling**).

**Steps**

1. Staff opens `/login`, completes OTP.
2. JWT includes `admin` role from `resolveRolesForPhone`.
3. `ProtectedRoute` blocks without role.

**Postconditions:** Session in auth package; no row written.

**Rollback:** Remove phone from env + redeploy — **not** via UI.

**Ops rule:** Never share staff OTP devices; never use vendor password in admin browser.

**`Admin` Prisma table:** does not grant access.

---

## Scenario A — Investigate who changed markup

1. `/controls` audit — filter action `markup_changed` or shop name.
2. Row: time, actor phone/id, summary "Markup set to 60%."
3. Cross-check `Vendor.markupPercent` on Vendors detail.
4. If missing audit (**pre-table**): only column change exists — note gap.

---

## Scenario B — Low wallet alert

**Phase 1 (computed):**

1. Header badge or `/controls` — evaluator shows `low_wallet` for shop X, summary "Balance is ₹19.00" (`19000` milli).
2. No acknowledge/resolve persistence — alert disappears when balance ≥ ₹20 on next load.
3. Open shop link → Vendors recharge if approved by policy; document in Support case note.

**Phase 2 (stored `StaffAlert`):**

1. Same detection; row persisted with `open` status.
2. **Acknowledge** — `acknowledged`; condition may persist.
3. **Resolve** after action documented in Support case note.
4. If balance still < ₹20 after credit, next scan opens **new** `open` row — prior stays `resolved`.

---

## Scenario C — FX stale

1. Alert `fx_stale` — platform-wide, no vendorId.
2. Open `/billing` → **Refresh rate**.
3. Success → `usdToInrFetchedAt` updated, `FxRateHistory` row; audit `fx_refreshed`.
4. Failed refresh → 502, rate unchanged — **do not** raise stale solely from one 502 if fetch still fresh.

---

## 1. Read audit

**API (**proposed**):** `GET /api/admin/audit?vendorId=&action=&limit=50&cursor=`

Merge ledger: `WalletTransaction` where `metadata.source = admin_recharge` and no linked audit metadata.

**Staff filters:** shop search, action select, default All.

**Sort:** `createdAt` DESC.

| User-visible | Internal |
|---|---|
| Empty | "No staff actions recorded yet." |
| Error | 500 log |

---

## 2. Alerts

### Phase 1 — computed on load

**When:** Opening admin dashboard, `/controls`, or refreshing header badge.

**API (**proposed**):** `GET /api/admin/alerts/computed` (or fold into dashboard payload) — returns current matches from evaluator; **no DB writes**.

**Staff UX:** List + deep links only; no dismiss/snooze persistence. Copy should not imply an audit trail for “acknowledged alert” in Phase 1.

**Evaluator (**proposed**):** shared service used by dashboard route — same rules as [controls/01-overview.md](./01-overview.md) alert table.

### Phase 2 — `StaffAlert` persistence

**Status machine**

```
open ──► acknowledged ──► resolved
open ──► resolved
```

No backward edges. Re-trigger condition → **new** row.

**API:**

- `GET /api/admin/alerts?status=open`
- `PATCH /api/admin/alerts/:id` `{ "status": "acknowledged" | "resolved" }`

Emit audit `alert_acknowledged` / `alert_resolved` on PATCH.

**Links (Phase 1 and 2)**

| Type | Target |
|---|---|
| `low_wallet` | `/vendors/:vendorId` |
| `failing_replies` | `/reliability?queue=failed&vendorId=` |
| `whatsapp_dropped` | `/vendors/:vendorId` (#whatsapp) |
| `fx_stale` | `/billing` |

**Phase 2 periodic job (**proposed**):** optional cron to materialize rows; Phase 1 relies on **on-demand evaluation** at dashboard load only.

---

## 3. Trial clocks

**API (**proposed**):** `GET /api/admin/trials?filter=next7|past|all`

**Query:** vendors where `trialExpiresAt IS NOT NULL`, join `registrationStatus`, `trialGrantedMilli`, `walletBalanceMilli`.

**Sort:** `trialExpiresAt` ASC.

**Caption rules** (per row):

- `approved` → "Expiry does not stop replies. This shop is approved."
- not approved, past expiry → "Replies are blocked until the shop is approved."
- not approved, future → "Replies stop at this time if the shop is still not approved."

**Link:** "Change grant for new shops" → `/billing` — does not mutate existing `trialExpiresAt`.

---

## 4. Look inside shop

**Entry:** Vendor detail → "View catalog and orders" → `/vendors/:vendorId/shop?tab=catalog|orders|queries`

**APIs (existing):**

| Tab | Call | Key fields |
|---|---|---|
| Catalog | `GET /api/products?vendorId=` | `name`, `basePrice` paise, `isActive`, `inStock` |
| Orders | `GET /api/orders?vendorId=` | `orderNumber`, `status`, `totalAmount` paise, `createdAt` |
| Questions | `GET /api/customer-queries?vendorId=` + `status=open` | `questionEn`, `category`, `hitCount`, `lastSeenAt` |

**Auth:** `requireVendorAccess` — admin passes.

**Audit:** `shop_viewed` with tab name on first load of each tab per session (**proposed** dedupe 30m optional).

**Preconditions:** admin session.

**Postconditions:** none on vendor data.

---

## 5. Templates

No CRUD. Static card — see UI plan.

---

## Error handling matrix

| Action | User | Internal |
|---|---|---|
| Look-inside 403 | Redirect login | auth middleware |
| Alert patch conflict | "Could not update alert." | log |
| Audit load fail | Red box | retry |

---

## Engineer wiring order

**Phase 1**

1. Migrations: `StaffCase`, `StaffCaseNote`, `StaffAuditLog` (retention purge job **deferred** — policy 1y / 1y-after-close in [DECISIONS.md](../DECISIONS.md) §3).
2. Shared audit writer; emit P1 scope from vendors, billing, support, settings, flags, map-wa handlers.
3. Alert **evaluator** service + `GET` computed alerts; wire dashboard + header badge.
4. UI `/controls` audit tab, computed alerts panel, Support case routes.
5. Look-inside page + vendor detail button.

**Phase 2**

1. Migration `StaffAlert` + dismiss/snooze columns.
2. PATCH alert routes + audit for acknowledge/resolve.
3. Optional materialization cron if load-time-only is insufficient.

---

## Must not

- Allowlist UI or print `AUTH_ADMIN_PHONES`.
- `walletBalanceMilli` update from alert button.
- Store chat text on `conversation_read`.
- Auto-resolve `low_wallet` on page view.
- Build templates CRUD.
