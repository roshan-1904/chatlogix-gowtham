# 3. Pending orders

> **PO review 2026-11-13** · commit `8f1a0e5` · **Status: Not started** · Competitive role: Parity · Priority: Phase 2, order 3 (unchanged)
> Verified: the date-scoped group (`backend/src/services/dashboardStatsService.ts:145-146`); the literal `pending` match (`:473`); the tile link (`frontend_v2/apps/web-vendor/src/pages/Dashboard.tsx:170`); `Orders.tsx:45` reads only `orderListFilters`; `orderNeedsAttention` (`utils/orderPayment.ts:143-148`). Missing: all seven steps. Changed in this review: section 3 notes that the paused-chat count beside it is already unscoped.

## 1. Phase and why this task is in it

Phase 2. Ibell can take the next message only after the owner can see the orders that still need a person. The home tile is the first number they read. Revenue can stay tied to the date chip. The pending count cannot.

## 2. Problem and user impact

The dashboard tile is labeled "Pending orders" and the 12 Nov walk showed 0 while the orders page still had 3 orders that needed collection. The owner looks at the home screen, sees nothing to do, and leaves money uncollected.

## 3. Current behavior

`fetchDashboardStatsFromDB` in `backend/src/services/dashboardStatsService.ts` builds `order_groupBy` with:

- `vendorId`
- `status: { not: 'cancelled' }`
- `createdAt` inside `dateRange`

`orders.pending` is then `statusBreakdown.find(status === 'pending')`. Only the literal status `pending` counts, and only inside the selected period. `confirmed`, `preparing`, `ready`, `out_for_delivery`, and `awaiting_payment` are absent even when they are open work. `OrderStatus` in `backend/prisma/schema.prisma` is `pending`, `awaiting_payment`, `confirmed`, `preparing`, `ready`, `out_for_delivery`, `delivered`, `cancelled`.

`orders.total` is the sum of that same date-scoped group. Revenue uses a separate aggregate that is also date-scoped (`order_aggregate_revenue`). `Dashboard.tsx` shows revenue with `In period: ${stats.dateRange.label}` and pending with no period caption. The tile click is `navigate('/orders?status=pending')`.

`getDashboardStats` caches the payload for 5 seconds (`shortcache`) and 30 seconds (`realtime`) under a key that includes the date range. A code change is visible after that TTL. Do not flush Redis.

`frontend_v2/apps/web-vendor/src/pages/Orders.tsx` does not read `?status=pending`. Filters come from `localStorage` key `orderListFilters`. The orders page "need attention" count uses `orderNeedsAttention` in `frontend_v2/apps/web-vendor/src/utils/orderPayment.ts`, which is true for `pending`, `awaiting_payment`, and a payment-initiated badge. That helper ignores `confirmed`, `preparing`, `ready`, and `out_for_delivery`. It is a different definition from this task. The dashboard also copies a date-scoped pending count into `buildNeedsAttentionItems` (`href: '/orders?status=pending'`). The paused-chat count in that same panel is already unscoped: the service loads conversations with `where: { vendorId }` and counts `aiPaused`. Pending orders are the one needs-attention number tied to the date chip.

## 4. Step-by-step implementation

1. Define open work in one predicate, used by the service and by a unit test:
   - `status` is not `cancelled` and not `delivered`.
   - The order is not a shell: `totalAmount` is a positive paise integer, and `items` has at least one line. `items` is JSON. Treat a missing value, an empty array, and a non-array as zero items. Match lines the way `parseOrderItems` in `backend/src/conversation/cart/snapshot.ts` already does if that helper accepts this JSON shape. If it does not, count `Array.isArray(items) ? items.length : 0` and say so in the test.
   - `createdAt` is not part of the predicate.
2. In `fetchDashboardStatsFromDB`, set `orders.pending` from that predicate for this `vendorId` only. A `count` cannot express "items JSON is non-empty" in one Prisma filter if the column is JSON. Load the candidate rows (`id`, `status`, `totalAmount`, `items`) with `status` not in `cancelled` or `delivered` and `totalAmount` greater than 0, then apply the items check in process. Keep the query bounded by vendor. Do not add a `createdAt` filter.
3. Leave the date-scoped `order_groupBy` in place for `statusBreakdown` and for `orders.total` if those still describe the period. Leave `order_aggregate_revenue` and the revenue block date-scoped. The tile caption for revenue already includes `stats.dateRange.label`.
4. If a period-scoped pending count is still useful, put it in a caption that includes `dateRange.label`. The tile value itself is the unscoped open-work count.
5. Point the tile and `buildNeedsAttentionItems` at a list that uses the same predicate. `Orders.tsx` must honor a query such as `?work=open` (the exact name is yours) on first render, ahead of the saved `orderListFilters` status chip. Filtering with `status=pending` shows only one enum value and will not match the tile. The orders page date preset must not hide these rows when that query is set.
6. Cache: the existing 30-second key still includes the date range, so each range stores the same pending number next to different revenue. That is acceptable. After deploy, the old number can linger for 30 seconds. Do not delete `dashboard:stats:*` by hand.
7. Tests:
   - Backend: two orders outside the dashboard date range, one `confirmed` with items and a positive `totalAmount`, one `cancelled`, one with `totalAmount` 0. `orders.pending` is 1. The revenue aggregate's `where` still contains `createdAt`.
   - Changing the preset changes `revenue.total` in the fixture and leaves `orders.pending` unchanged.
   - Frontend: `buildNeedsAttentionItems` pending href matches the list query the orders page reads.

`orders.pending` is a count of orders, not money. `totalAmount` stays paise. Do not run it through millirupee helpers.

No conversation-pipeline edit and no pricing edit.

## 5. What not to change

- Revenue, today's revenue, and the date chip's effect on those figures.
- Wallet balances and `chargeVendor`.
- `orderNeedsAttention` on the orders page, unless you deliberately switch that card to the same predicate and update its tests. The home tile is the one that must match open work. Leaving the orders-page card on the narrower helper is allowed if the tile's own list uses the new predicate.
- Shipping, payment recording, and order status transitions.
- Redis keys other than waiting out the 30-second dashboard cache.

## 6. Acceptance checks

- On Ibell at `http://127.0.0.1:3000`, with the default date range, the Pending orders tile equals the list of orders that are still open work. The ₹0 empty order and the cancelled order are outside that number.
- Changing the date chip leaves the pending number the same and can change revenue. The revenue caption still names `dateRange.label`.
- The tile click opens that same set. A list filtered to status `pending` only, or to the saved date preset, is a failed check when those filters drop a `confirmed` order that the tile counted.
- Negative case: vendor A's dashboard does not include vendor B's orders. The query is scoped by `vendorId` from the token.
- Negative case: a `delivered` order with items and a positive total is not in the pending number.

## 7. Dependencies

Task 2. The pending query is per vendor. It is safe to build against Ibell once admin catalog isolation is in, so the walk is looking at the right shop.
