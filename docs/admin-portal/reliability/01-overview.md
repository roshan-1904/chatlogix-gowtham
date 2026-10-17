# Reliability — overview

## Problem statement

When customers stop getting answers, vendors churn and Meta quality scores suffer. Production traffic runs on **five Lambdas** writing to Postgres — not on the Express API process. Reliability gives staff a **database-backed triage desk**: failed outbound replies, paused AI, wallet blocks, stuck orders, plus a honest caveat about API-only error counters.

## Business depth

**Why it exists**

- **Vendor success:** Fast detection of `Message.status = failed` reduces perceived "bot dead" time.
- **Support load:** Queues with deep links to Vendors/Support cut Slack firefighting.
- **Cost control:** Wallet-empty skips stop debits but still harm CX — surface separately from failures.
- **Risk:** Misusing `GET /api/errors/stats` as truth causes false "all clear" after API restart while Lambdas fail.

**Personas**

| Persona | KPI | Definition |
|---|---|---|
| Ops | Failed reply MTTA | Time from `Message.timestamp` to case opened |
| Ops | Paused chat backlog | `COUNT(Conversation WHERE aiPaused)` |
| Engineering | API error rate | `currentErrorRate` — **API only**, 5-minute window |

**Pipeline tie-in** ([INCOMING_RESPONSE_GENERATOR_FLOW.md](../../INCOMING_RESPONSE_GENERATOR_FLOW.md))

- Reply generation: `chatlogix-incoming-response-generator` → `pipeline.ts`.
- Send failures: `responseProcessor.ts` / dispatcher Lambda → `markAssistantMessageFailed`.
- Wallet gate: `canProcessMessage` → template `WALLET_EMPTY_TEMPLATE` — **persist `WalletBlockEvent`** per [DECISIONS.md](../DECISIONS.md) #2 before LLM (see `pipeline.ts`).
- Paused: `Conversation.aiPaused` — inbound stored, no model call.

**Decision rules**

| Signal | Act | Wait |
|---|---|---|
| Single failed reply | Check `failureReason`; WhatsApp outage vs wallet | Panic change markup |
| 3+ failures / 24h | Controls `failing_replies` alert; open Support case | — |
| Paused chat | Vendor must resume in web-vendor | Staff cannot clear flag here |
| Stuck `pending` order 24h+ | Nudge vendor; read order in look-inside | Do not call recovery Lambda manually from UI |

## Scope / non-goals

**In scope:** read queues; `/logs` → `/reliability` redirect; Lambda names on error card.

**Out of scope:** CloudWatch UI; SQS replay; wallet credit; vendor help page; `MessageProcessing.status` list until writers exist.

## Definitions

| Term | Model / field |
|---|---|
| Failed reply | `Message`: `senderType = assistant`, `status = failed`, `failureReason` |
| Paused chat | `Conversation.aiPaused = true` |
| Wallet block | `WalletBlockEvent` (Phase 1): `reason` from billing guard (`insufficient_balance` / `trial_expired`); not `Message.failed` |
| Stuck order | `Order.status` in `pending`, `confirmed`; `updatedAt` < now − 24h |
| Order alert | `OrderAlert.resolved = false` |

## Already built / API only / net new

| Job | State | Evidence |
|---|---|---|
| Logs stub | **Built stub** | `App.tsx` |
| Failed messages in DB | **Data** | `responseProcessor.ts`, `webhookEventProcessor.ts` |
| Paused count | **Data** | `Conversation.aiPaused`; vendor `dashboard-stats` |
| Wallet blocks | **Net new** | `WalletBlockEvent` + pipeline writer (decision #2); list via admin API |
| Stuck orders | **Data** | `Order` + `orderRecoveryService.ts` Lambda sweep |
| `OrderAlert` | **Data** | schema |
| Admin list APIs | **Proposed** | `GET /api/admin/reliability/*` |
| API error stats | **API only** | `GET /api/errors/stats` — in-memory |

**Lambdas (name only on card):** webhook-handler, incoming-response-generator, whatsapp-response-dispatcher, media-fetcher, order-recovery.

**Indexes to use**

- `Message`: `idx_message_conversation_timestamp` — filter by time + join conversation for vendor
- `Conversation`: `idx_conversation_vendor_updated` for paused list
- `Order`: `idx_order_vendor_status` + `updatedAt` filter

## Dependencies

- Vendors for shop links and wallet context.
- Support for "Open case" from failed row.
- Controls for `failing_replies` alert.

## Success criteria

- Failed assistant message appears within one list refresh after DB update.
- Wallet blocked queue lists persisted `WalletBlockEvent` rows in range; empty means no blocks, not missing storage.
- `/logs` redirects to `/reliability`.
- Error card always mentions Lambda + restart caveat.

## Risks and open questions

| Risk | Mitigation |
|---|---|
| Batch SQS redelivery duplicates sends | Document in engineering runbook; not fixed in admin UI |
| Delivery failure on customer message | Show `senderType` in queue |

| Open question | |
|---|---|
| Persist wallet blocks to `CreditUsage`? | **No** — not a charge |
| Surface `NotificationHistory.failed`? | Phase 2 queue |
