# Support — operating instructions

Phase 1 ships **`StaffCase`** + **`StaffCaseNote`** and **`StaffAuditLog`** (see [DECISIONS.md](../DECISIONS.md) §3). Context uses existing APIs. Wallet: **millirupees**.

---

## Case status machine

```
open ──► waiting ──► resolved
  │         │            │
  └─────────┴────────────┘
       (resolved ──reopen──► open only)
```

| From | To | Who | System note |
|---|---|---|---|
| `open` | `waiting` | Staff | "Status set to waiting by {actor}." |
| `open` | `resolved` | Staff | "Status set to resolved by {actor}." |
| `waiting` | `open` | Staff | "Status set to open by {actor}." |
| `waiting` | `resolved` | Staff | same |
| `resolved` | `open` | Staff Reopen | "Status set to open by {actor}." |

Invalid transition → 409 `invalid_status_transition`.

---

## Scenario 1 — From failed reply to resolution

1. Reliability → **Open case** → `/support/new?vendorId=X&conversationId=Y`.
2. Shop locked; staff subject: "Graph 500 on outbound replies 17 Oct".
3. **Create** → `POST /api/admin/support/cases`.
4. Context card loads wallet, WhatsApp, failure, queries.
5. **Read conversation** → audit `conversation_read` then messages.
6. Note: "Asked vendor to retry; credited ₹50 on ticket WAL-1" (if credit done on Vendors).
7. **Resolve** when vendor confirms customer received reply.

**Postconditions:** `status = resolved`; audit trail complete.

**Rollback:** Reopen case; no auto-reversal of wallet credit.

**Notify:** none v1.

---

## Scenario 2 — Wallet not refilling (vendor report)

1. New case from Vendors or Support list — no conversation id.
2. Context: balance ₹0.00; WhatsApp `live`.
3. Check mock top-up flag on Billing settings — if mock off, vendor needs Razorpay path (vendor app).
4. Note steps; link **Adjust wallet** only if policy allows manual credit.

---

## Scenario 3 — Open customer queries pile-up

1. Context shows 5 open `CustomerQuery` lines.
2. Staff does **not** PATCH queries — vendor must answer in web-vendor.
3. Note: "Vendor has 5 open questions — sent reminder to complete FAQs."

---

## 1. Open a case

**Staff:** `/support/new` or Reliability deep link.

**Body:**

```json
{
  "vendorId": "uuid",
  "subject": "string",
  "conversationId": "uuid optional"
}
```

**Checks:**

- `requireRole('admin')`
- subject 3–140 trimmed
- if `conversationId`: `Conversation.vendorId === vendorId`

**Stored:** case `open`, `openedBy`; audit `case_opened`.

**API sequence**

1. `POST /api/admin/support/cases`
2. `201` → `{ id, ... }`
3. Client navigate `/support/:caseId`

---

## 2. Add note / change status

**Note:** `POST /api/admin/support/cases/:id/notes` `{ "body": "..." }` — 1–2000 chars.

**Status:** `PATCH /api/admin/support/cases/:id` `{ "status": "waiting" }` — append system note + audit `case_status_changed`.

**Preconditions:** case exists.

**Postconditions:** `updatedAt` bumped.

**Rollback:** none — notes append-only.

---

## 3. Read case context

**Parallel fetch:**

| Data | Endpoint / query |
|---|---|
| Wallet, markup | `GET /api/vendors/:id/config` |
| WhatsApp | proposed `GET .../whatsapp-numbers` |
| Last failure | `Message` latest `failed` assistant for vendor |
| Open queries | `GET /api/customer-queries?vendorId=` |

**Error matrix**

| Missing data | Copy |
|---|---|
| No WA row | "This shop has no WhatsApp number yet." |
| No failure | "No failed reply stored for this shop." |
| No queries | "This shop has no open customer questions." |

---

## 4. Read conversation

**Route:** `/support/conversations/:conversationId?caseId=`

**Sequence (engineer — fail closed):**

1. `requireRole('admin')`
2. Load conversation; verify vendor access
3. **Insert audit** `conversation_read` (actor, conversationId, vendorId, timestamp) — **if insert fails, return 500 and do not return messages**
4. `GET` messages via existing service — order `timestamp` ASC

**Display:** `senderType`, `timestamp`, `content`, `contentEn` if set, `status` on assistant rows.

**PII:** phones in header; warn staff — no screenshots to public channels policy (ops handbook).

---

## 5. Vendor-facing support (out of scope)

Build in web-vendor per P0.2 — contact card, diagnostics, links. Does not create `StaffCase`.

---

## Edge cases

| Case | Behavior |
|---|---|
| conversationId wrong vendor | 400 "That conversation is not on this shop." |
| Resolved → Resolved | Control hidden |
| Audit fail | "Could not record this read. The conversation was not opened." |
| Concurrent notes | Both stored by `createdAt` |

---

## Must not

- Send WhatsApp as vendor
- Copy message bodies into case or audit summary
- Use `Admin` table as assignee list
- Build vendor support page in web-admin
