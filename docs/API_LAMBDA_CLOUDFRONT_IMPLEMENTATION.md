# API Lambda + CloudFront — Implementation Runbook

**Parent plan:** [`docs/API_LAMBDA_CLOUDFRONT_MIGRATION_PLAN.md`](./API_LAMBDA_CLOUDFRONT_MIGRATION_PLAN.md) (decisions and rationale). This file is the ordered, copy-paste execution path.

**Status:** Not started (as of 2026-09-05). Do the steps in this order. Do not skip a step’s **Done when** gate.

**Account / region:** `987272474004` / `ap-south-1`, except the CloudFront ACM cert + distribution (`us-east-1` / global).

**Domains:**
- Marketing `www.chatlogix.in` (and apex `chatlogix.in` → www or CloudFront)
- Vendor portal `app.chatlogix.in`
- Admin portal `admin.chatlogix.in`
- API `api.chatlogix.in`

**Do not touch:** WhatsApp API Gateway `weeju313k2` / `chatlogix-webhook-handler`.

**Do not touch:** WhatsApp API Gateway `weeju313k2` / `chatlogix-webhook-handler`.

---

## Corrections vs the parent plan (read before Step 1)

The parent plan is the right architecture. Following its **phase numbers as a production deploy order** would break catalog import. Fold these into execution:

| Plan assumption | What the code actually requires |
|---|---|
| Phase 2 (SQS publish) can land, then Phase 5 creates the worker | If analyze/commit start publishing to SQS before the worker exists, imports queue and die. **Create the queue + worker Lambda first**, or ship a dual-path (`CATALOG_IMPORT_QUEUE_URL` set → SQS, unset → current in-process). |
| Keep `processAnalyzeJob` in `catalogImportService.ts` | That file currently imports `catalogExtractionService` (exceljs). The API zip plans to strip exceljs. **Split enqueue vs worker code into separate modules** so the API handler never loads exceljs. |
| `mergeJobResult` after each page | It is read-modify-write with no lock (`catalogImportAuditService.ts`). Vision pages run in parallel (`Semaphore(5)`). Unserialized merges will lose page rows. **Mutex or `jsonb_set`.** |
| Promote the existing SSE polling fallback | Fallback only watches `status === ready\|failed`. It never applies `result.pageProgress`. The progress bar will freeze unless polling reads `pageProgress`. |
| SQS batch size 5, worker timeout 300s | Five sequential vision jobs in one invoke will time out. **Batch size 1. Timeout 900s. Visibility 1800s.** |
| Flip `VITE_API_URL` in the CI job (plan Phase 7) | That rebuilds the SPA still shipped to the VM. Flip the GitHub variable **only at DNS cutover** (Step 10). |
| Handler `api.handler` | Live bug on `chatlogix-media-fetcher`. Use **`dist/lambdas/handlers/api.handler`** and **`dist/lambdas/handlers/catalogImportWorker.handler`**. |
| Copy “the full `.env`” onto `chatlogix-api` | Lambda env is **4 KB**. `FIREBASE_PRIVATE_KEY` often blows that. Trim unused WhatsApp keys; use Secrets Manager if the update fails. |

Leave as decided in the plan: split `app.ts`, `@vendia/serverless-express`, separate API zip, PgBouncer (not RDS Proxy), `commitStatus` nested in `result` (do not overload `status`), two zip scripts, 7–14 day bake with PM2 still running.

**Still synchronous on the API Lambda (30s API Gateway cap):** `POST /fast/photo` and `POST /test-message`. Out of scope unless they start 504’ing. Then queue them the same way as analyze.

---

## Execution order

Do **not** follow the parent plan’s phase numbers as a deploy sequence. Use these steps:

```
Step 0  DNS discovery
Step 1  Split Express app (no behavior change)
Step 2  Catalog-import async + frontend polling  [code; dual-path]
Step 3  Packaging scripts
Step 4  lambdaConfigurationService + README
Step 5  AWS: SQS + catalog-import worker Lambda  [infra]
Step 6  Point PM2 API at the new queue, bake imports
Step 7  AWS: chatlogix-api + HTTP API + custom domain (no public DNS yet)
Step 8  AWS: S3 + CloudFront (no public DNS yet)
Step 9  CI jobs (keep VITE_API_URL on https://chatlogix.in/api)
Step 10 Cutover DNS + VITE_API_URL
Step 11 Bake 7–14 days
Step 12 Decommission nginx / PM2 backend / VM frontend
```

Parent-plan mapping: Step 0 = Phase 0; Step 1 = Phase 1; Steps 2+5+6 = Phase 2 (split so the worker exists before production enqueue); Step 3 = Phase 3; Step 4 = Phase 4; Step 7 = Phase 5; Step 8 = Phase 6; Step 9 = Phase 7; Steps 10–11 = Phase 8; Step 12 = Phase 9.

---

## Step 0 — DNS discovery (~1 hour)

**Done when:** you know the DNS host, the current apex record, and whether the apex can ALIAS to CloudFront.

1. `whois chatlogix.in` and check nameservers (Route53 vs Cloudflare vs registrar).
2. In that console, record:
   - apex `chatlogix.in` A/AAAA/CNAME (today: Lightsail public IP)
   - any `www`
   - existing ACM/email records
3. Lower TTL on the apex to **60s** now (so cutover rollback is fast).
4. Decide apex behavior (lock one):
   - **A (preferred if the provider supports ALIAS/ANAME/CNAME flattening):** apex → CloudFront; SPA at both `chatlogix.in` and `app.chatlogix.in`.
   - **B:** `app.chatlogix.in` → CloudFront; apex 301 → `https://app.chatlogix.in` (needs something that can 301; after Step 12 that cannot be nginx unless you keep a tiny redirector).
5. Firebase Console → Authentication → Settings → Authorized domains: add `app.chatlogix.in` (and the apex if you keep serving the SPA there). Do this before cutover or login breaks.

---

## Step 1 — Make Express Lambda-callable (½–1 day)

No production behavior change. PM2 still runs `dist/index.js`.

### 1.1 Split the app

**New file** `backend/src/app.ts` — move everything currently inside `bootstrap()` except `app.listen` and signal handlers:

- `express()`, middleware (`requestLogger`, `cors()`, `helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })`, `morgan`)
- `/webhook` then `express.json({ limit: '2mb' })`
- `/health`, `/api/errors/stats`, all `/api/*` routers, swagger block, `notFoundHandler`, `enhancedGlobalErrorHandler`
- `export { app }`

Keep `setupUnhandledRejectionHandler()` / `setupUncaughtExceptionHandler()` in `index.ts` (process-level), not in `app.ts`.

**Trim** `backend/src/index.ts` to:

```ts
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './logger.js';
import {
  setupUnhandledRejectionHandler,
  setupUncaughtExceptionHandler
} from './middleware/errorHandler.js';

setupUnhandledRejectionHandler();
setupUncaughtExceptionHandler();

const port = Number(env.PORT);
const server = app.listen(port, () => {
  logger.info({ port }, 'HTTP server started');
  process.send?.('ready');
});
// existing error + SIGTERM/SIGINT shutdown unchanged
```

If route tests currently boot via `index.ts`, point them at `app.ts` so they do not bind a port.

### 1.2 Adapter

```bash
cd backend && npm install @vendia/serverless-express
```

**New** `backend/src/lambdas/handlers/api.ts`:

```ts
import serverlessExpress from '@vendia/serverless-express';
import { app } from '../../app.js';

export const handler = serverlessExpress({ app });
```

API Gateway HTTP APIs use payload format 2.0; this library handles that.

### 1.3 Verify

```bash
cd backend
npm run build
npm test
npm run dev   # GET http://localhost:8000/health still works
```

Optional local Lambda invoke (no AWS): a tiny script that calls `handler` with an `APIGatewayProxyEventV2` for `GET /health` and asserts `statusCode === 200`.

**Done when:** `npm run build` is clean, tests pass, `npm run dev` is unchanged, and the handler returns the same `/health` JSON.

---

## Step 2 — Catalog-import async refactor (2–4 days)

Highest-risk code change. Ship behind dual-path so local `npm run dev` still works without the new queue.

### 2.1 Env

In `backend/src/config/env.ts` add:

```ts
CATALOG_IMPORT_QUEUE_URL: z.string().optional(),
```

Leave it **unset** on local `.env`. Set it on the VM and on both new Lambdas only after Step 5.

### 2.2 Split modules (required for the API zip)

| File | Responsibility | Imported by |
|---|---|---|
| `catalogImportService.ts` | `startAnalyze` (create job + enqueue or in-process), `enqueueCommit`, replay/idempotency checks. **No import of `catalogExtractionService`.** | API routes |
| **New** `catalogImportAnalyzeJob.ts` | Today’s `runExtractionInBackground`, renamed `processAnalyzeJob` | Worker handler only |
| `catalogImportService.ts` `commit()` **or** a worker-only `catalogImportCommitJob.ts` | Existing `commit()` body | Worker handler; API only for **replay** (cached summary) |

API `startAnalyze`:

1. `createJob(...)` as today.
2. If `env.CATALOG_IMPORT_QUEUE_URL` → `publishToQueue(url, { type: 'analyze', jobId, vendorId })`.
3. Else → `processAnalyzeJob(...)` fire-and-forget (today’s behavior, local / rollback only).
4. Return `{ jobId, status: 'queued' }` (unchanged).

Do **not** put `brochureImageKeys` / `approvedProducts` in the SQS body (256 KB limit). The worker re-reads `CatalogImportJob.inputManifest` / `result.pendingCommit`.

### 2.3 Incremental `pageProgress` (and no lost updates)

In `catalogExtractionService.ts`, after each page status change, persist `pageProgress`.

Do **not** call bare `mergeJobResult` from parallel page tasks. Add a mutex in the extract function (a single-threaded promise chain is enough inside one worker invoke):

```ts
let writeChain = Promise.resolve();
const persistProgress = () => {
  writeChain = writeChain.then(() =>
    mergeJobResult(jobId, { pageProgress: [...pageProgress] })
  );
  return writeChain;
};
```

Call `await persistProgress()` after `page.started` / completed / failed, and after tabular parse / enrichment. Delete `catalogImportEventBus.emit` in the same edit.

### 2.4 Commit → 202 + `result.commitStatus`

Do **not** change top-level `status` (`queued` / `processing` / `ready` / `failed`).

`POST /commit`, `POST /:jobId/commit-wave2`, `POST /:jobId/retry-failed`:

1. Keep ownership + idempotency-key format checks (sync).
2. If cached summary matches → `200` + `Idempotent-Replay: true` (unchanged).
3. If `result.commitStatus === 'committing'` for the same wave → `202 { jobId, status: 'committing' }` (don’t double-enqueue).
4. Else `mergeJobResult` with `pendingCommit: <full CommitRequest>` and `commitStatus: 'committing'`.
5. Publish `{ type: 'commit', jobId, vendorId, wave }` (wave so the worker knows which cache slot).
6. Respond **`202 { jobId, status: 'committing' }`**.

Empty retry (`failedIds.size === 0`) stays a sync `200` with a zero summary.

Worker on commit success: `commitStatus: 'done'`, write `commitSummary` / `commitSummaryWave2` as today, clear `pendingCommit`.  
On failure: `commitStatus: 'failed'`, `commitError: message`. Do **not** set top-level `status` to `failed` (that would look like analyze failed).

Dry-run uses the same async path (same per-row loop + rollback; same timeout exposure).

### 2.5 Worker handler

**New** `backend/src/lambdas/handlers/catalogImportWorker.ts` — copy the `batchItemFailures` loop from `backend/src/conversation/handler.ts`:

- Parse body `{ type, jobId, vendorId }`.
- `analyze` → load job → `processAnalyzeJob(vendorId, jobId, inputManifest)`.
- `commit` → load `result.pendingCommit` → existing `commit()`.
- Malformed body: log and **do not** retry (same as media fetcher).
- Unexpected throw → `batchItemFailures`.

### 2.6 Delete SSE last

Keep `GET /:jobId/stream` until the frontend polling path is verified in production (Step 6). Then delete:

- `backend/src/services/catalogImportEventBus.ts`
- remaining `.emit` / `subscribe` call sites
- the stream route

`?token=` auth on the catalog-import router can stay (harmless) or be removed later.

### 2.7 Frontend

`frontend_v2/apps/web-vendor/src/lib/catalogImport.ts` — rewrite `streamJob` to poll `getJob` every 2s:

- `onEvent` for page updates from `job.result.pageProgress` (diff against last snapshot so `CatalogImport.tsx` `onEvent` still drives the bar).
- `onTerminal('job.complete')` when `status === 'ready'`.
- `onTerminal('job.failed')` when `status === 'failed'`.
- Keep the `streamJob(jobId, handlers)` signature so the analyze `useEffect` in `CatalogImport.tsx` stays.

`runCommit` in `CatalogImport.tsx`:

- `commit()` may return 202. Treat a non-summary body as “start polling”.
- Poll `getJob` until `result.commitStatus === 'done'` → `setSummary(job.result.commitSummary.summary)` then existing dry-run vs go-live navigation.
- `commitStatus === 'failed'` → toast `result.commitError`, phase `reviewing`.
- Timeout (e.g. 10 minutes) → toast and return to reviewing.

Use the same polling helper for wave-2 / retry if those UIs expect a `CommitSummary`.

Update fallbacks (used only if `VITE_API_URL` is missing at build):

- `src/lib/api.ts`, `auth.ts`, `catalogImport.ts`, `env.template` → `https://api.chatlogix.in/api`

Production builds already inject `vars.VITE_API_URL`, so this is belt-and-suspenders.

### 2.8 Tests

- `startAnalyze` publishes to SQS when the URL is set (mock `publishToQueue`).
- `startAnalyze` calls `processAnalyzeJob` when the URL is unset.
- Commit replay still 200 without enqueue.
- New commit enqueues and 202.
- Parallel page updates do not drop `pageProgress` rows (mutex test).

### 2.9 Local verify (still Express, queue unset)

Upload → analyze (bar moves per page) → review → dry-run commit → poll to `commitStatus: done` → real commit → go-live counts.

**Done when:** that flow works locally with the queue **unset**. Do not set the prod URL on the VM yet.

---

## Step 3 — Packaging (½ day)

### 3.1 Worker zip (`backend/scripts/package-lambda.sh`)

**Remove from the strip list** (the new worker imports them):

- `exceljs`, `@fast-csv`, `date-fns`

**Keep stripped:** `express`, `cors`, `helmet`, `morgan`, `jsonwebtoken`, `swagger-ui-express`, `swagger-ui-dist`, `express-rate-limit`, `rate-limit-redis`, `firebase-admin`, `@firebase`, `@google-cloud`, and the rest of the current list.

### 3.2 API zip — new `backend/scripts/package-lambda-api.sh`

Copy the worker script. Change the strip list:

**Do not strip:** `express`, `cors`, `helmet`, `morgan`, `jsonwebtoken`, `swagger-ui-express`, `swagger-ui-dist`, `express-rate-limit`, `rate-limit-redis`, `firebase-admin` (and `@firebase` / `@google-cloud` / `google-gax` / `@grpc` if admin needs them).

**Do strip:** `exceljs`, `@fast-csv`, `date-fns` — **only if** the Step 2.2 split is done. Confirm by importing `dist/lambdas/handlers/api.js` after the strip.

Same 250 MiB unzipped gate as the original script.

### 3.3 Verify locally

```bash
cd backend
# production node_modules + dist present
bash scripts/package-lambda.sh /tmp/lambda.zip
bash scripts/package-lambda-api.sh /tmp/lambda-api.zip
unzip -l /tmp/lambda.zip | grep node_modules/express || echo "express absent from worker: OK"
unzip -l /tmp/lambda-api.zip | grep node_modules/express
unzip -l /tmp/lambda.zip | grep exceljs
```

**Done when:** both zips are under 250 MiB; express is only in the API zip; exceljs is in the worker zip; the API handler loads after strip.

---

## Step 4 — Keep internal catalogs honest (30 min)

In `backend/src/lambdas/services/lambdaConfigurationService.ts` `getFunctionDefinitions()`, add:

| name | handler | memory | timeout |
|---|---|---|---|
| `chatlogix-api` | `dist/lambdas/handlers/api.handler` | 1024 | 30 |
| `chatlogix-catalog-import-worker` | `dist/lambdas/handlers/catalogImportWorker.handler` | 1536 | 900 |

Update the function table in `backend/src/lambdas/README.md`. CI still does **not** create functions (`update-function-code` only).

**Done when:** those two names appear in both files with the `dist/lambdas/handlers/…` handler path.

---

## Step 5 — AWS: queue + worker Lambda (console, ~2 hours)

Region **ap-south-1**.

### 5.1 SQS

1. Create queue `chatlogix-catalog-import-dlq-prod` (Standard, defaults).
2. Create `chatlogix-catalog-import-queue-prod` (Standard):
   - Visibility timeout: **1800** seconds
   - Dead-letter: the DLQ, max receives **3**
   - Message retention: 4 days (default is fine)
3. Copy the queue URL into your notes as `CATALOG_IMPORT_QUEUE_URL`.

### 5.2 PgBouncer (if not already)

On the VM: `systemctl is-active pgbouncer` must be `active`.  
Lightsail firewall: TCP **6432** from the Lambda VPC CIDR (same pattern as the existing 5432 rule).  
Do **not** open 6432 to `0.0.0.0/0`.

### 5.3 Create `chatlogix-catalog-import-worker`

| Field | Value |
|---|---|
| Runtime | Node.js 18.x |
| Architecture | x86_64 |
| Handler | **`dist/lambdas/handlers/catalogImportWorker.handler`** |
| Memory | 1536 MB |
| Timeout | **900** seconds |
| Role | existing `chatlogix-lambda-execution-role` |
| VPC | same subnets + SG as the other 5 |

**Trigger:** SQS `chatlogix-catalog-import-queue-prod`

- Batch size: **1**
- **Report batch item failures:** enabled
- Optional maximum concurrency: 2–5 so imports cannot stampede Postgres

**Env (minimum):**

- `NODE_ENV=production`
- `DATABASE_URL` via `scripts/deployment/update-lambda-database-url.sh chatlogix-catalog-import-worker` (`connection_limit=1`, `pgbouncer=true`)
- `REDIS_URL` (ElastiCache, same as other Lambdas)
- `CATALOG_IMPORT_QUEUE_URL`
- `CATALOG_IMPORT_S3_BUCKET` / `CATALOG_IMPORT_S3_REGION`
- `OPENAI_API_KEY`, `VISION_EXTRACTION_MODEL`
- `AWS_REGION=ap-south-1`
- `RESPONSE_QUEUE_URL` (required by `env.ts` even if this worker never publishes)
- `LOG_LEVEL=info`
- `ENABLE_FILE_LOGS=false`

Upload code: after merge to `master`, CI (Step 9) can update it. For the first create, upload `/tmp/lambda.zip` from Step 3 to `s3://ap-south-1-chatlogix-lambda-deployments-prod/functions/chatlogix-catalog-import-worker/<sha>.zip`.

**Done when:** a test SQS message `{ "type": "analyze", "jobId": "<real-queued-job>", "vendorId": "..." }` runs; CloudWatch shows success; the job `status` becomes `processing` then `ready`.

---

## Step 6 — Turn on the queue for the live PM2 API (½ day + bake)

API still on the VM. Worker is live.

1. Merge Steps 1–4; let `deploy-ec2` ship it. **Leave `CATALOG_IMPORT_QUEUE_URL` unset** on first deploy (still in-process).
2. Confirm Smart Import still works (rollback = revert the commit).
3. Add `CATALOG_IMPORT_QUEUE_URL=<queue url>` to the VM `backend/.env`.
4. `pm2 restart chatlogix-backend --update-env`.
5. Run one real import. Confirm:
   - API 202
   - SQS message appears then vanishes
   - worker logs
   - progress bar moves
   - dry-run + real commit via polling

Keep this for at least **24 hours** of real imports before Step 10.

**Rollback:** remove `CATALOG_IMPORT_QUEUE_URL` from `.env`, restart PM2 (in-process again). Drain the queue first if messages are in flight.

**Done when:** production imports use the worker; the PM2 API only enqueues.

---

## Step 7 — AWS: API Lambda + HTTP API (no public DNS yet) (~3 hours)

### 7.1 Create `chatlogix-api`

| Field | Value |
|---|---|
| Handler | **`dist/lambdas/handlers/api.handler`** |
| Memory | 1024 MB |
| Timeout | **30** seconds |
| Role / VPC | same as other functions |
| Package | `/tmp/lambda-api.zip` (API zip, **not** the worker zip) |

**Env:** copy from the VM `.env` but:

- PgBouncer URL + `DATABASE_CONNECTION_LIMIT=1` + `DATABASE_POOL_TIMEOUT=3`
- `CATALOG_IMPORT_QUEUE_URL` set (required once Step 6 is done)
- `REDIS_URL`
- `AUTH_JWT_SECRET`, Firebase trio, `RECAPTCHA_SECRET_KEY`
- `CATALOG_IMPORT_*`, S3
- `RESPONSE_QUEUE_URL` (zod requires it)
- Skip file logs / swagger in production (`ENABLE_FILE_LOGS` unset/false, `ENABLE_SWAGGER` unset)
- If `UpdateFunctionConfiguration` fails on size, move `FIREBASE_PRIVATE_KEY` to Secrets Manager and load at runtime (follow-up); do not ship a broken function

IAM: confirm `sqs:SendMessage` on the new catalog-import queue. Confirm S3 presign for the catalog-import bucket.

### 7.2 ACM (ap-south-1)

Request a public cert for `api.chatlogix.in`. Add the validation CNAME at the DNS host from Step 0. Wait until **Issued**.

### 7.3 HTTP API

1. Create HTTP API named `chatlogix-dashboard-api`.
2. Integration: Lambda `chatlogix-api`, payload format 2.0.
3. Routes: `ANY /{proxy+}` **and** `ANY /` (`/health` is not under `/api`).
4. Stage: `$default`, auto-deploy.
5. **Do not configure API Gateway CORS** (Express `cors()` owns headers).
6. Custom domain: `api.chatlogix.in`, Regional, cert from 7.2, API mapping `$default` at path `(none)`.
7. **Do not create the public `api.chatlogix.in` DNS record yet.** Use the execute-api invoke URL.

### 7.4 Verify invoke URL (not the custom domain)

```bash
curl -sS https://<api-id>.execute-api.ap-south-1.amazonaws.com/health
# expect {"status":"ok",...}

# preflight (will matter after the SPA moves)
curl -sSI -X OPTIONS https://<api-id>.execute-api.ap-south-1.amazonaws.com/api/auth/send-code \
  -H "Origin: https://app.chatlogix.in" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

Then with a real vendor JWT: conversations list, products list, catalog-import `GET /jobs`, one analyze (worker path).

Watch CloudWatch `/aws/lambda/chatlogix-api` for Prisma / Redis errors.

**Done when:** invoke URL `/health` matches the VM; authenticated CRUD works; import still goes through SQS.

---

## Step 8 — AWS: S3 + CloudFront (no public DNS yet) (~2 hours)

### 8.1 ACM in **us-east-1**

Cert for `app.chatlogix.in`. If Step 0 chose apex-alias, include `chatlogix.in` (and `www`) on the same cert. DNS validate.

### 8.2 S3

- Bucket e.g. `chatlogix-web-vendor-prod`, region `ap-south-1` (or `us-east-1`; either works with CloudFront).
- Block **all** public access.
- Versioning on.
- Default encryption SSE-S3.

### 8.3 CloudFront

- Origin: the bucket via **Origin Access Control** (not OAI). After create, apply the bucket policy CloudFront shows.
- Viewer: redirect HTTP→HTTPS.
- Default root object: `index.html`.
- Cache: hashed assets can be long-TTL; HTML is short-TTL or invalidated every deploy (Step 9 invalidates `/*`).
- **Custom error responses:** 403 → `/index.html` with 200; 404 → `/index.html` with 200 (React `BrowserRouter`).
- Alternate domain: `app.chatlogix.in` (+ apex if chosen).
- Cert: us-east-1 cert from 8.1.

### 8.4 First upload (manual)

Upload current `frontend_v2/apps/web-vendor/dist` built with **current** `VITE_API_URL=https://chatlogix.in/api`. The SPA on CloudFront still calls the VM API — that is OK (cross-origin; `cors()` reflects Origin; JWT is in `localStorage`, sent as `Authorization`).

**Done when:** `https://<distribution>.cloudfront.net/` loads; `https://<distribution>.cloudfront.net/catalog/import` returns the SPA (not raw XML 404); direct S3 website access is denied.

---

## Step 9 — CI (do not flip `VITE_API_URL`) (~½ day)

Edit `.github/workflows/deploy.yml` only. Leave `bitbucket-pipelines.yml` untouched.

### 9.1 `deploy-lambdas`

Add `chatlogix-catalog-import-worker` to the existing `for fn in ...` list. Same `/tmp/lambda.zip`.

### 9.2 New job `deploy-api-lambda`

Same artifact download as `deploy-lambdas`, then:

```bash
bash scripts/package-lambda-api.sh /tmp/lambda-api.zip
aws s3 cp /tmp/lambda-api.zip \
  "s3://${LAMBDA_S3_BUCKET}/functions/chatlogix-api/${GITHUB_SHA}.zip"
aws lambda update-function-code \
  --function-name chatlogix-api \
  --s3-bucket "${LAMBDA_S3_BUCKET}" \
  --s3-key "functions/chatlogix-api/${GITHUB_SHA}.zip" \
  --publish
aws lambda wait function-updated --function-name chatlogix-api
```

The function must already exist from Step 7 (`update-function-code` does not create it).

### 9.3 New job `deploy-frontend`

- Download `frontend-dist`
- `aws s3 sync …/web-vendor/dist s3://${FRONTEND_S3_BUCKET} --delete`
- `aws cloudfront create-invalidation --distribution-id ${CLOUDFRONT_DISTRIBUTION_ID} --paths "/*"`

**New GitHub environment variables:** `FRONTEND_S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.  
**IAM on `chatlogix-deployer`:** `s3:PutObject` / `DeleteObject` / `ListBucket` on that bucket; `cloudfront:CreateInvalidation`.

### 9.4 Keep `deploy-ec2`

Still required for `prisma migrate deploy` and the PM2 bake. Do **not** change `vars.VITE_API_URL` yet (must stay `https://chatlogix.in/api`).

**Done when:** a `workflow_dispatch` on `master` updates the worker + API Lambda + S3 without changing public DNS.

---

## Step 10 — Cutover (DNS + frontend API URL) (~2 hours + TTL)

**Pre-flip smoke** (must all pass):

- [ ] Invoke URL: auth, conversations, orders, products, catalog import E2E
- [ ] CloudFront raw domain: login against **current** `VITE_API_URL` (VM) still works
- [ ] Custom domain `api.chatlogix.in` resolves in `/etc/hosts` to the API Gateway target; `curl /health` works
- [ ] TTL on apex / future API CNAME is 60s
- [ ] PM2 `chatlogix-backend` still running

### API DNS

Create CNAME (or ALIAS) `api.chatlogix.in` → API Gateway custom-domain target (from the console). Wait until `curl https://api.chatlogix.in/health` works from a network that is not your laptop cache.

### Frontend rebuild

1. Set GitHub `VITE_API_URL` = `https://api.chatlogix.in/api`.
2. Run Deploy (or wait for the next `master` push).
3. Confirm the new JS bundle in S3 contains `api.chatlogix.in` (`grep` in `dist/assets/*.js`).
4. DNS: `app.chatlogix.in` → CloudFront. Apex per Step 0.

Firebase authorized domains already include `app.chatlogix.in` from Step 0.

### Rollback (fast)

- Set `VITE_API_URL` back to `https://chatlogix.in/api`, redeploy frontend.
- Point `app` / apex back to the Lightsail IP.
- Leave or revert the `api.chatlogix.in` CNAME as needed.
- PM2 + nginx were never stopped.

**Done when:** vendors log in at `app.chatlogix.in`, the network tab shows `api.chatlogix.in`, and WhatsApp messages still flow (webhook unchanged).

---

## Step 11 — Bake (7–14 days)

Watch:

- Lambda errors / p95 duration (`chatlogix-api` cold starts of 1–3s in VPC are expected)
- PgBouncer `SHOW POOLS` / Postgres `max_connections`
- Catalog-import DLQ depth
- CloudFront 4xx vs SPA error-mapping (deep links should be 200)

Do **not** stop PM2. It is idle except if you still proxy something to it.

Optional: provisioned concurrency = 1 on `chatlogix-api` if the first dashboard click is too slow.

**Done when:** error rate and p95 are acceptable vs the old nginx/PM2 baseline; no import stuck in `committing`.

---

## Step 12 — Decommission

1. `pm2 stop chatlogix-backend && pm2 delete chatlogix-backend && pm2 save`
2. Remove the app from `ecosystem.config.js`
3. Trim `scripts/deployment/deploy-ec2.sh` + the `deploy-ec2` CI job: **keep** `prisma migrate deploy` (and enough `node_modules` / Prisma client to run it). **Stop** copying `frontend/dist`.
4. Remove VM static files and disable nginx only after migrate still has a way to run (SSH + `npx prisma migrate deploy` is enough).
5. Update `docs/DEPLOYMENT.md`: VM = Postgres + PgBouncer (Redis is already ElastiCache).
6. Set the status line on `docs/API_LAMBDA_CLOUDFRONT_MIGRATION_PLAN.md` to done; check off phases.

**Done when:** stopping nginx/PM2 does not change `curl https://api.chatlogix.in/health` or the SPA; WhatsApp is unaffected.

---

## Smoke-test matrix (use at Steps 6, 7.4, and 10)

| Area | Check |
|---|---|
| Health | `GET /health` |
| Auth | send-code + verify + authorized request |
| CORS | from `Origin: https://app.chatlogix.in`, `Authorization` header |
| Conversations | list + thread + media GET (Helmet CORP already `cross-origin`) |
| Orders / products / FAQs | CRUD happy path |
| Catalog import | upload URL → S3 PUT → analyze progress → dry-run → commit → go-live |
| Wave-2 / retry | if you use them in prod |
| Fast photo / test-message | still &lt; 30s |
| WhatsApp | inbound text still replies (control) |

---

## Critical files

- `backend/src/index.ts` → split into `backend/src/app.ts` + thin `index.ts`
- `backend/src/lambdas/handlers/api.ts` (new)
- `backend/src/lambdas/handlers/catalogImportWorker.ts` (new)
- `backend/src/services/catalogImportService.ts` (enqueue only; no exceljs import)
- `backend/src/services/catalogImportAnalyzeJob.ts` (new, worker-only)
- `backend/src/services/catalogExtractionService.ts` (persist progress + mutex)
- `backend/src/routes/catalogImport.ts`
- `backend/src/config/env.ts`
- `backend/src/services/catalogImportEventBus.ts` (deleted after Step 6)
- `backend/scripts/package-lambda.sh` (modified)
- `backend/scripts/package-lambda-api.sh` (new)
- `backend/src/lambdas/services/lambdaConfigurationService.ts`
- `backend/src/lambdas/README.md`
- `frontend_v2/apps/web-vendor/src/lib/catalogImport.ts`
- `frontend_v2/apps/web-vendor/src/pages/CatalogImport.tsx`
- `.github/workflows/deploy.yml`
- `scripts/deployment/deploy-ec2.sh` (trimmed in Step 12)

---

## Time estimate

About **12–19 engineering days**, **4–6 calendar weeks** with ACM, DNS, the Step 6 bake, and the Step 11 bake. Same envelope as the parent plan; Step 6 is inserted so catalog import is not dark between “code on PM2” and “worker exists.”
