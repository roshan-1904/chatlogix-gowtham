---
name: Stage 4 auto recharge
overview: Let a vendor turn on UPI Autopay so the AI wallet refills by a chosen preset when it drops under ₹100. Handle the mandate lifecycle, not just the debit. Settlement is not a funding source.
todos:
  - id: mandate-ui
    content: Add the auto-recharge toggle and preset amounts on the wallet page
    status: completed
  - id: mandate-events
    content: Handle token.confirmed, token.rejected, token.paused, and token.cancelled; a preset change needs a new mandate
    status: completed
  - id: schedule
    content: Schedule a single 25-hour debit when the AI wallet is under ₹100
    status: completed
  - id: capture
    content: Credit the preset from the autorecharge webhook and stop on failure
    status: completed
isProject: false
---

# Stage 4 — AI wallet auto-recharge

Threshold is the constant `100000` milli in [backend/src/services/payments/settlementMath.ts](backend/src/services/payments/settlementMath.ts). The vendor chooses ₹500, ₹1,000, or ₹2,000 only.

Needs the three `autoRecharge*` columns applied. If Razorpay’s Route confirmation has not arrived, so the settlement migration is still waiting, apply them as their own migration (stage 1, `split-auto-recharge`).

## Vendor settings

- Wallet page: toggle plus those three amounts. Columns: `autoRechargeEnabled`, `autoRechargeAmountMilli`, `autoRechargeMandateId`.
- Turning it on starts a Razorpay UPI Autopay registration. Store the mandate id only on `token.confirmed`. Record who approved it, when, the amount, and the mandate id as an audit row.
- The mandate is for one amount. Changing the preset starts a new registration. The old mandate stays in use until the new one is confirmed, then it is cancelled.
- Show the expected debit time on the wallet page while an attempt is scheduled.

## Mandate lifecycle

- `token.rejected`: leave auto-recharge off and tell the vendor.
- `token.paused` or `token.cancelled` (by the vendor in their UPI app, or by the bank): turn auto-recharge off, cancel any scheduled attempt, and tell the vendor.

## When it fires

- After a successful `chargeVendor` in [backend/src/conversation/billing.ts](backend/src/conversation/billing.ts), and from a periodic sweep for quiet vendors.
- Schedule one attempt at `now + 25 hours` only when the AI wallet is under ₹100, a mandate exists, and no attempt is already scheduled or pending.
- Send Razorpay’s pre-debit notification before the charge. Do not use a calendar Subscription.
- On `payment.captured` with `purpose: 'wallet_autorecharge'`, call `creditWalletFromTopUp` for the chosen preset.
- On failure, notify the vendor and do not retry in a loop.
- A vendor who spends ₹100 in under 25 hours reaches the zero-balance gate before the debit lands. That is expected. The wallet page shows the debit time so they can top up by hand.

## Done when

- A ₹99 balance with a fake mandate schedules one attempt.
- A second debit the same day does not schedule another.
- The captured fixture credits exactly the preset, and `settlementBalanceMilli` stays unchanged.
- A `token.cancelled` fixture turns auto-recharge off and cancels the scheduled attempt.
