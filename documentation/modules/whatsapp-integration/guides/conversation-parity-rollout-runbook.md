# WhatsApp Conversation Parity — Rollout Runbook

> **⚠️ Before running any stage below:** the `whatsapp_conversation_parity` flag this runbook enables is read in `backend/src/routes/webhook.ts`, the Express webhook route. Production WhatsApp traffic does **not** currently hit that route — it goes API Gateway → the `chatlogix-webhook-handler` Lambda, a separate text-only implementation that never checks this flag. Flipping the flag with the SQL below will **not** change behavior for real vendors/customers today. Confirm the Lambda has been updated to route through the parity pipeline (or that you're testing against a non-production environment still pointed at the Express route) before treating any stage here as "live." See `docs/CONVERSATION_WORKER_GAPS.md` §2.5.

This runbook executes the four-stage enablement of the per-vendor `whatsapp_conversation_parity` flag.
Source plan: [conversation-parity-implementation-plan.md](./conversation-parity-implementation-plan.md).
UAT acceptance: [uat-scenarios.md](./uat-scenarios.md).

## Pre-flight (one-time, before Stage 1)

Code-side items (already landed in this branch):

- [x] Phase 1 schema migration applied to dev → staging → prod
- [x] Phase 2 ingestion + outbound + media worker live behind the flag (off by default)
- [x] Phase 3 enriched conversations API + media-proxy endpoint live
- [x] Phase 4 frontend bubbles + i18n shipped
- [x] Phase 5 metrics helper wired into webhook + media worker

Operational items (manual, **outside this codebase**):

- [ ] PM2: deploy `chatlogix-media-worker` to all backend hosts (`pm2 reload ecosystem.config.js`)
- [ ] SQS: `media-fetch-queue` provisioned in each environment (`npm run queues:init` for dev; Terraform for staging/prod)
- [ ] S3: `WA_MEDIA_S3_BUCKET` created in each environment with lifecycle rule expiring objects after `WA_MEDIA_RETENTION_MONTHS` (default 12)
- [ ] IAM: backend role has `s3:PutObject` (media worker) + `s3:GetObject` (presigned-URL signer) on the bucket
- [ ] Env vars set: `MEDIA_FETCH_QUEUE_URL`, `WA_MEDIA_S3_BUCKET`, `WA_MEDIA_S3_REGION`, `WA_MEDIA_RETENTION_MONTHS`, `MEDIA_FETCH_MAX_ATTEMPTS`
- [ ] Note: media-fetch retry backoff is `[1s, 5s, 30s, 5min, 15min]` (5 attempts). The design doc's 30-min final slot is **clamped to 15 min** because SQS `DelaySeconds` caps at 900s. If a longer terminal delay is required, route the 5th attempt through a dedicated DLQ + scheduled re-drive — out of scope for this rollout.
- [ ] CloudWatch: `CLOUDWATCH_METRICS_ENABLED=true` in staging + prod; namespace `ChatLogix/ConversationParity`
- [ ] CloudWatch: dashboard + 5 alarms wired (see "Alarms" below)
- [ ] Frontend: `npm install` to pick up `i18next`, `react-i18next`, `i18next-browser-languagedetector`
- [ ] Backend: `npm install` to pick up `@aws-sdk/client-cloudwatch`

## Enabling the flag for a vendor

```sql
UPDATE "Vendor"
SET "featureFlags" = COALESCE("featureFlags", '{}'::jsonb)
                     || '{"whatsapp_conversation_parity": true}'::jsonb
WHERE id = '<vendor-id>';
```

The 30-second LRU cache in `featureFlags.ts` means flag flips take effect within ~30s of the SQL `UPDATE`.

To revert a single vendor:

```sql
UPDATE "Vendor"
SET "featureFlags" = "featureFlags" - 'whatsapp_conversation_parity'
WHERE id = '<vendor-id>';
```

## Rollout stages

Each stage gate requires **all of**: ≥1 week elapsed, no SLI breach, no critical bug.

### Stage 1 — Internal / test vendors (week 1)

- Vendors: internal-test accounts only (no real customers)
- Run the [UAT matrix](./uat-scenarios.md) end-to-end
- Verify: CloudWatch metrics arriving, dashboard green, no parse failures
- Exit: UAT signed off by Engineering + Product

### Stage 2 — Friendly real vendors (week 2)

- Vendors: 1–2 hand-picked vendors with low daily volume + active engineering contact
- Run the UAT matrix against live customer traffic
- Daily check-in: review CloudWatch dashboard, customer-reported issues
- Exit: 1 week green, no critical bugs, vendor-facing screenshots captured for support docs

### Stage 3 — 25% sample (week 3)

- Vendors: pseudo-random 25% of active vendors (use a stable hash of vendor ID modulo 4)
- Watch SLIs daily; rollback any individual vendor that shows >10× normal media-fetch failure rate
- Exit: 1 week green, error budget intact, support tickets categorized

### Stage 4 — 100% (ongoing)

- Vendors: all
- Monitor through 2 release windows
- Declare DoD when both windows pass with green SLIs

## Alarms (CloudWatch — manual setup)

Configure the following with email notification to the shared engineering address. Thresholds based on
the design doc Phase 5 §"Metrics to Emit". Tune after Stage 2 baseline data.

| Alarm                              | Metric                         | Threshold                          | Window | Action          |
| ---------------------------------- | ------------------------------ | ---------------------------------- | ------ | --------------- |
| Webhook parse failures             | `webhook.parse_failure`        | >5 in 5 min                        | 5 min  | Page on-call    |
| Media terminal failures            | `media.fetch.terminal_failure` | >10 in 15 min                      | 15 min | Page on-call    |
| Media fetch latency p99            | `media.fetch.duration_ms`      | p99 > 30000 ms                     | 5 min  | Email           |
| Media fetch attempt anomaly        | `media.fetch.attempt`          | <50% of trailing 1-hour avg        | 15 min | Email (drop)    |
| Webhook event drop-off             | `webhook.event_processed`      | <50% of trailing 1-hour avg        | 15 min | Email (drop)    |

## Rollback

**Per-vendor rollback:** flip the SQL flag off (see above). Effect within 30s.

**Global rollback:** set `CLOUDWATCH_METRICS_ENABLED=false` (alarm silence) and run:

```sql
UPDATE "Vendor"
SET "featureFlags" = "featureFlags" - 'whatsapp_conversation_parity';
```

Legacy ingestion path stays in place for the duration of the rollout — no code rollback needed.

## Cleanup (after Stage 4 + 2 release windows green)

- [ ] Remove `runLegacyPipeline()` and the flag check from `webhook.ts`
- [ ] Remove fallback branches that key off `parityOn === false`
- [ ] Drop `Vendor.featureFlags['whatsapp_conversation_parity']` from all rows (but keep the column for future flags)
- [ ] Remove the legacy `parseWhatsAppPayload` adapter from `waParser.ts`

Cleanup is its own PR — do not bundle with rollout.
