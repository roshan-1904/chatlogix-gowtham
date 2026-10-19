---
name: Stage 2 signed webhooks
overview: Accept Razorpay webhooks on one public route, verify the signature on the raw body, and record each event id in the same transaction as its handler so a failed handler is retried, not dropped. Do not credit any balance in this stage.
todos:
  - id: mount-raw
    content: Mount the webhook path with express.raw before authenticate
    status: completed
  - id: verify-store
    content: Verify HMAC; fetch from Razorpay before the transaction; insert PaymentWebhookEvent and run the handler in one transaction
    status: completed
  - id: dispatch
    content: Dispatch by event name and notes.purpose (wallet_topup, wallet_autorecharge, order_payment, shop_funding)
    status: completed
  - id: webhook-tests
    content: Test good signature, flipped byte, duplicate event id, and a handler that throws
    status: completed
isProject: false
---

# Stage 2 — Signed webhook ingress

Copy the WhatsApp pattern in [backend/src/routes/webhook.ts](backend/src/routes/webhook.ts) and [backend/src/utils/whatsappSignature.ts](backend/src/utils/whatsappSignature.ts): raw body, HMAC SHA256, `timingSafeEqual`.

Depends on stage 1 F2 for the settlement handlers. The AI-wallet handlers in stage 3 do not need it.

## Route

- Add `POST /api/payments/razorpay/webhook`. It is the only payment webhook. Payments, refunds, disputes, transfers, linked accounts, and UPI Autopay tokens all arrive here. There is no RazorpayX webhook.
- Mount it in [backend/src/index.ts](backend/src/index.ts) **above** `app.use('/api', authenticate, paymentsRouter)` (line 119). Use `express.raw({ type: 'application/json' })` on that path only.
- Leave [backend/src/routes/payments.ts](backend/src/routes/payments.ts) authenticated. Do not put the webhook on that router.

## Behavior

- Missing or bad `X-Razorpay-Signature` returns 400 and writes nothing.
- Order of work, per request:
  1. If a [PaymentWebhookEvent](backend/prisma/schema.prisma) row exists for `x-razorpay-event-id`, return 200.
  2. Fetch the payment, refund, dispute, or transfer from Razorpay’s API if the handler needs it. No transaction is open during the HTTP call.
  3. In **one** transaction: insert the event row, run the handler with the transaction client, set `processedAt`, commit.
  4. Return 200 after the commit. Any failure returns 5xx and rolls the event row back with the money change, so Razorpay’s retry runs the handler again.
  5. Follow-up Razorpay calls (create transfers, submit a funded refund) run after the commit under intent, call, confirm. Their failure does not fail the webhook; the stage 9 sweep finishes them.
- Do **not** insert the event row in its own transaction first. A handler failure would then make the retry look like a duplicate and lose the credit.
- A unique-key violation on the insert means a concurrent delivery won. Return 200.
- Dispatch by event name, then `notes.purpose`. A captured payment with an unknown purpose credits nothing and raises an alert.
- Unknown event names return 200 after the row is stored.
- Known names log and return 200 until their stage attaches a handler: `payment.captured`, `payment.failed`, `order.paid`, `payment_link.paid`, `payment_link.expired`, `refund.processed`, `refund.failed`, `payment.dispute.*`, `transfer.*`, `account.*`, `token.*`.
- Do not store the raw body.
- A rate limit on the webhook path only slows a flood of bad signatures. It must never drop a validly signed event.

## Tests

- Fixture body plus the test secret verifies.
- One flipped byte returns 400.
- A second post of the same event id does not call the handler twice.
- A handler that throws leaves no event row. Posting the same event again runs the handler.
