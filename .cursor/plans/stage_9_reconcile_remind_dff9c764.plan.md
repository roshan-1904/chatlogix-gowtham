---
name: Stage 9 reconcile remind
overview: Finish half-done Razorpay intents, repair missed webhooks from Razorpay's API, check every cached balance against its ledger and every shop's held transfers against Razorpay, and send one WhatsApp reminder before a payment link expires.
todos:
  - id: intent-sweep
    content: Every 15 minutes, finish transfers in to_create/releasing and refunds in submitting from Razorpay's state
    status: completed
  - id: daily-sweep
    content: Daily, fetch stale links, refunds, and disputes and apply the existing handlers
    status: completed
  - id: ledger-check
    content: Alert when a cached settlementBalanceMilli differs from the sum of its ledger entries
    status: completed
  - id: route-check
    content: Alert when a shop's held transfers at Razorpay differ from the local on_hold transfers
    status: completed
  - id: one-reminder
    content: Send a single WhatsApp reminder inside the last two hours of a link
    status: completed
  - id: docs
    content: Mark stage 9 done and add the settlement section to the billing doc
    status: completed
isProject: false
---

# Stage 9 — Reconciliation, checks, and one reminder

Depends on stages 2, 5, 6, and 7. Every sweep item calls the same handler as the webhook or the job. Idempotency keys and the vendor lock make a race safe. Full spec: phase 9 in [docs/payments/02-implementation-plan.md](docs/payments/02-implementation-plan.md).

## Intent sweep (every 15 minutes)

- `SettlementTransfer` in `to_create`: fetch the payment’s transfers, match `notes.settlementTransferId`, create if missing, mark `on_hold`.
- `SettlementTransfer` in `releasing`: fetch the transfer; if its hold is off, mark `released` and write `transfer_release`; otherwise retry the release.
- `CustomerRefund` in `submitting`: fetch reversals and the refund by notes, create what is missing, mark `submitted`.

## Daily sweep

- `CustomerPayment` holds only captured payments, so start from `PaymentLink`. For links still `created` after a capture should have arrived, fetch them and run the capture handler.
- Refunds and disputes at Razorpay with no matching ledger row: run their handlers.
- Alert, and do not auto-delete, when a local credit has no captured payment at Razorpay, or when gross, fees, taxes, and net on a payment do not add up.

## Ledger check

- For every shop with settlement activity, `settlementBalanceMilli` must equal the sum of its entries. Credits: `payment_credit`, `shop_funding`, `dispute_credit`, credit `adjustment`. Debits: `transfer_release`, `refund_debit`, `dispute_debit`, debit `adjustment`.
- A mismatch alerts and changes nothing.

## Route check

- For every shop, the sum of transfers on hold at Razorpay must equal the local `on_hold` transfers minus their reversals.
- A mismatch alerts and changes nothing.

## Reminder

- One WhatsApp message when a link is unpaid and inside two hours of `expiresAt`. Do not send a second one. Use the existing response queue and `NotificationHistory`.
- Outside the 24-hour customer window, send the approved template from stage 5.

## Done when

- A link stuck in `created` becomes credited when the fake client returns a captured payment. A second sweep adds nothing.
- A transfer stuck in `releasing` is finished from the fake’s state.
- A hand-edited cached balance raises the ledger alert. A fake Razorpay hold total that differs raises the Route alert.
- The reminder job writes one notification row.
- Update the progress table in [docs/payments/02-implementation-plan.md](docs/payments/02-implementation-plan.md). After this stage is live, add a settlement section to [docs/BILLING_AND_PRICING.md](docs/BILLING_AND_PRICING.md) instead of restating the AI-wallet formula.
