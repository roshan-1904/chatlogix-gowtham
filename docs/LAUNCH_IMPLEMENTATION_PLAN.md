# Launch implementation plan

**The plan to follow is [`docs/launch/README.md`](launch/README.md).** The phase documents in `docs/launch/` replace this file's sequencing. This file stays as the earlier date-based write-up.

Written 12 Nov 2026. This is a plan for one senior full-stack engineer and a product owner. It does not change application code, billing settings, wallets, or production data.

Source of product decisions: `docs/PORTAL_IMPROVEMENT_AND_COMPETITIVE_REVIEW.md` (keep / improve / do-not-build). This file sequences that list. It does not reopen competitor research.

Portals used in the 12 Nov walkthrough:

- Vendor app that is ChatLogix: `http://127.0.0.1:3000`. `localhost:3000` is a different app. Do not test the vendor journeys there.
- Admin: `localhost:3001`.

Vendor-1 is Ibell Creations, the shop already taking WhatsApp orders.

## Dates

| Gate | Date | Meaning |
| --- | --- | --- |
| Next step | Friday 13 Nov 2026 | Read which database production Lambdas use. No settings write. |
| Vendor-1 unblocked | Friday 4 Dec 2026 | Ibell can take orders, answer, record payment, and trust the dashboard without an engineer in the thread. |
| Market launch | Wednesday 23 Dec 2026 | A new one-owner shop can sign up and run on the same path. No engineer in the thread, the catalog, or the payment recording step. |

Weekdays only. A local holiday moves that day’s work to the next weekday and does not get absorbed by the buffer.

### Why 4 Dec, not the end of the build week

The build that unblocks Ibell fits in 16–27 Nov if nothing waits on access. Three working days after that (30 Nov, 1 Dec, 2 Dec) are the hardening walk on `http://127.0.0.1:3000`, plus one observed live reply whose charge is near the October cost. 3 Dec is spare. 4 Dec is the day Ibell is told the shop is operable.

That week of slack is the conservative part. The billing row audited on 12 Nov may be the database the Lambdas read. Proving that, and only then changing four fields, is a gate in front of every screen fix. WhatsApp status for a number that already receives chats is easy to “fix” by sending the owner through Embedded Signup, which can disturb the live number. The date assumes that path is refused and the status copy is fixed instead.

Pull-in: if Friday 13 Nov shows the Lambda database already has per-turn fee 0, media fee 0, no FX override, and mock top-up off, and the 27 Nov walk passes, Vendor-1 can move to Friday 27 Nov 2026. Do not announce 27 Nov until that read is written down.

What slips 4 Dec:

- Friday 13 cannot read the Lambda `DATABASE_URL` (account access, not a coding task). Everything moves by the number of weekdays that read takes.
- The audited row is the production row and the owner does not approve the four-field change on 16 Nov. Screen work can continue. Ibell is not “unblocked” until one live reply is charged near real cost.
- The 27 Nov walk finds the admin catalog or the charge still wrong. Those two are not allowed to ship as known issues. Other walk bugs use the 30 Nov–3 Dec buffer. A new tenant leak or a charge still near ₹222 consumes the buffer and moves the date into the week of 7 Dec, which also moves market launch.

### Why 23 Dec

Vendor-1 is a shop that already has a number, a catalog, and threads. Market launch is a stranger: signup, trial wallet, their own catalog, an honest connection state, a human reply, an order, and “I received the UPI” on that order. That is the week of 7 Dec through 18 Dec, then a launch checklist on 21–23 Dec.

23 Dec is the last weekday before the Christmas weekend. A miss does not become 24 or 26 Dec. The next honest date is Tuesday 6 Jan 2027.

What slips 23 Dec:

- Vendor-1 slips. Market launch keeps a two-week gap after Ibell is actually operating.
- A fresh-number Embedded Signup test fails. New shops would then need an operator to map a number. That fails the “without an engineer” bar. The date moves; Ibell does not get Embedded Signup as a workaround.
- Someone pulls Razorpay Route, broadcasts, or Shopify into the same fortnight. Those are out of this launch. Putting them in is how 23 Dec becomes January.

## Next step (the only work on 13 Nov)

Confirm which database the production Lambdas read for `PlatformSettings` id `default`. Read only. No `PATCH /api/admin/settings`. No SQL update. No wallet edit. No Redis delete.

Do this before any other engineering:

1. From the Lambda configuration for `chatlogix-incoming-response-generator` (the function that charges a turn in `backend/src/conversation/billing.ts`), record the database host and port only. Redact user, password, and database name in anything that will be pasted into chat or committed. Note whether the port is 6432 (PgBouncer, the path documented for the five Lambdas) or a direct Postgres port.
2. Compare that host and port to the `DATABASE_URL` of the process behind `localhost:3001`, which is the screen that showed ₹222 / ₹22 / FX ₹50 / mock top-up on, last saved 12 Nov 2026, 12:21 am. Also compare the Express API if it is a third host.
3. On each distinct host, `SELECT` the singleton row (`platformSettingsService.ts` uses id `default`): `platformFeePerTurnPaise`, `platformFeeOutboundMediaPaise`, `usdToInrOverride`, `usdToInrRate`, `usdToInrFetchedAt`, `mockWalletTopUpEnabled`, `updatedAt`, `updatedBy`. The admin form in `frontend_v2/apps/web-admin/src/lib/settings.ts` displays those fee columns as rupees (`paiseToRupeeInput`). A screen value of ₹222 means the column is 22200 paise, not 222. The FX override is a rupee-per-dollar rate, not paise. Write the raw column values next to the screen values.
4. Record whether Redis key `platform:settings` exists. The read path in `backend/src/services/platformSettingsService.ts` is process memory (60 seconds), then that Redis key (24 hours), then Postgres, then env fallback. A Lambda can keep serving a cached snapshot after a later write. This step only reads the key. It does not delete it.
5. Stop and write the result in a short note (host redacted, raw columns, “same database as the 12 Nov screen: yes or no”). If the hosts differ, the ₹222 row is not a production incident until the Lambda host is read. If they match, the production charge path is the one in the next section, and 16 Nov is the day the four fields may change, with the owner’s approval that morning.

`chargeVendor` in `backend/src/services/pricing/pricingService.ts` is the only writer of `Vendor.walletBalanceMilli`. This plan never edits a balance, a `CreditUsage` row, or a `WalletTransaction`.

## 1. Outcome: the vendor can run the shop

A journey is done when Ibell’s owner can do it on `http://127.0.0.1:3000` against the real shop, and a product owner watching can see the same facts on `localhost:3001`.

| Journey | Bar | Rank |
| --- | --- | --- |
| Answer a WhatsApp customer in the language they wrote, including a voice note | The assistant replies from Ibell’s catalog (brownies, cookies, tin), not another shop’s. `resolveCatalogContext` in `backend/src/conversation/context/resolveCatalogContext.ts` already takes a `vendorId`. Confirm the pipeline passes the conversation’s vendor, then prove it with one reply. | Blocker |
| Wallet charge stays near real cost | One new reply lands near the October band (about ₹0.18 at the old FX, about ₹0.20 with a correct FX and a 50% markup, fee ₹0). The formula in `pricingService.ts` is `ceil((aiCost + whatsappCost + platformFee) × (1 + markup))`. `platformFeePerTurnPaise` is inside that sum before markup (`computeChargeMilli`, and `debitAfterEnqueue` in `backend/src/conversation/billing.ts`). A stored 22200 paise is ₹222 before markup, about ₹333 at the 50% default. Historical October rows are not rewritten. | Blocker |
| Catalog the operator sees is that shop’s | Admin inspection of Ibell shows Ibell’s products. Today `ShopInspection.tsx` calls `GET /products?vendorId=`, and `products.ts` uses `req.user.vendorId` first. The admin phone `+919790690170` is also Isha Bakers, so the token’s shop wins and Ibell’s inspection shows that other catalog (Black Forest, Geode Cubes). | Blocker |
| See open orders that are actually open | The dashboard “Pending orders” number matches orders that still need the owner. The count today comes from a date-scoped groupBy that also drops cancelled orders (`dashboardStatsService.ts`, `order_groupBy` on `createdAt` within `dateRange`). The tile label is “Pending orders” (`Dashboard.tsx`). Revenue may stay period-scoped. Pending may not. | Blocker |
| Record or collect payment without naming the wrong person | For an open order with items and a non-zero total, the owner can mark UPI or cash received, and any UPI text names this shop’s saved payee and VPA. Cancelled orders and the ₹0 empty order do not offer collection or Create Shipment. Live Razorpay Route is not required for this journey. | Blocker |
| Pause and reply as the owner | One obvious control pauses the assistant and focuses the composer. Today `MessageInput` renders only when `aiPaused` is already true (`Conversations.tsx`). | Blocker for Vendor-1 once the owner must type; the pause toggle exists but is not explained on the thread |
| Connection status is honest | A shop that already has customer chats is not told to Connect WhatsApp. Mapped numbers are not “Unknown” when the reason is a legacy row with no `connectStatus`. Ibell is not sent through Embedded Signup. | Blocker |
| Customer name is a name or a phone | The inbox, dashboard, and queries never show the literal `null`. | Important (trust). Treat as part of Vendor-1 because it is on every thread. |
| “Where is my order” quotes the order that exists | Status, items, total, next step, in the customer’s language. `prompts.ts` already forbids a knowledge-gap on order status. Prove it with a test. The 6 Oct miss is not assumed fixed until that test runs. | Important |
| Open queries are not a silent backlog | The five open items (31–51 days), three of them order intents, are answered, turned into an order, or dismissed. New “place the order” turns do not become FAQs. | Important. The product owner does this with the owner. Engineering only if a new order-intent still opens a query. |
| A new shop signs up and lands approved, with a trial wallet, without an engineer | `completeOnboarding` already sets `registrationStatus: 'approved'` (`vendorOnboardingService.ts`). The admin dashboard still says shops auto-approve until review is on, and Lumina Fragrances is `pending_approval` with no approve or reject control. | Blocker for market launch. Ibell is already approved, so it does not block Vendor-1. |
| Add money after the trial without an engineer | Out of this launch unless Razorpay wallet checkout is already live in that environment. Trial is ₹50. Admin recharge exists for the founder to use. Mock “Add money (simulated)” is off on any shared or production database. | Later for self-serve checkout. Turning mock off is a Blocker on the database the Lambdas use. |
| Quick replies for “ready for pickup” and “out for delivery” | One tap. The panel already says coming soon (`CustomerDetailsPanel.tsx`). | Important for market launch. Ibell can type a reply without them. |
| Low balance is visible to the owner | Replies stop, the dashboard says why, the next step is add money (or “ask ChatLogix to add money” while top-up is manual). | Important for market launch. |
| Approve or reject a shop that is actually waiting | One action with a reason, for rows already in `pending_approval`. Auto-approve stays the signup path. | Important for market launch, because Lumina is stuck and the Waiting card implies a queue. |
| Shipping labels | Create Shipment stays hidden. `backend/src/routes/shipping.ts` returns HTTP 501. `frontend_v2/apps/web-vendor/src/services/shipping.ts` already maps that to “not yet available”. | Later |
| Broadcasts, Shopify sync, omnichannel inbox, catalog cards, a second staff user, CSAT, reorder nudges | Not this launch. | Later |

## 2. Priority stack

Effort is the senior engineer’s days. The product owner’s time is extra and called out. No second engineer.

### Now (this week: 13 and 16–17 Nov)

Feature work does not start before these two are done.

#### N1. Confirm the settings database, then correct four fields only if that database is the one Lambdas read

- Problem. The 12 Nov billing screen showed per-turn fee ₹222, outbound media ₹22, USD/INR override ₹50 against a live Frankfurter rate of ₹93.69, and mock wallet top-up on. `docs/BILLING_AND_PRICING.md` says both fees default to 0 paise and that mock top-up is turned off in production once Razorpay is live. Effective FX is `usdToInrOverride ?? usdToInrRate` (`platformSettingsService.ts`). October replies were about ₹0.18 because the fee in force then was effectively zero.
- User impact. If the Lambda host is that row, the next customer message costs on the order of ₹222 plus markup, and the OpenAI portion is converted at about half the real rate. The pre-flight estimate uses the same fee (`turnEstimateCost`), so a small wallet can also start refusing turns. Mock top-up lets a shop add money that is not money.
- Proposed fix. 13 Nov is the read in “Next step”. On 16 Nov, if and only if the owner agrees and the read says the Lambdas use that row: set `platformFeePerTurnPaise` to 0, `platformFeeOutboundMediaPaise` to 0, `usdToInrOverride` to null, `mockWalletTopUpEnabled` to false. Leave `usdToInrRate` to the Frankfurter value already stored. Leave trial grant, tax bps, and top-up limits alone. After the write, delete Redis `platform:settings` so the 24-hour cache cannot keep the old fee, and allow warm Lambdas up to 60 seconds of memory cache. Recompute one charge with `computeChargeMilli` from a sample token count in a script or a unit test. Do not debit a customer. If the hosts differ, change nothing on the Lambda database; fix only the database the admin screen writes, and say so in the note.
- Acceptance. Raw columns on the Lambda database are 0, 0, null override, mock false. A recomputed turn with fee 0 is under ₹1 at the vendor’s markup. The vendor wallet page does not say “Add money (simulated)”. No `WalletTransaction` was created by the change. `updatedBy` is the person who applied it.
- Effort. 0.5 day read (13 Nov) + 0.5 day write and recompute (16 Nov), or 0.5 day total if the read says production is already at the defaults.
- Dependency. AWS read access to the Lambda environment. Owner approval before the write. Nothing else in this plan writes settings.

#### N2. Admin catalog reads and writes use the shop in the URL

- Problem. `backend/src/routes/products.ts` list and categories do `const vendorId = req.user?.vendorId || req.query.vendorId`. The admin check only stops a non-admin from reading someone else’s id. An admin who is also a vendor keeps their own shop. `frontend_v2/apps/web-admin/src/pages/ShopInspection.tsx` requests `/products?vendorId=${vendorId}` and therefore shows the wrong catalog for every shop except the one on the token. Later handlers in the same file (`POST`, update, delete, bulk) take `req.user.vendorId` and, for an admin, either skip the shop filter or would write onto the token’s shop.
- User impact. The operator cannot see the catalog the assistant is selling. A later admin edit can change Isha Bakers while the screen says Ibell. The customer-facing catalog path is separate: `resolveCatalogContext` is given a `vendorId`. This bug is the operator’s view, and it is still a blocker because “the catalog is that shop’s” is how Vendor-1 is signed off.
- Proposed fix. Copy the admin branch already used by `resolveVendorId` in `backend/src/routes/customerQueries.ts`: an admin uses the query or body shop id and never the token shop; a vendor uses only the token. Apply that to every handler in `products.ts`. Add a regression test: admin token whose `vendorId` is shop A, `GET /products?vendorId=` shop B, response is shop B. `GET /orders` already goes through `requireVendorAccess` on the query id and lets admins through (`backend/src/middleware/authorize.ts`). Do not “fix” orders the same way unless a test shows the query id is ignored. Spend the rest of the day grepping other routers for `req.user?.vendorId || req.query.vendorId` and for admin mutations that write `req.user.vendorId`. The products file is the one confirmed on 12 Nov.
- Acceptance. Signed in as `+919790690170`, Ibell’s catalog tab shows Ibell’s products (the brownie and cookie set, on the order of 8), not the 30-product bakery list. A vendor token for shop A still cannot read shop B.
- Effort. 1.5 days (16 Nov afternoon through 17 Nov).
- Dependency. N1’s read is done. The code change does not wait on the settings write. Do not start N3 until this test passes.

### Vendor-1 unblock (18 Nov – 4 Dec)

#### V1. Pending orders means orders the owner still has to handle

- Problem. `dashboardStatsService.ts` builds `orders.pending` from `order_groupBy`, which filters `createdAt` to the dashboard date range and drops `cancelled`. `Dashboard.tsx` labels the tile “Pending orders” and navigates to `/orders?status=pending`. The 12 Nov walk saw 0 on the tile and 3 orders still needing collection.
- User impact. The owner looks at the home screen, sees nothing to do, and leaves money uncollected.
- Proposed fix. Count orders that are still open work for this vendor with no `createdAt` filter: status not cancelled, not delivered, and not a zero-item or zero-total shell. Return that count as `orders.pending`. Keep the date range on revenue and on the period caption that revenue already shows (`In period: ${stats.dateRange.label}`). If a date-scoped pending count is still useful, put it in a caption that includes `dateRange.label`. The tile click should open a list that matches the number.
- Acceptance. On Ibell, with the default date range, the tile equals the list of orders that still need collection or fulfillment. The ₹0 empty order and the cancelled order are not in that number. Changing the date chip does not change the pending number. It may still change revenue.
- Effort. 1 day (18 Nov).
- Dependency. N2 done.

#### V2. Cancelled and empty orders stop offering payment and shipment

- Problem. `OrderDetails.tsx` always renders `OrderPaymentPanel` and, when `shippingStatus === 'not_created'`, a Create Shipment button. `listNextStep.ts` already suppresses “Collect payment” when status is cancelled; the detail page does not. `shipping.ts` routes all return 501.
- User impact. The owner can chase payment on `ORD-ORDER-2026090006` (cancelled) and on `ORD-ORDER-2026090002` (₹0, no items), and can open a shipment flow that the API refuses.
- Proposed fix. On the detail page, hide payment actions when status is cancelled or when there are no line items or the total is 0. Hide Create Shipment and View Shipping Details until `shipping.ts` no longer returns 501. Leave the list next-step helper as it is unless the walk shows the list still offers collection on those orders. Do not implement Shiprocket.
- Acceptance. Those two orders show no collect control and no shipment control. An open order with items still shows mark-received (UPI or cash).
- Effort. 1 day (19 Nov).
- Dependency. V1, so the pending count and the detail page agree on what “needs collection” means.

#### V3. The customer is never named `null`

- Problem. Inbox, dashboard, and queries render the literal `null`. Display code uses `customerName || phone` (`ConversationListItem.tsx`, `ConversationHeader.tsx`, `RecentConversationsWidget.tsx`, `Queries.tsx`). A real `null` would fall through to the phone. The string `"null"` would not. `dashboardStatsService.ts` copies `customerInsights.customerName` straight through. `customerInsightsEnrichment.ts` will store a trimmed extracted name, including the word null if the model emits it. A single writer is not confirmed.
- User impact. The owner cannot tell customers apart, and a payment or reply can be aimed at the wrong thread.
- Proposed fix. One display helper used by those four surfaces and by the recent-orders mapping: missing, blank, `"null"`, and `"undefined"` become the phone. On write, `customerInsightsEnrichment.ts` (and any other assign into `customerName` found that day) refuses those same tokens. Do not bulk-rewrite insight rows until the helper is in and a read-only count of bad names is noted. Then blank the bad names for Ibell in a reviewed one-off, not a blanket `UPDATE` across vendors, and only after the count is small and the owner agrees. If the count is large or the source is unclear, ship the helper and leave the data cleanup listed as a follow-up on 30 Nov rather than guessing.
- Acceptance. Ibell’s conversation list, a thread header, the dashboard recent list, and the queries list show a name or a phone. None of them show `null`. A unit test covers the helper.
- Effort. 1 day (20 Nov), plus a product-owner pass on the data note.
- Dependency. None beyond N2. Can sit beside V2 if the same person is not splitting attention. This plan keeps them on separate days.

#### V4. Payment text names this shop, and received means received

- Problem. A payment message in Sugan’s thread named another person and a personal UPI. The system UPI body is built in `backend/src/services/payments/upiQrService.ts` from `order.vendor.upiPayeeName` and `order.vendor.upiVpa`, prefixed with the amount and order number. The assistant can also invent payment instructions in prose. Which of those produced Sugan’s message is not confirmed from code alone. Collection via Razorpay Route is off until D1 (`docs/payments/02-implementation-plan.md`, `docs/payments/05-compliance-and-risk.md`). The vendor can already mark cash or UPI received: `OrderPaymentPanel.tsx` posts to `/orders/:id/mark-cash-collected`.
- User impact. The customer pays the wrong person, or the owner does not know whether the order is paid.
- Proposed fix. On 23 Nov morning, read-only: open the message, and read Ibell’s `upiVpa`, `upiPayeeName`, and `businessName`. Do not update those columns in SQL. If the saved VPA is wrong, the owner types the correct VPA and payee in payment settings that day; the product owner watches. In code: the send path refuses to send when either field is blank; the body includes the shop `businessName` and the saved payee and VPA and no other account; the order panel shows the same three strings before send. In `backend/src/conversation/llm/prompts.ts`, tell the model to send the customer to the shop’s payment message and not to invent a UPI id or a person’s name. Update `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md` in the same change if that prompt rule changes reply behavior. Route stays faked or disabled. `RAZORPAY_USE_FAKE_ROUTE` stays as the docs require until D1.
- Acceptance. A payment instruction for an Ibell order contains only Ibell’s saved VPA and payee, plus the business name. The order page shows the same values before the send. Marking payment received moves that order out of “needs collection” on the dashboard (V1) and does not offer the action again. A cancelled order still has no payment action (V2).
- Effort. 1 day (23 Nov). Owner availability for the VPA is the dependency that can slip this day.
- Dependency. V2. N1 so a test send is not a ₹222 turn. No D1, no Route go-live.

#### V5. WhatsApp status tells the truth, and Ibell is not reconnected

- Problem. `Dashboard.tsx` treats the shop as live only when `connectStatus === 'live'`, and otherwise shows `ConnectWhatsAppPromo`. `vendorSendingNumber.ts` still sends on a legacy row: `connectStatus` null and no per-number token (`TIER_LEGACY`). Ibell has chats and orders in that shape. `ConnectStatusPanel.tsx` labels a missing status “Unknown”. A second mapped id that looks like a sample is shown as if it were healthy. Embedded Signup on a number that already receives production traffic can disturb it.
- User impact. The owner follows “Connect WhatsApp”, starts Embedded Signup, and the number customers already message is at risk. Or they ignore a real outage because the screen has cried wolf.
- Proposed fix. Define live-for-the-banner as: a sendable row (`live` or `credit_attached`) or a legacy row that has customer messages. Banner copy in the legacy case: the number customers already message, status “Connected (existing number)”, no button into Embedded Signup. Unknown is reserved for a row that is neither legacy-with-traffic nor a known connect status. In admin, a sample-looking phone-number id is a warning on the shop, not an active number. `pickVendorSendingNumber` stays the send authority; this change is display and a guard that the connect wizard refuses to start when a legacy or live row already has traffic. Do not run the wizard against Ibell.
- Acceptance. Ibell’s home on `http://127.0.0.1:3000` has no Connect WhatsApp banner. Admin shows the sending number as existing-and-in-use, and flags the sample id. A shop with no number and no chats still sees the connect wizard.
- Effort. 1.5 days (24 Nov, spilling into 25 Nov morning if the legacy rule needs a second pass).
- Dependency. Read-only look at Ibell’s `WhatsAppNumber` rows (status, whether a token exists, which id matches recent outbound sends). No Meta API call.

#### V6. The owner can take the thread in one click

- Problem. `Conversations.tsx` mounts `MessageInput` only inside `aiPaused &&`. The header has a pause toggle. The thread does not say that the composer is hidden until pause. Quick replies and notes say “coming soon” in `CustomerDetailsPanel.tsx`.
- User impact. A wrong or stuck answer cannot be corrected until the owner discovers Pause AI. For Ibell that is a blocked reply, not a missing canned-reply feature.
- Proposed fix. Add one control, “I’ll reply”, that pauses AI and focuses the composer, and “Back to assistant” that resumes it. Show one line on the thread when the composer is hidden: the assistant is answering; I’ll reply to type. Leave the quick-reply panel as coming soon until market launch. Do not build a shared inbox.
- Acceptance. From a thread where AI is running, one click shows the composer and the assistant does not answer the next inbound until resume. Resume hides the composer again and the assistant answers. Tested on an Ibell thread the owner chooses, or a fixture thread if they do not want a live pause that day.
- Effort. 1 day (25 Nov, or 26 Nov if V5 slips).
- Dependency. V5’s morning only if the same files are in flight. Otherwise independent.

#### V7. Order status in the answer, and the five open queries

- Problem. On 6 Oct the assistant told Sugan it could not see an order that was already in the thread. The prompt (`backend/src/conversation/llm/prompts.ts`) and `orderStatusGuard.ts` now say order-status turns answer from recent orders and do not open a knowledge gap. `pipeline.ts` logs `CustomerQueryBlockedOrder` when that fires. Five queries are still open after 31–51 days. Three are order intents (“place the order”, “repeat the cancelled order”, “I need them tomorrow”), which should be an order or a handoff, not an FAQ under Other.
- User impact. The customer asks where the order is and gets a shrug. The owner’s query page looks like homework instead of a shop.
- Proposed fix. Engineering: one regression test that an order-status turn with an existing order does not persist a `CustomerQuery` and does not send the deferral. If the test fails, fix the guard. Do not add a new status product. Product owner, same day, with the owner: close the five queries in the existing UI (answer, promote a real FAQ, or dismiss). Turn the three order intents into an order action or a human reply, not a new FAQ. Empty delivery-instruction and “birthday cakes” FAQ cleanup is a catalog conversation with the owner the same week, not a code project. Stock strings such as “9999.999 box” get corrected in the product form by the owner. Engineering does not write a stock-display project.
- Acceptance. The new test passes. The five queries are no longer open. A “where is my order” reply in a test fixture names the order number, items, and total from the row.
- Effort. 0.5 day engineering (26 Nov) and 0.5 day product owner with the shop.
- Dependency. V6 if the human reply is how an order intent gets answered. The test itself has no dependency.

#### V8. Vendor-1 hardening and the day Ibell is unblocked

- Problem. The items above can pass in isolation and still fail as a shop day.
- User impact. The owner is told the shop works and then hits the first real customer.
- Proposed fix. 27 Nov: product owner walks the Blocker journeys on `http://127.0.0.1:3000` as Ibell, and the catalog tab on `localhost:3001` as the dual-role admin. 30 Nov–2 Dec: only failures from that walk, plus the data-cleanup follow-up from V3 if it was deferred. 2 or 3 Dec: one real customer reply (or the next natural one) is checked in the ledger. Charge components: AI cost at the live FX, platform fee 0, markup as stored on the vendor, total under ₹1. 4 Dec: tell the owner the shop is operable, with the manual list in section 5.
- Acceptance. Checklist in section 1, every Blocker row, ticked on Ibell. One ledger row attached to the note.
- Effort. 3 days buffer inside the date (30 Nov, 1 Dec, 2 Dec) plus the 27 Nov walk and the 4 Dec sign-off. 3 Dec is unused unless the walk or the live charge fails.
- Dependency. N1, N2, V1–V7.

### Market launch (7–23 Dec)

A new shop, not Ibell. Signup through the existing onboarding. Auto-approve stays.

#### M1. A new phone can finish signup and land on the dashboard

- Problem. `completeOnboarding` sets `approved` and `approvedBy: 'system'`. A missing `registrationStatus` on the vendor token is treated as approved in `ProtectedRoute.tsx` (`user?.registrationStatus ?? 'approved'`). That hides a shop that should still be in onboarding if the token was minted without a status. Lumina is the opposite case: `pending_approval` with nobody able to decide.
- User impact. A new seller either cannot tell whether they are in, or a waiting shop sits forever. The admin card (`frontend_v2/apps/web-admin/src/pages/Dashboard.tsx`) says “New shops are approved automatically until review is turned on” and also “need decision”.
- Proposed fix. Keep auto-approve for the signup path. Do not turn review on. Fix the token default: a missing status follows `redirectPathForStatus`, whose default is onboarding, not the dashboard. Add Approve and Reject (reason required) on the admin vendor panel for `pending_approval` only. Use them on Lumina. Relabel the Waiting card so a zero means there is nothing to decide, and a non-zero is a list with those two actions. No review queue, no assignment, no SLA.
- Acceptance. A test phone completes onboarding and opens the dashboard without a script or a database edit. Lumina is approved or rejected with a reason stored. A token with no `registrationStatus` does not enter the vendor dashboard.
- Effort. 2 days (7–8 Dec) for the signup walk and the token default, 1.5 days (9–10 Dec) for approve/reject.
- Dependency. Vendor-1 signed off on 4 Dec. If 4 Dec slips, this starts the next Monday after sign-off.

#### M2. Quick replies, still not templates

- Problem. `CustomerDetailsPanel.tsx` reserves “Quick replies (coming soon)”. Admin `Templates.tsx` says the meaning of templates is undecided. Vendor sidebar marks Templates coming soon.
- User impact. Pickup and delivery replies are retyped, and the owner is slower than the assistant they are correcting.
- Proposed fix. A short shop-level list of replies, seeded with “Ready for pickup” and “Out for delivery”, inserted into the composer. Stored per vendor. No Meta template submit, no broadcast, no click tracking. Leave both Templates pages as they are, with one sentence that utility templates are a later release. Do not start the undecided templates project.
- Acceptance. On a paused thread, one tap fills the composer with the shop’s line and sends only when the owner presses send.
- Effort. 2 days (11 and 14 Dec).
- Dependency. V6, because the composer has to be on screen.

#### M3. Low balance the owner can see

- Problem. The admin Reliability wallet tab (`Reliability.tsx`) says `WalletBlockEvent` is waiting on a migration and then shows an empty list. The vendor dashboard already has `lowBalanceWarning` under ₹20. The reply gate is the pre-flight estimate in `pricingService.ts`. Those are three different stories.
- User impact. The shop runs out of wallet and does not know why replies stopped. The admin tab looks like a broken report.
- Proposed fix. On the vendor dashboard, when a turn would be refused, say replies are paused because the wallet is too low, and link to the wallet page. Do not add the `WalletBlockEvent` table. On the admin tab, keep the explanation and remove the empty “queue” table so a zero is not read as “nobody is blocked”. Mock top-up stays off (N1). Self-serve Razorpay top-up is not built in this window. The wallet page must not invite a simulated add. Copy can say the founder adds money from admin recharge until checkout is live.
- Acceptance. A fixture vendor under the estimate sees the pause reason and a wallet link. The admin wallet-block tab does not show an empty table of events that were never stored. Ibell’s real wallet is not edited to test this.
- Effort. 1 day (15 Dec).
- Dependency. N1 (mock off, fee 0), so the pause copy is about real cost and not about a ₹222 estimate.

#### M4. Hardening that is in the launch, and the cuts that are not

In this launch, small, and on 16–17 Dec:

- `TextBubble.tsx` `stripHtml` assigns `innerHTML` on a detached element before reading `textContent`. Strip tags without assigning untrusted HTML to `innerHTML`. The access token remains in `localStorage` under `chatlogix_auth_token` (`frontend_v2/packages/auth/src/storage.ts`). Moving it to an httpOnly cookie is a multi-day auth change across vendor and admin. It is a known risk, recorded in section 5, and it is not in this launch.
- Replace the six `expect(true).toBe(true)` cases in `frontend_v2/apps/web-vendor/src/hooks/dashboard/__tests__/useDashboardStats.test.ts` with tests that the pending count is not taken from the date-scoped series. The other frontend tests are not a rewrite target.
- `DateRangeFilter.tsx` calls `alert('Custom date picker coming soon')`. Remove the alert. A custom range can stay unimplemented; the control should not throw a browser alert.
- Billing-settings save asks for a confirm that names the four fee/FX/mock fields. Other money confirms (freeze, invoice, tax month) wait.

Explicitly out of this launch, even if a day is free:

- `WalletBlockEvent` migration and a real reliability queue.
- Admin sidebar redesign, “Pro” plan label, date-format and rupee-format polish.
- JWT storage migration.
- Shipping aggregator, Shiprocket, labels, tracking.
- Razorpay Route live HTTP, linked accounts, payment links that settle (phases 5–7, gated on D1).
- WhatsApp marketing templates, broadcasts, click-to-WhatsApp ads, drip campaigns.
- Shopify or WooCommerce sync.
- Instagram, Facebook, or TikTok inbox.
- Meta catalog cards and multi-product messages.
- A second user, assignment, `vendor_staff` UI.
- COD confirmation templates, reorder nudges, CSAT.
- AI voice calls.

- Effort. 1.5 days (16–17 Dec) for the in-launch list.
- Dependency. M1–M3 so the tests describe the launched behavior.

#### M5. Market-launch hardening and the launch-day checklist

18 Dec is a full walk of a new test shop (not Ibell’s live number). 21–22 Dec fix only what that walk breaks. 23 Dec is the checklist below, then the launch is real.

Launch-day checklist (23 Dec), each item has a name next to it before the day starts:

1. Lambda database row: fees 0 paise, FX override null, mock top-up false. Redis key matches. Confirmed that morning, read-only.
2. New shop walk: signup, catalog of at least one product, dashboard, no Connect banner if a number is already mapped, connect wizard only if there is no number.
3. Embedded Signup was exercised on a fresh test number earlier in M5, or new shops are explicitly still operator-mapped and the launch is delayed. Ibell’s number was not used.
4. Admin inspection of the new shop shows that shop’s product, not Isha Bakers and not Ibell.
5. One test order: pending tile includes it; mark UPI received removes it; payment text matches the shop’s saved VPA; a cancelled test order has no pay and no shipment button.
6. Pause, type, resume, on the test shop.
7. A reply charge on the test shop is under ₹1, with platform fee 0 in the ledger metadata.
8. Mock top-up control is absent on the test shop’s wallet page.
9. Lumina is not `pending_approval` unless a reason is visible and an approve/reject control is on that row.
10. `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md` matches the prompt and handoff behavior shipped in V4 and V6.
11. No production wallet balance was edited by hand during the fortnight. Admin recharge, if used, is a normal ledger credit with a reason.

## 3. Sequence

| Days | Work | Done when |
| --- | --- | --- |
| Fri 13 Nov | N1 read only | Note: which host the processor Lambda uses, raw columns, same as the admin screen or not |
| Mon 16 Nov | N1 write only if the note says so. Then start N2 | Recomputed charge under ₹1, or a written “production already at defaults”. Products test started |
| Tue 17 Nov | N2 finished | Ibell catalog in admin is Ibell’s. Vendor A cannot read vendor B |
| Wed 18 Nov | V1 | Pending tile matches open work, and ignores the date chip |
| Thu 19 Nov | V2 | Cancelled and empty orders have no pay and no shipment |
| Fri 20 Nov | V3 | No literal `null` on Ibell’s lists |
| Mon 23 Nov | V4 | Payment text is this shop’s saved UPI. Owner has confirmed the VPA |
| Tue 24 Nov | V5 | No connect banner on Ibell. No Embedded Signup |
| Wed 25 Nov | V5 spill or V6 | “I’ll reply” focuses the composer |
| Thu 26 Nov | V6 if needed, else V7 | Order-status test green. Five queries closed by the product owner |
| Fri 27 Nov | Vendor-1 walk | Written pass/fail on every Blocker journey |
| Mon 30 Nov – Tue 2 Dec | Walk failures only | Blockers from the walk closed |
| Wed 3 Dec | Spare, or the live charge if it has not happened | Ledger row under ₹1, fee 0 |
| Thu 4 Dec | Vendor-1 unblocked | Ibell told they can run the shop. Manual list in section 5 handed over |
| Mon 7 – Tue 8 Dec | M1 signup and token default | Test phone reaches the dashboard |
| Wed 9 – Thu 10 Dec | M1 approve/reject | Lumina decided. Waiting card matches the rows |
| Fri 11 and Mon 14 Dec | M2 quick replies | One tap fills the composer |
| Tue 15 Dec | M3 low balance | Pause reason on a fixture vendor. Empty wallet-block table gone |
| Wed 16 – Thu 17 Dec | M4 | innerHTML, dashboard tests, date alert, billing confirm |
| Fri 18 Dec | New-shop walk, including a fresh-number connect test if a test WABA exists | Pass/fail. Ibell’s number not used |
| Mon 21 – Tue 22 Dec | Walk failures only | Checklist items 2–7 able to pass |
| Wed 23 Dec | Launch checklist | Market launch, or a written slip to 6 Jan 2027 |

## 4. What Vendor-1 still does by hand

Until market launch, and for order money even after it:

- Mark UPI or cash received on the order after the customer pays the shop’s own VPA. The GPay QR and the tap-to-pay text do not mark the order paid by themselves (`docs/payments/01-business-flow.md`). A payment screenshot does not either.
- Correct the saved UPI id and payee name in settings if the 23 Nov read shows the wrong person. Engineering does not type that VPA.
- Close or answer shop questions the assistant filed. The product owner sits with them on 26 Nov for the current five.
- Pack and deliver. Create Shipment will be hidden. There is no label.
- Ask the founder for wallet money when the trial or the balance is low, until Razorpay wallet checkout is a separate, later change. Admin recharge already exists (`RechargeWalletCard` on the vendor detail panel). That credit goes through the wallet top-up path, not a balance edit.
- Ignore Embedded Signup. Their number stays on the legacy sending path.

Before market launch, these become true without an engineer in the loop: signup lands approved, the new shop’s catalog is the one the assistant and the admin both see, the owner can pause and reply, quick replies exist, payment received is a button on their order, the connect banner is honest, and a reply costs about a fifth of a rupee plus their markup. These stay manual after market launch too: UPI reconciliation, delivery, and adding wallet money, until Route D1 and wallet checkout are their own projects.

ChatLogix still absorbs Meta’s conversation fee. `whatsappCostMilli` is not populated (`pricingService.ts` header: the slot stays zero until the Meta rate card). The per-turn platform fee stays 0. It is not a place to hide Meta’s fee. Review that subsidy on 31 Mar 2027, or when ten shops are live, whichever comes first. The October price (₹6.99 for 38 replies) is the price to protect. Do not advertise a per-reply figure until N1’s note says the fee and the FX pin are gone on the Lambda database.

## 5. Risks

Shared production database. Local admin on `localhost:3001` and the Lambdas may be the same Postgres. A settings save from a laptop is a production change when they are. `FX_REFRESH_ENABLED` stops a local process from writing the FX rate; it does not stop `PATCH /api/admin/settings`. That is why 13 Nov is a host comparison and 16 Nov is the only day a write is allowed, after the note. Cache makes a wrong row sticky for up to 24 hours in Redis plus 60 seconds in a warm Lambda. The 16 Nov write, if it happens, includes the Redis key delete. No wallet row is part of that write.

Meta fee subsidy. Leaving the fee at 0 is a choice to absorb Meta’s charge. It is safe only while reply volume is dozens per shop, which is the October shape. A ₹222 platform fee is a different, larger charge and is not the subsidy. If the 13 Nov read shows 22200 paise on the Lambda database, every day until 16 Nov is a day of overcharging. Say that to the owner on 13 Nov. Do not “temporarily” set a smaller non-zero fee.

Embedded Signup on a live number. Ibell already receives chats. `vendorSendingNumber.ts` can send without `connectStatus: 'live'`. The connect banner must go away by copy and by a guard, not by completing signup. A market-launch test uses a fresh number. If that test cannot be run because there is no test WABA, market launch slips. Vendor-1 does not.

Razorpay Route. `docs/payments/05-compliance-and-risk.md` D1 is still waiting on Razorpay’s written confirmation. `docs/payments/02-implementation-plan.md` keeps live Route HTTP behind that letter and tells dev to use `RAZORPAY_USE_FAKE_ROUTE` until then. This launch records shop-received UPI and cash. It does not create linked accounts, capture customer payments into Route, or release settlements. If the D1 letter arrives in December, it still waits for a later plan. Building it inside 7–23 Dec is the slip condition in section “Why 23 Dec”.

Known security debt carried past launch. Customer message text is passed through `innerHTML` in `stripHtml` until 16 Dec, when that stops. The JWT stays in `localStorage`. That is accepted for this launch because moving it is an auth project, not a shop-day fix. It is the first item after 6 Jan if launch holds, or the first item after launch if launch slips.

Admin phone is also a shop. `+919790690170` resolves as admin and as Isha Bakers (`roleService.ts` adds `admin` from `AUTH_ADMIN_PHONES` and also attaches the vendor row for that phone). Any new admin screen that prefers `req.user.vendorId` will repeat N2. The products fix is the pattern. The 17 Nov grep is there to catch siblings. Orders and customer queries already prefer the requested shop for an admin. Do not assume a new screen does.

Placeholder tests. `useDashboardStats.test.ts` is six tautologies. They will not catch a regression in the pending count. M4 replaces them. Until 16 Dec, the 27 Nov walk is the test.

## 6. Staffing and what is cut to hit the dates

Assumption: one senior full-stack engineer, and a product owner who writes this plan, walks the shops, closes the five queries with the owner, and does not take a second coding stream. No extra headcount.

The dates hold because the following are cut, not deferred inside the same calendar:

- Everything in the “Explicitly out of this launch” list under M4.
- Self-serve Razorpay wallet checkout. Founder-operated admin recharge covers the first shops. Flag a payments engineer only when the business decides checkout is the next project, which is after 23 Dec.
- A Meta specialist. Flag one only if the fresh-number Embedded Signup test fails and the failure is Meta-side. That flag slips market launch. It does not add a person to the Ibell week.
- Weekend work. It is not in the schedule. Using a Saturday to save a slipped Friday is how the buffer disappears.

The product owner’s own cut: no competitive rewrite, no new pricing model, no broadcast roadmap, no change to markup for Ibell as part of this plan. Markup stays whatever is already on the vendor row. The charge check uses that percent. It does not “correct” it.
