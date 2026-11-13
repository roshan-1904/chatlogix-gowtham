# 6. Record payment

## 1. Phase and why this task is in it

Phase 2. Ibell collects on its own UPI or in cash. The owner needs a button that means "I received it" and a payment message that names this shop. Live Razorpay Route is a later project. It is not how this shop gets paid in this phase.

## 2. Problem and user impact

A payment message in a customer thread named another person and a personal UPI. The customer can pay the wrong account. The owner also needs a clear received state so the order leaves the "needs collection" set from task 3.

Which sender produced that message is not proven from code alone. Two paths can name a payee: the deterministic UPI body in `upiQrService.ts`, and a free-text assistant reply.

## 3. Current behavior

`sendUpiQrForOrder` in `backend/src/services/payments/upiQrService.ts` loads `vendor.upiVpa`, `vendor.upiPayeeName`, and `vendor.businessName`. It already returns 409 when `upiVpa` or `upiPayeeName` is blank (`Save your UPI ID and payee name in payment settings first`). The body it sends is:

```
Pay ₹{amount} for order {orderNumber}

{payeeName}
UPI: {vpa}
Amount: ₹{amount}
```

`businessName` is selected and not included. `buildUpiUri` puts `pa` and `pn` from the VPA and payee name. Amount is `order.totalAmount / 100` because `totalAmount` is paise.

`OrderPaymentPanel.markReceived` posts to `POST /orders/:id/mark-cash-collected` via `orderPayments.markCashCollected`. For the GPay choice it sends `paymentMethod: 'vendor_collected'`. `markOrderCashCollected` writes an `OrderAuditLog` action `cash_collected`. It does not change `Vendor.walletBalanceMilli`. Customer payment money is not wallet money ([`docs/payments/README.md`](../payments/README.md)).

`prompts.ts` tells the model to answer payment-status questions from `ORDER PAYMENT STATUS` and not to say it is checking with the bank. It does not tell the model to avoid inventing a UPI id or a person's name. The system prompt can still name an account in prose.

Route go-live is gated on D1 in [`docs/payments/05-compliance-and-risk.md`](../payments/05-compliance-and-risk.md). [`docs/payments/02-implementation-plan.md`](../payments/02-implementation-plan.md) keeps live Route HTTP behind that letter. Dev uses `RAZORPAY_USE_FAKE_ROUTE`. [`docs/payments/01-business-flow.md`](../payments/01-business-flow.md) is the business flow for customer payments. A GPay QR and a tap-to-pay link do not mark the order paid by themselves. A payment screenshot does not either.

The panel already knows `upiVpa` and `upiPayeeName` through `ShopPaySettings`. It does not show `businessName` next to them before send.

## 4. Step-by-step implementation

1. Read-only, before any code: open the historical payment message if it is still in the thread, and read Ibell's `upiVpa`, `upiPayeeName`, and `businessName`. Do not update those columns in SQL. If the saved VPA or payee is wrong, the owner types the correct values in payment settings. Engineering does not type the VPA. The product owner watches.
2. Keep the existing blank refusal in `sendUpiQrForOrder`. Add a unit test that a missing `upiVpa` or a missing `upiPayeeName` throws 409 and does not call `sendWhatsAppCtaUrl`.
3. Include `businessName` in `bodyText` together with the saved payee and VPA. The body contains those three strings, the amount, and the order number. It contains no other account. Put the same three strings on `OrderPaymentPanel` before the send button, from the shop settings the page already loads. If `businessName` is not on `ShopPaySettings`, extend the settings payload the order page already fetches. Do not hardcode Ibell's name.
4. In `buildSystemPrompt` in `backend/src/conversation/llm/prompts.ts`, add a rule: when the customer asks how to pay, point them at the shop's payment message (the UPI message the shop sends, or cash on delivery). Do not invent a UPI id, a QR, or a person's name. Do not copy a VPA from the transcript unless it is already in the vendor block you also add. Pass `businessName` only. Do not put the raw VPA into the prompt unless product and engineering agree the model should repeat the saved value. The safer rule is: the model does not state an account; the owner sends the UPI message from the order page.
5. Update [`docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`](../INCOMING_RESPONSE_GENERATOR_FLOW.md) in the same change as the prompt rule. The payment-status section already describes `upi_pending` and `send-upi-qr`. Add that the assistant does not invent a VPA or a payee, and that `sendUpiQrForOrder` includes `businessName`. Touch the `DOC_SYNC` comment and `docs/DOC_SYNC_INDEX.md` as that flow doc requires. Do not rewrite [`docs/BILLING_AND_PRICING.md`](../BILLING_AND_PRICING.md). This task does not charge the wallet.
6. After `cash_collected`, the order drops out of "needs collection" on the list (`needsCollection` in `orderPayment.ts` is false when `isCashCollected`). Task 3's open-work count is about fulfillment status, not payment. Marking received does not by itself remove a `pending` order from open work until the owner advances status. The acceptance below is: the collect action is gone, and the dashboard collection cue from `needsCollection` is gone. Do not auto-advance `Order.status` in this task.
7. Leave `RAZORPAY_USE_FAKE_ROUTE` as the payments docs require until D1. Do not call Route linked-account APIs.

## 5. What not to change

- Live Razorpay Route, linked accounts, settlement release, and payment links that settle to the shop.
- `Vendor.walletBalanceMilli`. Marking cash collected is an order audit, not a wallet credit.
- `Vendor.upiVpa` and `upiPayeeName` from application code or SQL. The owner types them.
- The platform fee and FX fields from task 1.
- Shiprocket.
- Embedded Signup on Ibell's number.

## 6. Acceptance checks

- A UPI instruction for an Ibell order contains Ibell's saved VPA, saved payee name, and `businessName`, plus the amount and order number. The order page shows the same three strings before send.
- Blank VPA or blank payee: the send returns 409 and no WhatsApp message is created.
- Marking UPI or cash received writes `cash_collected` and the panel does not offer the action again.
- A cancelled order still has no payment action (task 4), and `mark-cash-collected` returns 409.
- Negative case: the assistant reply on a "what is your UPI" turn does not contain a VPA or a person name that is absent from the shop's saved fields. Cover this with a prompt test (`prompts.test.ts`) that the new rule line is present, and with one fixture turn if you have a harness that snapshots `draftReply` instructions.
- Negative case: the fee is still ₹222 on the Lambda database if task 1 did not write. Do not send a live test payment message until task 1's recompute is under ₹1. The UPI send itself is a WhatsApp message, not a `chargeVendor` call, but the thread may still be billed when the assistant replies.
- No `WalletTransaction` is created by mark-received.

## 7. Dependencies

Task 4. Task 1, so a test reply in the same thread is not a ₹222 turn. Task 3, so the walk can see the order leave the collection cue. No D1.
