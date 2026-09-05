# Plan: Move API to Lambda + api.chatlogix.in + CloudFront Frontend

**Status:** Planned, not yet started (as of 2026-09-05). This is the decided, detailed successor to `docs/LAMBDA_MIGRATION_PLAN.md`'s Phase B — read this doc for the actual plan; treat that doc's Phase B architecture (nginx as a reverse proxy in front of API Gateway) as superseded by the direct-custom-domain design below. Once execution starts, update this status line and check off phases as they complete.

**Execute from:** [`docs/API_LAMBDA_CLOUDFRONT_IMPLEMENTATION.md`](./API_LAMBDA_CLOUDFRONT_IMPLEMENTATION.md) — ordered step-by-step runbook. That doc reorders a few of the phases below so the catalog-import worker exists before production traffic publishes to SQS; follow the runbook's step numbers, not this file's phase numbers, when shipping.

## Context

The Lightsail VM currently runs Postgres, nginx, and the Express API (PM2, ~447MB total RAM shared across all three — confirmed undersized). Redis is already externalized to ElastiCache Serverless. The goal: move the Express API to Lambda behind a new API Gateway custom domain, move the frontend SPA to S3+CloudFront, and leave the VM running **only Postgres** (nginx becomes fully removable once nothing on the VM needs a reverse proxy). Scaling plan after this: resize the VM vertically as Postgres load grows, defer RDS until budget allows — already decided, not revisited here.

**Worth knowing before starting:** `docs/LAMBDA_MIGRATION_PLAN.md` opens with a warning that a ~$24/mo Lightsail upsize alone fixes "80% of scaling problems" with zero code changes, and that a full API-to-Lambda migration is a multi-week effort that typically *increases* total AWS spend rather than reducing it. Decision made to proceed anyway — custom domain, CloudFront, and decoupling from the VM have merit independent of pure cost/scaling. Flagging it here so it stays a fully-informed call for whoever picks this up.

**Decisions locked in:**
- **Domain: `chatlogix.in`**, not `.com` — confirmed the only real, live domain (GitHub Actions `VITE_API_URL`, code fallbacks, docs). Hosts:
  - `www.chatlogix.in` — marketing site
  - `app.chatlogix.in` — vendor portal
  - `admin.chatlogix.in` — admin portal (vendor onboarding)
  - `api.chatlogix.in` — Express API
- **Provisioning: manual AWS Console**, matching the existing pattern for all 5 live Lambdas — on the condition that this plan includes an explicit, copy-paste runbook (this repo has already shipped console-drift bugs: `chatlogix-media-fetcher`'s Handler is misconfigured, `chatlogix-order-recovery`'s EventBridge trigger is unconfirmed).
- **Catalog-import SSE route → async job + polling.** `GET /api/catalog-import/:jobId/stream` can't run behind API Gateway (buffered-only proxy integration, no streaming). Redesigned as: keep the existing S3-presigned upload unchanged, queue `analyze`/`commit` work via SQS to a new worker Lambda (reusing the same pattern as the existing `conversationProcessor`/`mediaFetcher` Lambdas), frontend polls the **already-existing** `GET /api/catalog-import/:jobId` endpoint instead of holding a connection open.

## What research surfaced beyond the original ask

Verified directly against the code (not just inferred):
- `backend/src/index.ts` has no `app` export today — `bootstrap()` builds it locally. Must split before Lambda can import it.
- Prisma (`backend/src/db/prisma.ts`) is already a Lambda-safe module-level singleton, reused across warm invocations — no code change, just needs `DATABASE_CONNECTION_LIMIT`/`DATABASE_POOL_TIMEOUT` env vars set explicitly (same requirement PgBouncer already imposes on the other 5 Lambdas).
- No adapter library installed yet; `docs/LAMBDA_MIGRATION_PLAN.md` already sketches using `@vendia/serverless-express` — reuse that choice.
- Lambda packaging is a bash script (`backend/scripts/package-lambda.sh`), not esbuild/webpack, and it currently **strips Express and its middleware** from the shared zip because no existing handler needs them — the new API Lambda needs its own separate zip so the other 5 don't inherit that bloat.
- **Catalog-import has more Lambda-incompatibility than just the SSE route** (confirmed by reading the actual code, not just the route list):
  - `POST /analyze` already returns 202 today, but via an unawaited `runExtractionInBackground(...).catch(...)` fire-and-forget call (`catalogImportService.ts:42-44`) — this relies on the Node process staying alive after the response is sent. Lambda freezes/tears down the execution environment right after `serverless-express` returns, so this silently stops working under Lambda, independent of the SSE issue.
  - `POST /commit` (`catalogImportRouter.post('/commit', ...)`) awaits the full commit transaction synchronously before responding — a real 30s API-Gateway-timeout risk for large catalogs.
  - Per-page extraction progress today only lives in an in-memory array, written to Postgres once at the very end. Naively swapping SSE for polling `GET /:jobId` would make the live per-page progress bar go dark for the whole analyze duration — a real UX regression that needs a small fix (persist `pageProgress` incrementally), not just a mechanical transport swap.
  - The frontend (`frontend_v2/apps/web-vendor/src/lib/catalogImport.ts`) already contains a polling fallback that kicks in after 3 SSE errors — the frontend change is "promote the fallback to primary," not build polling from scratch.
  - `GET /api/catalog-import/:jobId` (`catalogImport.ts:189-201`) already returns the full job row including `result` — this is the polling endpoint; no new endpoint needed.
- No IaC exists anywhere in the repo (no Terraform/CDK/SAM). All infra is hand-provisioned via AWS Console per `docs/DEPLOYMENT.md`. `.github/workflows/deploy.yml` is the live CI pipeline (`bitbucket-pipelines.yml` is confirmed stale/superseded, don't touch it); it only runs `aws lambda update-function-code` against 5 hardcoded function names — assumes functions already exist.
- **The real production domain is `chatlogix.in`** — today the SPA is served at the bare apex domain with nginx reverse-proxying `/api` to `localhost:3000` on the same box. There's no existing API subdomain at all. DNS provider for `chatlogix.in` is unknown from the repo (no Route53/registrar reference anywhere) — this needs a manual lookup as the very first step (`whois chatlogix.in` / check nameservers).

## Architecture decisions

| Decision | Choice | Why |
|---|---|---|
| API Gateway | New HTTP API (`chatlogix-dashboard-api`), separate from the existing `weeju313k2` (WhatsApp webhook only) | Keep one API : one purpose, avoid commingling unrelated CORS/throttle/route config |
| API Gateway CORS | Leave unconfigured; Express's own `cors()` keeps handling it | Avoids duplicate/conflicting `Access-Control-Allow-Origin` headers |
| ACM cert for `api.chatlogix.in` | ap-south-1 (same region as the API) | Regional API Gateway custom domains need a same-region cert |
| ACM cert for `app.chatlogix.in` (CloudFront) | us-east-1, mandatory | CloudFront only accepts us-east-1 certs, no exceptions |
| Adapter library | `@vendia/serverless-express` | Matches the existing internal doc's recommendation; well-maintained; handles API Gateway v2 payload format |
| DB pooling for the 2 new Lambdas | PgBouncer (already being stood up), not RDS Proxy | Matches the existing decision; $0 vs $15/mo |
| Catalog-import worker packaging | Joins the existing shared "worker" zip (`package-lambda.sh`) | Doesn't use Express — belongs with the other 5, not the new API zip |
| API Lambda packaging | New, separate zip/script (`package-lambda-api.sh`) | Keeps Express out of the other 6 functions' cold-start path |

## Implementation phases

### Phase 0 — DNS discovery (blocks everything else, ~0.5–1 day)
Find where `chatlogix.in` is actually managed (`whois chatlogix.in`, check nameservers — Route53 vs registrar vs Cloudflare etc.), confirm the current record for the bare apex domain (almost certainly → Lightsail IP today), and decide how the apex domain behaves post-migration: alias it directly to CloudFront if the provider supports apex ALIAS/ANAME, otherwise create `app.chatlogix.in` and 301-redirect the apex to it. Lock AWS account `987272474004` / region `ap-south-1` for everything except the two CloudFront-related pieces (cert + distribution, which are us-east-1/global).

### Phase 1 — Make the Express app Lambda-callable
- Split `backend/src/index.ts`: move everything except the PM2 entry point (imports, all middleware/route mounts, error handlers) into a new `backend/src/app.ts` exporting `app`. Keep `index.ts` as the thin PM2 entry point (`app.listen`, `process.send?.('ready')`, SIGTERM/SIGINT shutdown) — unchanged behavior for `npm run dev`/PM2.
- Add `backend/src/lambdas/handlers/api.ts`:
  ```ts
  import serverlessExpress from '@vendia/serverless-express';
  import { app } from '../../app.js';
  export const handler = serverlessExpress({ app });
  ```
- Add `@vendia/serverless-express` to `backend/package.json` dependencies (everything else the API needs — express, cors, helmet, jsonwebtoken, swagger-ui-express, firebase-admin — is already a dependency, just currently stripped from the *shared worker* zip, not absent from the project).
- Verify: `npm run build` clean, `npm run dev` boots identically, a local hand-built `APIGatewayProxyEventV2` invoke of `handler` for `GET /health` matches today's `curl` response.

### Phase 2 — Catalog-import async refactor (highest-risk phase, budget the most time here)
New SQS queue `chatlogix-catalog-import-queue-prod` (+ DLQ), visibility timeout 1800s. Messages carry only `{type: 'analyze'|'commit', jobId, vendorId}` — never bulk payloads (SQS's 256KB limit would break on a large catalog's `approvedProducts` array) — the route persists the real request to `CatalogImportJob` first, the worker re-reads it by `jobId`.

- `backend/src/services/catalogImportService.ts`: remove the inline fire-and-forget `runExtractionInBackground(...).catch(...)` call from `startAnalyze()`; export the extraction function (rename to something worker-facing, e.g. `processAnalyzeJob`) for the new worker to call directly.
- `backend/src/routes/catalogImport.ts`:
  - `POST /analyze`: after creating the job, publish `{type:'analyze', jobId, vendorId}` to the queue instead of calling the background function in-process. Response shape unchanged (still `202 {jobId, status:'queued'}`).
  - `POST /commit`, `/:jobId/commit-wave2`, `/:jobId/retry-failed`: keep the fast synchronous checks (ownership, idempotency-key format, idempotency replay — a repeat of an already-committed key should still respond instantly with the cached summary). Only when there's genuinely new work: persist the pending commit request into `CatalogImportJob.result.pendingCommit`, publish `{type:'commit', jobId, vendorId}`, respond `202 {jobId, status:'committing'}`.
  - Track commit progress in `result.commitStatus` (nested in the JSON `result` column), **not** the top-level `status` column — `status` already has established analyze-lifecycle semantics (`queued`/`processing`/`ready`/`failed`) that other code branches on; overloading it risks breaking those checks.
  - Both dry-run and real commits go through this same async path — dry-run runs the identical per-row loop with a rollback at the end, so it has the same timeout exposure on a large catalog.
- New `backend/src/lambdas/handlers/catalogImportWorker.ts` — SQS handler following the exact `batchItemFailures` pattern already used by `conversationProcessor.ts`/`mediaFetcher.ts`: reads the message, re-fetches the job/pending-commit from Postgres, calls `processAnalyzeJob` or `commit()`, updates `result.commitStatus` on completion/failure.
- `backend/src/services/catalogExtractionService.ts`: after each per-page status mutation in the extraction loop, add `await mergeJobResult(jobId, { pageProgress })` so progress is visible incrementally instead of only at the very end (needed once the SSE push is gone — pure polling would otherwise go dark for the whole analyze duration).
- Delete `backend/src/services/catalogImportEventBus.ts`, its `.emit()` call sites, and the `GET /:jobId/stream` route block once the above is live (confirmed no other consumers exist).
- Frontend: `frontend_v2/apps/web-vendor/src/lib/catalogImport.ts`'s `streamJob()` already has a polling fallback (kicks in after 3 SSE errors) — make that the primary path instead of the EventSource path, keeping the function's external signature so `CatalogImport.tsx`'s rendering logic doesn't need to change. `CatalogImport.tsx`'s `runCommit()` needs to poll for `result.commitStatus === 'done'|'failed'` instead of using the old synchronous `CommitSummary` response.
- **Verify this entire phase against a local Express server before touching Lambda at all**: upload → analyze (confirm visible incremental per-page progress) → dry-run commit → poll to `commitStatus:'done'` → real commit → poll → go-live page shows correct product counts.

### Phase 3 — Lambda packaging scripts
- `backend/scripts/package-lambda.sh` (shared worker zip): remove `exceljs`, `@fast-csv`, `date-fns` from the strip list — the new `catalogImportWorker.ts` pulls these in via `catalogExtractionService.ts`/tabular parsing, so they're no longer safely strippable once that handler joins this zip.
- New `backend/scripts/package-lambda-api.sh`: a variant that does **not** strip `express`/`cors`/`helmet`/`morgan`/`jsonwebtoken`/`swagger-ui-express`/`express-rate-limit`/`rate-limit-redis`/`firebase-admin` (the API needs all of these), but does strip `exceljs`/`@fast-csv`/`date-fns` (not reachable from any API route once analyze/commit move to the worker). Same 250MB size-check gate as the original script.
- Verify both zips build locally under 250MB unzipped; `unzip -l` confirms `node_modules/express` present only in the API zip.

### Phase 4 — Keep internal references honest
Update `backend/src/lambdas/services/lambdaConfigurationService.ts`'s `getFunctionDefinitions()` (add `chatlogix-api` and `chatlogix-catalog-import-worker`) and `backend/src/lambdas/README.md`'s function table — both exist specifically to prevent the console-drift problem this migration is trying not to repeat, so they need to reflect the new functions even though they don't drive real deploys.

### Phase 5 — AWS Console runbook: backend (SQS, PgBouncer networking, IAM, 2 new Lambdas, ACM, API Gateway custom domain)
Region ap-south-1 unless noted. Written so it's copy-paste-able, matching `docs/DEPLOYMENT.md`'s style:
1. **SQS**: create `chatlogix-catalog-import-dlq-prod`, then `chatlogix-catalog-import-queue-prod` (visibility timeout 1800s, DLQ redirect after 3 receives).
2. **PgBouncer networking**: confirm `scripts/deployment/setup-pgbouncer.sh` has actually been run and `pgbouncer` is active on the VM; open the Lightsail firewall port 6432 to the AWS VPC CIDR (same pattern as the existing 5432 rule); run `scripts/deployment/update-lambda-database-url.sh` against each new function once it exists (step 4) to wire `DATABASE_URL`→PgBouncer.
3. **IAM**: reuse the existing `chatlogix-lambda-execution-role` for both new functions — it already has the SQS/VPC/basic-execution policies both need.
4. **Create `chatlogix-api`** (Node 18.x, 1024MB, 30s timeout — capped by API Gateway anyway, same VPC/subnets/security group as the existing 5, handler `dist/lambdas/handlers/api.handler`) and **`chatlogix-catalog-import-worker`** (1536MB matching the AI-heavy `chatlogix-incoming-response-generator`, 300s timeout, handler `dist/lambdas/handlers/catalogImportWorker.handler`, SQS trigger on the new queue with batch size 5 and **"Report batch item failures" enabled** — required for `batchItemFailures` to actually take effect). Env vars: copy the full existing `.env` set for `chatlogix-api` (it runs the whole Express app); queue URL + S3 + OpenAI key for the worker.
5. **ACM cert for `api.chatlogix.in`** (ap-south-1, DNS validation) — add the validation CNAME at wherever Phase 0 found the DNS lives.
6. **API Gateway**: new HTTP API `chatlogix-dashboard-api`, single route `ANY /{proxy+}` → `chatlogix-api`, custom domain `api.chatlogix.in` (Regional endpoint, the cert from step 5), map it to the `$default` stage at the domain root. Add the resulting CNAME at the DNS provider. **Don't point real traffic at it yet.**
7. Verify: `curl` to the API Gateway's own invoke URL (not the custom domain yet) returns the same `/health` JSON as today's VM; CloudWatch shows clean invocations; an authenticated route round-trips correctly, confirming Prisma-over-PgBouncer connectivity from inside the VPC.

### Phase 6 — AWS Console runbook: frontend (S3 + CloudFront)
1. ACM cert for `app.chatlogix.in` in **us-east-1** (and the apex domain too if Phase 0 decided on apex-aliasing).
2. S3 bucket (e.g. `chatlogix-web-vendor-prod`), block all public access, versioning on.
3. CloudFront distribution: origin = that bucket via **Origin Access Control** (not a public bucket — apply the bucket policy CloudFront generates after distribution creation), redirect HTTP→HTTPS, default root object `index.html`, **custom error responses for 403 and 404 → `/index.html` with 200** (required for the SPA's client-side routing to survive deep links), alternate domain name `app.chatlogix.in`, the cert from step 1.
4. DNS: alias/CNAME `app.chatlogix.in` to the distribution; handle the apex per Phase 0's decision.
5. Verify: deep link (e.g. `/catalog/import`) loads the SPA shell instead of a raw S3 403/404; CloudFront response headers present.

### Phase 7 — CI/CD changes (`.github/workflows/deploy.yml`)
- Add `chatlogix-catalog-import-worker` to the existing hardcoded 5-function deploy loop (reuses the same shared zip already built in that job).
- Add a new `deploy-api-lambda` job: builds `/tmp/lambda-api.zip` via the new script, uploads to S3, `update-function-code` on `chatlogix-api`.
- Add a new `deploy-frontend` job: `aws s3 sync` the Vite build output to the new bucket with `--delete`, then `aws cloudfront create-invalidation --paths "/*"`. New repo variables needed: `FRONTEND_S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`. New IAM permissions on the CI deploy credentials: S3 put/delete/list on the new bucket, `cloudfront:CreateInvalidation`.
- Update the `VITE_API_URL` GitHub Actions variable to `https://api.chatlogix.in/api` — this is the only frontend code-adjacent change needed to point the SPA at the new API (confirmed the code already reads this via `import.meta.env.VITE_API_URL`, no hardcoded URLs to chase down beyond the existing fallback strings).
- Leave `bitbucket-pipelines.yml` untouched (confirmed stale/superseded).

### Phase 8 — Cutover, DNS-level (no nginx traffic-splitting available since nginx is being removed, not kept as a proxy)
- **API**: validate `chatlogix-api` thoroughly against the raw API Gateway invoke URL first (full smoke-test matrix: auth, catalog-import end-to-end, conversations/orders/products CRUD). Only then flip the `api.chatlogix.in` DNS record to the API Gateway custom domain, and redeploy the frontend with the new `VITE_API_URL`. **Set DNS TTL low before cutover** so rollback is fast. Keep PM2's `chatlogix-backend` running untouched on the VM for a **7–14 day bake period** — it costs nothing extra and is the instant rollback (just revert the DNS record).
- **Frontend**: same pattern — validate via the raw CloudFront domain first, then flip `app.chatlogix.in` (+apex). Leave the VM's nginx + static files in place, untouched, for the same bake period.
- Confirm the unrelated WhatsApp webhook (`chatlogix-webhook-handler`/`weeju313k2`) is untouched by any of this — it was never coupled to nginx or the PM2 API.

### Phase 9 — Decommission (only after a clean bake period)
Stop and remove `chatlogix-backend` from PM2 and `ecosystem.config.js`; trim `deploy-ec2.sh` and the `deploy-ec2` CI job to stop shipping frontend files to the VM; remove the old static files; disable/remove nginx; verify Postgres connectivity is unaffected; update `docs/DEPLOYMENT.md`'s "what stays on the VM" note to say Postgres-only. This is the point where the previously-agreed vertical-scaling plan actually starts.

## Verification checklist (per phase, recap)
| Phase | Must pass before moving on |
|---|---|
| 1 | Clean build; local handler invoke round-trips `/health`; PM2 dev boot unchanged |
| 2 | Full analyze→review→dry-run→commit→go-live flow works locally with visible incremental progress and correct status transitions |
| 3 | Both zips build, both under 250MB, Express present only in the API zip |
| 5 | Both new Lambdas reach PgBouncer from inside the VPC; API Gateway invoke URL serves `/health` correctly |
| 6 | CloudFront serves the SPA shell for deep links; direct S3 access is blocked |
| 7 | A CI dry-run on a branch produces both new artifacts without touching production DNS |
| 8 | Full smoke-test matrix passes on the temporary/raw endpoints before any DNS flip; post-flip metrics match or beat the PM2 baseline for the whole bake window |
| 9 | PM2 stop and nginx removal cause zero user-visible impact |

## Critical files
- `backend/src/index.ts` → split into `backend/src/app.ts` + trimmed `index.ts`
- `backend/src/lambdas/handlers/api.ts`, `backend/src/lambdas/handlers/catalogImportWorker.ts` (new)
- `backend/src/routes/catalogImport.ts`, `backend/src/services/catalogImportService.ts`, `backend/src/services/catalogExtractionService.ts`, `backend/src/services/catalogImportEventBus.ts` (deleted)
- `backend/scripts/package-lambda.sh` (modified), `backend/scripts/package-lambda-api.sh` (new)
- `backend/src/lambdas/services/lambdaConfigurationService.ts`, `backend/src/lambdas/README.md`
- `.github/workflows/deploy.yml`, `scripts/deployment/deploy-ec2.sh` (trimmed in Phase 9)
- `frontend_v2/apps/web-vendor/src/lib/catalogImport.ts`, `frontend_v2/apps/web-vendor/src/pages/CatalogImport.tsx`

## Time estimate
~12–19 days of active engineering effort; ~4–6 weeks of calendar time once DNS propagation, ACM validation, and the two 7–14 day bake windows are accounted for. This is larger than `docs/LAMBDA_MIGRATION_PLAN.md`'s own 3–4 week estimate because that doc didn't cover the catalog-import redesign or the frontend migration, both of which are net-new scope with no existing scaffolding.
