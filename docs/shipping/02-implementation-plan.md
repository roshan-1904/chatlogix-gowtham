# Implementation plan — vendor shipments

**Status:** Plan, written 2026-10-21. Nothing built.  
**Spec:** [README.md](./README.md). This file says what to build, in what order, and what has to be true before each phase ships. It does not repeat the spec.  
**Wallet authority:** [BILLING_AND_PRICING.md](../BILLING_AND_PRICING.md). **Payments:** [payments/README.md](../payments/README.md).

Build in the phase order below. Each phase is shippable on the **fake aggregator** or the aggregator’s test account before the next one starts. Live money (phase 5 onward) waits for the gates in phase 0. Effort is one engineer, rough, in working days, and includes tests.

## Progress

| Phase | What | Effort | Status | Waits on |
|---|---|---|---|---|
| 0 | Commercial, spikes, and written confirmations | 3 | Not started | — |
| 1 | Foundations: schema, aggregator client + fake, pickup address, vendor flag | 4 | Not started | — |
| 2 | Admin Shipping page | 3 | Not started | 1 |
| 3 | Chat: pincode, serviceability, shipping line in the total | 5 | Not started | 1, 2 |
| 4 | Vendor Ship step: rate list (no booking) | 3 | Not started | 1, 2 |
| 5 | Wallet charge, booking, label, cancel | 7 | Not started | 4. **Live** needs O2, O3, O4, O5 |
| 6 | Webhooks, order status, customer messages, bot status reply | 6 | Not started | 5. **Live** needs O6 |
| 7 | Failed deliveries (NDR) over WhatsApp | 6 | Not started | 6 |
| 8 | Reconciliation, adjustments, aggregator balance, monthly statement | 5 | Not started | 6. Adjustments need the spike results |
| 9 | COD | 5 | Not started | 8 |

About 47 working days end to end. Phases 1–4 touch no money and can ship to a pilot of vendors on the fake aggregator or a test account. Phases 5–9 move money and need the live gates.

```
0 (runs alongside 1–4, must finish before live 5)
1 ─┬─ 2 ──┬─ 3
   │      └─ 4 ─ 5 ─ 6 ─┬─ 7
   │                    └─ 8 ─ 9
```

When a phase ships, update this table. Add the live shipping charge sources to [BILLING_AND_PRICING.md](../BILLING_AND_PRICING.md) §4 and §5 (phase 5), the new cart flow to [INCOMING_RESPONSE_GENERATOR_FLOW.md](../INCOMING_RESPONSE_GENERATOR_FLOW.md) (phase 3), and the NDR pre-LLM handler to the same file (phase 7).

## Rules that bind every phase

1. `pricingService` is the only writer of `Vendor.walletBalanceMilli` for debits. Shipping adds fixed-amount entry points there. No other file writes the column. The refund credit is the only credit path outside `creditWalletFromTopUp`, and only for the shipment keys.
2. Order and shipment amounts are **paise**. The wallet is **milli**. Cross only with `paiseToMilli` from `utils/money.ts`. Never pass a paise integer into a `*Milli` column.
3. **No aggregator HTTP call inside a database transaction.** Record intent, make the call, record the result in a second transaction.
4. Every wallet movement has a unique idempotency key. A replay changes nothing.
5. Every vendor query is scoped by `vendorId`. Admin routes use `requireRole('admin')`.
6. Aggregator email, password, and token never reach a log line, a response, or the database. The token lives in Redis.
7. Vendor API responses never contain `carrierPricePaise`, `markupPaise`, `rawQuote`, or aggregator ids.
8. Order status changes made by shipping go through `orderService` and write an `OrderAuditLog` row.
9. Markup is rounded up once: `ceil(price × bps / 10000) + flat`.
10. A webhook event is written to `ShipmentEvent` before it is applied. Status only moves up in rank.
11. Money tables never cascade-delete. `Shipment` and `ShipmentAdjustment` relations use `onDelete: Restrict`.
12. All amounts that cross to the frontend as `BigInt` go as decimal strings. Routes that return a whole row must `select` fields.
13. The aggregator client is an interface (`ShippingProvider`). Shiprocket is one implementation. A fake implementation is selected by `SHIPPING_USE_FAKE_AGGREGATOR=true`, the same idea as `RAZORPAY_USE_FAKE_ROUTE`.

## Phase 0 — Commercial and spikes

No product code. This runs alongside phases 1–4 but gates live money.

**Commercial (O2, O3).**

- [ ] Written platform agreement from the aggregator: one master account, many pickup addresses, API, rate card, webhooks, NDR actions, COD remittance, wallet-balance API.
- [ ] Plan tier confirmed to include API access and multiple pickup addresses.
- [ ] A test or sandbox account with API credentials.

**Tax and finance (O4).**

- [ ] CA confirms: is `freight_charge` GST-inclusive; is a monthly shipping statement acceptable for a logistics resale at a markup; how GST on the aggregator’s invoice to ChatLogix is claimed.
- [ ] Decide who tops up the aggregator account and the alert thresholds.

**Product (O5).**

- [ ] Decide whether trial-grant vendors may book. Proposed: no.

**API spikes** — answer each in one line in the spec (O7) before the phase that needs it:

| Question | Needed by |
|---|---|
| Serviceability response fields; prepaid versus COD price; how COD charge appears | 3, 9 |
| Pincode lookup endpoint for city and state | 3 |
| Pickup-location API: required fields, uniqueness, verification (OTP?), per-account limits, edit and delete | 1 |
| Create-order, assign-AWB, request-pickup, generate-label: sequence, partial failure behaviour, order lookup by our `channelOrderId` | 5 |
| Order and shipment cancel rules before and after pickup | 5 |
| Label PDF URL lifetime; multi-shipment label PDF | 5 |
| Webhook auth (token header or signature), payload shape, status codes, whether events carry an id | 6 |
| NDR: webhook shape, action endpoint, fields for re-attempt and address update, time limit before auto-RTO | 7 |
| How RTO freight and weight discrepancies are billed and where an API exposes them | 8 |
| Wallet-balance API | 8 |
| COD remittance cycle and API | 9 |

**Meta (O6).**

- [ ] Find out how `payment_link_utility` was created and whether the Graph API template-management call works with the stored WABA tokens.
- [ ] Draft the five template texts (`shipment_shipped`, `shipment_out_for_delivery`, `shipment_delivered`, `shipment_delivery_failed` with three quick-reply buttons, `shipment_returning`). Check the wording against Meta’s utility rules.

**Gate:** Live bookings need O2, O3, O4, and O5 closed. Live customer messages outside the window need O6.

## Phase 1 — Foundations

**Goal:** the tables, the aggregator interface with a working fake, and the vendor’s pickup address. Nothing is visible to customers.

**Schema** — one migration, hand-checked, with the partial unique index in SQL:

- `Vendor.shippingEnabled`, `Vendor.shippingDefaultWeightGrams`
- `Order.deliveryPincode`, `deliveryCity`, `deliveryState`, `shippingChargePaise`, `shippingQuote`
- `ShippingConnection`, `ShippingCarrier`, `VendorPickupAddress`
- `Shipment`, `ShipmentEvent`, `ShipmentAdjustment`, `ShipmentNdr`, `VendorShippingTemplate`, `ShippingStatement`

Create all tables now, even the ones later phases fill, so no later phase needs a second migration review of the same area. Add a `.sql` check that `Shipment` has the partial unique index.

**Code:**

- `ShippingProvider` interface: `login`, `listCouriers`, `serviceability`, `lookupPincode`, `registerPickup`, `createOrder`, `assignCourier`, `requestPickup`, `generateLabel`, `cancel`, `track`, `ndrAction`, `walletBalance`.
- `ShiprocketProvider` for the calls the spikes have answered. The rest throw `NotImplemented` until their phase.
- `FakeProvider`: deterministic, in-memory, selectable failures (unserviceable pincode, timeout, 5xx, price drift, duplicate order). Every later phase's tests run on this.
- Token cache in Redis with login-on-401.
- Pickup address service: save, validate (6-digit pincode, 10-digit phone), register at the aggregator, record `aggregatorSyncStatus`.
- Vendor API: `GET`/`PUT /api/vendors/me/shipping`. Turning shipping on requires a `synced` pickup and the accepted terms.
- Vendor Settings page: pickup address form, default weight, shipping toggle, aggregator terms checkbox.

**Tests:** provider contract tests run against `FakeProvider` and, when credentials exist, against the test account; pickup validation; the flag refuses to turn on without a synced pickup; migration applies cleanly on a copy of the shared DB.

**Done when:** a vendor can save a pickup address and turn shipping on in the fake environment, and no existing flow changed.

## Phase 2 — Admin Shipping page

**Goal:** staff control which carriers exist and what they cost. No vendor effect yet beyond the platform switch.

- Admin API from the spec (`GET`, `test`, `sync`, `PATCH carriers/:id`, `PATCH`), vendor force-off.
- `ShippingConnection` is seeded on first read.
- web-admin `/shipping` page modelled on `/billing`: connection status, Test connection, balance (placeholder until phase 8), carrier table (enable, markup bps, flat fee in rupees, sort), switches.
- Sync inserts new couriers disabled and hides dropped ones.
- Vendor detail panel shows the shipping flag, pickup sync state, and force-off.
- Money fields in the page are rupees and convert at the edge, like `/billing`.

**Tests:** sync is idempotent and never enables a new code; markup edits validate (bps 0–10000, flat ≥ 0); non-admin gets 403; the platform switch turns off the vendor settings toggle with a clear message.

**Done when:** staff can sync, enable two carriers, set a markup, and see the platform switch hide shipping for vendors, all on the fake provider.

## Phase 3 — Chat: pincode and the shipping line

**Goal:** the customer is asked for a pincode, told at once if it is unserviceable, and sees a shipping line in the total. This is the first phase customers feel, and it touches the payment total.

**Code:**

- Extract the pincode from the address with a regex in the cart engine (`[1-9][0-9]{5}`), not from the model. Look up city and state through the provider.
- `computeMissing` takes the vendor’s `shippingEnabled` and returns `pincode` when the address has none. Widen `CartSnapshot.missing` and the LLM-1 prompt in `conversation/llm/prompts.ts`.
- `shippingEstimateService.estimate({ vendorId, deliveryPincode, weightGrams })`: reads the Redis cache, else asks the provider, filters to enabled carriers, applies markup, returns the cheapest. Stale cache (same pincode pair, under 24 hours) is the outage fallback.
- Cart engine (`cart/engine.ts`, the two `totalAmount` writes): `totalAmount = itemsTotal + shippingChargePaise`. Write `shippingChargePaise` and `shippingQuote`. Freeze when the order is confirmed or a payment link exists. Refresh a quote older than 30 minutes before freezing.
- Unserviceable pincode: the order cannot confirm. The bot says why and asks for another address.
- No estimate available (outage, no stale quote): the bot asks the customer to try again. It never confirms without a line.
- Audit the other `totalAmount` writers. `services/aiService.ts` writes it too (lines near 517 and 679). If that path is still reachable, a `shippingEnabled` vendor must not go through it, or it must add the line. Delete it if it is dead.
- Payment link, `orderPaymentPipeline`, and the platform fee read `Order.totalAmount` unchanged, so the line is in the Razorpay amount automatically. Check every place that compares `previousTotalPaise`.
- Order views in the vendor portal show items subtotal, shipping, and total.
- Update `INCOMING_RESPONSE_GENERATOR_FLOW.md` and `CONVERSATION_PROCESSOR_LAMBDA.md` §16 if the status reply changes.
- COD: until phase 9, a `shippingEnabled` vendor’s bot does not offer COD. Online payment only.

**Tests:** cart engine on the fake provider (add items, give an address without a pincode, give a pincode, change pincode, change items, confirm, edit after a link exists); unserviceable pincode blocks confirm; quote cache hit and stale fallback; paise arithmetic, with no float; a vendor with shipping off sees no change at all. Add a conversation pipeline test for the full path.

**Done when:** on the fake provider, a test conversation reaches a confirmed order with a shipping line in `totalAmount`, and a payment link for the right amount.

## Phase 4 — Vendor Ship step (rate list)

**Goal:** the packed order shows Ship and a real rate list. Booking is not wired.

- `GET /api/orders/:orderId/shipping-rates`: check the order is `ready` and paid, validate the address, ask the provider, filter to enabled, apply markup, return price and date and the wallet balance. Weight override in the query.
- Replace `ShippingModal` and the `NOT_YET_AVAILABLE_ACTIONS` alert. The order list shows Ship only when the order is `ready`, shipping is on, and the pickup is synced. Until phase 5 the Book button is disabled with a tooltip.
- The page shows the customer’s shipping line next to the chosen price, so the vendor sees their margin on the parcel.
- Remove the interim tooltip once this ships. Update `VENDOR_PORTAL_ROADMAP.md` §5.2.
- No-carriers-enabled and shipping-off states have their own messages.

**Tests:** rates for the right statuses only; carriers that are off never appear; the marked-up price equals the formula; the response has no `carrierPricePaise`; a weight override changes the quote; not found and cross-vendor requests give 404.

**Done when:** a vendor on the fake provider sees the rate list on a packed order, with the correct price per carrier.

## Phase 5 — Wallet charge, booking, label, cancel

**Goal:** a vendor books, pays from the wallet, and prints a label. The first phase that moves money.

**Code:**

- `pricingService`: fixed-amount debit (`shipment_freight`, `shipment_adjustment`) and the `shipment_refund` credit, with the idempotency keys in the spec, new `ChargeSource` values, and new `WalletTransactionType` values. Add them to the persisted-contract list in `BILLING_AND_PRICING.md` §4.
- Booking service implementing the state machine: re-quote and `PRICE_CHANGED`; check-and-debit under the vendor lock; aggregator steps with the result saved after each; `channelOrderId` lookup before create; definitive failure credits back; ambiguous failure stays in `booking`.
- Booking sweep (2 min) that resumes from `bookingStep`, and the 15-minute resolution rule.
- `POST …/shipment`, `GET …/shipment`, `GET …/label`, `POST …/cancel`, and the day-labels PDF.
- Label copied to S3, signed URL served.
- Cancel before pickup: provider cancel, then credit. Order cancel with an active shipment: cancel the shipment first.
- Trial rule (O5) enforced.
- Admin: stuck-booking list with Retry and Cancel.
- The vendor UI: Book, `202` polling, label print, day list, wallet top-up prompt on `INSUFFICIENT_WALLET`.
- Order status: `ready` stays `ready` while booked.
- Docs: `BILLING_AND_PRICING.md` §4, §5, §6.

**Tests (the important ones):**

- Concurrency: two bookings for one order, two orders racing for one balance, a booking racing an AI charge. Exactly one wins; the wallet never goes below zero from a booking.
- Idempotency: replay of the whole request, of the sweep, of the cancel.
- Crash points: kill after the debit, after step 3, after step 4, after step 5. Each resumes or refunds, and the balance reconciles.
- Definitive versus ambiguous failure; price drift returns `PRICE_CHANGED` and writes nothing.
- `paiseToMilli` exactness: `walletDebitMilli` equals `chargePaise × 10`.
- No aggregator call inside a transaction (assert by wrapping the provider in a test that checks for an open transaction).
- Cancel after pickup is refused; cancel before pickup credits exactly `chargePaise`.
- Ledger: the sum of `WalletTransaction` rows for a shipment equals debit minus credit.

**Gate for live:** O2, O3, O4, O5 closed. Pilot with a few vendors and a small prefunded aggregator balance.

**Done when:** on the test account, a booking produces an AWB and a printable label, the wallet shows one debit, and cancelling returns it.

## Phase 6 — Webhooks, order status, customer messages

**Goal:** the carrier tells ChatLogix, and ChatLogix tells the customer. The vendor stops touching tracking.

**Code:**

- `POST /api/shipping/webhook` mounted without JWT, token check in constant time, rate limit, fast ACK.
- `ShipmentEvent` write, rank rule, apply under the shipment lock, order status mapping through `orderService`, unknown-AWB hold and re-apply.
- `orderService.validStatusTransitions`: the one new system-only transition `out_for_delivery → ready`, used on `rto_delivered`. It writes an `OrderAuditLog` row and is not reachable from the vendor API.
- `sendShippingUpdate` extended: widened status union, text inside the 24-hour window and template outside it, skip-and-alert when a template is not approved, and no in-transit template (D17).
- Template provisioning: submit the five templates to the vendor’s WABA when shipping is turned on; a status poll updates `VendorShippingTemplate`; Settings shows the state.
- Order-status reply: `renderOrderStatusReply`, `prefetch.ts`, and `prompts.ts` include courier, AWB, tracking link, and shipment status. The bot repeats `estimatedDelivery` and never invents a date. Update `orderStatusGuard` tests.
- Vendor order view shows the shipment timeline.
- Order cancel is blocked from `booked` to `rto_delivered` as the spec says.

**Tests:** replayed webhook changes nothing; out-of-order events never move a status down; an event before the AWB is saved is applied later; each event maps to the right order status; template versus text by window; a skipped send does not fail the webhook; bot reply with and without a shipment; the invalid-transition tests still pass for every other path.

**Gate for live:** O6 closed for the pilot vendors’ WABAs.

**Done when:** replaying a recorded sequence of carrier events on the fake provider walks an order from `ready` to `delivered` and sends the right customer messages.

## Phase 7 — Failed deliveries (NDR)

**Goal:** a failed attempt becomes a short conversation instead of a returned parcel.

**Code:**

- Webhook handling for a failed attempt: `failed_attempt`, `ShipmentNdr` with a deadline, vendor notification.
- `shipment_delivery_failed` template with three quick-reply buttons whose payloads are `ndr:{ndrId}:{choice}`.
- `ndrPipeline.ts` in `backend/src/conversation/`, modelled on `orderPaymentPipeline.ts`, called before LLM-1. It matches the button payload, and in the `awaiting_address` state it consumes the next free-text message from that customer in that conversation. It validates that the pincode is unchanged.
- Provider NDR calls for re-attempt (with optional address update) and return.
- `POST /api/shipments/:shipmentId/ndr` for the vendor override.
- NDR deadline sweep (15 min) applying the default: re-attempt on the first failed attempt, return after that. Controlled by `ndrReplyHours`.
- `rto` and `rto_delivered` handling; the `shipment_returning` template.
- Vendor order view shows the reason, the customer’s choice, the deadline, and the override buttons.
- Update `INCOMING_RESPONSE_GENERATOR_FLOW.md` with the new pre-LLM step.

**Tests:** each button; a button after the deadline; a double tap; address change with the same and with a different pincode; a normal message from a customer who has an open NDR is not hijacked unless `awaiting_address`; the deadline sweep applies each default; a vendor override wins when sent first; the customer’s reply racing the sweep ends with exactly one aggregator action.

**Done when:** on the fake provider, a failed attempt sends the buttons, a tap re-attempts, and an ignored NDR returns the parcel at the deadline.

## Phase 8 — Reconciliation, adjustments, balance, statement

**Goal:** the money after booking is correct and nobody finds out from a bank statement.

- Tracking poll (6 hours) as the webhook fallback.
- Billing reconciliation (daily) creating `ShipmentAdjustment` rows and debiting the wallet through the `shipment_adjustment` entry point. Adjustments use the carrier’s markup bps and not the flat fee.
- Aggregator balance job (15 min): admin page balance, alert under `lowBalanceAlertPaise`, automatic booking pause under `bookingPauseBelowPaise`, CloudWatch metric.
- Vendor view of adjustments on the shipment, with the reason.
- Negative-balance rule: new bookings blocked until the balance covers the next quote.
- `ShippingStatement` generation per vendor, hooked into the payments statement job; PDF or CSV download in the vendor portal.
- Dashboards and alarms for the `ChatLogix/Shipping` metrics.
- Support runbook: stuck booking, missing webhook, wallet mismatch, cancelled-but-charged.

**Tests:** reconciliation is idempotent per shipment and per day; an adjustment debit equals the formula; the balance job pauses and un-pauses; the statement totals equal the sum of shipment and adjustment rows for the month.

**Done when:** a seeded month of shipments and adjustments produces a statement whose totals match the ledger to the paisa.

## Phase 9 — COD

**Goal:** the courier can collect cash on delivery, and the vendor is paid fairly for it.

This phase reopens the rule in [payments/01-business-flow.md](../payments/01-business-flow.md) that COD cash never reaches ChatLogix. With courier COD it does: the courier hands cash to the aggregator, the aggregator remits it to ChatLogix, and ChatLogix owes it to the vendor. That needs a ledger design before code. **Write the design as a new section of the payments docs and get it reviewed before starting.**

Outline to confirm in that design:

- A COD remittance ledger: expected, received from the aggregator, and paid to the vendor, with the freight and COD fee netted or debited from the wallet.
- `Shipment.isCod` and `codAmountPaise`; the estimate and rate list use the COD price.
- The bot offers COD again for `shippingEnabled` vendors, and the estimate uses the COD price.
- The `codEnabled` platform switch.
- Vendor “Order payments” view of COD in transit and COD remitted.
- RTO of a COD parcel: no cash, no transfer, freight and RTO charge debited from the wallet.
- Remittance reconciliation against the aggregator’s cycle, and what happens when the aggregator is late or short.
- Fraud and limits: a maximum COD value, and flagging customers with repeated RTOs.

**Done when:** the design is approved, and a COD parcel on the test account books, delivers, remits, and appears in the vendor’s ledger with totals that match.

## After v1

Not planned yet. Candidates, roughly by value:

- Per-product weights and an automatic weight from the cart
- Free-shipping thresholds and vendor-set shipping fees
- A second aggregator or a direct carrier contract
- Bulk booking for several orders
- Branded tracking page and delivery analytics for vendors
- Customer-initiated returns and exchanges

## Risks to watch

| Risk | Where it bites | Mitigation |
|---|---|---|
| The aggregator’s answers (O2, O3, spikes) change the design | Phases 5, 6, 7, 9 | Phase 0 runs first for the calls each phase needs. The interface isolates the vendor-specific parts. |
| The shipping line in `totalAmount` breaks an existing payment path | Phase 3 | Cart engine is the only writer. Test every `previousTotalPaise` and payment-link path. Ship behind `shippingEnabled`. |
| Estimate lower than freight | Vendor margin, Phase 5 | The rate list shows both numbers. The vendor bears it by decision (D11). Review the real gap after the pilot. |
| Wallet empty mid-month stops AI replies | Vendor experience | The rate list shows the balance, warns before booking, and the existing low-balance warning fires. |
| A template is rejected on some WABAs | Phase 6 | Skip-and-alert, Settings shows the state, text still works inside the window. |
| Aggregator account runs dry | All bookings | Balance job, alert, automatic booking pause. |
| NDR button handling hijacks normal chat | Phase 7 | Match on payload only. Free text is consumed only in `awaiting_address`, until the deadline. |
| COD changes the payments promise | Phase 9 | Separate design review before any code. |
