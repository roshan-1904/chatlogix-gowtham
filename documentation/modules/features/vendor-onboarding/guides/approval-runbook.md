# Vendor approval ops runbook

**Last updated:** 2026-09-17

**Target funnel:** vendors **auto-approve** when they finish onboarding (24/7, no queue). This runbook is for **exceptions** — suspend, reject, or manually unstick a vendor — not for every signup.

Full funnel: [public-signup-onboarding.md](./public-signup-onboarding.md). WhatsApp connect: [whatsapp-connect-p2h.md](./whatsapp-connect-p2h.md).

---

## Happy path (no ops action)

1. Vendor completes onboarding → **`registrationStatus = 'approved'`** (target; see gaps in public-signup doc if code still sets `pending_approval`).
2. **Trial balance carries forward** — do **not** set `walletBalanceMilli = 0`.
3. Vendor may top up at `/wallet` (**mock** today) or use **carried trial** for live AI; connects WhatsApp (P2h).

---

## Manually approve a vendor (legacy / exception)

Use only when auto-approve is broken or a vendor is stuck in `pending_approval`.

```sql
UPDATE "Vendor"
SET
  "registrationStatus" = 'approved',
  "approvedAt" = NOW(),
  "approvedBy" = 'ops@chatlogix.in',
  "subscriptionStatus" = 'active'
  -- Target: do NOT zero walletBalanceMilli (carry forward trial)
WHERE phone = '+919876543210';
```

Or script ( **note:** shipped script still zeros wallet — update script when implementing carry-forward):

```bash
cd backend && npx tsx scripts/approve-vendor.ts +919876543210 ops@chatlogix.in
```

After approval:

1. **Target:** trial balance **carried forward** — never reset to 0 on approve.
2. Call `notifyVendorApproved()` (stub logs the WhatsApp/SMS copy today).
3. Vendor should land on `/dashboard`, not onboarding.
4. **Wallet funding:** vendors self-serve via `/wallet` ([P2g](./wallet-top-up-p2g.md), mock payments until Razorpay credentials exist). Admin `POST /api/vendors/:id/recharge-wallet` remains the ops escape hatch — its `amount` is in **millirupees** (₹1,000 = `1000000`), not paise.
5. **WhatsApp connect:** do **not** SQL-insert `WhatsAppNumber` or paste a token for new vendors. They self-serve at `/settings/whatsapp` after [P2h](./whatsapp-connect-p2h.md) ships. Existing mapped numbers (Ibell, Lush, …) stay on the global token until migrated. Manual mapping is a **temporary** exception only.

## Billing knobs ops should know

Money on the wallet is **millirupees** (1 rupee = 1000). Full model: [BILLING_AND_PRICING.md](../../../../../docs/BILLING_AND_PRICING.md).

| Knob | Where | Note |
| --- | --- | --- |
| Per-vendor markup | `Vendor.markupPercent`, default **50** | Edit via `PATCH /api/vendors/:id/billing-config` (admin) or the web-admin vendor detail panel. Range 0–500 |
| Trial grant | `PlatformSettings.trialGrantPaise`, default `5000` paise = **₹50** | Edit on the web-admin `/billing` page (`TRIAL_GRANT_MILLI` is only a fallback). Roughly 250 replies |
| Minimum top-up | `PlatformSettings.minWalletTopUpPaise`, default **₹100** | **Per top-up transaction only** — not a go-live requirement |
| Low-balance warning | Under **₹20** (`20000` milli) | Surfaces on the vendor dashboard |
| Platform fees, spend caps, top-up limits, USD/INR | `PlatformSettings` (stored in **paise**) | Same `/billing` page, shown in rupees. Env vars are seed + fallback only; `WALLET_PAYMENT_PROVIDER` stays env-only |
| Ledger inspection | `GET /api/vendors/:id/wallet-transactions?limit=50` (admin) | Each `deduction` row's `metadata` has the full cost breakdown and the `markupPercent` it was charged at |

**Admin access** to web-admin comes from the `AUTH_ADMIN_PHONES` env allowlist (`backend/src/services/roleService.ts`), **not** the `Admin` table. Adding an ops phone number means editing that env var and restarting the API.

The millirupee migrations (`20250916120000_wallet_top_up_intent`, `20250916180000_wallet_milli_units`, `20250916210000_credit_usage_source`) and `20250916220000_platform_settings` are **applied** as of 2026-09-16, so `walletBalanceMilli` is the live column. On any environment that predates them the column is still `walletBalance` — check with `prisma migrate status` before running the SQL above there.

## Reject / suspend a vendor

```sql
UPDATE "Vendor"
SET
  "registrationStatus" = 'rejected',
  "rejectionReason" = 'We could not verify your shop details. Please contact support.'
WHERE phone = '+919876543210';
```

Use for abuse, fraud, or policy — not as a normal onboarding gate.

## Notification stub

`backend/src/services/vendorApprovalNotificationService.ts` logs the post-completion message to login phone. Wire to `whatsappTemplateService` when production templates are ready.

Suggested copy (2026-09-17):

> You’re set up on ChatLogix. Connect WhatsApp when you’re ready — keep wallet balance so customers get replies.

## Daily ops digest (optional)

Only relevant while legacy `pending_approval` still exists in code:

```sql
SELECT COUNT(*) AS pending_count
FROM "Vendor"
WHERE "registrationStatus" = 'pending_approval';
```

When auto-approve ships, this count should stay near zero.

## Funnel logs

Search application logs for `onboarding_funnel` events:

- `signup_started`, `otp_verified`, `step_N_completed`
- `sandbox_message_sent`, `sandbox_voice_sent`, `submitted`, `approved`

Alert thresholds (log warnings today):

- Sandbox error rate > 2% over 1h window
- Sandbox p95 latency > 20s (`sandbox_latency_alert`)
