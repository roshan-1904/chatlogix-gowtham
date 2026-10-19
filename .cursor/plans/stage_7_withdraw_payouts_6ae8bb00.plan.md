---
name: Stage 7 hold release and risk controls
overview: Waits on Razorpay's Route confirmation. Release each held Route transfer when its hold ends (48 hours, 7 days for new shops) unless a block applies, and give admins and shops the controls around it. No Withdraw button and no RazorpayX.
todos:
  - id: release-job
    content: releaseDueTransfers in batches on a timer, with intent/call/confirm around the hold PATCH
    status: completed
  - id: blocks
    content: Admin freeze, open dispute, bank-change pause, refund in progress, and the new-shop daily cap
    status: completed
  - id: bank-change
    content: Bank change with phone OTP, linked-account update at Razorpay, settlementBankChangedAt, WhatsApp and email notice
    status: completed
  - id: admin-controls
    content: Admin freeze/unfreeze with reason, rollingReserveBps, and held/reserve/released/owed view, all audited
    status: completed
  - id: shop-view
    content: Order payments page showing on hold, in reserve, released, owed (with Pay), next release time
    status: completed
isProject: false
---

# Stage 7 — Hold release and risk controls

**Do not start until Razorpay’s Route confirmation is saved in [docs/payments/05-compliance-and-risk.md](docs/payments/05-compliance-and-risk.md).** Razorpay must confirm that a held transfer can be released later with `PATCH /v1/transfers/:id`.

There is no Withdraw button. Released money is settled to the shop’s bank by Razorpay on its linked-account schedule. Full spec: phase 7 in [docs/payments/02-implementation-plan.md](docs/payments/02-implementation-plan.md). Rules: D4 in 05.

## Release job

- Every few minutes, `releaseDueTransfers` from [backend/src/services/payments/settlementService.ts](backend/src/services/payments/settlementService.ts), in batches of about 100.
- For each `on_hold` transfer past `eligibleAt`: take the vendor lock, check the blocks, mark `releasing`, call `PATCH /v1/transfers/:id` with `on_hold: false` with no transaction open, then mark `released` and write `transfer_release`. A run that finds a transfer already `releasing` skips it; stage 9 finishes stuck ones.
- Holds: 48 hours; 7 days while the shop is new (30 days from `collectionStartedAt` or 20 captured payments, whichever ends later). Reserve transfers: 30 days.

## Blocks

| Block | Source |
|---|---|
| Admin freeze | `releasesFrozenAt` with a non-dispute reason |
| Open dispute | Any of the shop’s payments with an open `disputeStatus` |
| Bank change | Within 48 hours of `settlementBankChangedAt` |
| Refund in progress | A `CustomerRefund` in `awaiting_funding` or `submitting` |
| Daily cap | New shop already had ₹25,000 released today (IST). A single larger transfer is released alone on a day with no other release. |

## Bank change

- From the shop’s settings, with a fresh phone OTP.
- Update the linked account’s settlement bank account through Razorpay’s API. Razorpay verifies it.
- Set `settlementBankChangedAt`. Tell the shop on WhatsApp and email.
- Rate-limit to about 5 changes per shop per day.

## Admin controls

- Vendor panel: freeze and unfreeze releases with a reason, set `rollingReserveBps`, view held, reserve, released, and owed.
- Every change writes an audit row (who, when, old, new).

## Shop view

- Order payments page: On hold (next release time), In reserve, Released (on its way to the bank), Owed (with a Pay button that opens the stage 6 funding Checkout).
- Amounts arrive from the API as decimal strings in milli.

## Done when

- A transfer with `eligibleAt` in the future is not released. After it passes, the transfer is released once even if the job runs twice.
- Each block holds a due transfer.
- A new shop’s second ₹20,000 release in a day waits for the next day. A new shop’s single ₹30,000 transfer is released on a day with no other release.
- A bank change an hour ago holds releases.
- The AI wallet does not move.
