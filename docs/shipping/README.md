# Vendor shipments

**Status:** Design, revised 2026-10-21 after the open decisions were closed. Not implemented.  
**Plan:** [02-implementation-plan.md](./02-implementation-plan.md) — phases, gates, tests, effort.  
**Aggregator:** One ChatLogix account at a shipping aggregator (Shiprocket first). India, domestic parcels. Carriers such as Delhivery and DTDC appear as rows on that account. They are not separate integrations.

This document is the spec for getting a packed order from the shop to the customer by courier: check the pincode in chat, charge the customer a shipping line, show the vendor a rate list, book the pickup, print a label, push tracking to the customer, and handle failed deliveries over WhatsApp. It is not a local-delivery or rider product.

## Where the money goes

| Money | Where it lives | Who writes it | Spec |
|---|---|---|---|
| AI wallet and **courier freight** | `Vendor.walletBalanceMilli` | `pricingService` (new fixed-amount entry points, see [Wallet](#wallet-charges)) | [BILLING_AND_PRICING.md](../BILLING_AND_PRICING.md) |
| Order payment, **including the shipping line** | Razorpay Route, `Vendor.settlementBalanceMilli` | `settlementService` | [payments/README.md](../payments/README.md) |
| Shipment amounts on the record | Paise on `Shipment`, `ShipmentAdjustment`, and `Order.shippingChargePaise` | Shipping service | This folder |

Two flows touch two different pockets, and they are not netted against each other:

- **The customer pays a shipping line.** It is part of `Order.totalAmount`, so it rides the payment link, the platform fee, and settlement like any other part of the order. It is the vendor's revenue.
- **The vendor pays the freight.** When they book, `chargePaise` is debited from the AI wallet. It is the vendor's cost.

The line the customer paid is an estimate from the cheapest enabled carrier. The vendor may book any carrier, and **the vendor bears the difference** between the estimate and the freight they booked.

## The problem

After the bot places an order, the vendor still finishes delivery by hand.

1. They prepare and pack the order.
2. They print the customer address, or write it on the parcel.
3. They take it to the nearest courier counter.
4. They copy the tracking id back into WhatsApp, once per customer.

With a hundred orders that is a hundred slips and a hundred messages. Customers still ask “where is my order?” because the bot only knows the order status (`ready`, `out_for_delivery`, `delivered`) and has no tracking number. When a delivery fails, nobody asks the customer what to do, and the parcel goes back at the vendor’s cost.

The vendor’s job in ChatLogix should stop at packing and a few clicks. ChatLogix books the courier, answers the customer, and chases the customer when a delivery fails.

## The customer’s side (in chat)

For a vendor with courier shipping on:

1. **The bot asks for a full address and a 6-digit pincode** before it will confirm. The pincode is read from the address with a regex, not by the model. City and state come from a pincode lookup.
2. **The pincode is checked at once.** If the aggregator cannot deliver there, the bot says so and asks for a different address. The order is not confirmed.
3. **The cart shows a shipping line.** It is the cheapest enabled carrier’s marked-up price for the shop’s pickup pincode, the customer’s pincode, and the shop’s default weight. It is added to the total. A payment link or a COD total includes it.
4. **The line is frozen** once the order is confirmed or a payment link is sent. A quote older than 30 minutes is refreshed before it freezes. After that the customer’s price never moves.
5. **After booking,** the customer gets WhatsApp updates (see [Customer messages](#customer-messages)). “Where is my order?” quotes the courier, the AWB, the tracking link, and the latest status.
6. **If a delivery fails,** the bot asks the customer what to do, with buttons (see [Failed deliveries](#failed-deliveries-ndr)).

If the aggregator is down and there is no usable stale quote (same pincode pair, under 24 hours old), the bot asks the customer to try again in a few minutes. It never invents a fee, and it never confirms with a missing line.

## What the vendor does

On an order that is packed and paid (or, once COD ships, a COD order):

1. **Ship.** The pickup address, the customer address, and the frozen shipping line are already on the order. The vendor can change the package weight. Nothing else is typed.
2. **Pick a service.** One list: carrier name, price, and approximate delivery date. Only carriers staff have enabled appear. The price already includes the admin markup. The page shows the wallet balance and the shipping line the customer paid, so the vendor sees their margin on the parcel.
3. **Book.** That choice debits the wallet, creates the shipment, and raises the pickup. The label opens for print, with the carrier’s barcode or QR, the customer address, and the order number. A day list prints every label for the day.
4. **Nothing after that,** unless a delivery fails and the vendor wants to override the customer’s choice. Pickup, in transit, out for delivery, and delivered come from the carrier. Each event updates the order and messages the customer.

After booking, the order shows status only: label ready, pickup scheduled, picked up, in transit, delivered. The vendor does not open the carrier’s site.

## Decisions

| # | Decision | Answer |
|---|---|---|
| D1 | What v1 is | Courier booking on one aggregator account. Not manual AWB entry, not a rider run-sheet, not a separate Shipments module. |
| D2 | Who holds the carrier account | ChatLogix. Each shop is a pickup address on that account. Vendors do not create a Shiprocket (or other) login. |
| D3 | Which carriers a vendor sees | Staff, on web-admin `/shipping`. A carrier that is off never appears in a quote. |
| D4 | What the vendor pays | Aggregator `freight_charge` plus the carrier’s markup. Debited from the **AI wallet** at booking, in one step with the shipment. |
| D5 | Where the discount comes from | The aggregator’s contracted rate, shared by every shop on the ChatLogix account. A lower markup is the only in-product discount. |
| D6 | Secrets | Aggregator email, password, and webhook token live in environment variables. The admin page never accepts them. |
| D7 | Customer updates | Carrier webhooks are the source of truth. Updates go as plain text inside Meta’s 24-hour window and as approved utility templates outside it. |
| D8 | Who can ship | A per-vendor flag, **off by default**. A vendor turns it on in Settings once the pickup address is complete. Staff can force it off. |
| D9 | Markup model | Per carrier: basis points plus an optional flat fee in paise, rounded up once. It does not stack on `Vendor.markupPercent`. |
| D10 | Customer pays shipping | Yes. A shipping line is added to the order at cart time, from a live estimate of the cheapest enabled carrier. |
| D11 | Estimate versus booked freight | The vendor bears the difference. |
| D12 | COD | Phased. Prepaid first. The data model carries a COD flag from day one. COD remittance is its own phase. |
| D13 | RTO freight and weight corrections | The vendor’s wallet, as a `ShipmentAdjustment`. ChatLogix never absorbs them. |
| D14 | Failed deliveries | Full NDR in v1: the bot asks the customer to re-attempt, fix the address, or return the parcel. |
| D15 | Tax | A monthly shipping statement. No per-shipment tax invoice. |
| D16 | Where a failed or returned order goes | Back to `ready`, but only when the parcel is physically back with the shop (`rto_delivered`). |
| D17 | In-transit messages | No template for “in transit”. It sends as text only when the 24-hour window is open. This keeps Meta costs down. |

### Considered and not chosen

| Option | Why it is not v1 |
|---|---|
| Vendor pastes courier name and AWB | Removes none of the counter trip or the per-customer tracking message. |
| Local bike / rider / “send today’s run” | Real for some shops, and a different product. |
| One direct contract with a single carrier | A single carrier cannot show a choice of price and date. Direct contracts can come later. |
| Shiprocket or iThink “partner program” as published | Those programs are referrals. The vendor opens their own account and ChatLogix earns a signup commission. That is the opposite of booking inside the order. |
| A separate shipping wallet | One more balance to build and top up. The AI wallet already has top-up, auto-recharge, low-balance warning, and a ledger. |
| Netting freight against Route settlement | Only works for vendors with online payments. COD-only shops would have nothing to deduct from. |
| Monthly invoice for freight | ChatLogix would front the money and carry the credit risk. |
| Flat or zone shipping table for the customer | More setup for the vendor and less accurate than a live quote. |
| Per-vendor carrier allow-lists | Later, on the vendor detail panel if a shop needs it. Default is the platform list. |

### Still open

| # | Question | Blocks |
|---|---|---|
| O2 | Written platform commercial from the aggregator: one master account, many pickup addresses, API, and a rate card. The public partner form does not grant this. | Live booking |
| O3 | Plan tier. The aggregator plan must include API access and multiple pickup addresses. The cheapest published Shiprocket plan does not. | Live booking |
| O4 | Tax. Is `freight_charge` GST-inclusive? Does your CA accept a monthly shipping statement in place of per-shipment tax invoices, given ChatLogix resells a logistics service at a markup? | Live money (phase 5) |
| O5 | Can a vendor still on the **trial grant** book freight? That credit is promotional and the freight is real cost. Proposed: no. Freight needs at least one paid top-up. | Phase 5 |
| O6 | How templates are provisioned. Each vendor has their own WABA (`WhatsAppNumber.wabaId`), and templates are approved per WABA. `payment_link_utility` has no creation code in the repo, so it was probably made by hand. | Phase 6 |
| O7 | API facts to confirm on a test account. See the spike list in the [plan](./02-implementation-plan.md#phase-0--commercial-and-spikes). | Per phase |

## What already exists

Shipping is drawn in the product and unimplemented on the server.

| Piece | Today |
|---|---|
| `backend/src/routes/shipping.ts` | Four routes return `501`: create shipment, rates, label, track. |
| `backend/src/services/shippingService.ts` | Throws `Not implemented`. The intended notification call is commented above `createShipment`. |
| `frontend_v2/apps/web-vendor/src/services/shipping.ts` | Calls those routes and turns `501` into “not yet available”. |
| `ShippingModal` | Partner radios (Shiprocket, Delhivery, self) and a weight field. Submit cannot succeed. State is local and disappears on reload. |
| Order list | `create_shipment` and `track` sit in `NOT_YET_AVAILABLE_ACTIONS` and alert. |
| `Order` | Free-text `deliveryAddress`, `deliveryInstructions`, `estimatedDelivery`. No pincode, city, state, shipping line, tracking number, AWB, label, or courier. |
| `Order.totalAmount` | The live path writes it in `conversation/cart/engine.ts` (create and update) as the sum of line totals. The shipping line joins that sum there. `services/aiService.ts` also writes it (legacy path). Phase 3 confirms whether that path is still reachable and, if so, leaves shipping vendors out of it. |
| `Vendor.aiPickupDeliveryAddress` | One sentence. No pincode, city, or phone split out. |
| `Product` | No weight or dimensions. |
| Prisma | No `Shipment` model. No pincode column anywhere in the schema. |
| `OrderStatus` | `pending`, `awaiting_payment`, `confirmed`, `preparing`, `ready`, `out_for_delivery`, `delivered`, `cancelled`. |
| `orderService.validStatusTransitions` | `ready → out_for_delivery`, `out_for_delivery → delivered` only. **There is no way back from `out_for_delivery`.** See [Order status](#order-status-and-the-failed-path). |
| `whatsappTemplateService.sendShippingUpdate()` | Queues a **plain text** message (`type: 'text'`). It records a template name in `NotificationHistory` but never sends a template. Outside the 24-hour window Meta rejects it. It also accepts only `created`, `in_transit`, `delivered`. |
| `whatsappTemplateService.sendPaymentLink` | Already switches between text and the `payment_link_utility` template by window. The same switch is the model for shipping. |
| `computeMissing` | `backend/src/conversation/cart/snapshot.ts`. Returns `name`, `address`, `items`. No pincode. |
| `orderPaymentPipeline.ts` | A deterministic pre-LLM handler for order-payment messages. It is the pattern for NDR button replies. |
| Order-status bot | Answers “where is my order?” from status. It has no tracking number to quote. See `docs/CONVERSATION_PROCESSOR_LAMBDA.md` §16: the bot must not invent a delivery date. |
| `pricingService.ChargeSource` | Eight AI and catalog sources. No shipping source and no credit entry point. |
| web-admin | No shipping page. `/billing` is the pattern for staff-edited platform config. Staff access is `AUTH_ADMIN_PHONES`, not the `Admin` table. |

The Ship modal is replaced by the rate list. The four `501` routes become the vendor calls in [Vendor API](#vendor-api). They are not left as stubs beside a new design.

## Data

Money is paise on shipping rows and on `Order`, the same unit as `Order.totalAmount`. The wallet is milli. The only bridge is `paiseToMilli` (×10, exact, no rounding).

### Changes to existing models

| Model | Fields |
|---|---|
| `Vendor` | `shippingEnabled Boolean @default(false)`. `shippingDefaultWeightGrams Int @default(500)`. |
| `Order` | `deliveryPincode String?`, `deliveryCity String?`, `deliveryState String?`. `shippingChargePaise Int @default(0)`. `shippingQuote Json?` (carrier code and name, price, delivery date, quoted-at). |

`Order.totalAmount` stays the grand total: items plus `shippingChargePaise`. The items subtotal is `totalAmount - shippingChargePaise`.

### New models

**`ShippingConnection`** — one row. Provider `shiprocket`. `platformEnabled`, `codEnabled` (phase 9), status, last success at, last error, `ndrReplyHours` (default 24), `lowBalanceAlertPaise`, `bookingPauseBelowPaise`. No secret columns.

**`ShippingCarrier`**

| Field | Notes |
|---|---|
| `provider`, `code` | Aggregator and its courier id. Unique together. |
| `displayName` | Vendor-facing name |
| `enabled` | Default false on sync |
| `markupBps` | Basis points on freight. 0 is allowed. |
| `markupFlatPaise` | Added once per parcel. 0 is allowed. |
| `sortOrder` | |
| `updatedAt`, `updatedBy` | Staff user id, same idea as `PlatformSettings.updatedBy` |

**`VendorPickupAddress`** — one current pickup per vendor. Line, city, state, 6-digit pincode, contact name, phone. Plus `aggregatorPickupName`, `aggregatorSyncStatus` (`pending`, `synced`, `failed`), `lastSyncError`. The aggregator needs each pickup registered before it can be used. Editing the address re-registers it and does not rewrite shipments already booked.

**`Shipment`** — one active shipment per order. A cancelled or returned shipment can be followed by a new one. History stays.

| Field | Notes |
|---|---|
| `orderId`, `vendorId` | Scoped on every vendor query |
| `provider`, `carrierId` | `ShippingCarrier` at booking time |
| `carrierName` | Copy of the display name |
| `channelOrderId` | The id sent to the aggregator as its order id. Unique. This is how a half-finished booking is found again. |
| `idempotencyKey` | Unique. Derived from the order and the attempt number. |
| `aggregatorShipmentId`, `awb`, `trackingUrl` | Filled as booking progresses |
| `labelKey` | S3 key of our copy of the label PDF (see [Security](#security-and-privacy)) |
| `status` | See [Shipment states](#shipment-states) |
| `bookingStep` | `intent`, `order_created`, `awb_assigned`, `pickup_requested`, `label_ready` |
| `carrierPricePaise`, `markupPaise`, `chargePaise` | The quote the vendor accepted. `chargePaise` is what was debited. |
| `walletDebitMilli` | `paiseToMilli(chargePaise)` |
| `isCod`, `codAmountPaise` | `false` and `0` until phase 9 |
| `estimatedDelivery` | From the quote, not from the bot |
| `weightGrams`, `lengthCm`, `breadthCm`, `heightCm` | Weight booked. Dimensions optional. |
| `pickupPincode`, `deliveryPincode` | What was quoted |
| `failureReason` | Last reason from the carrier or from our own checks |
| `bookedAt`, `pickedUpAt`, `deliveredAt`, `cancelledAt` | |
| `rawQuote` | Json of the chosen aggregator row, for support only |

One active shipment per order is a partial unique index written in the migration SQL (Prisma cannot declare it): unique on `orderId` where `status` is not `cancelled`, `rto_delivered`, or `delivered`.

**`ShipmentEvent`** — the immutable log of carrier events. `providerEventKey` (unique), `shipmentId` (nullable until the AWB is matched), `status`, `occurredAt`, `receivedAt`, `payload` Json, `appliedAt`.

**`ShipmentAdjustment`** — money after booking. `shipmentId`, `kind` (`rto_freight`, `weight_correction`, `cod_fee`), `amountPaise`, `idempotencyKey` (unique), `providerRef`, and the wallet transaction it created.

**`ShipmentNdr`** — one row per failed attempt. See [Failed deliveries](#failed-deliveries-ndr).

**`VendorShippingTemplate`** — `vendorId`, `name`, `status` (`pending`, `approved`, `rejected`), `metaTemplateId`, `lastError`. See [Customer messages](#customer-messages).

**`ShippingStatement`** — `vendorId`, `month`, totals in paise (freight, markup, adjustments, GST as the aggregator states it), and a PDF key. Generated alongside the payments phase 10 monthly statement.

## Addresses and weight

A rate and a pickup need a pincode, a contact phone, a city, a state, and a weight. The sentences stored today are not enough.

**Shop pickup, saved once** in Settings: address line, city, state, 6-digit pincode, contact name, phone. Saving it registers the pickup at the aggregator. Shipping cannot be turned on until it is `synced`.

**Customer address the carrier will accept.** The bot keeps asking until the order has a full address and a 6-digit pincode, then checks the pincode with the aggregator. Confirm requires name, address, items, **and a serviceable pincode** for a vendor with `shippingEnabled`. `computeMissing` takes the vendor’s flag and returns `pincode` when needed. The cart snapshot type and the LLM-1 prompt both learn about the new missing item.

**Package weight.** A shop default (for example 500 g) plus an edit on the ship step. Price and delivery date depend on it. The default is also what the cart-time estimate uses, so a 20-item order and a 1-item order get the same shipping line in v1. The vendor corrects it at booking and bears the difference. Per-product weight comes later. Dimensions are optional and match the aggregator’s optional length, breadth, and height.

## Rates and markup

The vendor’s list is the aggregator’s live quote, filtered and marked up. There is no second price list in ChatLogix.

Shiprocket’s serviceability API (`POST /v1/external/courier/serviceability/`) takes pickup pincode, delivery pincode, COD or prepaid, and weight in kilograms. Each row includes `courier_company_id`, `courier_name`, `freight_charge`, `estimated_delivery_days`, and `etd`. `is_custom_rate` means the figure is the account’s contracted card. The booked row stores the `freight_charge` the API returned. Published rate-card figures are marketing, not what ChatLogix is billed.

Volume through one account is what improves the card. When the aggregator agrees a tighter card, the same API returns it. No vendor UI change.

**Markup, per carrier:**

```
markupPaise = ceil(carrierPricePaise × markupBps / 10000) + markupFlatPaise
chargePaise = carrierPricePaise + markupPaise
```

One ceil, same idea as `pricingService`. It is not `Vendor.markupPercent` and is not stacked on it.

**Caching.** A quote is cached in Redis for 10 minutes by pickup pincode, delivery pincode, weight bucket, and prepaid/COD. Cart-time estimates read the cache so a chatty customer does not hammer the aggregator. A booking never reads the cache (see [Booking](#booking)).

### Commercial to ask for

Ask the aggregator, in writing, for a platform account:

- ChatLogix is the customer. Shops are pickup locations, not child accounts the vendor must KYC.
- API access and multiple pickup addresses are on the plan.
- Rate card is the account’s `freight_charge`, with a named path to a custom card once volume is real.
- Webhooks for pickup, in transit, delivered, failed (NDR), and RTO.
- NDR actions and COD remittance through the API.
- A wallet-balance API, so ChatLogix can watch the account balance.
- Billing is ChatLogix’s. Vendors do not recharge an aggregator wallet.

Do not onboard vendors through the referral or channel partner program.

## Wallet charges

Freight comes out of the same wallet as AI replies. `pricingService` stays the only writer of `Vendor.walletBalanceMilli` for debits. The existing `chargeVendor` computes `cost + markup` from AI, WhatsApp, and platform-fee components and applies `Vendor.markupPercent`. Freight already carries its own markup, so it does not go through that formula.

Add to `pricingService.ts`:

| Entry point | Purpose | Idempotency key |
|---|---|---|
| Fixed-amount debit, source `shipment_freight` | Debit `walletDebitMilli` at booking | `shipment:{id}:freight` |
| Fixed-amount debit, source `shipment_adjustment` | RTO freight or weight correction | `shipment:{id}:adj:{adjustmentId}` |
| Credit, source `shipment_refund` | Give the freight back when a booking fails or is cancelled before pickup | `shipment:{id}:refund` |

Names are decided in phase 5. The strings are a persisted contract, like the existing `ChargeSource` values, and new `WalletTransactionType` values are needed for the ledger rows. This is the only credit path outside `creditWalletFromTopUp`. It is allowed only for these three keys.

Rules:

1. **Check, then debit, under the vendor lock.** Booking takes the vendor row lock, checks `walletBalanceMilli >= walletDebitMilli`, creates the `Shipment` in `booking`, and debits in one transaction. If the balance is short the call fails with `INSUFFICIENT_WALLET` and a top-up link. It never clamps to zero.
2. **Debit first, refund on failure.** The aggregator is called after the debit commits. A booking that definitively fails is credited back. This means ChatLogix never pays the aggregator for freight the vendor has not funded.
3. **Cancel before pickup credits the full `chargePaise`.** After pickup there is no credit.
4. **Adjustments may take the balance negative,** because the freight is already spent. While the balance is below the next quote, new bookings are blocked with the same top-up prompt. AI replies behave as they do today for a negative live wallet.
5. **The line the customer paid is not part of the wallet movement.** It is order revenue and flows through Route.
6. **Trial grant (O5).** Proposed: a vendor still on the trial grant cannot book freight.
7. **Adjustments use the carrier’s markup bps** on the aggregator’s extra charge, but do not repeat the flat fee.

## Booking

Booking is not one call. At the aggregator it is: create the order, assign the courier and AWB, request the pickup, generate the label. Each can fail on its own. A booking is a small state machine that can be resumed.

```
POST …/shipment { carrierId, weightGrams?, acceptedChargePaise }
 1. Lock vendor. Re-quote with the live aggregator (no cache).
    If the marked-up price now differs from acceptedChargePaise → 409 PRICE_CHANGED with the new price. Nothing is written.
 2. Tx: check balance, create Shipment(status=booking, bookingStep=intent), debit wallet.
 3. Call: create order       → save aggregatorShipmentId        (bookingStep=order_created)
 4. Call: assign courier/AWB → save awb, trackingUrl            (bookingStep=awb_assigned)
 5. Call: request pickup     →                                  (bookingStep=pickup_requested)
 6. Call: generate label     → copy PDF to S3, save labelKey    (bookingStep=label_ready)
 7. Tx: status=booked, bookedAt. Return label URL and AWB.
```

- Every aggregator call runs with **no database transaction open**. Each step saves its result in its own short transaction.
- `channelOrderId` is sent as the aggregator’s order id. Before step 3, and on every retry, the service looks the order up by that id so a repeat never creates a second one.
- **Definitive failure** (unserviceable, validation, courier refused): `status=cancelled`, `failureReason` set, wallet credited back, any half-created aggregator order cancelled.
- **Ambiguous failure** (timeout, 5xx): the shipment stays in `booking` at its last `bookingStep`. A sweep every 2 minutes resumes from there. After 15 minutes unresolved, the sweep looks the order up at the aggregator. If it exists it resumes. If not it fails the booking and credits back.
- The server never trusts a price from the client. `acceptedChargePaise` is only compared to the live quote.
- The request returns when the label is ready, or after 15 seconds with `202` and status `booking`. The UI polls `GET …/shipment`.
- A double click is harmless: `idempotencyKey` and the unique active-shipment index turn the second call into the first call’s result.

### Shipment states

`booking` → `booked` → `pickup_scheduled` → `picked_up` → `in_transit` → `out_for_delivery` → `delivered`

Side exits: `failed_attempt` (a delivery attempt failed, NDR open), `rto` (parcel is being returned), `rto_delivered` (back with the shop), `cancelled`.

Webhooks can arrive out of order. Every state has a rank. A lower rank never overwrites a higher one, except through `failed_attempt` back to `out_for_delivery` on a re-attempt. `delivered`, `rto_delivered`, and `cancelled` are terminal.

### Order status and the failed path

`Order.status` stays the vendor pipeline. Mapping:

| Shipment status | Order status |
|---|---|
| `booking`, `booked`, `pickup_scheduled` | Stays `ready`. The order shows “label ready”. |
| `picked_up`, `in_transit`, `out_for_delivery` | `out_for_delivery` |
| `failed_attempt`, `rto` | Stays `out_for_delivery`. The shipment status and reason show on the order. The bot tells the customer the delivery failed and never says it is on the way. |
| `rto_delivered` | `ready`. The vendor can book again or cancel. |
| `delivered` | `delivered`, `deliveredAt` set |
| `cancelled` before pickup | `ready`. The vendor can book again. |

`orderService.validStatusTransitions` has no exit from `out_for_delivery` except `delivered`. This needs one new transition, **`out_for_delivery → ready`, allowed only to the shipping service** on `rto_delivered`, and it writes an `OrderAuditLog` row. Vendors and the bot cannot use it. `delivered` and `cancelled` stay terminal. Do not add a transition out of them.

An order cannot be cancelled while a shipment is between `booked` and `rto_delivered`. Cancelling an order with a shipment that is still cancellable (before pickup) cancels the shipment first, credits the wallet, then cancels the order. If the carrier refuses the cancel, the order cancel fails with “parcel already picked up”.

### Refunds

A refund of a managed-payment order refunds what the customer paid, which includes the shipping line. Freight already spent is not recovered. A prepaid order that comes back as `rto_delivered` is not refunded automatically. The vendor decides to re-ship or cancel, and the existing refund flow runs from there.

## Customer messages

Carrier webhooks drive customer updates. `sendShippingUpdate()` is extended, not replaced.

| Carrier event | Customer WhatsApp | Template |
|---|---|---|
| Picked up | Courier, AWB, tracking link | `shipment_shipped` |
| In transit | Text only if the window is open | none (D17) |
| Out for delivery | Arriving today | `shipment_out_for_delivery` |
| Delivered | Delivered | `shipment_delivered` |
| Delivery attempt failed | What do you want to do? Buttons | `shipment_delivery_failed` (quick-reply buttons) |
| Return started | The parcel is going back | `shipment_returning` |

How the helper decides:

- If the customer’s last message was under 24 hours ago it sends text. Otherwise it sends the template. This is the switch `sendPaymentLink` already uses.
- If the template is not approved on that vendor’s WABA, the send is **skipped and logged**, with an alert for staff. It is never sent as text that Meta will reject. The status union is widened to cover the new events.
- Each vendor’s WABA has its own template approvals. Turning shipping on submits the five templates to the vendor’s WABA and records them in `VendorShippingTemplate`. Settings shows the approval state. Shipping can be switched on before approval, but the page warns that customers will not get updates outside the window (O6).
- Meta conversation fees are not billed to vendors yet. These sends join that gap and should be counted when P2h lands.

“Where is my order?” reads the shipment. `renderOrderStatusReply`, the hot-set order history in `prefetch.ts`, and the order block in `prompts.ts` include courier name, AWB, tracking link, and the latest shipment status. The bot repeats `estimatedDelivery` from the booked quote and never invents a date.

## Failed deliveries (NDR)

When the carrier reports a failed attempt, the delivery is not over. The aggregator holds the parcel for an action: re-attempt, change phone or address, or return. If nobody answers in time the carrier returns it, at the vendor’s cost.

```
webhook: failed attempt
  → Shipment=failed_attempt, create ShipmentNdr(attemptNo, reason, deadlineAt = now + ndrReplyHours)
  → template shipment_delivery_failed to the customer, buttons: Deliver again / Change address / Return it
  → vendor sees the reason and the deadline on the order

customer taps a button (payload ndr:{ndrId}:{choice})
  → handled before the LLM, like orderPaymentPipeline.ts
  Deliver again   → NDR action re-attempt   → customer told
  Return it       → NDR action return       → Shipment=rto
  Change address  → status awaiting_address; the next text from that customer in that conversation
                    is taken as the address. It must keep the same pincode. Then re-attempt with the new address.
                    A different pincode is refused: "I can only change the street details. Deliver again or return it?"

no reply by deadlineAt (sweep every 15 minutes)
  → attempt 1: re-attempt once, tell the customer
  → attempt 2 or later: return it
```

- The vendor can override the choice until the aggregator action is sent. The vendor’s choice is recorded on the same `ShipmentNdr` row.
- A button tapped after the deadline, or twice, is a no-op with a polite reply.
- The reply is matched on the payload, so a customer chatting normally about something else is not hijacked. Only `awaiting_address` consumes the next free-text message, and only until the deadline.
- RTO freight comes back as a `ShipmentAdjustment` (see [Reconciliation](#reconciliation-and-operations)).
- The NDR action endpoint and its fields are confirmed in the phase 0 spike.

## Admin: carrier configuration

Staff manage carriers on a new **Shipping** page in web-admin, route `/shipping`, beside Billing. Same `admin` role. Carriers are not columns on the `PlatformSettings` singleton. That row is billing numbers. Carriers are a list.

### What staff control

**Connection.** One aggregator (Shiprocket). The page shows whether the last login worked, when the token was refreshed, the aggregator account balance, and a Test connection button. Email, password, and webhook token stay in env. The page can display the webhook URL so it can be pasted into the aggregator once. The login token is cached in Redis, not in the database.

**Carriers.**

| Column | Purpose |
|---|---|
| Name | What the vendor sees |
| Code | Aggregator courier id, filled by sync, not typed |
| Enabled | Off means it never appears on an order |
| Markup bps | Added to `freight_charge` as a percentage in basis points |
| Flat fee | Added once per parcel, in rupees on the page and paise in storage |
| Sort | Order of the vendor list |

**Sync.** Refresh carriers pulls the aggregator’s courier list and inserts any new code as **disabled**. A code the aggregator drops is hidden from new quotes. Old shipments keep the name stored on the row.

**Switches.** *Shipping* on or off hides Ship on every vendor order and stops cart-time estimates. *COD* (phase 9) on or off. *Booking pause* is automatic when the aggregator balance falls under `bookingPauseBelowPaise`: estimates keep working and the Ship button shows “temporarily unavailable”.

**Vendor detail panel.** Shows `shippingEnabled`, the pickup sync status, template approval state, and a force-off. Staff cannot turn it on for a vendor with an incomplete pickup.

**Stuck bookings.** A list of shipments in `booking` for over 15 minutes, with Retry and Cancel (which credits the vendor). Support can also see `rawQuote`, `carrierPricePaise`, and `markupPaise`. Vendors never can.

### Admin API

All of these require `requireRole('admin')`.

| Method / path | Purpose |
|---|---|
| `GET /api/admin/shipping` | Connection status, balance, switches, carriers |
| `POST /api/admin/shipping/test` | Login and return success or the aggregator error |
| `POST /api/admin/shipping/carriers/sync` | Pull codes. Insert new ones disabled |
| `PATCH /api/admin/shipping/carriers/:id` | Enable, markup bps, flat fee, display name, sort |
| `PATCH /api/admin/shipping` | Platform on or off, COD on or off, NDR hours, balance thresholds |
| `GET /api/admin/shipping/stuck` | Shipments stuck in `booking` |
| `POST /api/admin/shipping/shipments/:id/retry` | Resume a stuck booking |
| `POST /api/admin/shipping/shipments/:id/cancel` | Fail a stuck booking and credit the vendor |
| `PATCH /api/admin/vendors/:vendorId/shipping` | Force a vendor off |

## Vendor API

Replace the `501`s. Every query is scoped by `vendorId`.

| Method / path | Purpose |
|---|---|
| `GET /api/vendors/me/shipping` | Flag, pickup address and sync state, default weight, template approvals |
| `PUT /api/vendors/me/shipping` | Save the pickup address and default weight. Turn shipping on or off. |
| `GET /api/orders/:orderId/shipping-rates` | Validate address, then return enabled carriers with marked-up price, date, and the wallet balance. `?weightGrams=` overrides the default. |
| `POST /api/orders/:orderId/shipment` | Book the chosen carrier (see [Booking](#booking)). Returns label URL and AWB, or `202`. |
| `GET /api/orders/:orderId/shipment` | Current shipment, so the page survives reload. |
| `GET /api/shipments/:shipmentId/label` | Short-lived signed URL for our copy of the label. Vendor-scoped. |
| `GET /api/shipments/labels?date=` | One PDF of every label booked that day |
| `POST /api/shipments/:shipmentId/cancel` | Cancel before pickup. Credits the wallet. After pickup it is refused with the reason. |
| `POST /api/shipments/:shipmentId/ndr` | Vendor override of the customer’s NDR choice: `reattempt` or `return` |
| `POST /api/shipping/webhook` | Aggregator events. Token checked. Idempotent. No JWT. |

Error codes: `SHIPPING_OFF`, `NOT_SERVICEABLE`, `ADDRESS_INCOMPLETE`, `PICKUP_NOT_READY`, `INSUFFICIENT_WALLET`, `PRICE_CHANGED`, `ORDER_NOT_READY`, `ACTIVE_SHIPMENT_EXISTS`, `NOT_CANCELLABLE`, `BOOKING_PAUSED`.

`GET /api/shipments/:trackingNumber/track` is not how status moves. Webhooks move status. The poll in [Reconciliation](#reconciliation-and-operations) is the fallback.

Allowed to book when the order is `ready`, shipping is on, the pickup is `synced`, the customer pincode is validated, the order is paid (or, once phase 9 ships, COD), and no active shipment exists. `confirmed` and `preparing` do not show Ship. The vendor packs first. A COD order does not show Ship until phase 9.

### Webhook handling

- The aggregator’s webhook auth is a token header, checked in constant time. Whether Shiprocket signs the body is confirmed in the spike. Do not assume an HMAC.
- Events carry no reliable id. `providerEventKey` is built from AWB, status code, and event time. A replay with the same key changes nothing.
- Each event is written to `ShipmentEvent` first. Applying it locks the shipment row, checks the rank rule, updates the shipment and order, and sets `appliedAt`, in one transaction. The WhatsApp send happens after commit.
- An event for an AWB we do not know yet is kept with `shipmentId` null. It is re-applied when the AWB is saved and by the sweep for up to 10 minutes.
- The route ACKs quickly. Anything slow is queued, never done inline.

## Reconciliation and operations

| Job | Cadence | What it does |
|---|---|---|
| Booking sweep | 2 min | Resumes shipments stuck in `booking` |
| NDR deadline sweep | 15 min | Applies the default action to expired NDRs |
| Tracking poll | 6 h | For active shipments with no event for 6 hours, asks the aggregator for status and applies it like a webhook |
| Billing reconciliation | Daily | For delivered and RTO shipments from the last 7 days, compares what the aggregator billed with `carrierPricePaise`. Creates `ShipmentAdjustment` rows for the difference (weight correction, RTO freight) and debits the wallet |
| Aggregator balance | 15 min | Reads the account balance. Alerts under `lowBalanceAlertPaise`. Pauses bookings under `bookingPauseBelowPaise` |
| Monthly statement | Monthly | Builds `ShippingStatement` per vendor with the payments statements |

These run in Express, like the payment reconciliation sweeps. Logging uses Pino with `shipmentId`, `orderId`, `vendorId`, and `awb`. Metrics go to CloudWatch (`ChatLogix/Shipping`): bookings by outcome, booking duration, sweep resumes, stuck count, webhook lag, NDR outcomes, adjustments total, and aggregator balance.

ChatLogix funds the aggregator account. Topping it up is a finance task today. The balance alert is how that stays ahead of volume.

## Security and privacy

- **Aggregator secrets** are env only and never logged. The token is cached in Redis.
- **Label PDFs** from the aggregator expire. After the label step we copy the PDF to S3 under `vendor/{vendorId}/shipments/{shipmentId}/label.pdf` and serve a short-lived signed URL, the same layout as [PRODUCT_MEDIA.md](../PRODUCT_MEDIA.md).
- **Vendor API responses** never include `carrierPricePaise`, `markupPaise`, `rawQuote`, aggregator ids, or the token. They show `chargePaise` and adjustments.
- **Customer data** (name, phone, address) is sent to the aggregator and the courier. The privacy policy and the vendor terms must say so. DPDP Act consent is covered by the order, but the policy has to name the aggregator as a processor.
- **Webhook route** is mounted without JWT and rate-limited, like the Razorpay webhook.
- **Prohibited goods.** Couriers refuse some goods (food that spoils, liquids, batteries). The vendor accepts the aggregator’s terms of carriage in Settings when turning shipping on.

## Out of scope for v1

- Vendor-owned aggregator accounts and vendor KYC at the courier
- International shipments
- Hyperlocal-only couriers (`only_local` on the serviceability API)
- Customer-initiated returns and quality-check pickups (`is_return`, `qc_check`)
- Vendor disputes of weight corrections (support handles them by hand)
- Branded tracking pages
- Per-product weights, and an automatic weight from the cart
- Splitting one order across several parcels
- A second aggregator (the client is an interface so it can be added)
- A rider, a delivery run, or self-delivery as the primary path
- Free-shipping thresholds and vendor-set shipping fees
- A per-shipment tax invoice
