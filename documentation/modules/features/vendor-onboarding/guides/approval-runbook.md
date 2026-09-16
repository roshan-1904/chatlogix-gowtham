# Vendor approval ops runbook (P2f)

Manual approval remains the v1 path until an admin portal queue ships.

## Approve a vendor

```sql
UPDATE "Vendor"
SET
  "registrationStatus" = 'approved',
  "approvedAt" = NOW(),
  "approvedBy" = 'ops@chatlogix.in',
  "subscriptionStatus" = 'active',
  "walletBalanceMilli" = 0
WHERE phone = '+919876543210';
```

After approval:

1. Trial balance is **not** carried over (`walletBalanceMilli = 0`).
2. Call `notifyVendorApproved()` (stub logs the WhatsApp/SMS copy today).
3. Vendor re-login should land on `/dashboard`, not onboarding.
4. **Wallet funding:** vendors self-serve via `/wallet` ([P2g](./wallet-top-up-p2g.md), mock payments until Razorpay credentials exist). Admin `POST /api/vendors/:id/recharge-wallet` remains the ops escape hatch — its `amount` is in **millirupees** (₹1,000 = `1000000`), not paise.

## Billing knobs ops should know

Money on the wallet is **millirupees** (1 rupee = 1000). Full model: [BILLING_AND_PRICING.md](../../../../../docs/BILLING_AND_PRICING.md).

| Knob | Where | Note |
| --- | --- | --- |
| Per-vendor markup | `Vendor.markupPercent`, default **50** | Edit via `PATCH /api/vendors/:id/billing-config` (admin) or the web-admin vendor detail panel. Range 0–500 |
| Trial grant | `PlatformSettings.trialGrantPaise`, default `5000` paise = **₹50** | Edit on the web-admin `/billing` page (`TRIAL_GRANT_MILLI` is only a fallback). Roughly 250 replies |
| Low-balance warning | Under **₹20** (`20000` milli) | Surfaces on the vendor dashboard |
| Platform fees, spend caps, top-up limits, USD/INR | `PlatformSettings` (stored in **paise**) | Same `/billing` page, shown in rupees. Env vars are seed + fallback only; `WALLET_PAYMENT_PROVIDER` stays env-only |
| Ledger inspection | `GET /api/vendors/:id/wallet-transactions?limit=50` (admin) | Each `deduction` row's `metadata` has the full cost breakdown and the `markupPercent` it was charged at |

**Admin access** to web-admin comes from the `AUTH_ADMIN_PHONES` env allowlist (`backend/src/services/roleService.ts`), **not** the `Admin` table. Adding an ops phone number means editing that env var and restarting the API.

The millirupee migrations (`20250916120000_wallet_top_up_intent`, `20250916180000_wallet_milli_units`, `20250916210000_credit_usage_source`) and `20250916220000_platform_settings` are **applied** as of 2026-09-16, so `walletBalanceMilli` is the live column. On any environment that predates them the column is still `walletBalance` — check with `prisma migrate status` before running the SQL above there.

## Reject a vendor (optional)

```sql
UPDATE "Vendor"
SET
  "registrationStatus" = 'rejected',
  "rejectionReason" = 'We could not verify your shop details. Please contact support.'
WHERE phone = '+919876543210';
```

## Notification stub

`backend/src/services/vendorApprovalNotificationService.ts` logs the post-approval message to login phone. Wire to `whatsappTemplateService` when production templates are ready.

## Daily ops digest (manual v1)

```sql
SELECT COUNT(*) AS pending_count
FROM "Vendor"
WHERE "registrationStatus" = 'pending_approval';
```

## Funnel logs

Search application logs for `onboarding_funnel` events:

- `signup_started`, `otp_verified`, `step_N_completed`
- `sandbox_message_sent`, `sandbox_voice_sent`, `submitted`

Alert thresholds (log warnings today):

- Sandbox error rate > 2% over 1h window
- Sandbox p95 latency > 20s (`sandbox_latency_alert`)
