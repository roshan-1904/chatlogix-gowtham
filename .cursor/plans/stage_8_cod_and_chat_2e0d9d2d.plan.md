---
name: Stage 8 COD and chat
overview: Give shops the collection and auto-send settings, keep cash on delivery out of settlement, let an awaiting_payment order switch to COD, and answer payment-status questions from the payment row.
todos:
  - id: settings
    content: Shop settings for collection (via the stage 5 opt-in) and paymentLinkAutoSend; admin edits paymentFeeBps
    status: completed
  - id: cod
    content: Payment method on the order; switching awaiting_payment to COD cancels the link; cash-collected writes nothing to settlement
    status: completed
  - id: chat-status
    content: Answer payment status from CustomerPayment and update the flow doc
    status: completed
isProject: false
---

# Stage 8 — COD, settings, and chat

Full spec: phase 8 in [docs/payments/02-implementation-plan.md](docs/payments/02-implementation-plan.md). Order lifecycle: D5 in [docs/payments/05-compliance-and-risk.md](docs/payments/05-compliance-and-risk.md).

## Settings

- Collection is turned on through the stage 5 opt-in (KYC and an activated linked account). Turning it off cancels open links at Razorpay and stops new ones. Held money keeps its schedule.
- `paymentLinkAutoSend`, default on. Off means the bot never sends a link and the shop presses Send.
- Admin edits `paymentFeeBps` (0–2000, includes GST) on `PATCH /api/vendors/:id/billing-config` in [backend/src/routes/vendors.ts](backend/src/routes/vendors.ts), beside `markupPercent`. Vendors cannot set their own fee. Audit the change the same way other staff money edits are audited.

## Order method

- Record `razorpay`, `cod`, or `vendor_collected` on the order.
- `cod` and `vendor_collected` never create a payment link and never write a settlement entry or transfer.
- Switching an `awaiting_payment` order to COD cancels its open link and moves it to `confirmed`.
- “Mark cash collected” marks the order paid to the shop and changes neither balance.

## Conversation

- Include the latest `CustomerPayment` status in the context used for “did my payment go through?”. Read Postgres. Do not call Razorpay on the customer’s message.
- When that prompt path changes, update [docs/INCOMING_RESPONSE_GENERATOR_FLOW.md](docs/INCOMING_RESPONSE_GENERATOR_FLOW.md) in the same change.

## Done when

- Collection off returns 409 on link create. Turning collection off cancels an open link.
- Auto-send off: the bot sends no link.
- Switching an awaiting order to COD cancels its link.
- Marking COD collected leaves `walletBalanceMilli` and `settlementBalanceMilli` unchanged.
- A fixture payment status shows up in the pipeline context that is already logged.
