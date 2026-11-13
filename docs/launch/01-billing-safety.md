# 1. Billing safety

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Not started** · Competitive role: Differentiator · Priority: Phase 1, order 1 (unchanged)
> Verified: read order memory, Redis, Postgres, env (`backend/src/services/platformSettingsService.ts:346-373`); `DEFAULT_MARKUP_PERCENT = 50` (`pricingService.ts:32`); the PATCH fields (`backend/src/routes/adminSettings.ts:21-31`). Not verifiable from the repo: the live row, the live Redis key, the Lambda environment. Changed in this review: sections 3, 4, and 6 now compare the Redis host and read the Redis snapshot, because a Lambda prices from Redis before Postgres. Section 3 records that mock top-up defaults to on.

## 1. Phase and why this task is in it

Phase 1. The next WhatsApp reply is priced from `PlatformSettings` id `default` before any screen fix matters. If the row the Lambdas read is the row the admin screen showed, a turn is priced with a ₹222 platform fee and an FX pin of ₹50. This task is the gate in front of every later phase.

## 2. Problem and user impact

The admin billing screen showed per-turn fee ₹222, outbound media ₹22, USD/INR override ₹50 against a live Frankfurter rate of ₹93.69, and mock wallet top-up on. [`docs/BILLING_AND_PRICING.md`](../BILLING_AND_PRICING.md) says both fees default to 0 paise and that mock top-up is turned off in production once Razorpay is live. Effective FX is `usdToInrOverride ?? usdToInrRate` (`computeEffectiveUsdToInrRate` in `backend/src/services/platformSettingsService.ts`).

`computeChargeMilli` in `backend/src/services/pricing/pricingService.ts` does `ceil((aiCostMilli + whatsappCostMilli + platformFeeMilli) × (1 + markupPercent/100))`. `platformFeePerTurnPaise` is converted with `paiseToMilli` (×10) inside `turnEstimateCost` and inside the conversation debit. A stored 22200 paise is ₹222 before markup. At the schema default markup of 50 (`DEFAULT_MARKUP_PERCENT`), that fee alone is about ₹333. The OpenAI portion is converted at the override when the override is set, so the AI slice is about half the Frankfurter rate. `whatsappCostMilli` stays 0 until the Meta rate card ([`docs/BILLING_AND_PRICING.md`](../BILLING_AND_PRICING.md)).

Ibell's next customer message is the user impact when the Lambda host is that row. Mock top-up lets a shop add a balance that is not a payment (`frontend_v2/apps/web-vendor/src/pages/Wallet.tsx` shows "Add money (simulated)" when the flag is on).

The admin form displays fee columns as rupees (`paiseToRupeeInput` in `frontend_v2/apps/web-admin/src/lib/settings.ts`). A screen value of ₹222 means the column is 22200 paise. The FX override is a rupee-per-dollar rate, not paise.

## 3. Current behavior

`ensurePlatformSettings` in `backend/src/services/platformSettingsService.ts` reads in this order:

1. Process memory if younger than `MEMORY_TTL_MS` (60 seconds).
2. Redis key `PLATFORM_SETTINGS_REDIS_KEY` (`platform:settings`), TTL `REDIS_TTL_SECONDS` (24 hours).
3. Postgres `PlatformSettings` where `id` is `PLATFORM_SETTINGS_ID` (`default`).
4. Env fallback (`PLATFORM_FEE_*_MILLI` via `milliEnvToPaise`, and `MOCK_WALLET_TOPUP_ENABLED`).

`getPlatformSettings` is the sync reader. `turnEstimateCost` and `debitAfterEnqueue` (`backend/src/conversation/billing.ts`) both depend on that snapshot. `debitAfterEnqueue` calls `chargeVendor`. `chargeVendor` is the only writer of `Vendor.walletBalanceMilli`.

`updatePlatformSettings` upserts the singleton and then `writeRedisAndDropMemory`. That drops memory in the process that handled the write. A warm Lambda keeps its own memory for up to 60 seconds. `PATCH /api/admin/settings` (`backend/src/routes/adminSettings.ts`) is the HTTP path. It accepts `usdToInrOverride`, `platformFeePerTurnPaise`, `platformFeeOutboundMediaPaise`, and `mockWalletTopUpEnabled`. It does not accept `usdToInrRate`.

Redis is read before Postgres. A Lambda whose memory is older than 60 seconds takes the `platform:settings` snapshot from Redis when the key exists, and does not query Postgres (`ensurePlatformSettings`). The key lives 24 hours. A process that shares the Lambda's Redis and writes through `updatePlatformSettings` changes what the Lambda charges, including when that process points at a different Postgres. A process that shares the Redis and misses the key refills it from its own Postgres row. The Postgres host comparison alone does not settle which values price the next turn.

Mock top-up defaults to on in two places: the column default (`mockWalletTopUpEnabled Boolean @default(true)` in `backend/prisma/schema.prisma`) and the env fallback (`MOCK_WALLET_TOPUP_ENABLED` unset reads as true in `envFallbackSettings`). The mock confirm route in `backend/src/routes/vendorWallet.ts` refuses unless `WALLET_PAYMENT_PROVIDER` is `mock` and the flag is true. Task 13 step 5 turns the env fallback off in production.

The conversation processor that charges a turn is the Lambda `chatlogix-incoming-response-generator` (`backend/src/conversation/pipeline.ts` calls `debitAfterEnqueue`). Local admin on `localhost:3001` may or may not be the same Postgres. `FX_REFRESH_ENABLED` stops a local process from writing the FX rate. It does not stop `PATCH /api/admin/settings`.

## 4. Step-by-step implementation

This is an operations change plus one recompute. It does not change the charge formula.

1. Read `DATABASE_URL` on `chatlogix-incoming-response-generator`. Record host and port only. Redact user, password, and database name in anything that will be pasted or committed. Note whether the port is 6432 (PgBouncer, the path the five Lambdas use) or a direct Postgres port. Compare that host and port to the process behind `localhost:3001`, and to the Express API if it is a third host. Read the Redis host and port on the same processes and redact them the same way. Read `WALLET_PAYMENT_PROVIDER` on the Express API.
2. On each distinct host, `SELECT` the singleton `id = 'default'`: `platformFeePerTurnPaise`, `platformFeeOutboundMediaPaise`, `usdToInrOverride`, `usdToInrRate`, `usdToInrFetchedAt`, `mockWalletTopUpEnabled`, `updatedAt`, `updatedBy`. Write raw columns next to the screen values. Read Redis key `platform:settings` on the Redis the Lambda uses: whether it exists, its remaining TTL, and the same four fields inside the JSON snapshot. Do not delete it in this step. When the key exists, its values are what a Lambda with expired memory charges from, ahead of the Postgres row.
3. Stop and write a short note: host redacted, raw columns, the four fields from the Redis snapshot, whether the Lambda host is the same database as the admin screen, and whether the Lambda's Redis is the Redis the admin process writes. The audited screen values are per-turn fee ₹222 (22200 paise), media ₹22 (2200 paise), FX override ₹50, live Frankfurter ₹93.69, mock wallet top-up on.
4. Apply the four-field change only when the Lambda host is that audited row. Set `platformFeePerTurnPaise` to 0, `platformFeeOutboundMediaPaise` to 0, `usdToInrOverride` to null, `mockWalletTopUpEnabled` to false. Leave `usdToInrRate`, `trialGrantPaise`, `trialExpiryDays`, tax bps (`gstTcsBps`, `tds194oBps`, `tds194oNoPanBps`), and top-up limits (`minWalletTopUpPaise`, `maxWalletTopUpPaise`, `walletTopUpPresetsPaise`) as they are. Prefer `PATCH /api/admin/settings` through `updatePlatformSettings` so `updatedBy` is the person who applied it. When the hosts differ, write nothing on the Lambda database. The note is the deliverable. Do not describe a write on the admin-only host as the production fix, and do not run the under-₹1 exit check against that other host. One more case: the Postgres hosts differ, the Redis is shared, and the Redis snapshot carries the audited values. The Lambda is then charging from them. Deleting the key does not hold, because whichever process misses first refills it from its own Postgres. Stop and tell the founder. The fix is to take the non-production process off the production Redis and then delete the key once. That is an environment change, and it is outside the four-field write.
5. After a successful four-field write, delete Redis key `platform:settings`. `updatePlatformSettings` already `setCached` the new snapshot and dropped memory in the API process. The delete forces the next `ensurePlatformSettings` to read Postgres. Warm Lambdas can keep the previous snapshot for up to 60 seconds (`MEMORY_TTL_MS`). Wait that long before treating a live Lambda read as fresh. Do not delete the key when step 4 did not write.
6. Recompute one charge with `computeChargeMilli`. Do not call `chargeVendor`. Do not create a `CreditUsage` or `WalletTransaction`. In a unit test or a one-off script that reads the vendor row's `markupPercent` and does not write:
   - `aiCostMilli` from `aiCostMilliForTokens` with a small sample prompt and completion count on the vendor's `aiModel` (fallback `DEFAULT_CONVERSATION_MODEL`).
   - `whatsappCostMilli` 0.
   - `platformFeeMilli` from `paiseToMilli` of the platform-fee column just read (0 after a successful write).
   - `markupPercent` from `getVendorMarkupPercent` or the row. Do not change the vendor's markup.
   - Assert `chargeMilli < 1000` (under ₹1). Also assert the fee component in the breakdown is 0.
7. Confirm the vendor wallet page does not offer "Add money (simulated)". That string is in `frontend_v2/apps/web-vendor/src/pages/Wallet.tsx` and follows `mockWalletTopUpEnabled`.

No edit to [`docs/BILLING_AND_PRICING.md`](../BILLING_AND_PRICING.md) unless the recompute shows `computeChargeMilli` disagreeing with the formula already documented there. A data change on the singleton is not a formula change.

## 5. What not to change

- `Vendor.walletBalanceMilli`, any `CreditUsage` row, any `WalletTransaction`. Do not call `chargeVendor`. Do not debit a customer or a shop.
- `usdToInrRate`, trial grant, tax bps, catalog daily caps, and top-up min, max, and presets.
- The charge formula, markup on Ibell, and `RAZORPAY_USE_FAKE_ROUTE`.
- Redis, when step 4 did not write. The key delete is only the follow-up to that write.
- The Lambda database, when its host is not the audited row.

## 6. Acceptance checks

- The note says whether the Lambda host matches the admin screen, with raw paise and the FX numbers. It names the Redis host for the Lambda and for the admin process, and lists the four fields as read from the Redis snapshot.
- When the hosts match and the write ran: columns are `platformFeePerTurnPaise` 0, `platformFeeOutboundMediaPaise` 0, `usdToInrOverride` null, `mockWalletTopUpEnabled` false. `updatedBy` is the person who applied it. `usdToInrRate` is unchanged.
- `computeChargeMilli` for one sample turn at the shop's existing markup returns `chargeMilli` under 1000, with `platformFeeMilli` 0. No wallet row changed.
- Negative case: if the Lambda host differs, the Lambda columns are untouched, including a fee that is still 22200 paise. The exit check for "under ₹1" waits. Later phases do not treat Ibell as unblocked on price.
- Negative case: a second run of the same patch does not insert a `WalletTransaction`.
- Negative case: Postgres on the Lambda host shows fee 0 while the Redis snapshot still shows 22200 paise. The under-₹1 check is not signed until the snapshot on the Lambda's Redis shows 0.
- The wallet page has no simulated add control after mock is false on the database that page reads.

## 7. Dependencies

None. Task 2 can start once the host note exists. Task 2 does not wait on the four-field write. Every later charge check (tasks 6, 12, and the Phase 3 exit) waits on this task's write or on a note that the Lambda row was already at the defaults.
