# 4. Cancelled and empty orders

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Not started** · Competitive role: Parity · Priority: Phase 2, order 4 (unchanged)
> Verified: the panel is always mounted (`frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx:288`); both shipment buttons (`:343-349`); four 501 routes (`backend/src/routes/shipping.ts:21-42`); the cancelled 409 in `sendUpiQrForOrder` (`upiQrService.ts:61`); no cancelled or zero-total check in `markOrderCashCollected` (`codOrderService.ts:85-107`). Missing: all six steps. Changed in this review: step 3 also unmounts `ShippingModal`.

## 1. Phase and why this task is in it

Phase 2. The pending count in task 3 treats cancelled orders and zero-item or zero-total shells as not open work. The order page has to agree, or the owner still chases payment and a shipment on those rows.

## 2. Problem and user impact

`ORD-ORDER-2026090006` is cancelled and still offers payment confirmation and Create Shipment. `ORD-ORDER-2026090002` is ₹0 with no items and still says collect payment. The owner can chase money that is not owed and can open a shipment flow the API refuses.

## 3. Current behavior

`frontend_v2/apps/web-vendor/src/pages/OrderDetails.tsx` always renders `OrderPaymentPanel` and, inside the Shipping Information card, a Create Shipment button when local state `shippingStatus === 'not_created'`, otherwise View Shipping Details. `shippingStatus` is component state initialized to `not_created`. It is not loaded from a shipment record.

`backend/src/routes/shipping.ts` returns HTTP 501 `{ error: 'Not implemented' }` for all four routes: `POST /orders/:orderId/shipment`, `GET /orders/:orderId/shipping-rates`, `GET /shipments/:shipmentId/label`, `GET /shipments/:trackingNumber/track`. `frontend_v2/apps/web-vendor/src/services/shipping.ts` maps a 501 to "not yet available".

`OrderPaymentPanel` (`frontend_v2/apps/web-vendor/src/components/orders/OrderPaymentPanel.tsx`) always offers Razorpay, GPay / UPI, and cash, and `markReceived` posts `orderPayments.markCashCollected` to `POST /orders/:id/mark-cash-collected`.

`sendUpiQrForOrder` in `backend/src/services/payments/upiQrService.ts` already returns 409 when `order.status === 'cancelled'`. It does not reject a zero total. `markOrderCashCollected` in `backend/src/services/payments/codOrderService.ts` checks vendor match, online capture, and an existing `cash_collected` audit row. It does not check `cancelled` or a zero total.

`listNextStep` in `frontend_v2/apps/web-vendor/src/utils/orderPayment.ts` returns null for `cancelled` and `delivered`. `needsCollection` is true for every other status that is not paid online and not already cash-collected, including a zero total. `getOrderNextStep` in `frontend_v2/apps/web-vendor/src/components/orders/listNextStep.ts` suppresses "Collect payment" only when `status === 'cancelled'`.

Order money is paise. A shell is `totalAmount` 0 or no line items.

## 4. Step-by-step implementation

1. Add one predicate, shared by the detail page and the list helpers: payment actions are available when status is not `cancelled` and the order has at least one line item and `totalAmount` greater than 0. Delivered orders that still have items and a positive total keep payment actions. This predicate is the payment one. Task 3's open-work count also excludes `delivered`. Do not reuse that count here to hide payment on a delivered order that still needs a receipt mark.
2. In `OrderDetails.tsx`, skip `OrderPaymentPanel` when the predicate is false. Keep the status timeline and the customer card.
3. Remove the Create Shipment button and the View Shipping Details button from `OrderDetails.tsx` on every order while `shipping.ts` returns 501. Leave the shipping card's "Not Created" badge if you want the section visible, with no action. Leave `backend/src/routes/shipping.ts` returning 501. Do not add Shiprocket, labels, or tracking. Unmount `ShippingModal` from `OrderDetails.tsx` in the same edit. Nothing opens it once the buttons are gone, and it sends `customerName: order.customer?.id`, a raw id, as the customer's name.
4. In `listNextStep` and `getOrderNextStep`, return null for the collect action when the predicate is false. A cancelled order and a zero-total order show no collect label.
5. In `markOrderCashCollected` and `sendUpiQrForOrder`, reject cancelled orders and zero-item or zero-total orders with 409 before any WhatsApp send or audit write. `sendUpiQrForOrder` already rejects cancelled. Extend it for the shell case. Add a unit test on each function.
6. Confirm `OrderPaymentPanel` is not mounted elsewhere for those orders. `CustomerConversationModal` does not mount it.

No pipeline change and no pricing change.

## 5. What not to change

- Shiprocket, shipping rates, labels, and tracking. The four shipping routes stay 501.
- Live Razorpay Route and `RAZORPAY_USE_FAKE_ROUTE`. Recording UPI or cash on a real open order stays task 6.
- Wallet balances.
- Fulfillment buttons on a real open order (`OrderNextStep` in the same page). Cancelling a real order is still allowed.
- Task 3's revenue queries.

## 6. Acceptance checks

- `ORD-ORDER-2026090006` (cancelled) shows no collect control and no shipment button.
- `ORD-ORDER-2026090002` (₹0, no items) shows no collect control and no shipment button.
- An open Ibell order with line items and a positive paise total still shows mark-received for UPI or cash.
- `POST /orders/:id/mark-cash-collected` on the cancelled order returns 409 and writes no `cash_collected` audit row.
- `POST` shipment on any order still returns 501.
- Negative case: vendor A cannot mark vendor B's order collected (`markOrderCashCollected` already requires `order.vendorId === input.vendorId`).
- Negative case: a delivered order with items and a positive total still offers mark-received. Hiding that would be the wrong predicate.

## 7. Dependencies

Task 3, so the pending tile and this page agree on shells and cancelled orders. Task 6 depends on this one, so payment text is built only for orders that still offer payment.
