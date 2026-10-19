---
name: Stage 6 refunds and disputes
overview: Waits on Razorpay's Route confirmation; counsel's answer is needed before live keys. A refund is sent only when the shop's held money or a shop funding payment covers it, by reversing held transfers and then refunding. ChatLogix never fronts a refund. Lost disputes are recovered from held transfers and later payments.
todos:
  - id: refund-request
    content: Refund action under the vendor lock; straight to submitting when held money covers it, otherwise awaiting_funding
    status: completed
  - id: shop-funding
    content: Checkout for the grossed-up shortfall (purpose shop_funding); credit on capture; then submit
    status: completed
  - id: submit-refund
    content: Reverse the planned held transfers, then create the normal-speed refund; mark processed or failed from webhooks
    status: completed
  - id: drafts-and-chat
    content: Unfunded drafts expire after 24 hours; the bot never says a refund is approved before it is sent
    status: completed
  - id: flagged-captures
    content: Refund captures that were never transferred (F7, F9) from ChatLogix's account with no reversal
    status: completed
  - id: disputes
    content: payment.dispute.* — freeze, dispute_debit with reversals, owed remainder, dispute_credit and dispute_return transfer on win
    status: completed
isProject: false
---

# Stage 6 — Refunds and disputes

**Do not start until Razorpay’s Route confirmation is saved in [docs/payments/05-compliance-and-risk.md](docs/payments/05-compliance-and-risk.md).** Counsel’s answer on the refund-wait rule must be saved before live keys.

Depends on stages 2 and 5, and reuses the stage 3 Checkout. Full spec: phase 6 in [docs/payments/02-implementation-plan.md](docs/payments/02-implementation-plan.md).

## Refunds

- Refund on the order in the dashboard, amount defaulting to the remainder. `refundPaise + refundedPaise <= amountPaise`.
- `requestRefund` under the vendor lock:
  - Held money covers it: write `refund_debit`, store the reversal plan (this payment’s transfer first, then the shop’s other held transfers, newest first), status `submitting`.
  - It does not: status `awaiting_funding` with `shortfallMilli`. The dashboard shows “Add ₹X to send this refund” and opens Checkout for a Razorpay Order with `purpose: 'shop_funding'` and `notes.customerRefundId`, grossed up at the list fee rate.
- `payment.captured` with `purpose: 'shop_funding'`: `creditShopFundingTx` writes `shop_funding` for the actual net. If it covers the refund, the refund moves to `submitting`; if not, it stays `awaiting_funding` for the remainder.
- `submitRefund` after commit: create the planned reversals (fetch first), then the Razorpay refund with `speed: normal` and `notes.customerRefundId`. For a full refund covered only by this payment’s own held transfer, the reverse-all option on the refund call may replace separate reversals.
- `refund.processed`: `processed`, tell the customer. `refund.failed`: `failed`, alert ops. The reversed money is in ChatLogix’s account; ops retries.
- A full refund of an undelivered order may set `Order.status = cancelled`. A partial refund, or one after `delivered`, updates the payment only.
- While a shop has a refund in `awaiting_funding` or `submitting`, its releases pause (stage 7).

## Drafts and chat

- `expireRefundDrafts` cancels `awaiting_funding` refunds after 24 hours.
- The conversation `refund_request` path answers from eligibility and says the shop will confirm. It never creates a refund and never tells the customer a refund is approved before it is sent to Razorpay.

## Eligibility

- [backend/src/services/refundService.ts](backend/src/services/refundService.ts) today allows only `pending` or `confirmed` inside 7 days, then marks the order cancelled and calls no gateway.
- Managed payments are eligible while a captured remainder exists, including after delivery.
- Keep the 7-day and pending/confirmed rules for cash on delivery.

## Captures that were never transferred

- `refundRequired` (a F9 guard failed) or `net_not_positive`: ChatLogix refunds from its own account. No reversal, no settlement entry, an ops alert.

## Disputes

Subscribe to `payment.dispute.created`, `payment.dispute.lost`, `payment.dispute.won`, and `payment.dispute.closed`. Check the names in the dashboard.

- `created`: `releasesFrozenAt` with reason `dispute:<id>`, mark `disputeStatus`, show the shop the evidence deadline.
- Deduction (`amount_deducted`, at creation or on loss): `dispute_debit`, idempotent on the dispute id. Reverse held transfers, this payment’s first. The rest stays owed and is recovered from the shop’s next captures. The shop can pay it any time with a `shop_funding` payment.
- Won, or closed in the shop’s favour: `dispute_credit` for any amount returned, and a `dispute_return` transfer on the normal hold.
- Lift the freeze when no dispute is open, unless an admin froze the shop separately.

## Done when

- The phase 1 refund fixtures run through the webhook and the fake Razorpay, not only the pure functions.
- A short refund cannot reach Razorpay before its funding lands.
- A replayed `refund.processed` changes nothing.
- The AI wallet and the payment’s platform fee are unchanged.
- A lost-dispute fixture debits once, and a later won fixture credits back once.
