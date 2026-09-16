# ChatLogix Message Processing Operations Guide

## ⚠️ Architecture note (2026-09-02): this document describes the legacy Express/PM2 pipeline

**Production WhatsApp traffic no longer runs through most of what's described below.** As of the Lambda migration, the live pipeline is:

```
WhatsApp → API Gateway → chatlogix-webhook-handler (Lambda)
  → SQS TEXT_QUEUE_URL
  → chatlogix-incoming-response-generator (Lambda) — backend/src/conversation/*
    (LLM-1 + CartEngine + optional LLM-2, NOT the aiService.ts / messageProcessor.ts
    structured-vs-legacy flow described in Phase 5 below)
  → SQS RESPONSE_QUEUE_URL
  → chatlogix-whatsapp-response-dispatcher (Lambda) — backend/src/workers/responseProcessor.ts
  → WhatsApp send
```

The Express route this document walks through (`src/routes/webhook.ts`, `src/services/messageProcessor.ts`, `src/services/aiService.ts`, and the standalone `src/workers/responseWorker.ts`) still exists in the codebase and is more feature-complete in places (it handles reactions, delivery/read status, and media — the Lambda path currently doesn't), but **WhatsApp is configured to call API Gateway, not this Express route, in production.** So this document is effectively describing a dev-only / legacy code path today, not what customer traffic hits.

Known, real production gaps in the live Lambda path (not covered by the Phase walkthrough below, since it assumes the Express route): audio/image messages are silently dropped, message reactions and delivery/read status webhooks aren't processed at all, and the order-recovery EventBridge trigger is unverified. Full detail: `docs/CONVERSATION_WORKER_GAPS.md`.

Authoritative current-state docs: `backend/src/lambdas/README.md` (the 5 deployed Lambda functions), `docs/CONVERSATION_PROCESSOR_LAMBDA.md` (the new AI pipeline spec), `docs/CONVERSATION_WORKER_GAPS.md`, and the repo root `CLAUDE.md`.

**Also note:** `src/workers/responseWorker.ts`, referenced throughout Phase 7 below, was deleted as dead code on 2026-09-02. Its business logic (`src/workers/responseProcessor.ts`) is unchanged and still live, but it's now invoked by the `chatlogix-whatsapp-response-dispatcher` Lambda directly — see `response-worker.md` in this directory for the corrected version of that section.

The rest of this document is left as written — as a description of the Express-side implementation that still exists in the codebase — with the specific dead references called out inline.

## 📋 Overview

This document provides a comprehensive step-by-step breakdown of the ChatLogix message processing flow, from receiving WhatsApp webhook events to sending AI-generated responses back to customers. **See the architecture note above before relying on this for what production traffic actually does.**

## 🔄 Complete Message Processing Flow

### Phase 1: Webhook Reception & Validation

> Describes the Express route (`src/routes/webhook.ts`) — not what production WhatsApp traffic hits today. The live entry point is the `chatlogix-webhook-handler` Lambda (`backend/src/lambdas/handlers/webhookHandler.ts`), fronted by API Gateway. It does GET verification and POST message handling similarly to what's described below, but only processes `messages` changes with `type: 'text'` — no signature-via-`x-hub-signature-256` step (that's Express-route-specific), and reactions/status changes aren't read at all.

#### Step 1.1: Webhook Verification (GET Request)
```
WhatsApp → GET /webhook → ChatLogix Server
```

**Process:**
1. **Signature Validation**: Verify `hub.verify_token` matches `WHATSAPP_VERIFY_TOKEN`
2. **Mode Check**: Ensure `hub.mode` is `subscribe`
3. **Challenge Response**: Return `hub.challenge` if valid
4. **Logging**: Track verification attempts with operation ID

**Code Location**: `src/routes/webhook.ts` (lines 17-39)

#### Step 1.2: Event Reception (POST Request)
```
WhatsApp → POST /webhook → ChatLogix Server
```

**Process:**
1. **Raw Body Parsing**: Receive raw JSON payload for signature verification
2. **Signature Validation**: Verify `x-hub-signature-256` header using `WHATSAPP_APP_SECRET`
3. **Payload Parsing**: Convert raw buffer to JSON object
4. **Response**: Send 200 OK immediately to prevent WhatsApp retries
5. **Logging**: Create operation ID and step logger for tracking

**Code Location**: `src/routes/webhook.ts` (lines 42-64)

### Phase 2: Message Parsing & Vendor Mapping

#### Step 2.1: WhatsApp Payload Parsing
**Process:**
1. **Extract Messages**: Parse `entry[].changes[].value.messages[]`
2. **Normalize Types**: Convert message types to `text|audio|image|document|other`
3. **Extract Metadata**: Get `phoneNumberId`, `from`, `whatsappMessageId`
4. **Content Extraction**: Extract text content, media IDs, captions

**Code Location**: `src/services/waParser.ts`

**Example Parsed Message:**
```typescript
{
  phoneNumberId: "123456789",
  from: "+1234567890",
  type: "text",
  text: "Hello, I want to order pizza",
  whatsappMessageId: "wamid.xxx",
  raw: { /* original WhatsApp message */ }
}
```

#### Step 2.2: Vendor Mapping Lookup
**Process:**
1. **Database Query**: Look up vendor by `phoneNumberId` in `whatsAppNumber` table
2. **Vendor Validation**: Ensure vendor exists and is active
3. **Skip Processing**: If no vendor mapping found, log warning and skip

**Code Location**: `src/routes/webhook.ts` (lines 76-83)

**JSON to Database Field Mapping:**

| **WhatsApp JSON Field** | **Database Table** | **Database Field** | **Description** |
|------------------------|-------------------|-------------------|-----------------|
| `entry[].changes[].value.metadata.phone_number_id` | `WhatsAppNumber` | `phoneNumberId` | WhatsApp Phone Number ID (unique identifier) |
| `entry[].changes[].value.metadata.display_phone_number` | `WhatsAppNumber` | Not stored | Display phone number (not used for lookup) |

**Database Query:**
```typescript
const map = await prisma.whatsAppNumber.findUnique({ 
  where: { phoneNumberId: msg.phoneNumberId } 
});
```

**Database Schema (WhatsAppNumber table):**
```sql
model WhatsAppNumber {
  id            String   @id @default(cuid())
  vendorId      String   -- Links to Vendor table
  phoneNumberId String   @unique -- WhatsApp Phone Number ID
  wabaId        String   -- WhatsApp Business Account ID
  createdAt     DateTime @default(now())
  vendor        Vendor   @relation(fields: [vendorId], references: [id])
}
```

**Example WhatsApp Payload Structure:**
```json
{
  "entry": [
    {
      "changes": [
        {
          "value": {
            "metadata": {
              "phone_number_id": "123456789012345",  // ← This is used for lookup
              "display_phone_number": "+1234567890"  // ← This is NOT used for lookup
            },
            "messages": [
              {
                "id": "wamid.xxx",
                "from": "+1234567890",
                "type": "text",
                "text": { "body": "Hello" }
              }
            ]
          }
        }
      ]
    }
  ]
}
```

**Lookup Process:**
1. **Extract**: `phoneNumberId` from `entry[0].changes[0].value.metadata.phone_number_id`
2. **Query**: `SELECT * FROM WhatsAppNumber WHERE phoneNumberId = '123456789012345'`
3. **Result**: Returns vendor mapping with `vendorId` if found
4. **Validation**: Check if vendor exists and is active
5. **Continue**: If mapping found, proceed with message processing
6. **Skip**: If no mapping, log warning and skip message

**Visual Flow Diagram:**
```
WhatsApp Webhook Payload
         ↓
┌─────────────────────────────────────┐
│ entry[0].changes[0].value.metadata │
│ ┌─────────────────────────────────┐ │
│ │ phone_number_id: "123456789..." │ │ ← Extract this
│ │ display_phone_number: "+123..." │ │ ← Ignore this
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ WhatsAppNumber Table Lookup         │
│ ┌─────────────────────────────────┐ │
│ │ WHERE phoneNumberId = "12345..." │ │
│ │ Returns: {                       │ │
│ │   id: "wa_123",                  │ │
│ │   vendorId: "vendor_456",        │ │ ← This links to Vendor
│ │   phoneNumberId: "123456789...", │ │
│ │   wabaId: "waba_789"             │ │
│ │ }                                │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
         ↓
┌─────────────────────────────────────┐
│ Vendor Table Lookup                 │
│ ┌─────────────────────────────────┐ │
│ │ WHERE id = "vendor_456"          │ │
│ │ Returns: {                       │ │
│ │   id: "vendor_456",              │ │
│ │   businessName: "Pizza Palace",  │ │
│ │   aiBotName: "PizzaBot",         │ │
│ │   subscriptionStatus: "active"   │ │
│ │ }                                │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
         ↓
    Continue Processing
```

**Key Points:**
- **Primary Key**: `phoneNumberId` is the unique identifier for WhatsApp Phone Numbers
- **Foreign Key**: `vendorId` links to the Vendor table
- **Not Used**: `display_phone_number` is not stored or used for lookup
- **Unique Constraint**: Each `phoneNumberId` can only belong to one vendor
- **Relationship**: One vendor can have multiple WhatsApp numbers

### Phase 3: Duplicate Detection & Message Filtering

#### Step 3.1: Duplicate Message Detection
**Process:**
1. **Content Hashing**: Create hash of `whatsappMessageId + from + content`
2. **Database Check**: Query `duplicate_messages` table for existing hash
3. **Skip Duplicate**: If duplicate found, log and skip processing
4. **Store Hash**: If new message, store hash for future duplicate detection

**Code Location**: `src/services/duplicateMessageService.ts`

#### Step 3.2: Message Type Routing
**Process (Express route only):**
- **Text Messages**: Process synchronously via `processTextMessage()`
- **Audio Messages**: Enqueue to `INCOMING_AUDIO_QUEUE_URL`
- **Image/Document**: Enqueue to `INCOMING_IMAGE_QUEUE_URL`
- **Other Types**: Enqueue to `INCOMING_QUEUE_URL`

**Code Location**: `src/routes/webhook.ts` (lines 108-124)

> **In the live Lambda path this is different and narrower**: `webhookHandler.ts` only handles `message.type === 'text'` (published to `TEXT_QUEUE_URL` for the `chatlogix-incoming-response-generator` Lambda to consume). Audio and image fall into a `default` branch and are dropped — nothing is enqueued, stored, or acknowledged to the customer. This is a known, currently-unresolved gap; see `docs/CONVERSATION_WORKER_GAPS.md` §2.1.

### Phase 4: Text Message Processing (Synchronous Path)

#### Step 4.1: Conversation Management
**Process:**
1. **Customer Upsert**: Create or update customer record by phone number
2. **Conversation Lookup**: Find existing open conversation
3. **Conversation Creation**: Create new conversation if none exists
4. **Update Timestamps**: Update `lastInteraction` and `updatedAt`

**Code Location**: `src/services/messageProcessor.ts` (lines 76-110)

#### Step 4.2: Billing & Rate Limiting
**Process:**
1. **Wallet Check**: `billingService.canProcessMessage` verifies `Vendor.walletBalanceMilli` covers a worst-case turn estimate (also checks trial expiry)
2. **Rate Limiting**: Check if vendor has exceeded rate limits
3. **Block Processing**: If not allowed, log reason and skip
4. **Debit the Wallet**: *after* the reply is enqueued, charge the turn's **real** cost via `pricingService.chargeVendor` — `ceil((aiCost + whatsappCost + platformFee) × (1 + markupPercent/100))` in millirupees. There is no flat "1 credit per text message" any more.

**Code Location**: `src/services/billingService.ts` (gate), `src/services/pricing/pricingService.ts` (charge), `src/conversation/billing.ts` (debit-after-enqueue). Model: [docs/BILLING_AND_PRICING.md](../../../docs/BILLING_AND_PRICING.md)

#### Step 4.3: Message Relevance Check
**Process:**
1. **AI Analysis**: Use GPT-4o-mini to analyze message relevance
2. **Relevance Scoring**: Get `isRelevant`, `confidence`, and `reason`
3. **Irrelevant Handling**: If irrelevant, store message but skip response
4. **Fallback**: Default to relevant if AI check fails

**Code Location**: `src/services/messageProcessor.ts` (lines 17-43)

**AI Prompt for Relevance:**
```
Determine if a customer message is relevant to business operations.

IRRELEVANT if:
- Random characters, gibberish, spam
- Only emojis without meaning
- Offensive or inappropriate content
- Very short (< 3 chars) unless business inquiry

RELEVANT if:
- Business questions, product inquiries
- Order-related messages
- Support requests
- Meaningful business communication
```

#### Step 4.4: Message Storage
**Process:**
1. **Database Insert**: Create message record in `messages` table
2. **Message Data**: Store `conversationId`, `senderType: 'customer'`, `content`, `type: 'text'`
3. **Logging**: Track database operation with operation ID

**Code Location**: `src/services/messageProcessor.ts` (lines 140-149)

### Phase 5: AI Response Generation

> Describes `aiService.ts`'s structured-vs-legacy split, invoked from the Express route's `messageProcessor.ts`. **Not what runs in production.** The live pipeline (`chatlogix-incoming-response-generator` Lambda) calls `backend/src/conversation/*` — LLM-1 (intent/extraction) + a deterministic CartEngine + an optional LLM-2 verifier pass — which is a different design, not a "structured vs. legacy" toggle. See `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for the current spec. `aiService.ts`'s only remaining live caller is unrelated to this message path (`catalogImportSandboxService.ts`, via the old `multiStageOrchestrator.ts`).

#### Step 5.1: Feature Flag Check
**Process:**
1. **Structured Responses**: Check if vendor has structured responses enabled
2. **Event Processing**: Check if vendor has event processing enabled
3. **Response Type**: Choose between structured or legacy response system

**Code Location**: `src/services/messageProcessor.ts` (lines 155-157)

#### Step 5.2: AI Response Generation (Structured)
**Process:**
1. **Context Building**: Gather conversation history, vendor config, customer insights
2. **AI Call**: Send to GPT-4 with structured prompt
3. **Response Parsing**: Parse JSON response with `customerMessage`, `orderUpdateEvent`, `customerUpdateEvent`
4. **Validation**: Ensure response contains valid customer message

**Code Location**: `src/services/aiService.ts` (lines 200-300)

**AI Prompt Structure:**
```
System: You are a WhatsApp business assistant for [vendor].
Context: [conversation history, vendor config, customer insights]
Task: Generate structured response with:
- customerMessage: Natural response to customer
- orderUpdateEvent: Order-related actions (if applicable)
- customerUpdateEvent: Customer data updates (if applicable)
```

#### Step 5.3: AI Response Generation (Legacy)
**Process:**
1. **Simple Prompt**: Use basic prompt without structured output
2. **Response Generation**: Generate natural language response
3. **Content Extraction**: Extract plain text response

**Code Location**: `src/services/aiService.ts` (lines 400-500)

#### Step 5.4: Response Message Storage
**Process:**
1. **Database Insert**: Create assistant message record
2. **Message Data**: Store `conversationId`, `senderType: 'assistant'`, `content`, `type: 'text'`
3. **Logging**: Track AI response storage

**Code Location**: `src/services/messageProcessor.ts` (lines 169-196)

### Phase 6: Response Queue & Delivery

#### Step 6.1: Response Enqueuing
**Process:**
1. **Queue Message**: Create response message payload
2. **SQS Publishing**: Send to `RESPONSE_QUEUE_URL`
3. **Message Data**: Include `to`, `text`, `conversationId`

**Code Location**: `src/services/messageProcessor.ts` (lines 198-200)

**Response Queue Message:**
```typescript
{
  to: "+1234567890",
  text: "Thank you for your order! Your pizza will be ready in 30 minutes.",
  conversationId: "conv_123",
  vendorId: "vendor_456"
}
```

#### Step 6.2: Event Processing (Async)
**Process:**
1. **Event Detection**: Check for `orderUpdateEvent` or `customerUpdateEvent`
2. **Event Orchestration**: Process events via `EventOrchestrator`
3. **Async Processing**: Don't wait for event completion
4. **Error Handling**: Log errors but don't block response

**Code Location**: `src/services/messageProcessor.ts` (lines 202-226)

### Phase 7: Response Worker Processing

> **`src/workers/responseWorker.ts` was deleted as dead code on 2026-09-02.** It was a standalone PM2 process that polled `RESPONSE_QUEUE_URL` in a loop; it's been superseded by the `chatlogix-whatsapp-response-dispatcher` Lambda, which the SQS response queue invokes directly (event-driven, no polling). The processing logic it called — `src/workers/responseProcessor.ts` (`processResponseMessage()`) — is unchanged and still live, now imported by `backend/src/lambdas/handlers/responseProcessor.ts`. See `response-worker.md` and `response-worker-flow.md` in this directory for the corrected, current version of this section — they cover the same ground accurately, including that the async DB step now only updates customer insights (no duplicate check, no message-record creation).

#### Step 7.1: SQS Message Polling — superseded, see note above
**Process (as originally written, now historical):**
1. **Queue Polling**: Continuously poll `RESPONSE_QUEUE_URL`
2. **Message Retrieval**: Get up to 10 messages per poll
3. **Message Parsing**: Parse JSON message body
4. **Operation Tracking**: Create operation ID and step logger

**Code Location** (file deleted): `src/workers/responseWorker.ts` (lines 6-25)

#### Step 7.2: WhatsApp Message Sending
**Process:**
1. **API Call**: Send POST request to WhatsApp Graph API
2. **Authentication**: Use `WHATSAPP_ACCESS_TOKEN`
3. **Message Format**: Format as WhatsApp text message
4. **Success Validation**: Ensure 200 OK response

**Code Location**: `src/services/whatsappClient.ts`

**WhatsApp API Call:**
```typescript
POST https://graph.facebook.com/v18.0/{PHONE_NUMBER_ID}/messages
Headers: {
  Authorization: "Bearer {ACCESS_TOKEN}",
  Content-Type: "application/json"
}
Body: {
  messaging_product: "whatsapp",
  to: "+1234567890",
  type: "text",
  text: { body: "Response message" }
}
```

#### Step 7.3: Database Persistence (Async)
**Process:**
1. **Duplicate Check**: Check for existing messages with same content
2. **Message Creation**: Create system message record asynchronously
3. **Retry Logic**: Retry failed operations with exponential backoff
4. **Failure Logging**: Log failures to separate failure log files

**Code Location**: `src/services/asyncDatabaseService.ts`

#### Step 7.4: SQS Message Deletion / Lambda Success Reporting
**Process (as originally written, describing the deleted explicit-poll-and-delete worker):**
1. **Success Confirmation**: Only delete if WhatsApp message sent successfully
2. **Message Deletion**: Remove message from SQS queue
3. **Prevent Loops**: Ensure message is not reprocessed

**Code Location** (file deleted): `src/workers/responseWorker.ts` (lines 39-48)

**Current equivalent**: there's no explicit `deleteMessage` call anymore. The Lambda handler (`backend/src/lambdas/handlers/responseProcessor.ts`) reports per-record success/failure via `Promise.allSettled` and only throws (triggering an SQS-level batch retry) if every record in the invocation's batch failed — the SQS/Lambda event source mapping handles deletion based on that.

## 🔧 Error Handling & Recovery

### Database Connection Failures
**Problem**: Database unreachable during message processing
**Solution**: 
- WhatsApp message still sent successfully
- Database operations handled asynchronously
- SQS message deleted to prevent infinite loops
- Failures logged to separate files for analysis

### WhatsApp API Failures
**Problem**: WhatsApp API returns error or timeout
**Solution**:
- SQS message remains in queue for retry
- Exponential backoff via SQS visibility timeout
- Dead letter queue for persistent failures

### AI Service Failures
**Problem**: OpenAI API unavailable or rate limited
**Solution**:
- Fallback to cached responses if available
- Default responses for common queries
- Graceful degradation with error logging

### Duplicate Message Handling
**Problem**: Same message processed multiple times
**Solution**:
- Content-based duplicate detection
- WhatsApp message ID tracking
- Database constraints to prevent duplicates

## 📊 Monitoring & Logging

### Operation Tracking
- **Operation IDs**: Unique identifier for each processing flow
- **Step Loggers**: Detailed step-by-step tracking
- **Timing**: Performance metrics for each phase
- **Context**: Rich context data for debugging

### Database Failure Monitoring
- **Failure Logs**: Separate log files for database failures
- **Retry Tracking**: Monitor retry attempts and success rates
- **Performance Metrics**: Track database operation timing
- **Alerting**: Notify on high failure rates

### WhatsApp API Monitoring
- **Success Rates**: Track message delivery success
- **Error Codes**: Monitor API error patterns
- **Rate Limiting**: Track API usage and limits
- **Cost Tracking**: Monitor API call costs

## 🚀 Performance Optimizations

### Async Processing
- **Database Operations**: Non-blocking database writes
- **Event Processing**: Parallel event handling
- **Queue Processing**: Concurrent message processing

### Caching
- **Vendor Configs**: Cache vendor AI configurations
- **Customer Insights**: Cache customer data and preferences
- **Response Templates**: Cache common response patterns

### Rate Limiting
- **API Limits**: Respect WhatsApp API rate limits
- **Vendor Limits**: Enforce per-vendor rate limits
- **Credit Management**: Prevent over-billing

## 🔍 Troubleshooting Guide

### Common Issues

#### 1. Messages Not Being Processed
**Symptoms**: Webhook receives messages but no responses sent
**Debug Steps**:
1. Check webhook signature validation
2. Verify vendor mapping exists
3. Check billing/credit status
4. Review message relevance filtering
5. Check AI service availability

#### 2. Duplicate Messages Sent
**Symptoms**: Customer receives same response multiple times
**Debug Steps**:
1. Check SQS message deletion
2. Verify duplicate detection logic
3. Review database connection issues
4. Check response worker status

#### 3. Database Connection Errors
**Symptoms**: High database failure rates
**Debug Steps**:
1. Check database connectivity
2. Review connection pool settings
3. Monitor database performance
4. Check async database service logs

#### 4. AI Response Quality Issues
**Symptoms**: Irrelevant or poor quality responses
**Debug Steps**:
1. Review vendor AI configuration
2. Check conversation context
3. Monitor AI service performance
4. Review relevance filtering

### Debug Commands

```bash
# Monitor database failures
npm run monitor:db-failures

# Check response worker logs
tail -f logs/app-$(date +%Y-%m-%d).log | grep "response_worker"

# Monitor SQS queue status
aws sqs get-queue-attributes --queue-url $RESPONSE_QUEUE_URL

# Check webhook processing
tail -f logs/app-$(date +%Y-%m-%d).log | grep "webhook_event"
```

## 📈 Metrics & KPIs

### Processing Metrics
- **Message Processing Time**: End-to-end processing duration
- **AI Response Time**: Time to generate AI response
- **Database Operation Time**: Database read/write performance
- **Queue Processing Time**: SQS message processing duration

### Quality Metrics
- **Response Relevance**: Percentage of relevant responses
- **Customer Satisfaction**: Response quality scores
- **Error Rates**: Processing error percentages
- **Duplicate Rate**: Percentage of duplicate messages

### Business Metrics
- **Message Volume**: Messages processed per hour/day
- **Vendor Usage**: Messages per vendor
- **Credit Consumption**: Credits used per message
- **Cost Per Message**: Total cost per processed message

## 🔐 Security Considerations

### Data Protection
- **Message Encryption**: Encrypt sensitive message content
- **Access Control**: Restrict database access
- **Audit Logging**: Log all data access and modifications
- **Data Retention**: Implement data retention policies

### API Security
- **Webhook Signatures**: Validate all webhook requests
- **Rate Limiting**: Prevent abuse and DoS attacks
- **Input Validation**: Sanitize all user inputs
- **Error Handling**: Don't expose sensitive information in errors

### Infrastructure Security
- **Network Security**: Secure network communications
- **Database Security**: Encrypt database connections
- **Key Management**: Secure API key storage
- **Monitoring**: Monitor for security incidents

---

## 📝 Summary

The ChatLogix message processing system is designed for high reliability, scalability, and performance. The flow ensures that:

1. **WhatsApp messages are always delivered** when technically possible
2. **Database failures don't block message delivery**
3. **Duplicate messages are prevented** through multiple mechanisms
4. **AI responses are contextually relevant** and high-quality
5. **System performance is optimized** through async processing
6. **Comprehensive monitoring** provides visibility into system health

The system handles millions of messages with high reliability while maintaining low latency and cost efficiency.
