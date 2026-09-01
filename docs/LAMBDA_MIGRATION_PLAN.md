# Full Lambda Migration Plan

Plan for moving the remaining PM2 workloads (Express API + media worker) to AWS Lambda, motivated by scaling pressure on the current 512 MB Lightsail VM.

---

## TL;DR — Read This First

**Before you spend weeks on a Lambda migration, try this 10-minute experiment:**

1. Upgrade the Lightsail instance to **4 GB RAM / 2 vCPU / 80 GB SSD** (~$24/mo from ~$3.50/mo).
2. Add a 2 GB swap file (one-time setup).
3. Add PM2 cluster mode for the backend (`instances: 'max'`) to use both CPUs.

This addresses 80% of scaling problems for ~$20/mo, with zero code changes and zero risk. The current 512 MB box is the smallest Lightsail tier and is genuinely undersized for a Node + Prisma + 5-PM2-process workload.

**Only proceed with the Lambda migration below if:**
- You've already upsized and *still* hit limits, OR
- You have a concrete reason Lambda is a better fit (predictable scale-to-zero, regulatory isolation, etc.), OR
- The team has appetite for a 2–4 week refactor with the operational complexity it brings.

The rest of this doc assumes the answer is yes.

---

## What stays on Lightsail no matter what

Even after a "full" Lambda migration, the VM keeps:

| Component | Why |
|---|---|
| **PostgreSQL** | Moving to RDS is a separate ~1-week project (data migration, network setup, connection pooling). Not part of this plan. |
| **nginx** | TLS termination + reverse proxy to API Gateway + static file serving. Could be replaced with CloudFront + ACM later, but not in scope here. |
| **Static frontend (`frontend/dist`)** | Could move to S3 + CloudFront later; not the bottleneck. |

So "full Lambda" really means: **API + workers → Lambda; DB + nginx + static files stay on the box**. You will still pay for Lightsail; the savings come from being able to *downsize* it (e.g., back to 512 MB or 1 GB) once the heavy workloads are off it.

---

## Pre-work — Decouple before migrating (~2 days)

These steps make the migration safer. Skip them at your own risk.

### 1. Right-size the VM temporarily

Even during the migration, you need the existing PM2 workers running. Upsize **now** so the migration isn't fighting OOMs at the same time:

- Lightsail → Instances → your instance → **Stop** → wait for stop → **Change plan** → 4 GB / 2 vCPU → **Start**.
- Public IP may change; if so update DNS + `EC2_HOST` GitHub secret.

### 2. Add observability before changing anything

- Enable **CloudWatch Logs** for the existing Lambdas (already on if you followed DEPLOYMENT.md).
- Set up a **CloudWatch dashboard** with: Lambda invocations, errors, duration, concurrent executions. Bookmark it.
- Enable **AWS X-Ray** on the new Lambdas as you create them — invaluable when chasing latency.

### 3. Pin the DB connection model

The single biggest Lambda + Prisma footgun is connection exhaustion. Decide *now* between:

- **Option A — RDS Proxy** (recommended). Sits between Lambda and Postgres, multiplexes connections. ~$15/mo per proxy endpoint. Works with Postgres on Lightsail via VPC peering (already set up per DEPLOYMENT.md Phase 4).
- **Option B — Prisma Data Proxy**. Prisma's hosted proxy. Cleaner DX, but adds a network hop and Prisma-specific lock-in.
- **Option C — Pool inside Lambda using global var**. Cheap but fragile. Only OK for very low traffic.

Pick one and stick with it. Document the choice.

---

## Phase A — Migrate the media worker first (~3–5 days)

Smaller blast radius than the API. Validates the new patterns (SQS trigger, env config, deploy pipeline) before touching user-facing code.

### Steps

1. **Refactor `backend/src/workers/mediaWorker.ts`** so the message-handling function is exported separately from the SQS poller loop. The poller is what PM2 runs; the function is what Lambda will call.
2. **Create a new Lambda handler** `backend/src/lambdas/handlers/mediaProcessor.ts` that:
   - Receives SQS event batches.
   - For each record, calls the extracted handler.
   - Returns `batchItemFailures` for partial-batch retry support.
3. **Add to `deploy.yml`** — extend the `for fn in ...` loop in `deploy-lambdas` to include `chatlogix-media-processor` (or whatever you name it).
4. **In AWS Console** — create the Lambda function:
   - Runtime: Node.js 20 (or 18 to match the rest).
   - Memory: 1024 MB (Whisper API calls + base64 audio in memory).
   - Timeout: 5 min (Whisper can take 30s on a longer voice note).
   - VPC: same default VPC as other Lambdas (needs to reach Postgres).
   - Trigger: `chatlogix-media-fetch-queue-prod` SQS queue.
   - Env vars: copy from the media worker's `.env` (OPENAI_API_KEY, WHATSAPP_ACCESS_TOKEN, WA_MEDIA_S3_BUCKET, all the downstream queue URLs).
5. **Shadow-run for 24 hours.** Keep `chatlogix-media-worker` running on PM2, but watch the new Lambda's CloudWatch logs. It will process the same messages in parallel — they'll both try to publish to downstream queues, so you'll see duplicate AI replies during this window. Accept that for a day to gain confidence.
   - Alternative: temporarily change PM2 worker to a new "shadow" queue and have the Lambda use the real one. Less duplication, but more setup.
6. **Cut over.** Once Lambda metrics look clean (low errors, expected duration):
   ```bash
   pm2 stop chatlogix-media-worker
   pm2 save
   ```
   Remove the media worker entry from `ecosystem.config.js` and commit.
7. **Rollback if needed:**
   - Disable the SQS trigger on the Lambda (Console → Configuration → Triggers → Disable).
   - `pm2 start chatlogix-media-worker` on the box.
   - Investigate, retry.

**Exit criteria for Phase A:** Lambda processes 100% of media traffic for 7 days with error rate <0.5%, p95 duration <30s, no manual intervention needed.

---

## Phase B — Migrate the Express API (~2–3 weeks)

The big one. Touches every dashboard request.

### Architecture target

```
User browser
  ↓ HTTPS (nginx terminates TLS)
nginx on Lightsail
  ↓ proxy_pass /api/* to API Gateway URL
API Gateway (HTTP API, $default stage)
  ↓ Lambda proxy integration
chatlogix-api Lambda (single Lambda, all routes)
  ↓ via RDS Proxy
Postgres on Lightsail (VPC-peered)
```

### Steps

1. **Add a Lambda adapter** to `backend/src/index.ts`. Two reasonable choices:
   - `@vendia/serverless-express` — community-maintained fork of the original AWS lib, well-supported.
   - `serverless-http` — slightly simpler API, slightly less common.

   Either way, the change is small: keep `app` (the Express app) exportable, and add a Lambda entry point `backend/src/lambdas/handlers/api.ts`:
   ```ts
   import serverlessExpress from '@vendia/serverless-express';
   import { app } from '../../index.js';
   export const handler = serverlessExpress({ app });
   ```

2. **Audit every route for Lambda-incompatibility.** Hard limits:
   - API Gateway HTTP API timeout: **30 seconds**. Any route slower than this needs to be redesigned (background job → SQS → Lambda, return 202).
   - Request payload: **6 MB sync**. File upload routes (avatar, product images) may break.
   - Response payload: **6 MB sync**. Large CSV exports break.
   - Streaming responses: not supported in API Gateway HTTP API. If you stream anywhere, use Lambda Function URLs instead.

   Make a list of every route that hits these limits. For each, decide: redesign, route around (direct S3 presigned URL for uploads), or keep on Lightsail for now (nginx routes those specific paths to the VM).

3. **Set up RDS Proxy** (or chosen pooling solution from pre-work step 3). Update `DATABASE_URL` for the Lambda environment to point at the proxy endpoint, not Postgres directly.

4. **Create the Lambda function** — same VPC/security group/role pattern as the other Lambdas. Memory: start at 1024 MB; tune later. Timeout: 30s (matches API Gateway). Provisioned concurrency: start with 2 if you can't tolerate cold starts on the dashboard.

5. **Create API Gateway HTTP API:**
   - Single route: `ANY /{proxy+}` → `chatlogix-api` Lambda.
   - CORS: configure to allow your dashboard domain.
   - Note the invoke URL.

6. **Update nginx on Lightsail** to proxy `/api/*` to the new API Gateway URL. Keep the existing `location /api/` block as a comment for quick rollback.
   ```nginx
   location /api/ {
       proxy_pass https://<api-id>.execute-api.ap-south-1.amazonaws.com/api/;
       proxy_set_header Host <api-id>.execute-api.ap-south-1.amazonaws.com;
       proxy_ssl_server_name on;
   }
   ```
   Reload nginx with `sudo systemctl reload nginx`.

7. **Shadow-test with a subset of traffic.** Options:
   - Route a specific dashboard environment (staging subdomain) to the Lambda first.
   - Or use nginx `split_clients` to send 5% → Lambda, 95% → PM2 backend. Increase gradually.

8. **Watch closely for:**
   - Cold start latency on the first request after idle (1–3s typical).
   - Prisma connection errors (DB exhaustion → fix RDS Proxy config).
   - Auth/session issues (in-memory state lost between invocations — Firebase auth should be fine since it's token-based, but double-check anything that uses Express sessions).
   - 5xx spikes — check CloudWatch logs.

9. **Cut over.** Once 95%-via-Lambda metrics look good:
   - Update nginx to 100% Lambda.
   - `pm2 stop chatlogix-backend && pm2 save`.
   - Remove backend entry from `ecosystem.config.js`.

10. **Rollback if needed:** revert nginx to `proxy_pass http://localhost:3000/`, `pm2 start chatlogix-backend`. Investigate. The PM2 process and nginx config are designed to coexist with the Lambda forever, so rollback is trivial.

**Exit criteria for Phase B:** 100% API traffic via Lambda for 14 days, p95 latency <500ms (excluding cold starts), error rate <0.1%, no DB connection alerts.

---

## Phase C — Stop the remaining AI workers (~1 day)

Once the API and media worker are on Lambda, you can also retire:

- `chatlogix-response-worker` (replaced by `chatlogix-whatsapp-response-dispatcher` Lambda)
- `chatlogix-incoming-worker` (replaced by the webhook handler Lambda)
- `chatlogix-multi-stage-ai-worker` (replaced by the multi-stage Lambda)

This is the "Phase 13 Option A" cleanup from DEPLOYMENT.md. Steps:

```bash
ssh bitnami@<lightsail-host>
pm2 stop chatlogix-response-worker chatlogix-incoming-worker chatlogix-multi-stage-ai-worker
pm2 delete chatlogix-response-worker chatlogix-incoming-worker chatlogix-multi-stage-ai-worker
pm2 save
```

Then remove those three entries from `ecosystem.config.js` and commit.

**Before doing this:** confirm Phases 1–12 of DEPLOYMENT.md are complete — the Lambdas exist, are wired to the right SQS queues, and the WhatsApp webhook points at API Gateway. If any of that is missing, stopping the workers means messages drop.

---

## Phase D — Downsize the VM (~10 min)

After Phases A + B + C, PM2 is empty (no apps) and the VM only runs Postgres + nginx + static files. You can:

- Lightsail → Stop → Change plan → 1 GB or 2 GB RAM (depending on Postgres working-set size) → Start.
- Update DNS if public IP changes.
- Estimated savings: ~$10–20/mo vs. the 4 GB you upsized to in pre-work.

---

## Cost estimate (production scale, 100k WhatsApp messages/mo + light dashboard usage)

| Item | Current | Post-migration |
|---|---|---|
| Lightsail VM | 4 GB box $24/mo | 1–2 GB box $5–10/mo |
| Lambda invocations | ~$2 (existing 5 functions) | ~$5–10 (add API + media) |
| API Gateway | $0 | ~$3 (dashboard requests) |
| RDS Proxy | $0 | ~$15 |
| Data transfer / misc | ~$2 | ~$3 |
| **Total** | **~$28/mo** | **~$31–41/mo** |

**Lambda migration likely costs more, not less, in absolute dollars.** The real wins are auto-scaling, fewer ops touchpoints, and not worrying about VM resource limits. If pure cost reduction is the goal, this isn't the right project.

---

## Off-ramps — when to stop and reconsider

Stop the migration and re-evaluate if:

- **Phase A blows up cost.** Whisper-heavy traffic + Lambda's per-ms billing can get expensive fast. Compare actuals against the cost estimate after week 1.
- **Cold starts hurt UX.** If dashboard users complain about slow first loads, you'll need provisioned concurrency (~$15/mo for 2 always-warm instances) or to keep the API on PM2.
- **Prisma + Lambda connection issues persist after RDS Proxy.** Some Prisma operations (e.g., transactions) are sensitive to proxy behavior. If you hit weird errors, document them and consider keeping the API on Lightsail.
- **DB becomes the bottleneck instead of the VM.** If upsizing the API doesn't help because Postgres is pegged, migrate Postgres to RDS first, not the API to Lambda.

---

## Open questions to resolve before starting

1. Which connection pooling strategy? (RDS Proxy / Prisma Data Proxy / in-Lambda)
2. Who owns Phase B? It needs concentrated focus — not a side task.
3. Is there a staging environment for shadow testing? If not, build one *before* Phase B. Cutting over straight to prod on a 2-week refactor is reckless.
4. What's the rollback budget? Define "we will roll back if X happens" up front for each phase.

---

## Estimated total effort

- Pre-work: 2 days
- Phase A (media worker): 3–5 days dev + 7 days shadow
- Phase B (API): 10–15 days dev + 14 days shadow
- Phase C (worker cleanup): 1 day
- Phase D (downsize): 1 hour

**Calendar time: 6–10 weeks** if running alongside other work; **3–4 weeks** with dedicated focus.

If that timeline doesn't match the urgency of the scaling problem, *upgrade the VM today* and revisit this plan when the team has bandwidth.
