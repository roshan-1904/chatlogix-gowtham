# Launch phases

> **PO review 2026-11-13** · commit `8f1a0e5` · **13 tasks: 12 Not started, 1 Partial (task 9)** · 5 Phase 4 notes waiting by design
> No task code has landed. The last code commit is 2 Nov 2026 and these docs describe the 12 Nov walk. Every current-behavior section was checked against the code. Statuses, gaps found, the market change, and three open decisions are in [`docs/product-review/2026-11-13-po-review.md`](../product-review/2026-11-13-po-review.md).

The phase documents in this folder are the plan to follow. [`docs/LAUNCH_IMPLEMENTATION_PLAN.md`](../LAUNCH_IMPLEMENTATION_PLAN.md) keeps the earlier date-based sequence. Product decisions stay in [`docs/PORTAL_IMPROVEMENT_AND_COMPETITIVE_REVIEW.md`](../PORTAL_IMPROVEMENT_AND_COMPETITIVE_REVIEW.md).

A phase starts when the previous phase's exit check passes. There is no calendar in this folder.

Money: wallet amounts are millirupees (1 rupee = 1000 milli). Order and product amounts are paise. `backend/src/services/pricing/pricingService.ts` `chargeVendor` is the only writer of `Vendor.walletBalanceMilli`. These plans never edit a balance, a `CreditUsage` row, or a `WalletTransaction`.

Checks:

- Vendor portal: `http://127.0.0.1:3000`. `localhost:3000` is a different app.
- Admin: `localhost:3001`.

Vendor-1 is Ibell Creations, the shop that already takes WhatsApp orders. The admin phone `+919790690170` is also Isha Bakers (`backend/src/services/roleService.ts` `resolveRolesForPhone` adds `admin` from `AUTH_ADMIN_PHONES` and attaches that phone's vendor row).

## Phase 1 — Safe to take the next message

**Outcome.** The next customer message is charged near real cost, and an admin inspecting Ibell sees Ibell's catalog.

| Order | Task | Doc | Status |
| --- | --- | --- | --- |
| 1 | Read the Lambda `PlatformSettings` row. Correct four fields only when that row is the one audited with the admin screen. | [01-billing-safety.md](01-billing-safety.md) | Not started |
| 2 | Admin catalog reads and writes use the shop id in the request. A vendor uses only the token shop. | [02-catalog-tenant-isolation.md](02-catalog-tenant-isolation.md) | Not started |

**Exit.** A reply recomputed with `computeChargeMilli` is under ₹1 at the shop's existing markup. Signed in as `+919790690170`, Ibell's catalog tab shows Ibell's brownie and cookie products (on the order of 8), and the 30-product bakery list stays on Isha Bakers. A vendor token for shop A cannot read shop B.

**Stays manual.** No wallet top-up, no Embedded Signup, no order handling. Task 1 is a settings read and, only on a matching host, four fields plus the Redis key `platform:settings`.

## Phase 2 — Ibell Creations can run the shop

**Outcome.** The owner can see open work, record a payment that names this shop, take a thread, and get an order-status answer from the order that exists.

| Order | Task | Doc | Status |
| --- | --- | --- | --- |
| 3 | Pending orders count open work and ignore the dashboard date filter. Revenue stays period-scoped. | [03-pending-orders.md](03-pending-orders.md) | Not started |
| 4 | Cancelled and empty orders stop offering payment and shipment. | [04-cancelled-and-empty-orders.md](04-cancelled-and-empty-orders.md) | Not started |
| 5 | A customer is shown as a name or a phone. | [05-customer-names.md](05-customer-names.md) | Not started |
| 6 | Record UPI or cash received. Payment text uses this shop's saved payee, VPA, and business name. | [06-record-payment.md](06-record-payment.md) | Not started |
| 7 | WhatsApp status for a number that already has chats. Ibell stays off Embedded Signup. | [07-whatsapp-status.md](07-whatsapp-status.md) | Not started |
| 8 | One control pauses the assistant and focuses the composer. | [08-handoff.md](08-handoff.md) | Not started |
| 9 | Order-status regression test. The product owner closes the five open queries with the shop. | [09-order-status-answers.md](09-order-status-answers.md) | Partial |

**Exit.** Ibell can answer from its catalog, take the thread, see real open orders, and record payment. Packing, delivery, and adding wallet money stay manual.

**Stays manual.** Mark UPI or cash after the customer pays the shop's own VPA. The owner types the VPA in settings when the stored one is wrong. Pack and deliver. Ask the founder for wallet money. Leave the live number on the legacy sending path.

## Phase 3 — A new shop can do the same

**Outcome.** A new one-owner shop can sign up, see its own catalog in admin, pause and reply, mark a test order received, and take a reply under ₹1 with platform fee 0.

| Order | Task | Doc | Status |
| --- | --- | --- | --- |
| 10 | Signup lands approved. Approve or reject only a shop already in `pending_approval`. | [10-shop-approval.md](10-shop-approval.md) | Not started |
| 11 | Per-vendor quick replies. One tap fills the composer. | [11-quick-replies.md](11-quick-replies.md) | Not started |
| 12 | The owner sees why replies stopped when the wallet cannot cover a turn. | [12-low-balance.md](12-low-balance.md) | Not started |
| 13 | Five hardening steps in one change: HTML strip, pending-count tests, date alert, billing confirm, mock top-up fallback. | [13-hardening.md](13-hardening.md) | Not started |

**Exit.** A new test shop completes that path. Ibell's live number is not used for Embedded Signup. A reply on the test shop is under ₹1 with platform fee 0 in the charge breakdown. Mock top-up stays off.

**Stays manual.** UPI reconciliation, packing, delivery, and adding wallet money. The founder adds wallet money with admin recharge (`RechargeWalletCard` in `frontend_v2/apps/web-admin/src/components/vendors/VendorDetailPanel.tsx`). Self-serve Razorpay checkout is a later project.

## Phase 4 — After the wallet price is trusted

Short notes. They are reasons to wait, and they are build specs for nothing.

| Note | Doc |
| --- | --- |
| WhatsApp catalog cards. First in line when this phase opens | [phase-4/whatsapp-catalog-cards.md](phase-4/whatsapp-catalog-cards.md) |
| Utility templates | [phase-4/utility-templates.md](phase-4/utility-templates.md) |
| A second staff user | [phase-4/second-staff-user.md](phase-4/second-staff-user.md) |
| Reorder nudges | [phase-4/reorder-nudges.md](phase-4/reorder-nudges.md) |
| CSAT | [phase-4/csat.md](phase-4/csat.md) |

## Will not build

These do not get a task document: broadcasts, click-to-WhatsApp ads, Shopify or WooCommerce sync, an omnichannel inbox, AI voice calls, and seat pricing.

Also out of this launch, and already refused inside the task docs: live Razorpay Route (D1 in [`docs/payments/05-compliance-and-risk.md`](../payments/05-compliance-and-risk.md) is still waiting on Razorpay's written confirmation; `RAZORPAY_USE_FAKE_ROUTE` stays), Shiprocket, a `WalletBlockEvent` migration, and moving the JWT out of `localStorage`.

## Later cleanup

Polish from the portal review, with no task document: the admin sidebar emoji treatment, date format, rupee format, a raw `/billing` link, the Pro plan label, the wallet balance shown three times on the vendor home, and the order number on the home screen (`RecentOrdersWidget.tsx` prints `Order #` and the first 8 characters of the row id, while the orders list prints the order number). Do that after Phase 3's exit check, as one visual pass, when a shop day is already trustworthy.
