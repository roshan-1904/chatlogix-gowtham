# ChatLogix - Project Rules

## Overview
WhatsApp-based e-commerce SaaS platform. AI handles vendor customer service (ordering, FAQs, order tracking) via natural WhatsApp conversations.

## Architecture

### Backend (`backend/`)
- **Runtime:** TypeScript/Node.js + Express (ESM, `--import tsx`)
- **Database:** PostgreSQL (Supabase) via Prisma ORM (`backend/prisma/schema.prisma`)
- **Cache:** Redis (ioredis)
- **Queue:** AWS SQS (LocalStack for dev)
- **AI:** OpenAI GPT-4.1/GPT-4.1-mini
- **Auth:** Firebase Admin SDK + JWT
- **Messaging:** WhatsApp Business API (Meta)
- **Logging:** Pino
- **Validation:** Zod

### Frontend (`frontend_v2/`) - ACTIVE
- **Monorepo:** Turborepo with npm workspaces
- **Apps:** `web-vendor` (React/Vite - primary), `web-admin` (scaffolding), `vendor-mobile` (React Native/Expo - minimal)
- **Shared packages:** `api-client`, `auth`, `config`, `design-tokens`, `hooks`, `schemas`, `ui`, `utils`
- **IMPORTANT:** `frontend/` is DEPRECATED. Only `frontend_v2/` is used.

### Message pipeline — AWS Lambda (production path)

Production text traffic runs entirely on 5 Lambda functions (see `backend/src/lambdas/README.md` for the authoritative list), **not** the PM2 workers below:

- `chatlogix-webhook-handler` (`lambdas/handlers/webhookHandler.ts`) — API Gateway webhook receiver, ACKs WhatsApp in <3s. Delegates to `webhookEventProcessor.ts#processWebhookEventBatch`, which is shared with the Express `/webhook` route (see its own doc comment) — so as of the 2026-09-01 refactor it already persists `message_created` events of **any** type (not just text), creates a `MessageMedia` placeholder + enqueues a `MediaFetchJob` to `MEDIA_FETCH_QUEUE_URL` for `audio/image/video/document/sticker`, and processes reactions + delivery/read status updates (with the Redis-backed orphan buffer). Only `text`/`interactive` get enqueued to `TEXT_QUEUE_URL` for an AI reply — media types wait on the fetch pipeline below. (`docs/CONVERSATION_WORKER_GAPS.md` §2.1 describes the *pre-refactor* behavior and is stale on this point — see the correction note added there 2026-09-04.)
- `chatlogix-incoming-response-generator` (`lambdas/handlers/conversationProcessor.ts` → `backend/src/conversation/*`) — the current AI pipeline (LLM-1 + CartEngine + optional LLM-2 verifier). Its handler accepts any `{type:'TextMessage', ...}` SQS payload regardless of source queue. **Verified against AWS 2026-09-11: it has three enabled triggers** — `chatlogix-text-queue-prod` (batch size 1, `ReportBatchItemFailures` on), `chatlogix-audio-queue-prod` and `chatlogix-image-queue-prod` (both batch size 10, **no** `ReportBatchItemFailures`, so one failure redelivers all 10). The earlier note here that audio/image were unwired — leaving transcribed voice notes with "nowhere to go" — is **stale; that loop is closed.** Publishes to `RESPONSE_QUEUE_URL`. Spec: `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. Living as-implemented walkthrough: `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md` (update that file whenever the pipeline flow changes).
- `chatlogix-whatsapp-response-dispatcher` (`lambdas/handlers/responseProcessor.ts`, shared logic in `workers/responseProcessor.ts`) — sends the WhatsApp message.
- `chatlogix-order-recovery` (`lambdas/handlers/orderRecovery.ts`) — EventBridge-scheduled sweep; **verify the EventBridge rule actually exists** before relying on it (none was confirmed as of 2026-09-01).
- `chatlogix-media-fetcher` (`lambdas/handlers/mediaFetcher.ts`) — SQS-triggered off `MEDIA_FETCH_QUEUE_URL` (batch size 10, `ReportBatchItemFailures` on), downloads media from the WhatsApp Graph API, uploads to S3, transcribes audio via Whisper (shares `processJob()` with `mediaWorker.ts` via `services/mediaFetchProcessor.ts`). **The `Runtime.HandlerNotFound` misconfiguration previously noted here is fixed** — verified against AWS 2026-09-11, the handler is `dist/lambdas/handlers/mediaFetcher.handler`, matching the other four functions. It also has audio-queue and image-queue mappings, both **Disabled**, since those two queues now feed `chatlogix-incoming-response-generator` instead.

### Workers still on PM2 (`ecosystem.config.js`, 1 process)

- `chatlogix-backend` — the Express API (`src/index.ts`), dashboard/auth/orders/etc. Its own `/webhook` route runs the same `webhookEventProcessor.ts` pipeline as the Lambda (shared code, see above) — but **WhatsApp calls API Gateway, not this route, in production** — so that code path is effectively dev-only today.
- `chatlogix-media-worker` (`src/workers/mediaWorker.ts`) — same Whisper transcription + image handling as `chatlogix-media-fetcher` above (shares `processJob()`). Deliberately **retired from PM2** in favor of that Lambda (see the comment in `ecosystem.config.js`) — still runnable manually via `npm run worker:media` for local dev/fallback, but not process-managed in production.
- `conversationWorker.ts` — local-dev-only counterpart to `chatlogix-incoming-response-generator`, for running the same `conversation/pipeline.ts` against LocalStack. Not deployed.

The old 14-stage orchestrator (`multiStageOrchestrator.ts`, `unifiedAIProcessorService.ts`) and its standalone PM2 workers (`incomingMessageWorker`, `multiStageAIWorker`, `responseWorker`, `orderRecoveryWorker`, `textWorker`) were removed 2026-09 — the orchestrator is no longer on the hot path (still used by `catalogImportSandboxService.ts` only). See `docs/CONVERSATION_WORKER_GAPS.md` for the full migration/gap writeup.

## Deployment

- **PM2** via `ecosystem.config.js` — 2 processes: `chatlogix-backend`, `chatlogix-media-worker`
- **AWS Lambda** for the message pipeline (`backend/src/lambdas/`) — deployed via `.github/workflows/deploy.yml` (5 hardcoded function names; the `npm run deploy:lambda` script is a secondary path, not what CI uses)
- **Active deploy script:** `scripts/deployment/deploy-ec2.sh` (git reset + tarball extract + `pm2 reload ecosystem.config.js`)
- **Docker Compose** (`docker-compose.yml`) — local-only: postgres, redis, backend, frontend (stale — points at the deprecated `frontend/`, not `frontend_v2/`)
- See `docs/LAMBDA_MIGRATION_PLAN.md` for the plan to move the remaining PM2 workloads (API + media worker) to Lambda

## Key Commands

```bash
# Backend
cd backend && npm run dev              # Start dev server
npm run worker:conversation            # Start local conversation-processor worker (LocalStack text queue)
npm run worker:media                   # Start media worker (audio/image, live on PM2 in prod)
npm run prisma:generate                # Generate Prisma client
npm run prisma:migrate                 # Run migrations
npm test                               # Run tests (vitest)

# Frontend
cd frontend_v2 && npm run dev          # Start all apps
npm run build                          # Build all
npm run lint                           # Lint all
npm run type-check                     # Type check all
```

## Database Models (Prisma)
Core: `Vendor`, `Customer`, `Conversation`, `Message`, `Order`, `Product`
AI/Analytics: `ConversationMemory`, `CustomerInsights`, `QualityMetrics`, `StageExecutionLog`, `CorrectionHistory`
Billing: `CreditUsage`, `BillingHistory`, `WalletTransaction`, `WalletTopUpIntent`, `PlatformSettings`, `FxRateHistory`
Other: `WhatsAppNumber`, `NotificationHistory`, `OrderAuditLog`, `OrderAlert`, `Admin`

## API Routes
- `/api/webhook` - WhatsApp webhook (no auth)
- `/api/auth` - Authentication
- `/api/vendors` - Vendor management (authenticated)
- `/api/conversations` - Conversation management
- `/api/orders` - Order management
- `/api/products` - Product catalog
- `/api/payments` - Payment processing
- `/api/shipping` - Shipping management
- `/api/usage` - Credit usage tracking

## Conventions
- Backend services are in `backend/src/services/` (60+ files, single-responsibility)
- Routes are thin wrappers that delegate to services
- All amounts are stored as integers, but in **two different units**: wallet/billing money is **millirupees** (1 rupee = 1000 milli, fields suffixed `Milli`), while order/product/revenue money stays in **paise**. `backend/src/utils/money.ts` is the unit authority — do not mix them
- **`backend/src/services/pricing/pricingService.ts` is the only writer of `Vendor.walletBalanceMilli`.** Every billable action costs `ceil((aiCost + whatsappCost + platformFee) × (1 + Vendor.markupPercent/100))` in millirupees, with one rounding step after markup. Full model: `docs/BILLING_AND_PRICING.md`
- There is **no monthly plan quota and no flat per-message credit cost** — every charge is real cost plus the vendor's markup. `Vendor.subscriptionPlan` is bookkeeping only
- Multi-language support: Tamil, Hindi, English
- Order numbers use vendor-configurable prefix
- Docker Compose for local dev (postgres, redis, localstack, backend, workers)

## Deployed AWS reality (verified 2026-09-11, account `987272474004` / `ap-south-1`)

Several deployed values drift from the specs in `docs/`. Full table in `docs/LOAD_TESTING.md` §0.

- **PgBouncer is in the Lambda path.** All five functions' `DATABASE_URL` points at port **6432** (cutover 2026-09-11, AWS-verified). The raw-Postgres failure mode (1000 containers × 100 `max_connections`) is closed. **Reserved concurrency (132 total, 2026-09-11):** webhook **30**, processor **80**, dispatcher **15**, media-fetcher **5**, order-recovery **2** (set manually in AWS). Remaining before Phase 2: confirm PgBouncer `default_pool_size` under load (`npm run loadtest:probe-pgbouncer`).
- **`chatlogix-incoming-response-generator` is deployed with a 300s timeout / 2048MB**, not the 60s/1536MB in `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. Conversation lock TTL is **300s** (`DEFAULT_LOCK_TTL_MS`, fixed 2026-09-12) to match.
- **Lambda concurrency quota** (`L-B99A9384`) raised from 10 to 1000 on 2026-09-11. `DATABASE_CONNECTION_LIMIT=1` / `DATABASE_POOL_TIMEOUT=3` confirmed on all five functions.
- **Security: ports 5432 and 6432 on the database host answer from the public internet.** Production Postgres should be restricted to Lambda egress and the app hosts.
- **Text queue** `chatlogix-text-queue-prod`: visibility 1800s, `maxReceiveCount` 5 (specs say 360s / 3).
- **`CLOUDWATCH_METRICS_ENABLED=true` is set** on the processor; `chatlogix-lambda-role` has `cloudwatch:PutMetricData` for namespace `ChatLogix/ConversationParity` (2026-09-11). Metrics appear after the next cold start.
- **Three event source mappings lack `ReportBatchItemFailures` at batch size 10** — audio-queue and image-queue into the processor, and response-queue into the dispatcher. One failed record redelivers the whole batch; on the dispatcher that means duplicate WhatsApp sends.

## Important Notes
- Never modify `frontend/` - it's deprecated
- `master` is the active development branch (the `multi_stage_ai_worker` branch referenced here previously no longer exists)
- AI model defaults to `gpt-4.1-mini` (configurable per vendor)
- Prisma schema uses `@@map` to keep DB table names PascalCase
- Backend uses ESM (`"type": "module"` in package.json)
- Target cost: <$0.0022 per AI message
- **Admin access to `web-admin` comes from the `AUTH_ADMIN_PHONES` env allowlist** (`services/roleService.ts`), not the `Admin` table
- Trial wallet grant is **₹50** (`PlatformSettings.trialGrantPaise`, env fallback `TRIAL_GRANT_MILLI`); low-balance warning fires under ₹20
- WhatsApp per-conversation fees are **not billed yet** (`platformFeePerTurnPaise` is `0` until the P2h rate card) — ChatLogix absorbs Meta conversation costs today
- **All migrations are applied and recorded** (verified 2026-09-16 against `_prisma_migrations`, 8 rows; `prisma migrate status` → "Database schema is up to date!", zero drift from `schema.prisma`). That includes `20250916120000_wallet_top_up_intent`, `20250916180000_wallet_milli_units`, `20250916210000_credit_usage_source` and `20250916220000_platform_settings`. Their SQL had reached the DB out of band, so `migrate deploy` failed on an already-renamed column; they were reconciled with `prisma migrate resolve --applied` — accurate, not a problem. The ×10 rescale ran exactly once — all 277 pre-cutover `WalletTransaction` rows carry `metadata.unitMigration = 'paise_to_milli'`, which is the marker to check before ever re-running it
- **Live billing knobs come from the `PlatformSettings` singleton, not env.** Read path: process memory (60s) → Redis `platform:settings` (24h) → Postgres → env fallback. Money columns there are **paise**; convert with `paiseToMilli` at the wallet boundary. `USD_TO_INR_RATE`, `TRIAL_GRANT_MILLI`, `PLATFORM_FEE_*_MILLI`, `CATALOG_*_DAILY_MILLI_CAP` and the top-up knobs are **seed + last-resort fallback only** — editing `.env` no longer changes live behavior. `WALLET_PAYMENT_PROVIDER` stays env-only. USD/INR refreshes daily from **Frankfurter** into `usdToInrRate` (history in `FxRateHistory`; admins can pin `usdToInrOverride`). Admin surface: the web-admin **`/billing`** page over `GET`/`PATCH /api/admin/settings` plus `POST /api/admin/settings/refresh-fx` — it always reads and writes **rupees**, converting at the edge
