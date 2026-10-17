# Vendors — overview

## Problem statement

ChatLogix revenue is **usage-based wallet debit** on every AI turn (see [BILLING_AND_PRICING.md](../../BILLING_AND_PRICING.md)). A shop that never connects WhatsApp, never gets approved, or runs out of wallet balance stops generating orders—and burns support time. The Vendors module is the **control plane for tenant lifecycle**: who is on the platform, whether they can trade, how much margin we earn (`markupPercent`), and how staff inject goodwill credits without breaking billing invariants.

**Scope:** shop directory, onboarding decision (when enabled), wallet credit, WhatsApp number attachment, turn-audit flag, dashboard KPIs tied to `Vendor` / `Order`.

**Non-goals:** editing catalog or orders (Controls look-inside); platform fee knobs (existing `/billing`); debiting wallets; vendor impersonation; plan SKUs (`subscriptionPlan` is bookkeeping only).

## Business depth

**Why this module exists**

- **Revenue:** `markupPercent` on every `chargeVendor` call is ChatLogix margin on OpenAI + platform fee.
- **Cost control:** trial grant (`trialGrantedMilli`) and wallet balance gate the pipeline (`canProcessMessage` in `billingService.ts`).
- **Vendor success:** WhatsApp `connectStatus` and wallet visibility reduce "bot not replying" tickets.
- **Risk:** manual credits must be idempotent and auditable; turn-audit exposes customer PII—per-shop only.

**Personas and jobs-to-be-done**

| Persona | Job | Screen |
|---|---|---|
| Ops | Approve/reject shop; map WA number after Meta setup | Vendor detail |
| Support | Credit wallet after outage; check balance vs failure | Recharge + ledger |
| Founder | See shop count, approved count, monthly order GMV | Dashboard |

**KPIs (definitions)**

| KPI | Definition | Source |
|---|---|---|
| Active shops | `COUNT(Vendor)` | `Vendor` |
| Approved shops | `registrationStatus = 'approved'` | `Vendor.registrationStatus` |
| Waiting for decision | `registrationStatus = 'pending_approval'` | Same — **may be 0 while auto-approve runs** |
| Order revenue (month) | Sum `Order.totalAmount` where `status != cancelled`, calendar month IST | **paise** — not wallet |
| Wallet balance | `walletBalanceMilli` | Display via `formatWalletAmount` |
| Low balance warning | `walletBalanceMilli < 20000` (₹20) | `dashboardStatsService` constant — vendor dashboard; admin alert in Controls |

**Ties to web-vendor and WhatsApp**

- Vendor completes onboarding in web-vendor; staff see resulting `registrationStatus`, `submittedAt`, WhatsApp rows.
- Customer messages hit Lambdas → `chargeVendor` on successful debit path; empty wallet → template, not a vendor screen update.
- Markup changes apply to **next** charge only; ledger history keeps `metadata.markupPercent` snapshot per debit.

**Decision rules: act vs wait**

| Signal | Act | Wait |
|---|---|---|
| `pending_approval` + complete profile | Approve or reject with reason | — |
| `approvedBy: 'system'` | Educate: auto-approve on today; do not backfill fake human approver | — |
| Failed replies (Reliability) | Credit if wallet-related; link Support case | Do not raise markup without finance sign-off |
| WhatsApp `error` / `disconnected` | Ops fixes Meta; map-number only when ids known | Do not mark `live` manually |
| Balance low but above gate | Controls alert at ₹20; Reliability may still show blocks | Credit only with documented reason |

**Regulatory / ops**

- Staff must not share vendor OTP or paste `accessTokenEncrypted` into tickets.
- Turn-audit logs may contain phone numbers and order text — enable only for debugging named shops.
- Manual credits are financial adjustments — reason string required (**proposed** on API metadata).

## Who uses it

ChatLogix staff on `AUTH_ADMIN_PHONES` (`roleService.ts`). Not vendors.

## Jobs the screen must finish

1. Live dashboard counts (shops, approved, monthly order revenue paise, waiting).
2. Search + filter by `registrationStatus`.
3. Approve / reject when workflow enabled.
4. Detail: identity, wallet, markup, ledger, WhatsApp, flags, trial fields.
5. Manual wallet credit via `recharge-wallet` + idempotency.
6. Map WhatsApp `phoneNumberId` + `wabaId`.
7. Toggle `conversation_turn_audit`.

## Already built / API only / net new

| Job | State | Evidence |
|---|---|---|
| List + client search | **Built** | `pages/Vendors.tsx`, `GET /api/vendors`, `vendorListSelect` in `routes/vendors.ts` |
| Wallet, markup, turn-audit, ledger | **Built** | `MarkupEditor`, `TurnAuditToggle`, `VendorDetailPanel`, wallet-transactions route |
| Dashboard KPIs | **Net new UI + API** | `Dashboard.tsx` hardcoded; need `GET /api/admin/dashboard-summary` (**proposed**) or server aggregates |
| `registrationStatus` on list | **API gap** | Column exists on `Vendor`; omitted from `vendorListSelect` |
| Approve / reject | **Net new API + onboarding change** | `vendorOnboardingService.completeOnboarding` sets `approved` + `approvedBy: 'system'` today; no route writes `pending_approval` / `rejected` |
| Recharge form + reason | **API partial** | `POST .../recharge-wallet` exists; no `metadata.reason` in body yet (**proposed**) |
| WhatsApp read | **Net new API** | `WhatsAppNumber` model; only `map-wa-number` write today (**proposed** `GET /api/vendors/:id/whatsapp-numbers`) |
| Admin register shop | **API only — do not productize** | `POST /api/vendors/register` — wallet 0, skips trial signup |
| Upgrade plan | **API only — ignore** | `POST .../upgrade-plan` — no billing effect |

**Key Prisma fields (`Vendor`)**

`registrationStatus`, `submittedAt`, `approvedAt`, `approvedBy`, `rejectionReason`, `subscriptionStatus`, `walletBalanceMilli`, `trialGrantedMilli`, `trialExpiresAt`, `markupPercent`, `featureFlags` (JSON), `catalogImportEnabled`.

**Key services**

| Concern | File |
|---|---|
| Onboarding completion | `backend/src/services/vendorOnboardingService.ts` |
| Trial signup wallet | `backend/src/services/vendorSignupService.ts` |
| Wallet credit | `backend/src/services/wallet/walletTopUpService.ts` `creditWalletFromTopUp` |
| Charges (not from admin UI) | `backend/src/services/pricing/pricingService.ts` |
| WhatsApp connect types | `backend/src/services/whatsapp/whatsappConnectTypes.ts` |

## Dependencies

- **Usage module** — links from vendor row to `/usage/:vendorId`.
- **Reliability** — failed reply context on detail (**proposed** latest-failure query).
- **Controls** — audit rows for approve, credit, markup (**proposed** `StaffAuditLog`).
- **Billing** — trial grant amount for new signups only (`PlatformSettings.trialGrantPaise`).

## Success criteria (measurable)

- Dashboard approved count matches `SELECT COUNT(*) FROM "Vendor" WHERE "registrationStatus" = 'approved'` within one request.
- ₹50 credit → exactly one `WalletTransaction` with `amountMilli = 50000`, `transactionType = recharge`, `metadata.source = admin_recharge`; repeat idempotency key → `idempotent: true`, no second row.
- Markup PATCH persists `markupPercent`; next `chargeVendor` uses new percent in metadata.
- WhatsApp card shows `connectStatus`, `displayPhone`, `lastErrorMessage` when row exists.

## Risks and open questions

| Risk | Mitigation |
|---|---|
| Auto-approve makes "Waiting" card always zero | Copy on dashboard; product decision to land on `pending_approval` |
| Full vendor list without pagination | Accept until ~500 shops; then server-side search (**proposed**) |
| Map-number moves row between vendors | Confirm dialog; audit `whatsapp_mapped` |
| Staff sends `50` as recharge amount | UI converts rupees → milli; QA case in runbook |

| Open question | Owner |
|---|---|
| Require manual approval for all categories? | Product |
| Should approve trigger WhatsApp connect email? | Ops |
| Expose `aiModel` on admin detail? | Engineering — read-only informational |

## Out of scope

Second billing settings page; `chargeVendor` from admin; per-shop usage charts (Usage module); catalog/order edit; `POST /api/vendors/register` form; plans product.
