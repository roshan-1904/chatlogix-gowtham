# Vendors — operating instructions

**Policy (2026-10-17):** Onboarding stays **auto-approved** — `completeOnboarding` sets `registrationStatus = approved` with `approvedBy: system`. Manual approve/reject (Scenario B) is **optional future** work, not Phase 1. See [DECISIONS.md](../DECISIONS.md#1-onboarding-approval--auto-approve-locked).

Full runbook for staff and API sequences for engineers. Money units: wallet **millirupees** (₹50 = `50000`); orders **paise** (₹50 = `5000`). Index: [README](../README.md#rules-for-every-screen).

Charge formula (debits only): [BILLING_AND_PRICING.md](../../BILLING_AND_PRICING.md) — `chargeMilli = ceil((ai + whatsapp + platformFee) × (1 + markup%/100))`; `whatsappCostMilli` is 0 today.

---

## Registration status machine

`Vendor.registrationStatus` is a string. Recognized set: `onboarding`, `pending_approval`, `approved`, `rejected` (`ONBOARDING_STATUSES` in `routes/vendorOnboarding.ts`).

```
onboarding ──(vendor submits)──► pending_approval   [TARGET — not production today]
pending_approval ──approve──► approved
pending_approval ──reject──► rejected
rejected ──(vendor resubmits)──► pending_approval
approved ──X──► (no downgrade from admin)
```

**Production today:** `completeOnboarding` in `vendorOnboardingService.ts` jumps to `approved`, sets `approvedAt`, `approvedBy: 'system'`, `subscriptionStatus: 'active'`. No writer sets `pending_approval` or `rejected` in routes found — vendor redirect still handles those strings for UX.

| Transition | Preconditions | Postconditions | Rollback |
|---|---|---|---|
| → `pending_approval` | Profile complete; email unique | `submittedAt` set | N/A |
| → `approved` | Status `pending_approval`; admin role | `approvedAt`, `approvedBy` = admin user id; `subscriptionStatus` active | None — use Support case if mistaken |
| → `rejected` | Status `pending_approval`; reason 3–500 chars | `rejectionReason`; clear `approvedAt` | Vendor may resubmit |

**Who to notify:** optional email/WhatsApp to vendor on reject (**proposed** — not in scope v1). Internal: note on Support case if rejection follows incident.

---

## Scenario A — Goodwill credit after failed replies

1. Reliability shows 3+ `Message.status = failed` for shop X (see Reliability module).
2. Staff opens `/vendors/:id`, confirms `walletBalanceMilli` — e.g. ₹0.12 (`120` milli).
3. Staff enters **₹50.00**, reason: `Goodwill credit after Graph API outage 17 Oct`.
4. UI generates `idempotencyKey` at confirm open; `POST /api/vendors/:id/recharge-wallet` body:

```json
{ "amount": 50000, "idempotencyKey": "uuid-v4", "reason": "..." }
```

(`reason` **proposed** — store in `WalletTransaction.metadata.reason`.)

5. **Postconditions:** `walletBalanceMilli` += 50000; one `WalletTransaction` `recharge`; `metadata.adminUserId`; audit `wallet_credited` (**proposed**).
6. **Rollback:** no automatic reversal — finance issues compensating debit only via new product process (**out of scope**).

---

## Scenario B — Approve shop (deferred — optional future)

**Not Phase 1.** Use only if product later enables `pending_approval` and manual review ([DECISIONS.md](../DECISIONS.md#1-onboarding-approval--auto-approve-locked)).

1. Dashboard Waiting > 0; filter `pending_approval`.
2. Verify `businessName`, `email`, `phone`, `category` on detail.
3. `POST /api/admin/vendors/:id/approve` (**proposed**) or PATCH onboarding admin route.
4. **Postconditions:** `registrationStatus = approved`, `approvedBy` ≠ `system`.
5. **Do not** credit wallet — trial already at signup (`trialGrantedMilli`).

---

## Scenario C — Map WhatsApp after Meta gives ids

1. Shop has no `WhatsAppNumber` row — empty card copy.
2. Staff enters `phoneNumberId`, `wabaId` from Meta Business Manager.
3. `POST /api/vendors/:id/map-wa-number` — upsert on `phoneNumberId`.
4. If id owned by another `vendorId`, confirm move — previous shop loses number row.
5. **Postconditions:** row exists; `connectStatus` may still be null — **not live**.
6. Vendor completes connect flow in web-vendor for token + `live` status.

---

## Runbook steps (numbered)

### 1. Read home counts

| Step | Actor | Action |
|---|---|---|
| 1.1 | Staff | Open `/dashboard` |
| 1.2 | System | **Proposed** `GET /api/admin/dashboard-summary` returns `{ totalVendors, approvedVendors, pendingApproval, orderRevenuePaiseMonth }` |
| 1.3 | System | Order revenue: sum `Order.totalAmount`, exclude `cancelled`, month boundary `Asia/Kolkata` |

**API sequence (engineer):**

1. `GET /api/admin/dashboard-summary` — `requireRole('admin')`.
2. Prisma: `vendor.count`, `vendor.count({ where: { registrationStatus: 'approved' }})`, etc.
3. `order.aggregate` with `createdAt` range — use index `idx_order_vendor_created`.

**Error matrix**

| Condition | User-visible | Internal |
|---|---|---|
| 500 from API | "Could not load shop counts." | Log Prisma error |
| Auto-approve on | Waiting = 0 with caption | Document in UI |

### 2. Find a shop

- Search: `businessName`, `phone`, `email` (client-side today).
- **Proposed:** add `registrationStatus` to `vendorListSelect` + status filter query param when paginating.

### 3. Approve / 4. Reject

See status machine. **Proposed routes:**

- `POST /api/admin/vendors/:id/approve` — 409 if already `approved`.
- `POST /api/admin/vendors/:id/reject` — body `{ rejectionReason }`.

Auth: `requireRole('admin')`.

### 5. Read shop detail

Parallel fetch (existing):

| Call | Returns |
|---|---|
| `GET /api/vendors/:id/config` | `walletBalanceMilli`, `markupPercent`, `catalogImportEnabled`, AI block |
| `GET /api/vendors/:id/feature-flags` | `{ conversation_turn_audit: boolean }` |
| `GET /api/vendors/:id/wallet-transactions?limit=50` | Ledger rows |

**Proposed additions:**

- Extend config or `GET /api/vendors/:id/onboarding` — `registrationStatus`, `submittedAt`, `approvedAt`, `approvedBy`, `rejectionReason`, `trialExpiresAt`, `trialGrantedMilli`.
- `GET /api/vendors/:id/whatsapp-numbers` — array from `WhatsAppNumber`.

### 6. Change markup

**Implemented.** `PATCH /api/vendors/:id/billing-config` `{ "markupPercent": 60 }`.

| Pre | Post |
|---|---|
| Integer 0–500 | `Vendor.markupPercent` updated |

User-visible: MarkupEditor preview uses `EXAMPLE_BASE_MILLI = 260` → ₹0.26 base.

### 7. Add wallet money

| Check | Rule |
|---|---|
| Amount | Positive rupees → `rupeesToMilli` → integer `amount` |
| Idempotency | Client-generated key on confirm; never omit |
| Reason | 3–200 chars (**proposed** required) |

**Service:** `creditWalletFromTopUp` — does not create `CreditUsage`.

| Error code | User-visible |
|---|---|
| `invalid_amount` | "Enter a positive amount." |
| `not_found` | "Shop not found." |
| Network retry | Same key → no double credit |

### 8. WhatsApp connection

Read fields: `connectStatus`, `displayPhone`, `displayName`, `lastErrorCode`, `lastErrorMessage`, `connectedAt`, `liveAt`.

Statuses (`whatsappConnectTypes.ts`): `not_started`, `meta_in_progress`, `credit_attached`, `live`, `disconnected`, `error`.

**Security:** never display `accessTokenEncrypted`.

### 9. Turn-audit flag

`PATCH /api/vendors/:id/feature-flags` — strict schema; Pino log in route.

Lambdas read flag within ~30s — warn in UI (existing copy in `TurnAuditToggle.tsx`).

---

## Edge cases (expanded)

| Case | User-visible | Internal |
|---|---|---|
| Double-click credit | One row if key reused | Log idempotent response |
| Send `amount: 50` meaning rupees | ₹0.05 credited | Training issue |
| Approve while `onboarding` | Buttons hidden | — |
| `trial_expired` + not approved | Vendor blocked in pipeline | Reliability wallet queue when stored |
| Email duplicate on approve | "Email already used" | `completeOnboarding` check |

---

## Engineer API checklist (implementation order)

1. Add `registrationStatus` (+ optional `submittedAt`) to list select.
2. Dashboard summary endpoint.
3. (**Deferred**) Admin approve/reject + optional `completeOnboarding` → `pending_approval` if compliance requires manual review.
4. Recharge body `reason` → `metadata.reason`.
5. WhatsApp numbers GET.
6. Wire UI: dashboard, filters, onboarding card, recharge, WhatsApp.
7. Emit audit events (Controls schema).

---

## What engineers must not do

- `UPDATE "Vendor" SET "walletBalanceMilli" = ...` except via `creditWalletFromTopUp` / `chargeVendor`.
- Use `Admin` table for login allowlist.
- Treat `subscriptionPlan` as price.
- Enable turn-audit globally by default.
- Log or display WhatsApp tokens.
