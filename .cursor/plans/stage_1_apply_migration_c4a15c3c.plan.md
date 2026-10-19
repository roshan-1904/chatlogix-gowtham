---
name: Stage 1 Route ledger and migration
overview: The stage 1 code was written for the earlier RazorpayX design. Rework it for Route (R1–R6), apply the review fixes (F1, F2, F4–F9), then apply the migration once Razorpay confirms Route. Split out the auto-recharge columns if stage 4 needs them sooner.
todos:
  - id: r1-schema
    content: "R1: Route schema — drop VendorPayout, payoutFundAccountId, SettlementEntry.bucket/payoutId; add SettlementTransfer, CustomerRefund, new Vendor/CustomerPayment/PlatformSettings columns"
    status: completed
  - id: r2-math
    content: "R2: settlementMath — fee GST, TCS, TDS, reserve split, new-shop hold, daily cap, held/reserve/owed summary"
    status: completed
  - id: r3-service
    content: "R3: settlementService — replace payout functions with capture/transfer, release, refund request/fund/submit, dispute functions"
    status: completed
  - id: r4-route-client
    content: "R4: RouteClient interface and a fake for tests"
    status: completed
  - id: r5-constants
    content: "R5: hold, cap, reserve, pause, and draft-expiry constants"
    status: completed
  - id: f1-vendor-lock
    content: "F1: lock the vendor row at the start of every *Tx function"
    status: completed
  - id: f2-export-tx
    content: "F2: export the *Tx functions so the webhook commits event + money together"
    status: completed
  - id: f4-restrict
    content: "F4: onDelete Restrict on every relation of the money tables, in schema and migration.sql"
    status: completed
  - id: f5-bigint-json
    content: "F5: select fields on POST /api/vendors/register; add a bigint-to-string response helper"
    status: completed
  - id: f6-f9
    content: F6 batched release, F7 untransferred refunds, F8 DB clock, F9 capture guards
    status: completed
  - id: r6-tests
    content: "R6: rewrite the tests to docs/payments/02 phase 1, plus one real-Postgres concurrency test"
    status: completed
  - id: split-auto-recharge
    content: If stage 4 must start before Razorpay confirms Route, move the autoRecharge* columns into their own migration
    status: completed
  - id: migrate
    content: Apply the settlement migration after Razorpay's Route confirmation is saved in 05
    status: completed
  - id: generate
    content: Regenerate the Prisma client when the API process is not locking the engine
    status: pending
isProject: false
---

# Stage 1 — Route ledger, then the settlement migration

The design moved to Razorpay Route on 2026-10-19 ([docs/payments/05-compliance-and-risk.md](docs/payments/05-compliance-and-risk.md), D1). The existing code was written for a ChatLogix-held balance with RazorpayX payouts. The capture math and the idempotent credit carry over. The payout state machine goes. Full spec: **Phase 1** in [docs/payments/02-implementation-plan.md](docs/payments/02-implementation-plan.md).

## Already in the repo

- Schema and migration: [backend/prisma/schema.prisma](backend/prisma/schema.prisma), [backend/prisma/migrations/20261019140000_order_settlement/migration.sql](backend/prisma/migrations/20261019140000_order_settlement/migration.sql). Untracked and not applied, so edit them in place.
- Writer: [backend/src/services/payments/settlementService.ts](backend/src/services/payments/settlementService.ts).
- Math: [backend/src/services/payments/settlementMath.ts](backend/src/services/payments/settlementMath.ts).
- Tests: [backend/src/services/payments/__tests__/settlementService.test.ts](backend/src/services/payments/__tests__/settlementService.test.ts) (10 passing against the old design).

## Rework for Route

- **R1 schema.** Drop `VendorPayout`, `Vendor.payoutFundAccountId`, and `SettlementEntry.bucket` and `payoutId`. Add:
  - `SettlementTransfer`: `amountPaise`, `reversedPaise`, `kind` (`main`, `reserve`, `dispute_return`), `status` (`to_create`, `on_hold`, `releasing`, `released`, `reversed`, `failed`), `eligibleAt`, `releasedAt`, `razorpayTransferId @unique`.
  - `CustomerRefund`: `amountPaise`, `status` (`awaiting_funding`, `submitting`, `submitted`, `processed`, `failed`, `cancelled`), `shortfallMilli`, `fundingRazorpayOrderId`, `fundingExpiresAt`, `reversalPlan`, `razorpayRefundId @unique`.
  - `Vendor`: `razorpayLinkedAccountId @unique`, `linkedAccountStatus`, `collectionStartedAt`, `paymentLinkAutoSend` (default true), `releasesFrozenAt`, `releasesFrozenReason`, `rollingReserveBps` (default 0), `settlementBankChangedAt`, `legalName`, `panEncrypted`, `gstin`, `gstExempt`.
  - `CustomerPayment`: `platformFeeGstPaise`, `gstTcsPaise`, `tdsPaise`, `refundRequired`, `disputeStatus`. Drop `availableAt` (the hold is on the transfer).
  - `PlatformSettings`: `gstTcsBps` 50, `tds194oBps` 10, `tds194oNoPanBps` 500.
  - `SettlementEntry.kind`: `payment_credit`, `transfer_release`, `refund_debit`, `shop_funding`, `dispute_debit`, `dispute_credit`, `adjustment`.
- **R2 math.** The quote gains platform-fee GST (`× 18/118`), TCS, TDS, and the reserve split. Add the hold calculator: a shop is new while within 30 days of `collectionStartedAt` or under 20 captured payments, whichever ends later; new shops hold 7 days, others 48 hours. Add the daily cap check (₹25,000 per IST day for new shops, with a single larger transfer allowed alone). Replace `summarizeSettlement` with held / reserve / owed.
- **R3 service.** Remove `reservePayout`, `completePayout`, `releasePayout`. Add `creditCapturedPaymentTx`, `createPendingTransfers`, `releaseDueTransfers`, `requestRefund`, `creditShopFundingTx`, `submitRefund`, `applyRefundStateTx`, `applyDisputeTx`, `expireRefundDrafts`, `getSettlementPosition`. Every Razorpay write follows intent, call, confirm, and transfers and reversals are created only after fetching the existing ones (rule 13).
- **R4 RouteClient.** `createTransfer`, `fetchPaymentTransfers`, `setTransferHold`, `reverseTransfer`, `fetchTransferReversals`, `createRefund`, `fetchRefund`. A fake implements it for tests.
- **R5 constants.** As in the 02 constants table.

## Fixes that still apply

- **F1 (critical).** Lock the vendor row before the first balance read in every `*Tx` (`SELECT … FOR UPDATE`, or `pg_advisory_xact_lock` as in [backend/src/services/catalogCommitService.ts](backend/src/services/catalogCommitService.ts)).
- **F2.** Export the `*Tx` functions so stage 2 commits `PaymentWebhookEvent` with the money change.
- **F3.** Retired with RazorpayX.
- **F4.** `onDelete: Restrict` on every relation of `CustomerPayment`, `PaymentLink`, `SettlementEntry`, `SettlementTransfer`, `CustomerRefund`.
- **F5.** [backend/src/routes/vendors.ts](backend/src/routes/vendors.ts) `POST /register` returns the whole `Vendor`. Add a `select`. Add a bigint-to-string helper for responses.
- **F6.** Release in batches of about 100.
- **F7.** A payment that was never transferred is refunded by ChatLogix with no reversal and no settlement entry; the webhook returns success.
- **F8.** `capturedAt` from the database clock.
- **F9.** Capture guards: INR, amount equals `Order.totalAmount`, order not cancelled or already paid, link id matches the open link. A failed guard stores the payment with `settlementAlert` and `refundRequired` and creates no transfer.

## Tests (R6)

Use the list in 02 phase 1. Keep the in-memory fake for unit tests. Add one integration test, outside the default `npm test` run, against a disposable Postgres: two refunds started at once cannot both spend the same held money, and two concurrent captures both credit.

## Apply

- Apply the settlement migration only after Razorpay’s written Route confirmation is saved in 05. If Razorpay declines Route, D1 reopens and the tables change again.
- If stage 4 must start first, move the three `autoRecharge*` columns into their own migration (for example `20261019135000_vendor_auto_recharge`) and apply only that one.
- Local dev uses the shared remote database. Run `prisma migrate deploy` only when that write is intended.
- Re-run `prisma generate` after the API process is stopped. The last generate failed to replace `query_engine-windows.dll.node` because the file was locked.
- Do not backfill existing orders. New columns default to collection off, `paymentFeeBps` 100, settlement `0`.
- After applying, update the migration count and list in `CLAUDE.md` and `docs/BILLING_AND_PRICING.md` §5.

## Done when

- R1–R6 and F1, F2, F4–F9 are merged and the payments test folder is green. The concurrency integration test passes.
- `POST /api/vendors/register` returns 200 with the new schema generated.
- Razorpay’s Route confirmation is saved, and `prisma migrate status` shows the settlement migration applied. Or only the split auto-recharge migration is applied.
- A vendor row reads `settlementBalanceMilli = 0` and the AI wallet balance is unchanged.
