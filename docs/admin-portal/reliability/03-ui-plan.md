# Reliability — UI plan

Replace **Logs** sidebar label with **Reliability** → `/reliability`. Keep `/logs` → redirect `/reliability`.

**Phase 1:** Four DB queues + API error card — including **wallet blocked** from `WalletBlockEvent` ([DECISIONS.md](../DECISIONS.md) #2). **Phase 2:** `NotificationHistory.failed` queue.

Reuse: Vendors table styling, red error box, `Badge` for severity on order alerts.

---

## Route

| Screen | Route |
|---|---|
| Reliability hub | `/reliability` |

**Query params:** `queue=failed|paused|wallet|orders`, `vendorId`, `from`, `to` (failed queue).

---

## Layout (wide)

```
Reliability
Customer-facing issues from our database. This is not a log search tool.

┌─ API process errors (read-only) ─────────────────────────────────┐
│ Total since restart: 12    Last 5 min: 2    Uptime: 4h           │
│ Top code: VALIDATION_ERROR                                       │
│ These counts are for the API process only… [Lambda names list]   │
└──────────────────────────────────────────────────────────────────┘

[ Failed replies ] [ Paused AI ] [ Wallet blocks ] [ Stuck orders ]  ← tabs or anchor sections

── Failed replies ──────────────────────────────────────────────────
Shop [ search ]     Range [ Last 24 hours ▼ ]

Time          Shop           Customer      Preview           Reason
17 Oct 10:14  Annapoorna     98xxxxxx      We're unable…     Graph 500
              [ Open shop ] [ Open case ]

── Paused AI ───────────────────────────────────────────────────────
...

── Wallet blocked ──────────────────────────────────────────────────
Shop [ search ]     Range [ Last 24 hours ▼ ]

Time          Shop           Customer      Reason              Template
17 Oct 10:14  Annapoorna     98xxxxxx      insufficient_balance  Sent
              [ Open shop ] [ Open case ]

── Stuck orders ────────────────────────────────────────────────────
Order #     Shop      Status    Total      Still since
ORD-123     …         pending   ₹50.00     17 Oct

── Open order alerts ───────────────────────────────────────────────
Severity  Type     Message
```

**User goal per tab**

| Tab | Goal |
|---|---|
| Failed | Find undelivered AI replies |
| Paused | Find chats waiting on vendor |
| Wallet | See persisted wallet-blocked turns |
| Stuck | Find orders needing vendor action |

---

## Failed replies table

| Column | Field |
|---|---|
| Time | `Message.timestamp` |
| Shop | `Vendor.businessName` |
| Customer | `Customer.phone` |
| Preview | `Message.content` truncate |
| Reason | `Message.failureReason` |
| Sender | `Message.senderType` badge |

**Default sort:** time DESC. **Page size:** 50.

**Actions:** secondary "Open shop" → `/vendors/:id`; primary "Open case" → `/support/new?vendorId=&conversationId=`.

**Filters:** vendorId from URL; range 24h/7d/30d.

**States**

| State | Copy |
|---|---|
| Loading | "Loading failed replies…" |
| Empty | "No failed replies in this range." |
| Error | "Could not load failed replies." |

---

## Paused AI table

| Column | Field |
|---|---|
| Updated | `Conversation.updatedAt` |
| Shop | vendor name |
| Customer | phone |
| Hint | static: "Assistant will not reply until the vendor resumes." |

**Actions:** "Open shop" only.

---

## Wallet blocked table

| Column | Field |
|---|---|
| Time | `WalletBlockEvent.createdAt` |
| Shop | `Vendor.businessName` |
| Customer | `Customer.phone` or event denorm |
| Reason | `WalletBlockEvent.reason` |
| Template | optional badge: template sent vs skipped |

**Default sort:** time DESC. **Page size:** 50.

**Filters:** vendorId from URL; range 24h/7d/30d (same as failed queue).

**Actions:** secondary "Open shop" → `/vendors/:id`; primary "Open case" → `/support/new?vendorId=&conversationId=`.

**States**

| State | Copy |
|---|---|
| Loading | "Loading wallet blocks…" |
| Empty | "No wallet blocks in this range." |
| Error | "Could not load wallet blocks." |

**Do not** show pre-migration “not stored” copy once decision #2 writer is live. If API ships before migration, show error state — not a fake zero.

---

## Stuck orders

| Column | Field |
|---|---|
| Order # | `Order.orderNumber` |
| Shop | vendor |
| Status | `Order.status` |
| Total | `totalAmount` paise |
| Still since | `updatedAt` |

**Alerts sub-table:** `OrderAlert.severity`, `type`, `message`, `createdAt`.

---

## API error card

Always visible top or sticky summary. No chart. No log lines.

**A11y:** `aria-live="polite"` on error rate when refreshed.

---

## Responsive

Below `lg`: tabs become vertical `select` or accordion; tables → stacked cards (time, shop, reason, actions full width).

---

## Sidebar final position

```
Dashboard
Vendors
Usage
Reliability    ← was Logs
Support
Controls
Billing
Templates
```
