# ChatLogix Project Memory

> This file contains important project context, decisions, and information to help Cursor understand the codebase better.

## Primary Business Goal

**Chat-Based Order Assistance via WhatsApp**

The PRIMARY goal of ChatLogix is to enable customers to place orders and get questions answered through natural WhatsApp conversations, saving vendors **90% of their time** on repetitive questions.

**Key Value Propositions:**
- **For Customers:** Natural chat-based ordering experience, instant answers to questions
- **For Vendors:** 90% time savings on repetitive questions, automated order processing
- **Business Impact:** Scale customer service without scaling manual effort

**How Multi-Stage AI Supports This Goal:**
- Automates order placement through conversation
- Answers product inquiries, order status, delivery questions automatically
- Handles order updates and modifications naturally
- Maintains conversation context and remembers customer preferences
- Provides natural, human-like responses (not robotic)

**Success Metrics:**
- 90% reduction in vendor time on repetitive questions
- Natural, conversational order placement experience
- Automated question answering (product inquiries, order status, etc.)
- Complete order processing without manual intervention
- Cost-effective AI processing (<$0.0022 per message)

## Project Identity

**Name:** ChatLogix  
**Type:** WhatsApp-based e-commerce SaaS platform  
**Purpose:** Help small vendors manage customer interactions, catalogs, and orders through WhatsApp with AI-powered conversation management

## Core Business Model

- **Target Users:** Small vendors selling products via WhatsApp
- **Primary Use Case:** Automated customer service and order management through WhatsApp conversations
- **Key Features:**
  - AI-powered conversation handling
  - Product catalog management
  - Order processing and tracking
  - Multi-stage AI processing pipeline
  - Conversation memory and context management

## Architecture Highlights

### Multi-Stage AI Processing System
The platform uses a sophisticated multi-stage AI pipeline:
- **Stage 0.5:** Conversation memory extraction
- **Stage 1:** Intent classification
- **Stage 1.7:** Customer correction handling
- **Stage 2:** Context-aware data fetching
- **Stage 3:** Prompt building
- **Stage 4:** Primary AI response generation
- **Stage 8.5:** Quality assessment

### Key Components
- **Backend API:** Express.js with TypeScript
- **Workers:** Background job processors (SQS queues, BullMQ/Redis optional)
- **Process Manager:** PM2 for production deployment
- **Database:** PostgreSQL with Prisma ORM
- **Cache:** Redis for caching (optional, queues use SQS)
- **Queue System:** AWS SQS (default) or Redis/BullMQ (configurable)
- **AI:** OpenAI GPT models (GPT-4o-mini) for conversation handling
- **Frontend:** React monorepo with Turborepo

## Technology Decisions

### Why Prisma?
- Type-safe database access
- Automatic migration generation
- Excellent TypeScript support
- Easy to maintain schema

### Why SQS?
- Reliable job processing (AWS managed)
- Scalable and durable
- Built-in retry mechanisms
- Dead letter queue support
- Long polling for efficiency
- **Note:** System also supports Redis/BullMQ via `QUEUE_PROVIDER` config

### Why Turborepo?
- Monorepo management
- Shared packages between apps
- Efficient build caching
- Supports web and mobile apps

### Why Zod?
- Runtime validation
- Type inference
- Great error messages
- Works well with TypeScript

### Why PM2?
- Process management for production servers
- Automatic restarts on crashes
- Zero-downtime reloads
- Built-in logging and monitoring
- Manages multiple workers (API + workers)
- Ecosystem config for easy deployment

## Database Schema Key Models

- **Vendor:** Platform users (vendors)
- **Conversation:** WhatsApp conversations
- **Message:** Individual messages in conversations
- **Product:** Vendor product catalogs
- **Order:** Customer orders
- **ConversationMemory:** AI-extracted conversation context
- **CorrectionHistory:** Customer corrections tracking
- **QualityMetrics:** AI response quality scores

## Important Services

### Backend Services (`backend/src/services/`)
- `conversationMemoryService.ts` - Manages conversation context and memory extraction
- `intentClassificationService.ts` - Classifies user intents with pattern detection
- `contextFetcherService.ts` - Fetches relevant data based on intent (products, orders, etc.)
- `promptBuilderService.ts` - Builds focused AI prompts (500-800 tokens)
- `aiResponseService.ts` - Generates AI responses using OpenAI
- `whatsappService.ts` - WhatsApp Cloud API integration
- `multiStageOrchestrator.ts` - Orchestrates multi-stage AI processing pipeline
- `responseQueuingService.ts` - Queues responses for delivery
- `productMatchingService.ts` - Product matching with fuzzy and AI matching

### Utility Services (`backend/src/utils/`)
- `cacheStrategy.ts` - Centralized caching utilities with TTL management
- `redis.ts` - Redis client and cache operations
- `normalization.ts` - Message normalization and cleaning
- `productMatching.ts` - Product matching algorithms

### Workers (`backend/src/workers/`)
- `incomingMessageWorker.ts` - Processes incoming WhatsApp messages
- `textWorker.ts` - Handles text message processing
- `responseWorker.ts` - Sends responses to WhatsApp
- `multiStageAIWorker.ts` - Orchestrates multi-stage AI processing

## API Endpoints Structure

### Webhook Endpoints
- `GET /webhook` - WhatsApp webhook verification (verifies token)
- `POST /webhook` - WhatsApp webhook events (receives messages)
  - Validates HMAC signature (X-Hub-Signature-256)
  - Stores message in database
  - Queues to INCOMING_QUEUE for processing

### API Endpoints (`/api/v1/`)
- `/api/vendors/register` - Vendor registration
- `/api/vendors/:id/usage-analytics` - Vendor usage analytics
- `/api/conversations/*` - Conversation management
- `/api/products/*` - Product catalog management
- `/api/orders/*` - Order management

### Utility Endpoints
- `GET /health` - Health check endpoint
- `GET /api/docs` - Swagger API documentation (if enabled)

### Authentication
- JWT-based authentication
- Firebase phone authentication (optional)
- Admin phone numbers configured via `AUTH_ADMIN_PHONES`

## Environment Configuration

### Required Variables
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection (optional, for caching)
- `INCOMING_QUEUE_URL` - SQS queue URL for incoming messages
- `RESPONSE_QUEUE_URL` - SQS queue URL for responses
- `OPENAI_API_KEY` - OpenAI API key for AI processing
- `WHATSAPP_ACCESS_TOKEN` - WhatsApp Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID` - WhatsApp phone number ID
- `WHATSAPP_VERIFY_TOKEN` - Webhook verification token
- `AUTH_JWT_SECRET` - JWT secret for authentication

### Optional/Feature Flags
- `ENABLE_MULTI_STAGE_AI` - Enable multi-stage AI processing ('true'/'false' or percentage '10'/'50'/'100')
- `MULTI_STAGE_AI_ROLLOUT_PERCENTAGE` - Gradual rollout percentage (0-100)
- `USE_AI_MEMORY_EXTRACTION` - Enable AI-powered memory extraction (default: 'true')
- `PRODUCT_MATCHING_THRESHOLD` - Fuzzy matching threshold (default: 0.7)
- `PRODUCT_MATCHING_ENABLE_FUZZY` - Enable fuzzy matching (default: 'true')
- `PRODUCT_MATCHING_ENABLE_AI_MULTILANG` - Enable AI multi-language matching (default: 'true')
- `LOG_LEVEL` - Logging level (default: 'info')
- `QUEUE_PROVIDER` - Queue provider ('sqs' or 'redis', default: 'sqs')

### AWS Configuration
- `AWS_REGION` - AWS region (default: 'ap-south-1')
- `AWS_ACCESS_KEY_ID` - AWS access key (optional)
- `AWS_SECRET_ACCESS_KEY` - AWS secret key (optional)
- `AWS_SQS_ENDPOINT` - SQS endpoint (for LocalStack testing)

See `backend/.env.example` for complete list.

## Development Workflow

### Backend (Local Development)
1. Install dependencies: `npm install`
2. Generate Prisma client: `npm run prisma:generate`
3. Run migrations: `npm run prisma:migrate`
4. Start API: `npm run dev`
5. Start workers (in separate terminals): `npm run worker:incoming` and `npm run worker:response`

### Production Deployment (PM2)
- **Process Manager:** PM2 with `ecosystem.config.js`
- **Managed Processes:**
  - `chatlogix-backend` - Main API server
  - `chatlogix-response-worker` - Response worker
  - `chatlogix-incoming-worker` - Incoming message worker
  - `chatlogix-multi-stage-ai-worker` - Multi-stage AI worker
- **PM2 Commands:**
  - Start: `pm2 start ecosystem.config.js --env production`
  - Reload: `pm2 reload ecosystem.config.js --env production`
  - Status: `pm2 status`
  - Logs: `pm2 logs`
  - Save: `pm2 save`

### Frontend
1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Build: `npm run build`

## Testing Strategy

### Test Framework
- **Unit Tests:** Vitest for backend services
- **Integration Tests:** API endpoint testing
- **Coverage Target:** 90%+
- **Test Location:** `backend/test/` and `backend/src/**/__tests__/`

### Test Scripts
- `npm test` - Run all tests
- `npm run test:intent-classification` - Test intent classification service
- `npm run test:multi-stage` - Test multi-stage AI worker
- `npm run check:multi-stage` - Check multi-stage configuration

### Test Files
- `backend/scripts/test-intent-classification.ts` - Intent classification testing
- `backend/scripts/test-messages/intent-classification-test-cases.json` - Test cases
- `backend/test/conversationContext.test.ts` - Conversation context tests
- `backend/test/auth/` - Authentication tests

### Testing Patterns
- Mock external services (OpenAI, WhatsApp API)
- Use test fixtures for database operations
- Test error cases and edge cases
- Test fallback mechanisms
- Test caching behavior

## Documentation Structure

- `docs/architecture/` - System architecture and design decisions
- `docs/development/` - Development guides and best practices
- `docs/deployment/` - Deployment instructions
- `docs/setup/` - Setup and configuration guides
- `requirements/` - Business and technical requirements

## Queue System Architecture

### Queue Types (SQS)
- **INCOMING_QUEUE_URL** - Receives messages from WhatsApp webhook
- **RESPONSE_QUEUE_URL** - Queues responses to be sent to WhatsApp
- **INCOMING_TEXT_QUEUE_URL** - Optional, for text-specific processing
- **TEXT_QUEUE_URL** - Optional, for text message responses

### Queue Configuration
- **Visibility Timeout:** 30 seconds (prevents duplicate processing)
- **Message Retention:** 14 days
- **Long Polling:** 20 seconds
- **Dead Letter Queue:** Configured for failed messages

### Worker Processing Flow
```
WhatsApp Webhook → INCOMING_QUEUE → Incoming Worker → Multi-Stage AI → RESPONSE_QUEUE → Response Worker → WhatsApp
```

## Caching Strategy

### Cache Keys & TTLs
- `conversation_memory:{conversationId}` - 5 minutes (300s)
- `vendor_config:{vendorId}` - 30 minutes (1800s)
- `product_catalog:{vendorId}` - 1 hour (3600s)
- `customer_insights:{customerId}:{vendorId}` - 10 minutes (600s)
- `pending_order:{conversationId}` - 2 minutes (120s)
- `intent_classification:{hash}` - 1 hour (3600s)
- `normalization:{hash}` - 1 hour (3600s)

### Cache Invalidation
- Conversation cache invalidated on order creation/update
- Vendor cache invalidated on config/product changes
- Product catalog cache invalidated on product updates
- Intent cache uses message hash (auto-expires)

## Intent Classification System

### Supported Intents
- `greeting` - Customer greetings
- `product_inquiry` - Product availability, prices, details
- `order_new` - New order creation
- `order_update` - Update existing order (quantity, items, delivery)
- `order_status` - Check order status
- `order_cancel` - Cancel order
- `complaint` - Customer complaints
- `feedback` - Customer feedback
- `general_inquiry` - General questions

### Classification Process
1. **Cache Check** - Check if identical message was classified recently
2. **Order Context** - Check for existing pending orders
3. **Pattern Detection** - Pre-detect order update patterns (regex-based)
4. **Multi-Intent Detection** - Identify multiple intents in one message
5. **AI Classification** - OpenAI GPT-4o-mini with structured prompt
6. **Post-Validation** - Override if pattern detected but AI missed it
7. **Cache Result** - Store classification for future use

### Pattern Detection
- Order update patterns: "make it 5", "change to X", "update quantity"
- Multiple intent detection: Greeting + inquiry, order + inquiry, etc.
- Confidence thresholds: ≥0.8 auto-process, 0.5-0.8 clarify, <0.5 fallback

### Fallback Mechanism
- If AI fails → Keyword-based intent detection
- If pattern detected → Override AI classification
- If low confidence → Request clarification

## Logging Strategy

### Log Files (Pino)
- `logs/app-{date}.log` - All application logs
- `logs/error-{date}.log` - Error logs only
- `logs/conversation-{date}.log` - Conversation logs
- `logs/conversations/YYYY-MM/{vendorId}/{phone}.log` - Per-customer/vendor monthly logs

### Log Levels
- `error` - Errors only (always logged)
- `warn` - Warnings
- `info` - General information (disabled to save space)
- `debug` - Debug information

### Logging Features
- **StepLogger** - Tracks multi-stage AI processing steps
- **Conversation Logger** - Tracks inbound/outbound messages
- **Error Context Logger** - Enhanced error logging with context
- **Operation IDs** - Unique IDs for request tracking

### Logging Disabled (Space Saving)
- Database operations (except errors)
- Queue operations (except errors)
- WhatsApp operations (except errors)
- AI operations (except errors)
- Billing operations (except errors)

## Product Matching System

### Matching Strategies
1. **Fuzzy Matching** - Levenshtein distance algorithm (default threshold: 0.7)
2. **AI Multi-Language Matching** - OpenAI-based semantic matching for cross-language
3. **Vendor-Agnostic** - No hard-coded product field names
4. **Configurable** - Thresholds and strategies via environment variables

### Configuration
- `PRODUCT_MATCHING_THRESHOLD` - Fuzzy match threshold (default: 0.7)
- `PRODUCT_MATCHING_ENABLE_FUZZY` - Enable fuzzy matching (default: true)
- `PRODUCT_MATCHING_MAX_CATALOG_SIZE` - Max products to match (default: 1000)
- `PRODUCT_MATCHING_ENABLE_AI_MULTILANG` - Enable AI matching (default: true)
- `PRODUCT_MATCHING_AI_FALLBACK_THRESHOLD` - AI fallback threshold (default: 0.6)

### Matching Flow
1. Try fuzzy matching first
2. If similarity < AI_FALLBACK_THRESHOLD → Use AI matching
3. Return best match with confidence score
4. Filter invalid placeholders (e.g., "product name", "item name")

## Multi-Stage AI Processing

### Feature Flags
- `ENABLE_MULTI_STAGE_AI` - Enable/disable multi-stage processing
  - `'false'` - Disabled (default)
  - `'true'` - Enabled for all
  - `'10'`, `'50'`, `'100'` - Percentage rollout
- `MULTI_STAGE_AI_ROLLOUT_PERCENTAGE` - Gradual rollout (0-100)
- `USE_AI_MEMORY_EXTRACTION` - Enable AI memory extraction (default: 'true')

### Stage Details
- **Stage 0:** Message normalization (cleaning, typo correction)
- **Stage 0.5:** Conversation memory retrieval (key facts, preferences)
- **Stage 1:** Intent classification (with pattern detection)
- **Stage 1.5:** Intent prioritization (if multiple intents)
- **Stage 1.7:** Correction detection (customer corrections)
- **Stage 2:** Context-aware data fetching (products, orders, etc.)
- **Stage 3:** Prompt building (500-800 tokens, focused prompts)
- **Stage 4:** Primary AI response generation (GPT-4o-mini)
- **Stage 8.5:** Quality assessment (response quality scoring)

### Worker Coordination
- Legacy worker (`incomingMessageWorker`) and multi-stage worker run simultaneously
- Legacy worker checks feature flag and skips if multi-stage enabled
- Multi-stage worker processes when enabled
- SQS visibility timeout prevents duplicate processing

## Common Patterns

### Service Pattern
Services encapsulate business logic and are independent, testable units.

### Worker Pattern
Background jobs are processed by dedicated workers using SQS queues (or BullMQ/Redis).

### Caching Pattern
- Cache at service layer
- Use consistent cache keys
- Invalidate on updates
- Set appropriate TTLs

### Error Handling Pattern
- Use try-catch for async operations
- Log errors with context using `logErrorWithContext()`
- Return meaningful error messages
- Use Zod for validation errors
- Implement fallback mechanisms for AI failures
- Retry with exponential backoff for transient failures

### Message Flow Pattern
1. Webhook receives message → Store in DB → Queue to INCOMING_QUEUE
2. Incoming worker processes → Multi-stage AI → Queue to RESPONSE_QUEUE
3. Response worker sends → WhatsApp API → Update message status

## Performance Considerations

### AI Optimization
- **Prompt Size:** Keep prompts between 500-800 tokens (vs 3000-4000 previously)
- **Model Selection:** GPT-4o-mini for most tasks (cost-effective)
- **Caching:** Cache intent classifications and normalizations (1 hour TTL)
- **Token Limits:** Monitor and limit token usage per request

### Database Optimization
- **Indexes:** Use indexes on frequently queried fields (vendorId, conversationId, status)
- **Query Limits:** Limit results, use pagination
- **Connection Pooling:** Critical for performance (Prisma handles this)
- **Raw SQL:** Use only when necessary (document why)

### Caching Optimization
- **Cache Keys:** Consistent naming pattern (`type:id` or `type:id:subtype`)
- **TTL Strategy:** Short TTL for dynamic data, longer for static data
- **Invalidation:** Invalidate on updates, not on reads
- **Cache Size:** Monitor Redis memory usage

### Queue Optimization
- **Visibility Timeout:** 30 seconds prevents duplicate processing
- **Long Polling:** 20 seconds reduces empty receives
- **Batch Processing:** Process multiple messages when possible
- **Dead Letter Queue:** Handle failed messages gracefully

### Response Time Targets
- **Webhook Response:** < 100ms (store and queue only)
- **API Endpoints:** < 200ms for 95% of requests
- **Total Processing:** 3-7 seconds (webhook to WhatsApp response)
- **Queue Processing:** < 5 seconds per message

## Security Practices

- Input validation with Zod
- JWT authentication
- Rate limiting on API endpoints
- Environment variables for secrets
- Parameterized queries (Prisma)
- HTTPS in production
- CORS configuration

## Known Issues & Workarounds

- Multi-stage AI processing requires careful orchestration
- Conversation memory extraction needs continuous improvement
- WhatsApp API rate limits require careful handling
- Database connection pooling is critical for performance

## Future Considerations

- Mobile app development (React Native)
- Advanced analytics and reporting
- Multi-language support
- Enhanced AI capabilities
- Payment integration
- Shipping integration

## Important Notes

- Always use TypeScript strict mode
- Prefer async/await over promises
- Use Prisma for all database operations
- Log important operations
- Handle errors gracefully
- Write tests for new features
- Update documentation when making changes

## Code Quality Standards

- TypeScript strict mode enabled
- ESLint configured
- Prettier for formatting
- 90%+ test coverage target
- Clear function and variable names
- Comprehensive error handling
- Proper logging

## Project Status

- **Backend:** Core functionality implemented
- **Frontend:** Monorepo structure in place
- **AI Integration:** Multi-stage pipeline operational
- **Database:** Schema defined and migrated
- **Workers:** Background processing implemented
- **Documentation:** Comprehensive docs in place

## Key Contacts & Resources

- **Documentation:** See `docs/` directory
- **Requirements:** See `requirements/` directory
- **Setup Guides:** See `docs/setup/`
- **Architecture:** See `docs/architecture/`

## WhatsApp Integration

### Webhook Verification
- **GET /webhook:** Verifies webhook with `hub.verify_token`
- **POST /webhook:** Receives messages, validates HMAC signature
- **Signature Header:** `X-Hub-Signature-256` (HMAC SHA256)
- **Verification Token:** Configured via `WHATSAPP_VERIFY_TOKEN`

### Message Types Supported
- **Text Messages** - Standard text messages
- **Media Messages** - Images, audio, video, documents
- **Interactive Messages** - Buttons, lists, product cards
- **Template Messages** - Pre-approved WhatsApp templates

### Message Status Tracking
- **Statuses:** sent, delivered, read, failed
- **Status Webhook:** Updates message status in database
- **Error Handling:** Retry failed messages, log errors

### Rate Limits
- **WhatsApp API Limits:** 1000 messages per second per phone number
- **Rate Limiting:** Implemented at API level
- **Queue Management:** Queues prevent rate limit violations

## Quick Reference

### File Locations
- **Backend Entry:** `backend/src/index.ts`
- **Database Schema:** `backend/prisma/schema.prisma`
- **PM2 Config:** `ecosystem.config.js` (root directory)
- **Environment Config:** `backend/src/config/env.ts`
- **Logger:** `backend/src/logger.ts`
- **Frontend Entry:** `frontend_v2/apps/web-vendor/src/`
- **API Routes:** `backend/src/routes/`
- **Services:** `backend/src/services/`
- **Workers:** `backend/src/workers/`
- **Utils:** `backend/src/utils/`
- **Types:** `backend/src/types/`

### Key Configuration Files
- `.env` - Environment variables (backend directory)
- `ecosystem.config.js` - PM2 process configuration
- `tsconfig.json` - TypeScript configuration
- `package.json` - Dependencies and scripts

### Important Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run worker:incoming` - Start incoming worker
- `npm run worker:response` - Start response worker
- `npm run worker:multi-stage` - Start multi-stage AI worker

---

*This memory file should be updated as the project evolves and new patterns emerge.*

