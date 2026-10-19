# Implementation plan — Razorpay order payments with Route

**Status:** Design final 2026-10-19. Phase 1 Route ledger code (R1–R6, F1–F2, F4–F9) is in the repo; migration **`20261019140000_order_settlement` applied** 2026-10-19 (`prisma migrate status` up to date). **D1** (Razorpay’s written Route confirmation, 05) still gates **live** order money in phases 5–7 — tables are live, Route API flows are not production-enabled yet.  
**Flows:** [01-business-flow.md](./01-business-flow.md). **Account:** [03-razorpay-account-setup.md](./03-razorpay-account-setup.md). **Decisions:** [05-compliance-and-risk.md](./05-compliance-and-risk.md).  
**AI wallet authority:** [BILLING_AND_PRICING.md](../BILLING_AND_PRICING.md). Do not restate its formula here.

Build in the phase order below. Each phase is shippable on Razorpay **test** keys before the next one starts. Live keys wait until phase 0 KYC is approved, the outside confirmations in 05 are in, and the phase’s tests pass.

## Progress

| Phase | What | Status | Waits on |
|---|---|---|---|
| 0 | Razorpay test account, keys, webhook URL. Route requested. Confirmation questions sent to Razorpay, CA, and counsel. | Not started | — |
| 1 | Schema and ledger for Route, unit tests with a fake Razorpay client | **Done** — code in repo (18 unit tests; Postgres concurrency test is a skipped stub unless `SETTLEMENT_INTEGRATION=1`); **migration applied** (`20261019140000_order_settlement`, 2026-10-19). | — (schema gate met; **D1 still pending** for Route **live** money in phases 5–7) |
| 2 | Signed webhook route, mounted without JWT | **Done in repo** (stub dispatch; no balance credits). 6 webhook tests. | Razorpay dashboard webhook URL + tunnel test (phase 0 gate) |
| 3 | AI wallet top-up (P2g v2), plus the AI-wallet vendor lock | **Done in repo** (Razorpay Orders + Checkout; webhook credits; vendor lock on wallet writes). 16 tests in wallet + top-up dispatch. | Live keys + `WALLET_PAYMENT_PROVIDER=razorpay` for production Checkout |
| 4 | Auto-recharge on the AI wallet | **Done in repo** (UPI mandate Checkout, 25h schedule + pre-debit notify, token webhooks, capture credits preset). Tests in `autoRechargeService` + dispatch. | Live UPI Autopay enabled on Razorpay account |
| 5 | Linked accounts, payment links, capture and transfer, `awaiting_payment` | Done (code + fakes) | Live Route API calls still need D1 written confirmation in 05 |
| 6 | Refunds with shop funding, disputes | **Done in repo** (settlement refund/dispute writers, vendor refund API, shop-funding Checkout, webhook handlers, F7 flagged captures, conversation + vendor UI; fakes + dispatch tests). | **D1** + counsel in 05 before **live** Route refund/dispute API |
| 7 | Hold release and risk controls | **Done in repo** (5m `releaseDueTransfers` job, blocks, bank-change OTP, admin settlement controls + audit, vendor `/order-payments`; 21 settlement tests). Migration `20261019170000_settlement_control_audit`. | Live Route `PATCH` release needs **D1** in `05`; use `RAZORPAY_USE_FAKE_ROUTE` until then |
| 8 | COD, opt-in, auto-send setting, chat payment status | **Done** (code + unit tests) | Live collection still needs D1 for Route money (phases 5–7) |
| 9 | Reconciliation, ledger and Route checks, one payment reminder | **Done in repo** (15m intent sweep + daily sweep in Express, fakes + `paymentReconciliationService.test.ts`) | Live Razorpay list/fetch in prod; dev uses fakes until D1 |
| 10 | Tax reports, statements, invoices, offboarding | Not started | CA’s answers, for live rates |

Build in two tracks. Phases 0, 2, 3, and 4 only touch the AI wallet, where ChatLogix sells its own service, and can ship as soon as their gates pass. Phases 5–7 need Route enabled on the account, so they wait for Razorpay’s written confirmation.

When a phase ships, update this table and add the settlement rules that are now live to [BILLING_AND_PRICING.md](../BILLING_AND_PRICING.md) as a new section. Until then, that file stays the AI-wallet authority and this folder stays the settlement authority.

## Rules that bind every phase

1. `pricingService.chargeVendor` remains the only writer of `Vendor.walletBalanceMilli` for debits. `creditWalletFromTopUp` remains the only credit path for that column.
2. `settlementService` is the only writer of `Vendor.settlementBalanceMilli`, `SettlementEntry`, `SettlementTransfer`, and `CustomerRefund`. Each write runs inside one Prisma transaction with its ledger row.
3. Order amounts stay **paise** until the settlement boundary. Convert with `paiseToMilli` (`×10`). Never pass a paise integer into a `*Milli` column. Razorpay transfer and refund amounts are paise.
4. Idempotency keys are unique. A replayed webhook returns success and writes nothing.
5. Credit and debit only from a signature-verified webhook, from a shop or admin action under the vendor lock, or from a reconciliation job that has fetched the same object from Razorpay’s API. Never from the Checkout `handler` callback.
6. `paymentFeeBps` applies to customer order payments only. It does not apply to AI top-ups or to shop funding payments.
7. Platform fee is not reversed on refund. Refunds cost the shop the gross refund amount.
8. Every transaction that reads a balance to decide or compute a write locks the vendor row first (`SELECT … FOR UPDATE` on `Vendor`, or `pg_advisory_xact_lock` on the vendor id as `catalogCommitService.ts` does). Postgres runs these transactions as read-committed. Without the lock, two concurrent credits lose one, and two concurrent refunds both spend the same held money.
9. A webhook’s `PaymentWebhookEvent` row and its money change commit in the same transaction. Any Razorpay API fetch happens **before** that transaction opens, never inside it.
10. Money tables never cascade-delete. Every relation on `CustomerPayment`, `PaymentLink`, `SettlementEntry`, `SettlementTransfer`, and `CustomerRefund` uses `onDelete: Restrict`. They are tax records.
11. A `BigInt` never reaches `res.json` raw. Settlement amounts go to the API as decimal strings in milli (`"960400"`), and the frontend formats them. Routes that return a whole `Vendor` row must `select` fields instead.
12. Provider state wins over webhook order. For transfers, refunds, and disputes, fetch the object from Razorpay and apply its current state. Do not throw on an event that arrives after a later one.
13. **Intent, call, confirm.** Every Razorpay write that ChatLogix starts (create transfer, release hold, reverse transfer, create refund) is three steps: record the intent in a transaction, make the HTTP call with no transaction open, record the result in a second transaction. Razorpay has no idempotency key for transfers or reversals, so fetch the existing ones before creating (match on `notes`). A sweep finishes any intent left half-done.

## What already exists

| Piece | Where | Use |
|---|---|---|
| AI wallet, ledger, top-up intent | `Vendor.walletBalanceMilli`, `WalletTransaction`, `WalletTopUpIntent` | Phase 3 credits this. Leave it alone for orders. |
| Razorpay wallet top-up | `razorpayProvider.createIntent` + `wallet_topup` webhook dispatch | Orders API with `notes.purpose`; credit only from signed `payment.captured`. Mock when `mockWalletTopUpEnabled`. |
| Provider switch | `WALLET_PAYMENT_PROVIDER` (`mock` \| `razorpay`) | Stays env-only. Mock remains for local dev. |
| Credit function | `creditWalletFromTopUp` in `walletTopUpService.ts` | Phase 3 and phase 4 call it. Phase 5 must not. |
| Payment link status | `GET /api/payment-links/:linkId/status` in `payments.ts` | Reads local `PaymentLink` row. |
| Razorpay webhook | `POST /api/payments/razorpay/webhook` in `index.ts` | Wallet + auto-recharge + `order_payment` capture (`creditCapturedPaymentTx`, then `createPendingTransfers` after commit). Live Route HTTP uses fakes until D1 in `05`. |
| Order payment link route | `POST /api/orders/:id/payment-link` | `paymentLinkService` — amount from `Order.totalAmount`, one open link per order. |
| WhatsApp send | `whatsappTemplateService.sendPaymentLink` | Text inside 24h window; `payment_link_utility` template when outside. |
| Vendor payments UI | Settings payment collection, order Send, `PaymentLinkModal` QR | Linked-account opt-in + `awaiting_payment` actions. |
| Refunds / disputes | `refundService.ts` (eligibility), `settlementService` (`requestRefund`, shop funding, `submitRefund`, disputes), `POST /api/orders/:id/refund`, `POST /api/payments/shop-funding-intent` | Managed payments: refund when captured remainder exists; COD keeps 7-day rule. Webhooks + fakes until D1/counsel in `05`. |
| Orders | `Order` has `totalAmount` in paise and **no** payment status | Payment state lives on `CustomerPayment`, not a second amount column. |
| `OrderStatus` | includes `awaiting_payment` (migration `20261019160000_awaiting_payment`) | CartEngine + pipeline when collection on and not COD. |
| AI wallet writers | `chargeVendor`, `creditWalletFromTopUp` | Both take `lockVendorForSettlement` before reading `walletBalanceMilli` (stage 3). Settlement lock helper is shared with order ledger. |
| Vendor JSON | `POST /api/vendors/register` | Returns a bounded `select`; `settlementBalanceMilli` is a string in JSON (F5). |
| Phase 1 code | `backend/src/services/payments/` (`settlementMath.ts`, `settlementService.ts`, `routeClient.ts`, `vendorSettlementLock.ts`, 18 tests), migration `20261019140000_order_settlement` (**applied** 2026-10-19) | Route ledger (transfers, refunds, disputes). RazorpayX `VendorPayout` removed. Live Route flows wait on D1 (phases 5–7). |

## Phase 0 — Razorpay test account

Follow [03-razorpay-account-setup.md](./03-razorpay-account-setup.md) through test keys and a webhook secret. Ask Razorpay to enable Route, and send the six D1 questions in [05-compliance-and-risk.md](./05-compliance-and-risk.md). Send the CA and counsel their questions the same day. No application code beyond env placeholders. Do not put live keys in `.env` committed files. `.env.example` gets the names only.

**Gate:** a test payment created in the Razorpay dashboard shows a webhook delivery attempt against a tunnel or staging URL. The app may still answer 404. The point is that Razorpay can reach the host. The three sets of questions are sent and dated in 05.

## Phase 1 — Schema and ledger

New migration under `backend/prisma/`. Follow the repo’s existing migration practice (`prisma migrate`, then `prisma generate`). Money columns that are millirupees use a `Milli` suffix. Money columns copied from Razorpay or `Order.totalAmount` use `Paise`.

`settlementBalanceMilli` and ledger amounts are Prisma `BigInt`, not `Int`. A 32-bit integer overflows near ₹21.5 lakh. The AI wallet column stays `Int` until a separate billing change.

### Meaning of the balance

`Vendor.settlementBalanceMilli` is the shop’s money still under ChatLogix’s control at Razorpay, minus anything the shop owes ChatLogix:

```text
settlementBalanceMilli = held transfers (including reserve) − owed
```

It is positive while money is on hold and negative only when the shop owes money after a lost dispute. A refund never makes it negative, because a refund the held money cannot cover waits for the shop’s funds (rule 5 in the README).

### Vendor columns

| Column | Purpose |
|---|---|
| `paymentsManagedByChatlogix Boolean @default(false)` | Opt-in. Off means no payment links. |
| `paymentFeeBps Int @default(100)` | Admin-set. 100 = 1.00%, includes GST. Clamp 0–2000. |
| `settlementBalanceMilli BigInt @default(0)` | Held minus owed, as above. |
| `razorpayLinkedAccountId String? @unique` | The shop’s Route linked account. |
| `linkedAccountStatus String?` | Mirrors Razorpay’s account status. Collection needs `activated`. |
| `collectionStartedAt DateTime?` | Set when the linked account is activated and the shop has opted in. Starts the new-shop period. |
| `paymentLinkAutoSend Boolean @default(true)` | D5. The bot sends the link when on. |
| `releasesFrozenAt DateTime?`, `releasesFrozenReason String?` | Admin or dispute freeze (D4). |
| `rollingReserveBps Int @default(0)` | Admin-set reserve share (D4). 0 = off. |
| `settlementBankChangedAt DateTime?` | Start of the 48-hour release pause after a bank change. |
| `legalName String?`, `panEncrypted String?`, `gstin String?`, `gstExempt Boolean @default(false)` | Vendor KYC (05). PAN is encrypted the way WhatsApp tokens are (`utils/whatsappTokenCrypto.ts`). |
| `autoRechargeEnabled Boolean @default(false)` | AI wallet only. |
| `autoRechargeAmountMilli Int?` | One of ₹500 / ₹1,000 / ₹2,000 in milli. |
| `autoRechargeMandateId String?` | UPI Autopay token or mandate id. |

`payoutFundAccountId` from the RazorpayX design is dropped.

`markupPercent` stays the AI markup. Do not read it when computing the order platform fee.

### `PlatformSettings` columns

| Column | Default | Purpose |
|---|---|---|
| `gstTcsBps Int` | `50` | GST TCS rate (D2). 0 turns it off. |
| `tds194oBps Int` | `10` | 194-O TDS rate. |
| `tds194oNoPanBps Int` | `500` | TDS rate when the shop’s PAN is invalid or inoperative. |

Read through the existing `PlatformSettings` path (memory, Redis, Postgres, env fallback). Editable on the web-admin `/billing` page. They are rates, not money, so they need no paise conversion.

### Constants (`settlementMath.ts`)

| Name | Value |
|---|---|
| `SETTLEMENT_HOLD_MS` | 48 hours |
| `NEW_SHOP_HOLD_MS` | 7 days |
| `NEW_SHOP_WINDOW_DAYS` | 30 |
| `NEW_SHOP_ORDER_COUNT` | 20 |
| `NEW_SHOP_DAILY_RELEASE_CAP_MILLI` | `25_000_000` (₹25,000) |
| `RESERVE_HOLD_MS` | 30 days |
| `BANK_CHANGE_PAUSE_MS` | 48 hours |
| `REFUND_DRAFT_TTL_MS` | 24 hours |
| `PLATFORM_FEE_GST_BPS` | 1800 |
| `AUTO_RECHARGE_THRESHOLD_MILLI` | `100_000` (₹100, AI wallet only) |

A shop is new while `now < collectionStartedAt + 30 days` **or** it has fewer than 20 captured payments, whichever ends later.

### Models

**`CustomerPayment`** — one row per **captured** Razorpay payment for an order. Unpaid and failed attempts live on `PaymentLink.status`; a Razorpay link stays open after a failed attempt, so a failure is a notification, not a row.

- `orderId`, `vendorId`, `amountPaise`
- `gatewayFeePaise`, `gatewayTaxPaise`, `platformFeePaise`, `platformFeeGstPaise`, `gstTcsPaise`, `tdsPaise`, `netMilli`
- `status`: `captured`, `partially_refunded`, `refunded`
- `razorpayPaymentId @unique`, `razorpayPaymentLinkId`
- `capturedAt`
- `refundedPaise @default(0)`
- `settlementAlert String?` (`net_not_positive`, `order_cancelled`, `order_already_paid`, `amount_mismatch`, `unknown_link`, `not_inr`), `refundRequired Boolean @default(false)`
- `disputeStatus String?`

**`PaymentLink`** — an order may have several links over time, but at most one `created`.

- `orderId`, `vendorId`, `amountPaise`, `url`, `expiresAt`
- `razorpayLinkId @unique`
- `status`: `created`, `paid`, `expired`, `cancelled`

**`SettlementTransfer`** — one row per Route transfer. This is where the hold lives.

- `vendorId`, `customerPaymentId`, `amountPaise`, `reversedPaise @default(0)`
- `kind`: `main`, `reserve`, `dispute_return`
- `status`: `to_create`, `on_hold`, `releasing`, `released`, `reversed`, `failed`
- `eligibleAt` (when the hold ends), `releasedAt`
- `razorpayTransferId String? @unique`

**`CustomerRefund`** — one row per refund the shop starts.

- `vendorId`, `customerPaymentId`, `amountPaise`
- `status`: `awaiting_funding`, `submitting`, `submitted`, `processed`, `failed`, `cancelled`
- `shortfallMilli BigInt @default(0)`, `fundingRazorpayOrderId String?`, `fundingExpiresAt DateTime?`
- `reversalPlan Json` (transfer ids and paise to reverse)
- `razorpayRefundId String? @unique`, `requestedBy`

**`SettlementEntry`** — append-only money ledger. No buckets: the hold state is on `SettlementTransfer`.

- `vendorId`, `amountMilli` (always positive), `direction`: `credit` or `debit`, `balanceAfterMilli`
- `kind`:
  - `payment_credit` (credit): net of a captured order payment
  - `transfer_release` (debit): a held transfer released to the shop’s bank
  - `refund_debit` (debit): gross refund, written when the refund is funded and starts sending
  - `shop_funding` (credit): the shop paid ChatLogix to fund a refund or clear an amount owed; the actual net of that payment
  - `dispute_debit` (debit), `dispute_credit` (credit)
  - `adjustment` (either): staff correction, reason in `metadata`, with an audit row
- `idempotencyKey @unique`
- optional `customerPaymentId`, `settlementTransferId`, `customerRefundId`
- `metadata` Json for the paise breakdown

**`PaymentWebhookEvent`**

- `providerEventId @unique`, `eventType`, `razorpayPaymentId`, `razorpayRefundId`, `processedAt`
- Do not store the raw body. Store the event id, type, and the object ids.
- Inserted in the same transaction as the handler’s money change (rule 9). A row exists only for an event whose handler committed.

`VendorPayout` from the RazorpayX design is dropped.

### Settlement service

`backend/src/services/payments/settlementService.ts`. Every `*Tx` function takes the vendor lock first (rule 8). Razorpay calls go through a small `RouteClient` interface so unit tests use a fake.

| Function | Effect |
|---|---|
| `creditCapturedPaymentTx` | Webhook transaction. Checks the F9 guards, computes the quote, inserts `CustomerPayment` and `payment_credit`, and inserts one or two `SettlementTransfer` rows in `to_create`, reduced first by anything the shop owes. Idempotent on `razorpayPaymentId`. |
| `createPendingTransfers` | After commit. For each `to_create` row, fetch the payment’s transfers; create the Route transfer with `on_hold: true` and `notes.settlementTransferId` only if none exists; mark `on_hold`. |
| `releaseDueTransfers` | Job, in batches. Picks `on_hold` transfers past `eligibleAt` whose shop is not blocked (frozen, open dispute, bank-change pause, refund in progress, daily cap). Marks `releasing`, calls `PATCH /transfers/:id` with `on_hold: false`, then marks `released` and writes `transfer_release`. |
| `requestRefund` | Shop action. If held ≥ refund: writes `refund_debit`, stores the reversal plan (this payment’s transfer first, then the shop’s other held transfers, newest first), status `submitting`. Otherwise: status `awaiting_funding` with `shortfallMilli` and a Razorpay Order for the shortfall grossed up for the fee. |
| `creditShopFundingTx` | Webhook transaction for `purpose: 'shop_funding'`. Writes `shop_funding` for the actual net. A refund waiting on it moves to `submitting` and writes its `refund_debit`. |
| `submitRefund` | After commit. Creates the planned reversals (fetch first, rule 13), then the Razorpay refund with `speed: normal` and `notes.customerRefundId`. Marks `submitted`. |
| `applyRefundStateTx` | `refund.processed`: `processed`, customer told. `refund.failed`: `failed` and an ops alert. The reversed money is in ChatLogix’s account; ops retries the refund. No ledger change. |
| `applyDisputeTx` | `created`: freeze. Deduction (`amount_deducted`): `dispute_debit`, then reversals from held transfers; the rest stays owed. Won: `dispute_credit` and a `dispute_return` transfer on hold. |
| `expireRefundDrafts` | Job. `awaiting_funding` past `fundingExpiresAt` becomes `cancelled`. |
| `getSettlementPosition` | Held, in reserve, released this month, owed, next release time, refunds in progress. |

### Rework of the existing code (Route)

| # | Change |
|---|---|
| R1 | Schema: the columns and models above. Drop `VendorPayout`, `Vendor.payoutFundAccountId`, and `SettlementEntry.bucket` and `payoutId`. Add `SettlementTransfer`, `CustomerRefund`, the new `Vendor`, `CustomerPayment`, and `PlatformSettings` columns. Edit the untracked migration in place. |
| R2 | `settlementMath.ts`: the quote gains `platformFeeGstPaise`, `gstTcsPaise`, `tdsPaise`, and the reserve split. Add the hold calculator (new-shop rule) and the daily-cap check. Replace `summarizeSettlement` with held / reserve / owed. |
| R3 | `settlementService.ts`: replace `reservePayout`, `completePayout`, and `releasePayout` with the functions above. `debitRefund` becomes `requestRefund` plus `submitRefund`, keyed on `CustomerRefund.id` instead of the Razorpay refund id. |
| R4 | `RouteClient` interface: `createTransfer`, `fetchPaymentTransfers`, `setTransferHold`, `reverseTransfer`, `fetchTransferReversals`, `createRefund`, `fetchRefund`. A fake implements it for tests. No network in unit tests. |
| R5 | Constants from the table above. |
| R6 | Tests rewritten to the list below. |

### Fixes from the review (still apply)

| # | Severity | Fix |
|---|---|---|
| F1 | Critical | Lock the vendor row at the start of every `*Tx` function (rule 8). The old code read the balance and wrote `balance ± amount` with no lock, so concurrent writes lost one. |
| F2 | High | Export the `*Tx` functions, or accept an optional transaction client, so the webhook handler commits `PaymentWebhookEvent` and the money change together (rule 9). |
| F3 | — | Retired. It covered RazorpayX payout state, which Route removes. Rule 12 covers transfers, refunds, and disputes. |
| F4 | Medium | `onDelete: Restrict` on every relation of the money tables (rule 10). |
| F5 | High | `POST /api/vendors/register` (`routes/vendors.ts`) returns the full `Vendor` row. Add a `select`. Add a shared helper that turns settlement `bigint` fields into strings (rule 11). |
| F6 | Medium | The release job works in batches of about 100, one short transaction per batch. Prisma’s interactive-transaction timeout is 5 seconds. |
| F7 | Medium | A refund of a payment that was never transferred (`settlementAlert` set) is refunded by ChatLogix from its own account. No reversal, no settlement entry, an ops alert, and the webhook returns success. |
| F8 | Low | Set `capturedAt` from the database clock in the crediting transaction. Keep the parameter for tests only. |
| F9 | Low | `creditCapturedPaymentTx` owns the capture guards: currency is INR, `amountPaise` equals `Order.totalAmount`, the order is not cancelled, the order has no other captured payment, and the link id matches the order’s open `PaymentLink`. A capture that fails one is stored with `settlementAlert` and `refundRequired`, and is not transferred. |

### Tests (Vitest, no network)

- ₹1,000 at 2% + 18% GST and 100 bps, TCS and TDS at 0: credits `966400` milli, one `main` transfer of 96,640 paise in `to_create`. `walletBalanceMilli` unchanged.
- Same at the default rates (50 and 10 bps): `gstTcsPaise` 500, `tdsPaise` 100, `platformFeeGstPaise` 153, credit `960400`.
- Paise `96640` is not stored as milli `96640`.
- `paymentFeeBps = 0` credits `amount − gateway fee − taxes` only.
- `netPaise <= 0`: no credit, no transfer, `settlementAlert = net_not_positive`.
- Replay of the same payment id: no second credit and no second transfer row.
- New shop: `eligibleAt` is capture + 7 days. After 30 days **and** 20 captured payments: capture + 48 hours.
- Reserve at 500 bps: `main` 91,808 paise and `reserve` 4,832 paise, the reserve eligible at capture + 30 days.
- Shop owes `1000000` milli: a capture of `966400` leaves the balance at `−33600` and creates no transfer. The next capture leaves `932800` and transfers 93,280 paise.
- Full refund with only this payment’s `966400` held: `awaiting_funding`, shortfall `33600`. After a `shop_funding` of `33600`: `submitting`, `refund_debit` of `1000000`, balance `0`.
- Full refund with `500000` more held from another order: `submitting` at once, balance `466400`, reversal plan 96,640 paise from this transfer and 3,360 from the other.
- Partial ₹400 refund: balance `566400`.
- Refund after release with nothing held: `awaiting_funding`, shortfall `1000000`.
- A refund draft past its expiry is `cancelled` and releases resume.
- The release job skips a frozen shop, a shop with an open dispute, a shop within 48 hours of a bank change, a shop with a refund in progress, and a new shop past ₹25,000 released today. A new shop’s single ₹30,000 transfer is released on a day with no other release.
- Lost dispute after release: balance `−1000000`. A later win: `dispute_credit` and a `dispute_return` transfer on hold.
- Every `*Tx` function takes the vendor lock before its first balance read (assert the call order on the fake).
- A response helper turns `960400n` into `"960400"`.
- One integration test against a real Postgres, outside the default `npm test` run: two refunds started at once cannot both spend the same held money, and two concurrent captures both credit.

**Gate:** `npm test` for the payments folder is green. No real Razorpay client is constructed. R1–R6 and F1, F2, F4–F9 are done. Migration **`20261019140000_order_settlement` is applied** (2026-10-19). Production capture/transfer/release still waits on D1 Route confirmation (phases 5–7).

## Phase 2 — Webhook ingress

Add `POST /api/payments/razorpay/webhook`. One URL serves payments, refunds, disputes, transfers, linked accounts, and UPI Autopay tokens. There is no RazorpayX webhook.

Mount it in `backend/src/index.ts` **above** `app.use('/api', authenticate, paymentsRouter)`. Use `express.raw({ type: 'application/json' })` so the HMAC is over the bytes Razorpay signed. Parsing JSON first breaks verification.

Verify `X-Razorpay-Signature` with the webhook secret (HMAC SHA256). Reject mismatches with 400. Then process in this order:

1. Look up the header event id (`x-razorpay-event-id`). If a `PaymentWebhookEvent` row exists, return 200 with an empty body.
2. Fetch anything the handler needs from Razorpay’s API (the payment, refund, dispute, or transfer). No database transaction is open during this call.
3. Open one transaction. Insert `PaymentWebhookEvent`, run the handler with that transaction client, set `processedAt`, and commit.
4. Return 200 after the commit. If any step fails, return 5xx. The event row rolls back with the money change, so Razorpay’s retry runs the handler again.
5. Run any follow-up Razorpay call (create transfers, submit a funded refund) after the commit, under rule 13. Its failure does not fail the webhook; the sweep picks it up.

Do not insert the event row in its own transaction before the handler. If the handler then failed, the retry would look like a duplicate and the credit would be lost. A unique-key violation on the insert in step 3 means a concurrent delivery won the race; return 200.

Dispatch by event name, then by `notes.purpose` (`wallet_topup`, `wallet_autorecharge`, `order_payment`, `shop_funding`). Unknown events return 200 after the event row is stored, so Razorpay does not retry forever. Handlers that are not built yet log and return 200.

Keep the authenticated vendor routes on `paymentsRouter`. Do not put the webhook on that router.

**Gate:** a fixture body with a known secret verifies; a flipped byte returns 400; a second post of the same event id does not call the handler twice; a handler that throws leaves no event row, and the retry runs the handler again.

## Phase 3 — AI wallet top-up

**Status (2026-10-19):** Shipped — Razorpay Orders/Checkout, webhook credit, vendor wallet lock, production `rzp_test_` boot guard, intent rate limit, vendor-app CSP for `checkout.razorpay.com`.

This is P2g v2 from [wallet-top-up-p2g.md](../../documentation/modules/features/vendor-onboarding/guides/wallet-top-up-p2g.md) §7. Implement it before order payments so the webhook and the credit path are real before settlement exists.

- `razorpayProvider.createIntent` creates a Razorpay Order for `amountMilli` converted to paise with `milliToPaise`.
- Notes on the order: `{ purpose: 'wallet_topup', intentId }`.
- `payment.captured` whose notes say `wallet_topup` calls `creditWalletFromTopUp` with `idempotencyKey = payment.id`, inside the phase 2 transaction.
- Amount credited is the intent’s `amountMilli`, which is what the vendor selected. Do not subtract Razorpay’s fee and do not apply `paymentFeeBps`.
- If `payment.amount` in paise does not equal `milliToPaise(intent.amountMilli)`, do not credit. Alert.
- Frontend: Razorpay Checkout on `/wallet`. On handler success, poll `GET /api/vendors/me/wallet`. The handler must not call a “confirm” credit endpoint. Delete nothing of the mock path; it stays behind `mockWalletTopUpEnabled`.
- Add the vendor lock (rule 8) to `creditWalletFromTopUp` and `chargeVendor` before the first real Razorpay credit. A top-up landing while a conversation charge runs for the same vendor otherwise loses one of them. Remove the known-issue note in [BILLING_AND_PRICING.md](../BILLING_AND_PRICING.md) §4 in the same change.
- Boot check: refuse to start when `NODE_ENV=production` and `RAZORPAY_KEY_ID` starts with `rzp_test_` (04 §5.3).
- Content security policy on the vendor app allows `checkout.razorpay.com` and no other payment script (04 §3.2). Phase 6 reuses Checkout for shop funding.
- Rate-limit top-up intent creation per vendor (04 §4.7).

**Gate:** test-mode payment credits the wallet once. A replayed webhook does not. Client-only success without a webhook leaves the balance unchanged. A top-up and a charge for the same vendor run at the same time and both land in the balance.

## Phase 4 — Auto-recharge

**Status (2026-10-19):** Shipped in repo — wallet UI (toggle/presets/scheduled debit time), mandate registration Checkout, `token.*` webhooks, `wallet_autorecharge` capture via `creditWalletFromTopUp`, schedule after `chargeVendor` + 15-minute sweep, mandate audit row, preset change replaces mandate after confirm.

Vendor settings on the wallet page: toggle, and a choice of ₹500, ₹1,000, or ₹2,000. Saving “on” starts a Razorpay UPI Autopay registration and stores the mandate id only after Razorpay confirms it.

Trigger: after a successful `chargeVendor` in the conversation debit path, and from a periodic sweep so a vendor who receives no messages still refills. If `walletBalanceMilli < 100000`, auto-recharge is on, a mandate exists, and no attempt is `scheduled` or `pending`, create one attempt for `now + 25 hours`.

Send Razorpay’s pre-debit notification before the charge. On `payment.captured` with notes `purpose: 'wallet_autorecharge'`, call `creditWalletFromTopUp`. On failure, mark the attempt failed, notify the vendor (dashboard plus the existing notification path if one fits), and do not schedule another until the vendor re-enables or the next calendar day, whichever the implementation records on the attempt. Do not loop.

Mandate lifecycle:

- Subscribe to the token events (`token.confirmed`, `token.rejected`, `token.paused`, `token.cancelled`). Store the mandate id on `token.confirmed` only.
- On `token.paused` or `token.cancelled`, turn auto-recharge off, cancel any scheduled attempt, and tell the vendor.
- The mandate is for one amount. Changing the preset starts a new registration. The old mandate stays in use until the new one is confirmed, then it is cancelled.
- Record the approval (who, when, amount, mandate id) as an audit row (04 §4.5).

The attempt is scheduled 25 hours out. A vendor who burns through ₹100 faster than that hits the zero-balance gate before the debit lands. Show the expected debit time on the wallet page so the vendor can top up by hand.

**Gate:** a balance of ₹99 with a fake mandate schedules one attempt; a second debit the same day does not schedule another; the captured fixture credits exactly the chosen preset; a `token.cancelled` fixture turns auto-recharge off and cancels the scheduled attempt.

## Phase 5 — Linked accounts, payment links, and capture

**Waits on Razorpay’s written Route confirmation** (05, D1).

### Linked accounts

1. The opt-in screen collects legal name, business type, PAN, GSTIN or an exemption declaration, the settlement bank account (number, IFSC, holder name), and contact details.
2. ChatLogix creates the Route linked account through Razorpay’s linked-account API and stores `razorpayLinkedAccountId`. Store PAN encrypted, GSTIN, and legal name on `Vendor`. Show only a masked bank account afterwards.
3. `linkedAccountStatus` follows Razorpay’s account webhooks. If Razorpay reports a holder-name mismatch, a person approves before activation.
4. When the account is activated and the shop has opted in, set `paymentsManagedByChatlogix = true` and `collectionStartedAt = now()`. Refuse to enable collection otherwise.

### Payment links

1. `POST /api/orders/:id/payment-link` requires collection on. Amount is `Order.totalAmount` in paise. Ignore `amount` and `customerPhone` from the body. Refuse if a `captured` payment already covers the order. Refuse COD orders.
2. Cancel any `created` link for the order at Razorpay first, so an order never has two open links.
3. Create the Razorpay Payment Link. `notify.sms` and `notify.email` off; ChatLogix sends WhatsApp. `notes`: `orderId`, `vendorId`, `purpose: 'order_payment'`. `expire_by` is 24 hours unless the order has a shorter promise.
4. Persist `PaymentLink`. Send it through `sendPaymentLink`. When the customer’s last message is older than 24 hours, send an approved utility template instead of the plain text the function queues today.
5. `GET /api/payment-links/:linkId/status` reads the local row.
6. Vendor UI: remove `send_payment_link` from the not-available list, wire Send on `OrderDetails`, and drop the QR placeholder or encode the URL for real. Payment status on the order screen comes from `CustomerPayment`, not a `useState` default.

### Order lifecycle (D5)

7. Add `awaiting_payment` to `OrderStatus` in this phase’s migration. Audit every `switch`, filter, and label on `OrderStatus` in the backend and `frontend_v2`, the order-recovery sweep, and notifications.
8. When the customer confirms an order in chat and the shop has collection on, the CartEngine creates the order as `awaiting_payment`, unless the customer chose COD. If `paymentLinkAutoSend` is on, the pipeline creates and sends the link. If it is off, the shop sees Send. Update [INCOMING_RESPONSE_GENERATOR_FLOW.md](../INCOMING_RESPONSE_GENERATOR_FLOW.md) in the same change.
9. A cart change before payment cancels the open link and creates a new one for the new total. It is sent the same way as the first.
10. On capture, the order moves to `confirmed`.
11. On `payment_link.expired`, the order stays `awaiting_payment` and the shop is notified to resend, switch to COD, or cancel.

### Capture

12. `payment_link.paid` or `payment.captured` with `purpose: 'order_payment'`: fetch the payment from Razorpay’s API before the transaction (`amount`, `fee`, `tax`, `status`, `currency`), then `creditCapturedPaymentTx` inside the phase 2 transaction, then `createPendingTransfers` after the commit.
13. A capture that fails a F9 guard is stored, not transferred, and flagged `refundRequired` for phase 6.

Order API adds a `payment` object: `status`, `amountPaise`, `netMilli` (decimal string, rule 11), `transferStatus`, `eligibleAt`, `refundedPaise`. It does not add a second `totalAmount`.

**Gate:** a test linked account reaches `activated` and collection turns on; generate, reload, link still there; send writes `NotificationHistory`; a capture fixture credits `payment_credit`, creates one held transfer at the fake Razorpay, and does not change the AI wallet; a replay is a no-op; a cart change leaves exactly one open link; a capture on a cancelled order is not transferred.

## Phase 6 — Refunds and disputes

**Waits on Razorpay’s Route confirmation. Counsel’s answer on the refund-wait rule is needed before live keys.**

### Refunds

1. Vendor dashboard: Refund on the order, amount defaulting to the remainder. `refundPaise + refundedPaise <= amountPaise`.
2. `requestRefund` under the vendor lock. If the shop’s held money covers it, the refund goes straight to `submitting`. If not, the dashboard shows “Add ₹X to send this refund” and opens Razorpay Checkout for a Razorpay Order with `purpose: 'shop_funding'` and `notes.customerRefundId`. The amount is the shortfall grossed up at the list fee rate.
3. `payment.captured` with `purpose: 'shop_funding'`: `creditShopFundingTx`, then `submitRefund` after the commit. If the actual net still falls short, the refund stays `awaiting_funding` for the remainder.
4. `submitRefund` reverses the planned held transfers, then creates the Razorpay refund with `speed: normal`. For a full refund whose only source is this payment’s own held transfer, the refund call may use Razorpay’s reverse-all option instead of separate reversals.
5. `refund.processed` marks the refund processed and tells the customer. `refund.failed` marks it failed and alerts ops.
6. A full refund of an order that has not been delivered may set `Order.status = cancelled`. A partial refund, or a refund after `delivered`, updates the payment only.
7. Replace `checkRefundEligibility` for managed payments: eligible while a captured remainder exists. The 7-day and pending/confirmed rules remain for COD, where ChatLogix is only telling the shop, not moving money.
8. Conversation `refund_request` answers from eligibility and says the shop will confirm. It never creates a refund and never tells the customer a refund is approved before it is sent.
9. A payment flagged `refundRequired` (a F9 guard failed) or a payment that was never transferred (`net_not_positive`) is refunded by ChatLogix from its own account, with no reversal and no settlement entry (F7).
10. `expireRefundDrafts` cancels `awaiting_funding` refunds after 24 hours, which lets the shop’s releases resume.

### Disputes

Subscribe to Razorpay’s dispute webhooks (`payment.dispute.created`, `payment.dispute.lost`, `payment.dispute.won`, `payment.dispute.closed`; check the names in the dashboard).

- `created`: set `releasesFrozenAt` with reason `dispute:<id>`, mark the payment’s `disputeStatus`, and show the shop the evidence deadline.
- When Razorpay deducts the amount (the dispute’s `amount_deducted`, at creation or on loss): write `dispute_debit`, idempotent on the dispute id, and reverse held transfers, this payment’s first. What cannot be reversed stays owed. Owed money is recovered from the shop’s next captures (phase 1), and the shop can pay it with a `shop_funding` payment at any time.
- `won` or `closed` in the shop’s favour: write `dispute_credit` for any deducted amount returned, and create a `dispute_return` transfer on hold with the normal hold.
- Lift the freeze when the shop has no open disputes, unless an admin froze it separately.

**Gate:** the phase 1 refund fixtures run through the webhook and the fake Razorpay, not only the pure functions. A `refund.processed` replay changes nothing. The AI wallet fixture balance is unchanged. A short refund cannot be sent before its funding lands. A lost-dispute fixture debits once, and a won fixture after it credits back once.

## Phase 7 — Hold release and risk controls

**Status (2026-10-19):** Shipped in repo — `releaseDueTransfers` on a 5-minute Express timer (F6), block checks (admin freeze, open dispute, 48h bank-change pause, refund in progress, new-shop daily cap), bank change with phone OTP + linked-account PATCH + audit, admin freeze/unfreeze/reserve + position view with `VendorSettlementControlAudit`, vendor **Order payments** page (`/order-payments`) and admin settlement panel. **Live Route HTTP** still waits on D1; dev uses `RAZORPAY_USE_FAKE_ROUTE=true` (see [04-security-and-go-live.md](./04-security-and-go-live.md)).

**Release job.** Every few minutes, `releaseDueTransfers` in batches (F6). The Express process is acceptable for v1; a Lambda is fine if one already runs on a timer. A transfer is released when `eligibleAt <= now()` and none of these apply:

| Block | Source |
|---|---|
| Admin freeze | `releasesFrozenAt` with a non-dispute reason |
| Open dispute | Any of the shop’s payments with an open `disputeStatus` |
| Bank change | `now < settlementBankChangedAt + 48 hours` |
| Refund in progress | A `CustomerRefund` for the shop in `awaiting_funding` or `submitting` |
| Daily cap | A new shop has had ₹25,000 released today (IST) |

A release is all or nothing per transfer. A single transfer larger than the cap is released on its own, on a day when nothing else has been released for that shop.

Released transfers are settled to the shop’s bank by Razorpay. ChatLogix records `transfer_release` and the release time.

**Bank change.** The shop changes its settlement bank account from its settings. It needs a fresh phone OTP. ChatLogix updates the linked account through Razorpay’s API, sets `settlementBankChangedAt`, and tells the shop on WhatsApp and email. Razorpay verifies the new account. Rate-limit bank changes to about 5 per shop per day.

**Admin controls** on the vendor panel: freeze and unfreeze releases with a reason, set `rollingReserveBps`, and view held, reserve, released, and owed. Every change writes an audit row.

**Gate:** a transfer with `eligibleAt` in the future is not released. After the time passes it is released once, even if the job runs twice. Each block in the table holds a due transfer. A new shop’s second ₹20,000 release in a day waits for the next day. A bank change an hour ago holds releases. The AI wallet does not move.

| API (authenticated) | Role | Purpose |
|---|---|---|
| `GET /api/vendors/:id/payments/settlement` | vendor / admin | Held, reserve, released, owed, next release, transfers, awaiting-funding refunds |
| `POST …/settlement/bank-change/otp` | vendor | OTP to registered phone |
| `POST …/settlement/bank-change` | vendor | Confirm bank change after OTP |
| `GET …/settlement/admin` | admin | Position + recent audit rows |
| `POST …/settlement/freeze` | admin | Freeze releases (`releasesFrozenAt`) |
| `POST …/settlement/unfreeze` | admin | Clear admin freeze (not while dispute open) |
| `PATCH …/settlement/reserve` | admin | Set `rollingReserveBps` (0–2000) |

## Phase 8 — COD, opt-in, and chat

- Vendor settings: `paymentsManagedByChatlogix` (via the phase 5 opt-in flow) and `paymentLinkAutoSend`. Admin can see both on the vendor panel. `paymentFeeBps` is editable only by admin, next to `markupPercent`, on the existing billing-config route. Validate 0–2000.
- Turning collection off cancels open links and stops new ones. Held money is released on schedule (phase 10 covers leaving).
- Order payment method: `razorpay`, `cod`, or `vendor_collected`. COD and `vendor_collected` skip link creation. Switching an `awaiting_payment` order to COD cancels its open link and moves it to `confirmed`.
- “Mark cash collected” sets the order paid and writes no settlement entry.
- Conversation context for a managed order includes the latest payment status, so “did my payment go through?” is answered from Postgres. When this prompt change lands, update [INCOMING_RESPONSE_GENERATOR_FLOW.md](../INCOMING_RESPONSE_GENERATOR_FLOW.md) in the same change.

**Gate:** opt-in off returns 409 on payment-link create; `POST /api/vendors/:id/payments/collection/disable` cancels open links. COD mark-collected leaves both balances unchanged (`POST /api/orders/:id/mark-cash-collected`). Auto-send off means the bot does not send a link (`orderPaymentPipeline` + `PaymentLinkService`). A fixture payment status appears in `hotSet.orderPaymentStatuses` and turn-audit `context_plan`. Admin `PATCH /api/vendors/:id/billing-config` accepts `paymentFeeBps` (0–2000) with `VendorSettlementControlAudit` rows.

**Implemented (2026-10-19):** `codOrderService.ts`, `collectionControlService.ts`, `vendorBillingConfigService.ts`, order routes `switch-to-cod` / `mark-cash-collected`, prefetch + LLM-1 prompt block, web-admin payment fee bps on billing config.

## Phase 9 — Reconciliation and reminder

**Sweep**, every 15 minutes for unfinished intents and daily for the rest. Each item calls the same handler as the webhook or the job, so a race is safe.

- Payment links still `created` 15 minutes after a capture should have arrived: fetch and apply.
- `SettlementTransfer` rows in `to_create` or `releasing`: fetch from Razorpay and finish (rule 13).
- `CustomerRefund` rows in `submitting`: fetch reversals and refunds by notes and finish.
- Refunds and disputes at Razorpay with no matching ledger row: apply.

**Ledger check.** For every shop with settlement activity, `settlementBalanceMilli` must equal the sum of its ledger entries (credits: `payment_credit`, `shop_funding`, `dispute_credit`, credit `adjustment`; debits: `transfer_release`, `refund_debit`, `dispute_debit`, debit `adjustment`). A mismatch alerts and changes nothing.

**Route check.** For every shop, the sum of transfers on hold at Razorpay must equal the local `SettlementTransfer` rows in `on_hold` minus their reversals. A mismatch alerts and changes nothing.

**Reminder.** One WhatsApp message when a link is unpaid and inside two hours of `expire_by`. Do not send a second one. Use the existing response queue, and an approved template outside the 24-hour window.

**Gate:** a link stuck in `created` becomes credited when the fake client returns a captured payment. A second sweep adds nothing. A transfer stuck in `releasing` is finished from the fake’s state. A hand-edited cached balance raises the ledger alert. The reminder job sends one notification row.

**Implemented (2026-10-19):** `paymentReconciliationService.ts` (`runSettlementIntentSweep` every 15m, `runSettlementDailySweep` daily), `finishReleasingTransfers`, payment-link fetch on `paymentLinkRazorpayClient`, Route `fetchTransfer` / `sumOnHoldTransferPaise`, expiry reminder via `whatsappTemplateService.sendPaymentLinkExpiryReminder`, wired in `backend/src/index.ts`. Ledger/Route mismatches log + `emitMetric` only (no auto-fix).

## Phase 10 — Tax, statements, invoices, offboarding

**The CA’s answers set the live tax rates and the refund adjustment rule** (05, D2 and D3). The invoice must exist before the first live month is closed.

- GST TCS: monthly, per shop GSTIN, the value of supplies and the TCS withheld, in the GSTR-8 layout. Same-month refunds reduce the base.
- 194-O TDS: monthly, per shop PAN, the gross and the TDS withheld.
- If the CA says a refund returns TCS or TDS to the shop, credit it back as an `adjustment` when the month’s report is closed.
- Monthly statement per shop: opening balance, gross collected, gateway fee, platform fee and its GST, TCS, TDS, net, reserve, releases, refunds, funding payments, disputes, adjustments, closing balance. Opening plus movements equals closing, and closing equals the ledger check. Downloadable from the Order payments page.
- Monthly GST invoice from ChatLogix to each shop for its platform fees, showing `platformFeeGstPaise`. Invoice numbers run in sequence. An issued invoice is never regenerated; corrections are credit notes.
- Offboarding: turning collection off or leaving stops new links and cancels open ones. Held money is released on schedule unless frozen. Anything owed is invoiced. The linked account stays until no transfer is held and no dispute is open. Ledger, transfer, payment, refund, and invoice rows are kept (rule 10). A shop is deactivated, not deleted.

**Gate:** a fixture month’s TCS and TDS reports add up to the sum of its payments. A fixture statement balances. A shop that owes money and turns collection off keeps its ledger and shows the amount owed.

**Implemented (2026-10-19):** D2/D3 operational defaults in [05-compliance-and-risk.md](./05-compliance-and-risk.md) (`gstTcsBps` 50, `tds194oBps` 10, `refundReturnsWithheldTaxToShop` false until CA). `taxReportMath.ts` + `taxReportService.ts` (GSTR-8 table 3 + 194-O); admin `GET/POST /api/admin/tax-reports/:yearMonth` (+ `/gstr8`, `/tds194o`, `/close` with withheld-tax `adjustment` credits when enabled). `settlementStatementMath.ts` + `settlementStatementService.ts`; vendor `GET …/payments/settlement/statement` (JSON/CSV) and Order payments UI download. `platformFeeInvoiceService.ts` (sequential `VendorPlatformFeeInvoice`, PDF to S3/local, ₹8.47 + ₹1.53 fixture at 1%); daily batch via `runSettlementDailySweep` → `issueDuePlatformFeeInvoices`. `vendorOffboardingService.ts` (`POST …/payments/offboard`, collection disable preserves ledger + owed). Migrations `20261019180000_tax_reports`, `20261019180000_platform_fee_invoice`.

## Env names to add

| Name | Where it is used |
|---|---|
| `RAZORPAY_KEY_ID` | Orders, Payment Links, Route, refunds, AI top-up, shop funding |
| `RAZORPAY_KEY_SECRET` | Same |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC |

`WALLET_PAYMENT_PROVIDER` already exists. Keys stay out of git. Document the names in `backend/.env.example` with empty values during phase 0.

## Explicitly out of this plan

- Crediting order nets to `walletBalanceMilli`
- RazorpayX payouts and a Withdraw button
- ChatLogix fronting a refund the shop has not funded
- Automatic refunds started by the customer in chat
- Instant refunds and instant settlement
- In-chat WhatsApp `order_details` payments (Payment Links ship first)
- International cards, non-INR
- Using order money to pay AI charges
