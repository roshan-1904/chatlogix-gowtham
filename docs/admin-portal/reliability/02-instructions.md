# Reliability — operating instructions

Read-only triage. Staff **do not** mutate `Message.status`, `aiPaused`, or orders from this module.

Money display: order totals **paise**; wallet context **milli**. [README](../README.md).

---

## Scenario A — WhatsApp Graph 500 burst

**Preconditions:** Multiple shops; `failureReason` contains HTTP or Graph hints.

**Steps**

1. Open `/reliability`; note API error card — may still be low (Lambdas separate).
2. Failed queue — filter last 24h; sort time DESC.
3. If pattern is platform-wide → internal incident channel; **wait** on per-shop markup changes.
4. Per shop with wallet exhaustion mixed in → Vendors recharge after confirming balance.
5. Open Support case from row (`Open case` → `/support/new?vendorId&conversationId`).
6. **Postconditions:** Case `open`; vendor may still see failed status in their app until next successful send.

**Rollback:** N/A on read. Do not replay SQS from admin UI.

**Notify:** Vendor optional — out of scope v1.

---

## Scenario B — Shop paused AI, customer angry

**Preconditions:** Vendor enabled handoff (`humanHandoffService.ts`).

**Steps**

1. Paused queue — find `Conversation.aiPaused = true`.
2. Read hint: inbound stored; **no AI reply and no wallet template**.
3. Link vendor detail — ask vendor to resume AI in web-vendor.
4. Optional: Support case + audited chat read.

**Do not** toggle `aiPaused` from admin.

---

## Scenario C — Stuck pending order

**Preconditions:** Order `pending`, `updatedAt` > 24h ago.

**Steps**

1. Stuck orders queue — note `orderNumber`, shop, total (paise → rupees).
2. Open Controls look-inside Orders tab or Support context.
3. Contact vendor to advance status — admin cannot edit order.
4. Check `OrderAlert` sub-table on same screen for `resolved = false`.

---

## Queue 1 — Failed customer replies

**Staff filters:** shop search; time 24h | 7d | 30d (default 24h).

**System query (**proposed** `GET /api/admin/reliability/failed-messages?from&to&vendorId&limit=50&cursor=`):**

- `Message` WHERE `status = 'failed'` AND (`senderType = 'assistant'` OR delivery failure path on customer row per webhook)
- JOIN `Conversation`, `Vendor`, `Customer`
- ORDER BY `Message.timestamp` DESC
- Use time bound on `timestamp` for partition pruning where possible

**Columns:** time, `Vendor.businessName`, `Customer.phone`, content preview 80 chars, `failureReason`, actions.

**User vs internal errors**

| User-visible | Internal |
|---|---|
| "No failed replies in this range." | Empty query OK |
| "No reason recorded." | `failureReason` null |
| List 500 | Log Prisma timeout — reduce range |

---

## Queue 2 — Paused AI

**Query:** `Conversation.aiPaused = true`; join vendor + customer phone; sort `updatedAt` DESC.

**API (**proposed**):** `GET /api/admin/reliability/paused-conversations`

---

## Queue 3 — Wallet-blocked turns

**Phase 1 (locked):** persisted **`WalletBlockEvent`** rows — see [DECISIONS.md](../DECISIONS.md) #2. Reliability does **not** use “honest empty because we don’t store” once the table and writer ship.

**Writer:** `pipeline.ts` when the billing wallet check blocks **before** the LLM (same gate as `WALLET_EMPTY_TEMPLATE` in [INCOMING_RESPONSE_GENERATOR_FLOW.md](../../INCOMING_RESPONSE_GENERATOR_FLOW.md)) — **one row per blocked turn**.

**Proposed schema `WalletBlockEvent`:**

| Field | Type |
|---|---|
| id | uuid |
| vendorId | string |
| conversationId | string |
| reason | `insufficient_balance` \| `trial_expired` |
| createdAt | datetime (timestamp) |
| messageId | string, optional — inbound turn if known |
| templateSent | boolean, optional — wallet-empty template dispatched |
| customerPhone | string, optional — denormalized for list UI |

**Staff filters:** shop search; time 24h \| 7d \| 30d (default 24h).

**System query (**proposed** `GET /api/admin/reliability/wallet-blocks?from&to&vendorId&limit=50&cursor=`):**

- `WalletBlockEvent` in time range; JOIN `Conversation`, `Vendor`, `Customer` (or phone on event)
- ORDER BY `createdAt` DESC

**Columns:** time, shop, customer phone, `reason`, optional template-sent badge, actions.

**Do not** infer wallet blocks from `walletBalanceMilli` alone or treat low balance as this queue.

**Example:** Balance ₹50.00 (`50000` milli) can still block if worst-case turn > ₹50.

**Retention:** **1 year** from `createdAt` ([DECISIONS.md](../DECISIONS.md) #2 / #3 — aligned with staff audit window). Purge job deferred to schema PR.

---

## Queue 4 — Stuck orders + alerts

**Stuck filter:** `status IN ('pending','confirmed')` AND `updatedAt < now() - interval '24 hours'`.

**Alerts:** `OrderAlert` WHERE `resolved = false`; join order + vendor.

**API (**proposed**):** `GET /api/admin/reliability/stuck-orders`, `GET /api/admin/reliability/order-alerts`

**Link:** order → `/vendors/:vendorId/shop?tab=orders`

**Do not** expose button to invoke `orderRecovery` Lambda — sweep has no order id param.

---

## Server-error summary card

**Call:** `GET /api/errors/stats` — `requireRole('admin')`.

**Display only:** `totalErrors`, `currentErrorRate`, `uptime`, top key from `errorCounts`.

**Fixed paragraph:** API process only; resets on restart; list five Lambda names for CloudWatch.

**Engineer raw fields** (not on UI): `memoryUsage`, full `vendorErrorCounts` maps.

| Failure | User-visible |
|---|---|
| Stats endpoint down | "Could not load the API error summary." — other queues still load |

---

## Status machines (reference)

**Message.status** (assistant outbound): includes `pending`, `sent`, `delivered`, `read`, `failed` — staff queue only **failed**.

**Order.status:** stuck queue uses `pending`, `confirmed` only.

**OrderAlert:** `resolved` boolean — no admin write in v1.

---

## Engineer implementation sequence

1. Routes under `/api/admin/reliability/*` with admin auth.
2. Frontend `/reliability` tabbed or stacked queues; rename sidebar Logs → Reliability; redirect `/logs`.
3. Deep link `?queue=failed&vendorId=` for Controls alert.
4. Add `WalletBlockEvent` migration + pipeline writer (Phase 1 per decision #2; separate PR from list API OK).
5. Reliability row actions: Open shop, Open case.

---

## Must not

- Log viewer / CloudWatch embed.
- Use error stats as failed message list.
- Mark wallet template send as `failed`.
- `MessageProcessing.status = failed` driver without writer.
- Replay SQS or restart Lambda from UI.
