---
name: Stage 5 linked accounts and payment links
overview: Waits on Razorpay's Route confirmation. Onboard each shop as a Route linked account, add the awaiting_payment order status, send payment links (bot or shop, per setting), and on capture credit the net and create a held Route transfer.
todos:
  - id: route-confirmed
    content: Confirm Razorpay's written Route reply is saved in docs/payments/05 and matches this plan
    status: completed
  - id: linked-accounts
    content: Opt-in screen with KYC and bank account; create the Route linked account; follow its status; collection on at activation
    status: completed
  - id: awaiting-payment
    content: Add awaiting_payment to OrderStatus and audit every switch, filter, and label on it
    status: completed
  - id: create-link
    content: Payment-link creation from Order.totalAmount; one open link per order; persist PaymentLink
    status: completed
  - id: send-link
    content: Bot sends the link when paymentLinkAutoSend is on, shop presses Send when off; template outside the 24-hour window
    status: completed
  - id: link-lifecycle
    content: Cart change cancels and reissues; capture moves to confirmed; expiry leaves the order waiting for the shop
    status: completed
  - id: capture-transfer
    content: On capture, creditCapturedPaymentTx in the webhook transaction, then createPendingTransfers after commit
    status: completed
isProject: false
---

# Stage 5 — Linked accounts, payment links, and capture

**Do not start until Razorpay’s written Route confirmation is saved in [docs/payments/05-compliance-and-risk.md](docs/payments/05-compliance-and-risk.md).**

Depends on stages 1 and 2. Uses `creditCapturedPaymentTx` and `createPendingTransfers` from stage 1. Does not call `creditWalletFromTopUp`. Full spec: phase 5 in [docs/payments/02-implementation-plan.md](docs/payments/02-implementation-plan.md).

## Linked accounts

- Opt-in screen collects legal name, business type, PAN, GSTIN or an exemption declaration, settlement bank account (number, IFSC, holder name), and contact.
- Create the Route linked account through Razorpay’s linked-account API. Store `razorpayLinkedAccountId`, `legalName`, `gstin`, and `panEncrypted` (encrypt the way [backend/src/utils/whatsappTokenCrypto.ts](backend/src/utils/whatsappTokenCrypto.ts) does). Show only a masked bank account afterwards.
- `linkedAccountStatus` follows Razorpay’s `account.*` webhooks. A holder-name mismatch needs a person to approve.
- On activation, set `paymentsManagedByChatlogix = true` and `collectionStartedAt = now()`. Refuse to enable collection before that.

## Order status

- Add `awaiting_payment` to `OrderStatus` in this stage’s migration.
- Audit every `switch`, filter, and label on `OrderStatus` in the backend and `frontend_v2`, the order-recovery sweep, analytics, and notifications.

## Payment links

- Replace the 501 in `POST /api/orders/:id/payment-link` ([backend/src/routes/orders.ts](backend/src/routes/orders.ts)). Keep `ensureOrderAccess`.
- Ignore `amount` and `customerPhone` from the body. Use `Order.totalAmount` (paise) and the order’s customer phone.
- Require collection on. Refuse when a captured payment already covers the order, and refuse COD orders.
- Cancel any open link for the order at Razorpay before creating a new one. Never two open links.
- Create the Payment Link. SMS and email notify off. Notes: `orderId`, `vendorId`, `purpose: 'order_payment'`. Expire in 24 hours.
- Persist `PaymentLink`. `GET /api/payment-links/:linkId/status` reads the local row.

## Sending and lifecycle

- When the customer confirms in chat and the shop has collection on, the CartEngine creates the order as `awaiting_payment` unless the customer chose COD.
- `paymentLinkAutoSend` on (default): the pipeline creates and sends the link. Off: the shop sees Send on the order. Update [docs/INCOMING_RESPONSE_GENERATOR_FLOW.md](docs/INCOMING_RESPONSE_GENERATOR_FLOW.md) in the same change.
- [backend/src/services/whatsappTemplateService.ts](backend/src/services/whatsappTemplateService.ts) `sendPaymentLink` queues plain text. Add an approved utility template for when the last customer message is older than 24 hours.
- Cart change before payment: cancel the open link, create a new one for the new total, send it the same way.
- Capture: the order moves to `confirmed`.
- `payment_link.expired`: the order stays `awaiting_payment`, and the shop is notified to resend, switch to COD, or cancel.

## Capture

- `payment.captured` or `payment_link.paid` with `purpose: 'order_payment'`: fetch the payment before the transaction, call `creditCapturedPaymentTx` inside the stage 2 transaction, then `createPendingTransfers` after the commit.
- The F9 guards store a bad capture (cancelled order, already paid, amount mismatch, unknown link, non-INR) with `refundRequired` and create no transfer. Stage 6 refunds it.

## Vendor UI

- Remove `send_payment_link` from the not-available list. Wire Send on the order screen. Replace the QR placeholder in [frontend_v2/apps/web-vendor/src/components/orders/modals/PaymentLinkModal.tsx](frontend_v2/apps/web-vendor/src/components/orders/modals/PaymentLinkModal.tsx) by encoding the real URL, or remove the block.
- Payment status and transfer status come from the API, not a local `useState` default. Settlement amounts arrive as decimal strings.

## Done when

- A test linked account reaches `activated` and collection turns on.
- The link survives a reload. Send writes `NotificationHistory`.
- A capture fixture writes `payment_credit`, creates one held transfer at the fake Razorpay, and does not change the AI wallet.
- A replayed webhook credits nothing and creates no second transfer.
- A cart change leaves exactly one open link.
- A capture on a cancelled order creates no transfer and is flagged for refund.
- With auto-send off, the bot sends no link.
