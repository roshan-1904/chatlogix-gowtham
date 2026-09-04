# Conversation Worker: Cleanup Log & Known Gaps

Written 2026-09-02. Two things live in this doc:

1. A log of the dead-code cleanup done on this date (worker files + deploy scripts).
2. **The real finding from that cleanup**: a list of behaviors the *old* pipeline had that the *new* `chatlogix-incoming-response-generator` / `conversation-processor` pipeline does not, verified against the code as it exists in production today. This is the "what did we miss" answer — treat it as a punch list, not a retrospective.

Related docs: `docs/CONVERSATION_PROCESSOR_LAMBDA.md` (the new pipeline's design spec), `docs/LAMBDA_MIGRATION_PLAN.md` (the PM2→Lambda migration plan), `backend/src/lambdas/README.md` (the authoritative list of what's actually deployed).

---

## 1. What actually runs in production today

Confirmed via `.github/workflows/deploy.yml` (5 hardcoded Lambda function names), `backend/src/lambdas/README.md`, and `ecosystem.config.js`:

```
WhatsApp
  → API Gateway → chatlogix-webhook-handler (Lambda)
       publishes TextMessage to SQS TEXT_QUEUE_URL
       (audio/image/reactions/status: see gaps below)
  → chatlogix-incoming-response-generator (Lambda)
       backend/src/conversation/* — LLM-1 + CartEngine + optional LLM-2
  → SQS RESPONSE_QUEUE_URL
  → chatlogix-whatsapp-response-dispatcher (Lambda)
  → WhatsApp send

Still on PM2 (Lightsail, ecosystem.config.js):
  chatlogix-backend      — Express API (dashboard, auth, orders, ...)
  chatlogix-media-worker — Whisper/image handling (built, but not fed — see §2.1)
```

`chatlogix-order-recovery` (Lambda) and `chatlogix-media-fetcher` (Lambda) also exist but are unreliable — see §2.3 and the Lambda README respectively.

The **old** pipeline — `multiStageOrchestrator.ts` (14-stage) and `unifiedAIProcessorService.ts` (the "1 fat JSON call" optimization of it) — is no longer on the hot path anywhere. Its only remaining live caller is `catalogImportSandboxService.ts`, which is unrelated to message processing.

---

## 2. Gaps: what the old pipeline did that the new one doesn't (yet)

### 2.1 Audio and image messages are silently dropped

> **UPDATE (2026-09-04): the section below is stale.** It describes `webhookHandler.ts` as it existed at the initial commit (2026-05-12). Commits `04f2164`/`00e7a93`/`469a0ff` (all 2026-09-01, one day *before* this doc was written) refactored it to delegate to `webhookEventProcessor.ts#processWebhookEventBatch` — the same function the old Express route uses, per that function's own doc comment ("Shared by the Express webhook route and the API Gateway Lambda so both entry points see identical behavior"). As of that refactor, the live Lambda **does** persist a `MessageMedia` placeholder and enqueue a `MediaFetchJob` to `MEDIA_FETCH_QUEUE_URL` for `audio/image/video/document/sticker`, and **does** process reactions and status updates (§2.2 below is also stale for the same reason). The real remaining gaps, verified 2026-09-04:
>
> 1. `chatlogix-media-fetcher` (the sole intended consumer of `MEDIA_FETCH_QUEUE_URL` in production — `mediaWorker.ts` was deliberately retired from PM2, see `ecosystem.config.js`) has a broken Lambda "Handler" configuration: it's set to `mediaFetcher.handler` instead of `dist/lambdas/handlers/mediaFetcher.handler` (the pattern the other 4 functions use, per `lambdaConfigurationService.ts`). The handler file itself (`backend/src/lambdas/handlers/mediaFetcher.ts`) is complete and correct — every invocation just fails immediately with `Runtime.HandlerNotFound` before it runs. This is a one-line AWS config fix, not a code change.
> 2. `chatlogix-incoming-response-generator`'s only configured trigger is `TEXT_QUEUE_URL` (per its own README entry). `AUDIO_QUEUE_URL`/`IMAGE_QUEUE_URL` aren't wired to it, so even once media-fetcher is fixed and successfully transcribes/captions, the AI pipeline never sees it — needs those two queues added as additional SQS event source mappings on that function. No code change needed there either; its handler already accepts a generic `{type:'TextMessage', ...}` payload regardless of source queue.
>
> Original (now-superseded) text kept below for the audit trail:

`backend/src/lambdas/handlers/webhookHandler.ts` (the live webhook Lambda) only handles `message.type === 'text'`. Audio and image fall into its `default:` branch and return `{ success: false, error: 'Unsupported message type' }` — nothing is enqueued, nothing is stored, the customer gets no reply and no acknowledgment.

The old Express route (`backend/src/routes/webhook.ts` + `webhookEventProcessor.ts`) *does* handle media — it persists a placeholder `MessageMedia` row and enqueues a `MediaFetchJob` to `MEDIA_FETCH_QUEUE_URL`, which `mediaWorker.ts` (still running on PM2, Whisper transcription + S3 upload + retry backoff, all intact) picks up and processes. But that Express route is not what WhatsApp calls in production anymore — API Gateway → Lambda is. So:

- `mediaWorker.ts` is fully functional but, as far as the code shows, **receives nothing in production** right now.
- `chatlogix-media-fetcher` (the Lambda meant to replace it) is confirmed non-functional in `backend/src/lambdas/README.md` (misconfigured handler path).

This matches `docs/CONVERSATION_PROCESSOR_LAMBDA.md` §5 ("Does not: Whisper / image caption") — it's a known, deliberately-scoped-out gap for that spec, but nothing has picked it up since.

**Impact (as of 2026-09-04, only #1 and #2 above are actually blocking):** any customer who sends a voice note or photo currently gets no response at all.

### 2.2 Message reactions and delivery/read status updates aren't processed

The live `webhookHandler.ts` Lambda only reads `change.value.messages` from the WhatsApp payload. It never looks at `change.value.statuses` (delivery/read receipts) or reaction payloads.

The old Express pipeline has real handling for both — `webhookEventProcessor.ts` has `processReaction` / `processStatus`, complete with an orphan-buffer (Redis-backed, 5-minute TTL) for reactions/statuses that arrive before their parent message is persisted, and status-rank upgrade logic (`pending → processing → sent → delivered → read`, never regressing). None of that runs against production traffic today because it's gated behind the Express route.

**Impact:** `Message.status` and `MessageReaction` data isn't kept current from real WhatsApp traffic; anything in the dashboard relying on delivery/read state or reactions is working off stale/absent data.

### 2.3 Order recovery scheduling is unverified

`backend/src/lambdas/README.md` states outright: no EventBridge rule was found targeting `chatlogix-order-recovery` as of 2026-09-01. The Lambda handler (`orderRecovery.ts`) and the underlying `detectAndRecoverOrderIssues()` logic are fine — the trigger wiring is the open question. (The PM2-based version of this, `orderRecoveryWorker.ts`, was already fully dead code — `startOrderRecoveryWorker()` was exported but never called anywhere — so it wasn't providing a safety net either.)

**Action needed:** check the AWS console / EventBridge for a rule targeting this function. If none exists, order discrepancies are not being auto-recovered at all right now.

### 2.4 The webhook fallback log-replay mechanism lost its only reader

`webhookFallbackService.ts` has two halves: `logMessageToFile` (write — used as a last-resort fallback when both SQS and the DB write fail, called from both `webhook.ts` and `webhookHandler.ts`) and `readPendingMessages` / `markMessageProcessed` (replay — sweeps those log files back into the pipeline on worker startup). The replay half's only caller was `incomingMessageWorker.ts`, which was dead code and has now been removed as part of today's cleanup.

The write half is still live. So: if a message ever hits the triple-fallback path (SQS fails *and* DB write fails), it now gets written to a log file that nothing will ever read again. Left as-is rather than deleted today, since removing the replay functions would make an existing (if obscure) reliability gap worse, not better — flagging here instead so it gets a real decision (wire it into the new pipeline's startup, or replace the whole fallback mechanism, or accept the gap since it only triggers when SQS *and* Postgres are both down simultaneously).

### 2.5 The per-vendor `whatsapp_conversation_parity` flag path is orphaned

`backend/src/routes/webhook.ts` still branches on a per-vendor feature flag (`isVendorFlagOn(vendorId, 'whatsapp_conversation_parity')`) between `runParityPipeline` (the fuller Express-side implementation, reactions/status/media included) and `runLegacyPipeline` (bare-bones, text-only, this is effectively what `webhookHandler.ts` reimplements for Lambda). Since production WhatsApp traffic hits API Gateway, not this Express route, **neither branch of this flag currently affects real customers** — it only matters for whoever is testing against the Express server directly (local dev, or a non-production environment still pointed at it).

Worth knowing about mainly so nobody spends time debugging "why doesn't flipping this flag change production behavior" — it can't, given the current WhatsApp webhook URL configuration.

---

## 3. Cleanup performed 2026-09-02

**Deleted — dead PM2 worker entrypoints** (zero remaining references anywhere in the codebase, confirmed by grep + a full `tsc --noEmit` + `vitest run` pass before and after):

- `backend/src/workers/textWorker.ts` — TODO stub, never did anything.
- `backend/src/workers/incomingMessageWorker.ts` — pre-Lambda legacy worker, superseded by `webhookHandler.ts` + `conversationProcessor.ts`.
- `backend/src/workers/multiStageAIWorker.ts` — wrapped the retired `multiStageOrchestrator.ts` on the hot path.
- `backend/src/workers/orderRecoveryWorker.ts` — its exported `startOrderRecoveryWorker()` was never called from anywhere.
- `backend/src/workers/responseWorker.ts` — PM2 wrapper superseded by the dispatcher Lambda. (`workers/responseProcessor.ts`, the shared business logic it and the Lambda both import, was kept — it's live.)

**Not deleted, kept intentionally:**

- `backend/src/services/multiStageOrchestrator.ts` — still imported by `catalogImportSandboxService.ts`.
- `backend/src/services/messageProcessor.ts` (`processIncomingTextMessage`, `processBatchIncomingMessages`, etc.) — still imported by `lambdas/handlers/multiStageProcessor.ts`, which the Lambda README says is deliberately kept "in case audio/image ever needs it again."
- `backend/src/workers/conversationWorker.ts` — not dead; it's the local-dev counterpart to the live `chatlogix-incoming-response-generator` Lambda, edited as recently as 2026-09-01.
- `backend/src/workers/mediaWorker.ts` — live on PM2, see §2.1.
- `webhookFallbackService.ts`'s replay functions — see §2.4.

**Deleted — stale deployment scripts** (all untouched since the initial commit on 2026-05-12, all superseded by `scripts/deployment/deploy-ec2.sh` which was updated as recently as today, several directly referencing the now-deleted worker files):

`deploy.sh`, `lightsail-deploy.sh`, `quick-deploy.sh`, `deploy-production.sh`, `create-deployment-package.sh`, `create-deployment-package.ps1`, `setup-nginx.sh`, `bitnami-deploy.sh` (this last one also generated its own conflicting `ecosystem.config.js` with placeholder values — `DOMAIN="yourdomain.com"` — and configured Apache, not the nginx setup actually in use).

**Also updated:**

- `backend/package.json` — removed the `worker:incoming`, `worker:text`, `worker:response`, `worker:multi-stage` scripts. Kept `worker:conversation` and `worker:media`.
- `docker-compose.yml` — removed the `response-worker` service (referenced the now-deleted `dist/workers/responseWorker.js`).
- `CLAUDE.md` — rewritten to describe the current Lambda-first architecture instead of the old "4 PM2 processes / 14-stage pipeline" description.

**Not touched, flagged only:** the large `documentation/` directory tree (distinct from `docs/`) is itself entirely stale — untouched since the initial commit, and several of its pages (`documentation/modules/deployment/guides/*`, `documentation/shared/architecture/response-worker.md`, `documentation/modules/features/multi-stage-ai/*`) reference the scripts and workers removed above. It's a much larger, separate cleanup — out of scope for this pass, called out here so it doesn't get mistaken for current documentation.

**Unrelated file change noticed during this work:** `backend/exports/customer-9790690170-conversations-orders.json` showed up as modified (329 insertions / 1090 deletions) in `git status` during this session. Nothing in this cleanup touches `backend/exports/` or runs `scripts/export-customer-conversations-orders.ts`, so this wasn't caused by the work above — worth checking what else is writing to that file before committing it.
