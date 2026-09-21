# Turn audit logging (per-vendor, inline CloudWatch)

**Status:** Implemented (per-vendor `conversation_turn_audit` flag, admin API + web-admin toggle, pipeline checkpoints).  
**Goal:** When debugging a specific vendor, admins enable verbose **turn audit** logs; each customer message produces a correlated trail in existing Lambda log groups. No separate log group, no S3 offload, **no global env toggle** — only `Vendor.featureFlags` controlled from **web-admin**.

---

## 1. Product behavior

| Requirement | Decision |
|-------------|----------|
| Where logs go | Default Lambda groups: `/aws/lambda/chatlogix-webhook-handler`, `chatlogix-incoming-response-generator`, `chatlogix-whatsapp-response-dispatcher` |
| Who can turn it on | **Admin only** (same auth as markup / wallet recharge) |
| Scope | **Per vendor** — other vendors stay at normal log volume |
| Global env flag | **None** — do not add `TURN_AUDIT_LOGS_ENABLED`; if flag is off in DB, no audit lines |
| Correlation key | `traceId` = inbound `whatsappMessageId` (`wamid`) on every audit line |
| Default | Flag absent or not `true` → **no audit logs** (fail-closed, same as `isVendorFlagOn`) |

**Admin workflow:** Vendors page → select vendor → toggle “Turn audit logging” → wait up to ~30s (flag cache TTL) → reproduce issue → CloudWatch Logs Insights on processor (and webhook/dispatcher for bookends) → filter by `vendorId` / `traceId` → disable toggle.

---

## 2. Feature flag storage

Reuse existing column and reader:

- **Column:** `Vendor.featureFlags` (`Json?`), shape `{ [key: string]: boolean }`
- **Key:** `conversation_turn_audit` (boolean; only `true` enables logging)
- **Reader:** `isVendorFlagOn(vendorId, 'conversation_turn_audit')` in `backend/src/config/featureFlags.ts` (30s in-memory cache per vendor+flag)

**Cache invalidation (required in same change):**

- Add `invalidateVendorFlagCache(vendorId, flag)` — delete one cache entry on admin PATCH so toggles take effect immediately on the API instance; Lambdas still up to 30s unless we also shorten TTL (keep 30s, document in UI).

**No migration** unless we want a partial index later (not needed for v1).

---

## 3. Log envelope (Pino → CloudWatch)

Single shape on every audit line for Insights:

```json
{
  "turnAudit": true,
  "schema": "turn_audit_v1",
  "checkpoint": "llm1_response",
  "traceId": "wamid.xxx",
  "vendorId": "uuid",
  "conversationId": "uuid",
  "service": "incoming-response-generator",
  "payload": { }
}
```

- **Module:** `backend/src/observability/turnAuditLog.ts`
  - `export const TURN_AUDIT_FLAG = 'conversation_turn_audit'`
  - `isTurnAuditEnabled(vendorId): Promise<boolean>` → `isVendorFlagOn(...)`
  - `logTurnAudit(enabled: boolean, ctx, checkpoint, payload)` — sync no-op if `!enabled`; else `logger.info({ turnAudit: true, ... }, 'turn_audit')`
- Callers resolve `enabled` **once per invocation** (per webhook vendor batch, per SQS message, per response job) and pass `boolean` into hot path to avoid repeated DB reads.

**Size limit:** CloudWatch max **256 KB** per event. Strategy for v1 (still “inline”):

- Always log full: `mergedContent`, LLM-1/2 JSON, `finalText`, response queue body, WhatsApp send summary.
- Hot set / catalog: log full `catalogSlice` when reasonable; if serialized size &gt; ~200 KB, split into `llm1_prompt_part_N` or truncate with `truncated: true`, `originalBytes`, `keptBytes` (document in runbook).

---

## 4. Checkpoints (maps to analysis questions)

| # | `checkpoint` | Lambda / code | What’s in `payload` |
|---|----------------|---------------|---------------------|
| 1 | `webhook_batch` | `processWebhookEventBatch` | `events[]` (parsed `ParsedWAEvent` for this vendor only) |
| 1b | `webhook_message_created` | `processMessageCreated` | Full `MessageCreatedEvent`, persisted `messageId`, `conversationId` |
| 1c | `text_queue_enqueued` | `enqueueForAI` | Exact SQS `TextMessage` body |
| 2 | `context_plan` | `pipeline.ts` after `resolveCatalogContextForLlm1` | `plan`, `catalogSlice`, `promptCatalogSlice` sizes + content, `mergedContent`, coalesced ids |
| 2 | `llm1_prompt` | `llm1.ts` | `systemPrompt`, `userContent` (= merged), `model`, `sourceMessageType` |
| 3 | `llm1_response` | `llm1.ts` | Parsed result after `validateProductIds` (ops, draftReply, intent, tokens) |
| 3 | `llm2_prompt` | `llm2.ts` | Prompt string when LLM-2 runs |
| 3 | `llm2_response` | `llm2.ts` | `{ finalReply }` or `{ skipped: true }` |
| 4 | `cart_apply` | `pipeline.ts` after `apply` | `normalizedOps`, `mutated`, `rejectedOps`, `snapshot` (cart summary), `postSalesOutcome`, reply branch name |
| 4 | `reply_selected` | `pipeline.ts` before `finalizeTurn` | `finalText`, `intent`, `pendingMedia` summary |
| 5 | `persist_turn` | `persist.ts` or `finalizeTurn` after `persistTurn` | `assistantMessageId`, `intent`, `stage`, token meta |
| 5 | `debit` | `billing.ts` `debitAfterEnqueue` | `chargeVendor` outcome, `idempotencyKey` (= wamid), cost summary |
| 6 | `response_queue_published` | `finalizeTurn` | Full `RESPONSE_QUEUE` payload (redact nothing except never log secrets — there are none) |
| 6 | `whatsapp_sent` | `responseProcessor.ts` | `to`, `text` preview/length, `messageId`, Graph API returned id if available, `attachments` |

**Out of scope for v1:** Status/reaction-only webhooks (no `traceId`); log only when `message_created` + AI path or when `conversation_turn_audit` and event includes a wamid we care about.

**Post-`finalizeTurn` side effects** (knowledge gap, insights enrich, vendor new-order notify): optional `checkpoint: knowledge_gap_persist` if cheap; not required for first ship.

---

## 5. API (admin)

Add to `backend/src/routes/vendors.ts` (admin-only, mirror `PATCH /:id/billing-config`):

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/vendors/:id/feature-flags` | — | `{ conversation_turn_audit: boolean }` (+ only documented keys) |
| `PATCH` | `/api/vendors/:id/feature-flags` | `{ conversation_turn_audit?: boolean }` | merged flags subset |

Rules:

- `requireRole('admin')` only (vendors must not enable their own verbose PII logs).
- PATCH **merges** into existing `featureFlags` JSON (do not wipe other keys like `whatsapp_conversation_parity`).
- Zod: at least one known key; unknown keys rejected or ignored (prefer **reject** to avoid typos).
- Log: `logger.info({ adminUserId: req.user?.id, vendorId, patch }, 'admin updated vendor feature flags')`.
- Call `invalidateVendorFlagCache(vendorId, TURN_AUDIT_FLAG)` after update.

`GET /:id/config` for vendors **must not** expose `conversation_turn_audit` to non-admin (keep on dedicated admin endpoints only).

---

## 6. Admin UI (web-admin)

| Piece | Location |
|-------|----------|
| API client | `frontend_v2/apps/web-admin/src/lib/vendors.ts` — `getVendorFeatureFlags`, `patchVendorFeatureFlags` |
| Component | `TurnAuditToggle.tsx` (or section in `VendorDetailPanel.tsx`) |
| UX | Switch + helper text: temporary debugging, contains customer PII, effective within ~30s on Lambdas |

Pattern: same as `MarkupEditor` (`useQuery` + `useMutation` + invalidate `['admin-vendor', vendorId]`).

---

## 7. Files to touch (implementation checklist)

| Area | Files |
|------|--------|
| Core | `backend/src/observability/turnAuditLog.ts` (new) |
| Flags | `backend/src/config/featureFlags.ts` — `invalidateVendorFlagCache` |
| Webhook | `backend/src/services/webhookEventProcessor.ts` |
| Pipeline | `backend/src/conversation/pipeline.ts`, `persist.ts` (optional thin log after persist) |
| LLM | `backend/src/conversation/llm/llm1.ts`, `llm2.ts` |
| Billing | `backend/src/conversation/billing.ts` |
| Outbound | `backend/src/workers/responseProcessor.ts` (Lambda dispatcher shares this) |
| API | `backend/src/routes/vendors.ts` |
| Tests | `backend/src/routes/__tests__/vendorFeatureFlags.test.ts` (new); optional unit test for `logTurnAudit` no-op when disabled |
| Admin UI | `web-admin` vendors lib + `VendorDetailPanel` + toggle component |
| Docs | This file → update **Implementation status** when done; one row in `docs/DOC_SYNC_INDEX.md` if required by project habit |

**Do not add** `TURN_AUDIT_LOGS_ENABLED` to `env.ts` or `.env.example`.

---

## 8. CloudWatch analysis (runbook snippet)

Log groups (prod example):

- `/aws/lambda/chatlogix-webhook-handler`
- `/aws/lambda/chatlogix-incoming-response-generator`
- `/aws/lambda/chatlogix-whatsapp-response-dispatcher`

Insights (adjust field paths after first deploy — Pino may nest under `@message` JSON):

```sql
fields @timestamp, checkpoint, traceId, vendorId
| filter turnAudit = 1
| filter vendorId = "VENDOR_UUID"
| sort @timestamp asc
```

Single turn:

```sql
fields @timestamp, checkpoint, payload
| filter traceId = "wamid.XXX"
| sort @timestamp asc
```

---

## 9. Security & compliance

- Audit logs contain **phone numbers, addresses, order details, full prompts** — admin-only toggle, short retention recommendation on Lambda log groups, restrict IAM `logs:FilterLogEvents`.
- Never log `WHATSAPP_APP_SECRET`, tokens, or webhook signatures (raw body is OK for flagged vendor only; still no secrets in Meta payload).
- Disabling the flag stops **new** verbose lines; old log events remain until retention expires.

---

## 10. Testing plan

1. **API:** PATCH merge preserves other `featureFlags` keys; GET returns false when null; 403 for vendor role.
2. **Cache:** After PATCH, same Node process sees new value without waiting 30s (invalidation).
3. **Pipeline:** With flag off — zero `turnAudit` lines in tests (mock logger or spy).
4. **Pipeline:** With flag on (mock `isVendorFlagOn` true) — at least one `turn_audit` line per checkpoint in a golden/integration test (processor test may be heavy; route test + small `turnAuditLog` unit test acceptable for v1).
5. **Manual:** Enable for staging vendor → one WhatsApp message → traceId visible across three log groups.

---

## 11. Rollout

1. Deploy backend + admin UI (flag defaults off for everyone).
2. Enable for one internal/staging vendor; validate Insights query.
3. Document in admin UI copy; no vendor-facing exposure.
4. Optional later: auto-expire flag via cron (not v1).

---

## 12. Open decisions (defaults chosen)

| Question | Default |
|----------|---------|
| Flag name | `conversation_turn_audit` |
| Include sandbox/onboarding path? | Yes — same flag if `vendorId` present |
| Express `/webhook` dev path | Yes — shared `webhookEventProcessor` |
| Separate log group? | No |
| Env kill switch? | **No** (per user request) |

---

## 13. Implementation order

1. `turnAuditLog.ts` + `invalidateVendorFlagCache`
2. Admin GET/PATCH + tests
3. Admin UI toggle
4. Instrument webhook → processor → dispatcher (checkpoints table §4)
5. Manual staging verification + update this doc status to **Implemented**
