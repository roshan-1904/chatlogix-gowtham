# 12. Low-balance pause the owner sees

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Not started** · Competitive role: Parity · Priority: Phase 3, order 12 (unchanged)
> Verified: the two refusal reasons (`backend/src/services/billingService.ts:69-81`); the status response already carries `walletCanReply` and `walletBlockReason` (`whatsappConnectService.ts:243-253`); `Dashboard.tsx` does not read them; the placeholder cards (`frontend_v2/apps/web-admin/src/pages/Reliability.tsx:523-551`). Missing: all five steps. Conflict: `docs/admin-portal/DECISIONS.md` decision 2 is Locked on a persisted `WalletBlockEvent`, and this task defers that table. Changed in this review: sections 3, 4, and 7 name the backend route, its test, and the decision.

## 1. Phase and why this task is in it

Phase 3. A new shop's trial is finite. When the next turn would be refused, the owner has to see why replies stopped and where to ask for money. Ibell's real wallet is not the test fixture. Mock top-up stays off from task 1. Self-serve Razorpay checkout is not this task.

## 2. Problem and user impact

The shop runs out of wallet and does not know why replies stopped. The admin Reliability wallet tab explains that events are not stored and then shows an empty list, which reads as "nobody was blocked."

## 3. Current behavior

Three different stories exist today:

- `canProcessMessage` in `backend/src/services/billingService.ts` calls `ensurePlatformSettings`, then `computeTurnEstimate` (`pricingService.ts`) with the vendor's `markupPercent` and `aiModel`. It returns `{ allowed: false, reason: 'insufficient_balance' }` when `walletBalanceMilli` is below that estimate. `trial_expired` is a separate reason for an unapproved vendor past `trialExpiresAt`.
- `processMessage` in `pipeline.ts`, when the check fails and the turn is not a sandbox, publishes `WALLET_EMPTY_TEMPLATE` (`backend/src/conversation/templates.ts`: "We're unable to process your message right now. The shop will get back to you shortly."). It does not write a `WalletBlockEvent`. There is no such model.
- The vendor dashboard `lowBalanceWarning` is `walletBalanceMilli < 20000` (`LOW_BALANCE_THRESHOLD_MILLI` in `dashboardStatsService.ts`), which is under ₹20. That is a warning, not the estimate gate. `ConnectWhatsAppPromo` can append a "Top up your wallet" link when the warning is on. The Wallet tile says "Balance is low".
- `getWhatsAppConnectStatus` already returns `walletCanReply` and `walletBlockReason` from the same `canProcessMessage` call. `WhatsAppStatus` in `frontend_v2/apps/web-vendor/src/lib/whatsappConnect.ts` includes both fields. `Dashboard.tsx` does not read them.
- Admin `Reliability.tsx` wallet tab (`activeTab === 'wallet'`) shows an amber card titled "WalletBlockEvent Persistence Pending Schema Migration" and a card "Wallet-Blocked Turns" whose empty state is "No persisted block events in this range (pending table migration)." `frontend_v2/apps/web-admin/src/lib/reliability.ts` types `WalletBlockEventItem`. The list is empty because the table was never added. The API side is `backend/src/routes/adminReliability.ts`, which returns an empty list with the message "WalletBlockEvent persistence requires schema migration (Decision 2 Option A)". `adminReliability.test.ts` asserts that message.

`Wallet.tsx` shows "Add money (simulated)" when mock top-up is on. Task 1 turns that flag off on the Lambda database when that database is the audited row. Admin recharge is `RechargeWalletCard` in `VendorDetailPanel.tsx`. That path is a normal top-up credit. It is not a balance edit, and this task does not call it.

[`docs/BILLING_AND_PRICING.md`](../BILLING_AND_PRICING.md) remains the formula. This task does not change `computeChargeMilli` or `chargeVendor`.

## 4. Step-by-step implementation

1. On the vendor dashboard, when `walletBlockReason === 'insufficient_balance'` (from `getWhatsAppStatus`, which already calls `canProcessMessage`), show a banner: replies are paused because the wallet is too low, with a link to `/wallet`. Use that reason, not `lowBalanceWarning`. A balance under ₹20 that can still cover `computeTurnEstimate` keeps the existing "Balance is low" subtext and does not get the pause banner.
2. Copy on the wallet page, when mock top-up is off: the founder adds money from admin recharge until checkout is live. Do not add a Razorpay checkout button. Do not turn `mockWalletTopUpEnabled` on. If task 1 left the flag on because the hosts differed, the pause copy still must not invite a simulated add on a production shop. Hide the simulated control whenever the settings flag is false, which `Wallet.tsx` already does.
3. On the admin Reliability wallet tab, remove the "Wallet-Blocked Turns" card (the empty list). Keep a short note that block events are not stored, and point at the vendor's wallet balance on the vendor page and at Usage. The note must not show a zero count. Delete the unused empty-state UI. You can leave the TypeScript type in `reliability.ts` if something else imports it. Do not add a `WalletBlockEvent` migration or a pipeline writer. Leave the `adminReliability.ts` wallet route and its test as they are. The amber card that names Decision 2 is the note to keep.
4. Test with a fixture vendor whose `walletBalanceMilli` is below `computeTurnEstimate` for their markup. Do not lower Ibell's balance to create the case. Assert the dashboard banner renders for `walletBlockReason: 'insufficient_balance'` and does not render for `lowBalanceWarning: true` with `walletCanReply: true`.
5. No edit to [`docs/BILLING_AND_PRICING.md`](../BILLING_AND_PRICING.md) unless you change the estimate or the fee. No edit to the flow doc unless you change `WALLET_EMPTY_TEMPLATE` or the guard branch. Prefer leaving the customer template as it is. The new copy is on the vendor dashboard.

## 5. What not to change

- `WalletBlockEvent` and any new table for block events.
- `chargeVendor`, balances, `CreditUsage`, and `WalletTransaction`. Do not debit or credit Ibell to test this.
- Mock top-up. It stays off on the database task 1 cleared.
- Self-serve Razorpay wallet checkout.
- The ₹20 `lowBalanceWarning` threshold. It remains a warning beside the estimate gate.
- The customer-facing `WALLET_EMPTY_TEMPLATE`, unless a copy change is required for the owner banner. It is not.

## 6. Acceptance checks

- A fixture vendor whose next turn would be refused sees the pause reason on `http://127.0.0.1:3000` and a link to the wallet page. The wallet page tells them the founder adds money via admin recharge.
- The admin Reliability wallet tab has no empty events table and no "0 blocked" figure.
- Ibell's `walletBalanceMilli` is unchanged by the test.
- Negative case: a vendor under ₹20 who can still cover the estimate sees "Balance is low" and does not see the pause banner.
- Negative case: `trial_expired` is not labeled as a low wallet. The banner is for `insufficient_balance` only.
- Negative case: with platform fee still 22200 paise, the estimate is huge and almost every shop would look paused. Do not ship the banner copy as the explanation of a ₹222 fee. Task 1's fee is 0 on the Lambda database before this acceptance is signed.

## 7. Dependencies

Task 1, so the pause is about real cost. Task 7 if both change `Dashboard.tsx`: the low-balance banner and the legacy WhatsApp line are separate conditions. Phase 2 exit is the gate for starting Phase 3. The banner can be built against the fixture before a new shop signs up.

[`docs/admin-portal/DECISIONS.md`](../admin-portal/DECISIONS.md) decision 2 is Locked on Option A, a persisted `WalletBlockEvent` written from the pipeline. This task defers that table past the launch and removes the empty list meanwhile. The owner confirms the deferral on the decision record before step 3 ships (open decision 1 in [`docs/product-review/2026-11-13-po-review.md`](../product-review/2026-11-13-po-review.md)). Steps 1, 2, and 4 do not wait on that.
