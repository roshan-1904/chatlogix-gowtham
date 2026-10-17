# Support — overview

## Problem statement

Reliability queues show **symptoms**; Support holds **accountability** — a staff-owned case with notes, shop context, and an audited read of customer WhatsApp content. Vendors do not see cases in v1. This reduces duplicate Slack threads and documents what we promised the shop.

**Not** the vendor `/support` page (dead link in web-vendor) — spec remains [VENDOR_PORTAL_ROADMAP.md](../../VENDOR_PORTAL_ROADMAP.md) P0.2.

## Business depth

**Why it exists**

- **Support load:** One case per incident with notes beats ad-hoc DMs.
- **Risk / compliance:** Chat read requires audit (`conversation_read`) — customer PII, multilingual content.
- **Vendor success:** Context card surfaces wallet, WhatsApp, last failure, open `CustomerQuery` without vendor login.

**Personas**

| Persona | Job | KPI |
|---|---|---|
| Ops | Own case to resolution | Cases open > 7d |
| Support | Document calls | Notes per case |
| Founder | Spot repeat offenders | Cases per `vendorId` per month |

**Pipeline tie-in**

- Cases link `conversationId` from failed `Message` / Reliability row.
- Staff **never** send WhatsApp from admin — vendor sends from their tools.
- `CustomerQuery` rows are vendor-owned inbox — admin **lists** open only.

**Decision rules**

| Situation | Act | Wait |
|---|---|---|
| Wallet + failures | Credit on Vendors + note on case | Credit without reason |
| WhatsApp `error` | Ops + vendor Meta fix | Read chat before asking vendor for PII |
| Open queries | Inform vendor to answer in portal | Admin does not answer query |

**Regulatory / ops**

- Notes placeholder: do not paste passwords, tokens, or full card numbers.
- Conversation read blocked if audit write fails (fail closed).
- Turn-audit flag is separate — do not enable for all cases.

## Scope / non-goals

**In scope (Phase 1 — locked):** `StaffCase` + `StaffCaseNote` CRUD, notes, status machine, context card, read-only transcript, **`StaffAuditLog` on every conversation read** (fail closed). See [DECISIONS.md](../DECISIONS.md) §3.

**Out of scope:** vendor-visible cases; email/WhatsApp to vendor from case; answering `CustomerQuery`; SLA timers; assignee field; role split beyond admin allowlist.

## Data model (Phase 1)

**`StaffCase`**

| Field | Notes |
|---|---|
| id | uuid |
| vendorId | FK Vendor |
| subject | 3–140 chars |
| status | `open`, `waiting`, `resolved` |
| conversationId? | FK Conversation |
| openedBy | admin user id |
| createdAt, updatedAt | |

**`StaffCaseNote`**

| Field | Notes |
|---|---|
| id, caseId, authorId, body, createdAt | append-only |

## Already built / API only / net new

| Job | State | Evidence |
|---|---|---|
| Cases | **Net new (P1)** | `StaffCase` + `StaffCaseNote` per [DECISIONS.md](../DECISIONS.md) §3 |
| Context wallet | **API** | `GET /api/vendors/:id/config` |
| WhatsApp | **Gap** | proposed vendor whatsapp GET |
| Last failure | **Data** | query latest `Message` failed assistant |
| Open queries | **API** | `GET /api/customer-queries?vendorId=` default `status=open` |
| Messages | **API** | `GET /api/conversations/:id/messages` — admin allowed |
| Audit on read | **Net new (P1)** | `StaffAuditLog` action `conversation_read` — required before messages returned |

**CustomerQuery fields for context:** `questionEn`, `category`, `hitCount`, `lastSeenAt`, `status`.

## Dependencies

- Vendors (wallet link), Reliability (open case), Controls (audit).

## Success criteria

- Case survives refresh; notes append-only ordered by time.
- Status transitions enforced.
- `conversationId` must match case `vendorId`.
- Audit row on every successful transcript load.

## Retention

Per [DECISIONS.md](../DECISIONS.md) §3: closed cases and notes **1 year after `resolved`**; audit rows **1 year** from `createdAt`. Purge job implementation is deferred; policy is locked for ops copy.

## Risks and open questions

| Risk | Mitigation |
|---|---|
| Staff paste secrets in notes | Placeholder warning |
| Two staff on one case | Last write wins on status; notes both kept |

| Deferred | |
|---|---|
| Assignee field | Phase 2 |
| Vendor opens case | New requirement |
