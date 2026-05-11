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

### Workers (SQS-based)
- `incomingMessageWorker` - receives WhatsApp messages
- `multiStageAIWorker` - runs the AI pipeline
- `responseWorker` - sends AI responses back via WhatsApp
- `orderRecoveryWorker` - recovers failed orders

### Multi-Stage AI Pipeline (14 stages)
Orchestrated by `multiStageOrchestrator.ts`:
0. Message Normalization → 0.5. Memory Retrieval → 1. Intent Classification (17 intents) → 1.5. Intent Prioritization → 1.7. Correction Detection → 2. Context Fetching → 3. Data Enrichment → 4. Primary AI Response → 4.7. Proactive Assistance → 6. Response Refinement → 7. Message Composition → 8. Data Extraction & Validation → 8.5. Quality Assessment → 9. Response Queueing

**Unified AI Processor** (`unifiedAIProcessorService.ts`): Collapses stages 0,1,1.5,1.7,3,4,6 into a single OpenAI call (gpt-4o-mini, structured JSON output). Reduces latency from 30-40s to 8-12s. Uses **TOON table encoding** for product catalogs (~40% token savings vs JSON).

## Deployment
- **PM2** via `ecosystem.config.js` — 4 processes: backend, response-worker, incoming-worker, multi-stage-ai-worker
- **Docker Compose** — postgres, redis, backend, response-worker, frontend
- **Deployment scripts** in `scripts/deployment/` (lightsail, bitnami, nginx)
- **AWS Lambda** for serverless functions (`backend/src/lambdas/`)

## Key Commands

```bash
# Backend
cd backend && npm run dev              # Start dev server
npm run worker:multi-stage             # Start AI worker
npm run worker:incoming                # Start incoming message worker
npm run worker:response                # Start response worker
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
- The `multi_stage_ai_worker` branch is the active development branch
- AI model defaults to `gpt-4.1-mini` (configurable per vendor)
- Prisma schema uses `@@map` to keep DB table names PascalCase
- Backend uses ESM (`"type": "module"` in package.json)
- Target cost: <$0.0022 per AI message
