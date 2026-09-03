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

- `chatlogix-webhook-handler` (`lambdas/handlers/webhookHandler.ts`) — API Gateway webhook receiver, ACKs WhatsApp in <3s, enqueues text messages to `TEXT_QUEUE_URL`. **Only handles `type: text`** — audio/image messages are dropped (known gap, see `docs/CONVERSATION_WORKER_GAPS.md`), and it doesn't process reactions or status webhooks at all.
- `chatlogix-incoming-response-generator` (`lambdas/handlers/conversationProcessor.ts` → `backend/src/conversation/*`) — the current AI pipeline (LLM-1 + CartEngine + optional LLM-2 verifier). Consumes the text queue, publishes to `RESPONSE_QUEUE_URL`. Spec: `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. Living as-implemented walkthrough: `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md` (update that file whenever the pipeline flow changes).
- `chatlogix-whatsapp-response-dispatcher` (`lambdas/handlers/responseProcessor.ts`, shared logic in `workers/responseProcessor.ts`) — sends the WhatsApp message.
- `chatlogix-order-recovery` (`lambdas/handlers/orderRecovery.ts`) — EventBridge-scheduled sweep; **verify the EventBridge rule actually exists** before relying on it (none was confirmed as of 2026-09-01).
- `chatlogix-media-fetcher` — **not functional**, misconfigured handler. Audio/image processing is a deliberate, known gap.

### Workers still on PM2 (`ecosystem.config.js`, 2 processes)

- `chatlogix-backend` — the Express API (`src/index.ts`), dashboard/auth/orders/etc. Its own `/webhook` route still runs the older, more complete Express pipeline (reactions, status events, media, per-vendor `whatsapp_conversation_parity` flag) but **WhatsApp calls API Gateway, not this route, in production** — so that code path is effectively dev-only today.
- `chatlogix-media-worker` (`src/workers/mediaWorker.ts`) — Whisper transcription + image handling. Fully built, but since the live webhook Lambda never enqueues audio/image jobs, it likely receives nothing in production right now.
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
Billing: `CreditUsage`, `BillingHistory`, `WalletTransaction`
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
- All amounts stored as integers (paisa/cents, not rupees/dollars)
- Multi-language support: Tamil, Hindi, English
- Message types: text (1 credit), audio (3 credits), image (2 credits)
- Order numbers use vendor-configurable prefix
- Docker Compose for local dev (postgres, redis, localstack, backend, workers)

## Important Notes
- Never modify `frontend/` - it's deprecated
- `master` is the active development branch (the `multi_stage_ai_worker` branch referenced here previously no longer exists)
- AI model defaults to `gpt-4.1-mini` (configurable per vendor)
- Prisma schema uses `@@map` to keep DB table names PascalCase
- Backend uses ESM (`"type": "module"` in package.json)
- Target cost: <$0.0022 per AI message
