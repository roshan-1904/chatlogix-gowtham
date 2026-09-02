# Response Worker - Step-by-Step Implementation Guide

> **Updated 2026-09-02 for the current architecture.** The standalone `backend/src/workers/responseWorker.ts` PM2 process this guide originally described was deleted as dead code on 2026-09-02 (it had already been removed from `ecosystem.config.js` the day before). The business logic it called — `backend/src/workers/responseProcessor.ts`, exporting `processResponseMessage()` — is unchanged and still live, but it's now invoked directly by the **`chatlogix-whatsapp-response-dispatcher`** AWS Lambda (`backend/src/lambdas/handlers/responseProcessor.ts`), triggered by the SQS response queue's event source mapping instead of a hand-rolled polling loop. The two-phase design principle below (blocking WhatsApp send → SQS deletion, async DB follow-up) still holds; the entry-point and deployment sections have been corrected accordingly. See `backend/src/lambdas/README.md` and `docs/CONVERSATION_WORKER_GAPS.md` for the full current picture.

## Overview
The response processor is a critical component that turns queued outbound WhatsApp messages into sent messages. It ensures reliable delivery by separating the (blocking) WhatsApp send from (non-blocking) database follow-up work.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SQS Queue                                │
│              (RESPONSE_QUEUE_URL)                                │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ SQS event source mapping invokes the Lambda
                     │ with a batch of up to 10 messages
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│      chatlogix-whatsapp-response-dispatcher (AWS Lambda)         │
│  (backend/src/lambdas/handlers/responseProcessor.ts)             │
│  Promise.allSettled over event.Records                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ For each record
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              processResponseMessage()                            │
│  (backend/src/workers/responseProcessor.ts — shared business     │
│   logic, imported directly by the Lambda handler above)          │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐       ┌────────────────────────┐
│  STEP 1       │       │  STEP 2                │
│  WhatsApp API │       │  Optional Async Ops    │
│  (BLOCKING)   │       │  (FIRE-AND-FORGET)     │
│               │       │                        │
│  Throw on     │       │  Update customer       │
│  failure →    │       │  insights only (if     │
│  Lambda retry │       │  conversationId +      │
│  via SQS      │       │  customerId + vendorId)│
└───────────────┘       └────────────────────────┘
```

Note: the message `Message` DB row for an outbound reply is created earlier, in the incoming-response-generator pipeline — the response dispatcher does **not** create it. Its only DB-side responsibility (besides marking the `Message` row sent/failed) is the optional customer-insights update.

---

## Step-by-Step Implementation

### **Step 1: Lambda Invocation**

**Location:** `backend/src/lambdas/handlers/responseProcessor.ts` (the `chatlogix-whatsapp-response-dispatcher` Lambda)

There is no polling loop anymore — the SQS event source mapping invokes the Lambda directly with a batch of messages:

```typescript
export const handler = async (event: SQSEvent): Promise<void> => {
  const results = await Promise.allSettled(
    event.Records.map(async (record, index) => {
      const payload = JSON.parse(record.body);
      await processResponseMessage(payload, operationId);
    })
  );
  // If every record in the batch failed, throw so SQS retries the whole batch.
  // Otherwise the batch is considered handled (see docs/CONVERSATION_WORKER_GAPS.md
  // for the broader discussion of at-least-once delivery semantics here).
};
```

**Key Points:**
- Event-driven, not a polling loop — no process to keep alive, no PM2 entry
- Lambda receives up to 10 messages per invocation (SQS batch size config on the event source mapping)
- Each record processed independently via `Promise.allSettled`
- SQS message deletion on success/failure is handled by the Lambda runtime based on what the handler throws, not by an explicit `deleteMessage` call in this code

---

### **Step 2: Message Validation & Parsing**

```typescript
if (!record.body) {
  stepLogger.warn('Record without body, skipping');
  return { success: false, reason: 'no_body' };
}

stepLogger.step('Parsing message payload');
const payload = JSON.parse(record.body);
```

**Message Structure** (current `ResponseQueueMessage`, `backend/src/workers/responseProcessor.ts`) — a discriminated union, not the flat text-only shape this doc originally described:
```typescript
type ResponseQueueMessage =
  | {
      type: 'text';
      to: string;
      text: string;
      conversationId?: string;
      vendorId?: string;
      customerId?: string;
      messageId?: string;       // assistant Message row id, updated with send status
      phoneNumberId?: string;   // which vendor WhatsApp number to send from
      metadata?: Record<string, any>;
    }
  | {
      type: 'template';         // used for order-status/payment/shipping notifications
      to: string;
      templateName: string;
      languageCode?: string;
      parameters: { body?: Array<{ type: 'text'; text: string }>; header?: any[]; buttons?: any[] };
      vendorId?: string;
      customerId?: string;
      orderId?: string;
      notificationType?: 'order_status_update' | 'payment_link' | 'shipping_update' | 'custom_template';
      phoneNumberId?: string;
      metadata?: Record<string, any>;
    };
```

**Key Points:**
- No receipt handle to manage — SQS/Lambda integration handles message deletion based on whether the handler throws
- `type` defaults to `'text'` for backward compatibility if omitted
- `template` messages fall back to a plain text send if the named WhatsApp template doesn't exist (404 from Meta)

---

### **Step 3: Process Message**

**Location:** `backend/src/workers/responseProcessor.ts`

The processor follows a **critical architecture principle**: 
> **WhatsApp success = SQS message deletion**
> **Database operations are async and don't block deletion**

#### **3.1: Send WhatsApp Message (CRITICAL - BLOCKING)**

```typescript
// STEP 1: Send WhatsApp message (CRITICAL - this must succeed for SQS deletion)
stepLogger.step('Sending WhatsApp message', { to: body.to, textLength: body.text.length });
logWhatsAppOperation('send_text', undefined, body.to, { textLength: body.text.length });

await sendWhatsAppText(body.to, body.text);  // BLOCKING - blocks until success/failure
stepLogger.step('WhatsApp message sent successfully');
```

**WhatsApp Client Implementation:**
```typescript
export async function sendWhatsAppText(to: string, text: string) {
  const url = `https://graph.facebook.com/v18.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  });
  
  if (!res.ok) {
    throw new Error('WhatsApp send failed');  // This causes retry!
  }
}
```

**Key Points:**
- ⚠️ **BLOCKING OPERATION**: Worker waits for WhatsApp API response
- Success means message was sent to user
- Failure throws error → message stays in queue → automatic retry
- Uses Meta WhatsApp Cloud API

---

#### **3.2: Start Async Insights Update (NON-BLOCKING)**

Current code (`backend/src/workers/responseProcessor.ts`) — narrower than what this doc originally described. There is no duplicate check and no message-record creation here anymore; the outbound `Message` row is already created upstream (in the incoming-response-generator pipeline), so this step's only job is the customer-insights update, and only for real conversational replies (not notification sends):

```typescript
// Only for text messages with a full conversation context, and not notifications
if (textBody.conversationId && textBody.customerId && textBody.vendorId
    && !(body.metadata?.notificationId)) {
  stepLogger.step('Initiating optional async operations (insights)');

  // Fire-and-forget: Don't await - let it run in background
  handleDatabaseOperationsAsync(textBody, operationId).catch(error => {
    logger.error({ operationId, conversationId: textBody.conversationId, error }, 
      '❌ Async insights update failed - logged to failure file');
  });
}
```

**Key Points:**
- ⚡ **FIRE-AND-FORGET**: Does NOT await the insights update
- Failure does NOT prevent SQS message handling from completing
- Requires `conversationId` **and** `customerId` **and** `vendorId` (all three) — not just `conversationId`
- Skipped entirely for template/notification sends (`metadata.notificationId` set)

---

### **Step 4: Async Insights Update**

**Location:** `backend/src/workers/responseProcessor.ts` (`handleDatabaseOperationsAsync`), calling `backend/src/services/customerInsightsService.ts`

There is no separate duplicate-check or message-creation step anymore — `backend/src/services/asyncDatabaseService.ts` (`AsyncDatabaseService`) is still imported in this file but its `checkDuplicateAsync`/`createMessageAsync` methods are not called from the response path today. The only work done here:

```typescript
if (customerId && vendorId && text) {
  const insights = extractInsightsFromMessage(text);
  if (Object.keys(insights).length > 0) {
    await insightsService.updateInsights(customerId, vendorId, insights);
  }
}
```

**Insights Extraction** (`extractInsightsFromMessage`, regex-based, unchanged in substance from the original doc):
- Extracts delivery address from text patterns
- Extracts delivery instructions
- Extracts special requests
- Updates customer preferences in database
- Failure here is logged (`logDatabaseFailure`) but does not throw back to the caller in a way that affects WhatsApp delivery

---

### **Step 5: Success Handling & SQS Deletion**

```typescript
// Always mark as successful if WhatsApp message was sent
stepLogger.success({ 
  to: body.to, 
  textLength: body.text.length,
  whatsappSent: true,
  databaseAsync: !!body.conversationId
});

// CRITICAL: Always delete message from SQS after successful WhatsApp sending
// Database operations are now async and don't block this deletion
stepLogger.step('Deleting processed message from SQS');
await deleteMessage(env.RESPONSE_QUEUE_URL, m.ReceiptHandle);
```

**Key Points:**
- ✅ **Success = WhatsApp sent (database status irrelevant)**
- Delete message from SQS immediately after WhatsApp success
- Database operations continue independently
- Uses message receipt handle to identify message to delete

---

### **Step 6: Error Handling & Retry Logic**

```typescript
try {
  await processResponseMessage(body, operationId);
  stepLogger.step('Message processed successfully');
} catch (processError) {
  stepLogger.error(processError as Error, { messageId: m.MessageId });
  
  // CRITICAL: Only retry if WhatsApp sending failed
  stepLogger.warn('WhatsApp message sending failed - message will be retried');
  continue; // Don't delete message - let SQS retry
}
```

**Retry Behavior:**
- ❌ WhatsApp failure → Message stays in queue → SQS auto-retry
- ❌ Database failure → Ignored (async) → WhatsApp still sent
- SQS retry mechanism:
  - Visibility timeout: 30 seconds
  - Message becomes visible again if not deleted
  - AWS SQS handles retry attempts automatically

---

### **Step 7: Lambda Deployment**

**Location:** `backend/src/lambdas/handlers/responseProcessor.ts` (note: `lambdas/`, plural — not `lambda/`, and this **is** the live deployment, not an optional target)

This is deployed today as the `chatlogix-whatsapp-response-dispatcher` function. The actual handler goes a step further than the simplified snippet this doc originally showed — it uses `Promise.allSettled` per record but only throws (triggering an SQS batch retry) if **every** record in the batch failed, treating a partial success as an overall success:

```typescript
export const handler = async (event: SQSEvent): Promise<void> => {
  const results = await Promise.allSettled(
    event.Records.map(async (record, index) => {
      const payload = JSON.parse(record.body);
      await processResponseMessage(payload, operationId);
      return { success: true, messageId: record.messageId };
    })
  );

  const failed = results.filter(r => r.status === 'rejected' || !r.value.success);
  if (failed.length === event.Records.length) {
    throw new Error(`All ${event.Records.length} records failed processing`);
  }
  // Partial failure: batch is still considered handled — see
  // backend/src/lambdas/handlers/responseProcessor.ts for the current caveats
  // around per-record retry vs. whole-batch retry semantics.
};
```

**Lambda Configuration** (from `backend/src/lambdas/README.md`):
- Function: `chatlogix-whatsapp-response-dispatcher`
- Trigger: SQS event source mapping on `chatlogix-response-queue-prod`
- Memory: 512MB, Timeout: 60s
- Deployed via `.github/workflows/deploy.yml` (hardcoded function name — the source of truth for what's live)

---

## Critical Design Principles

### 1. **WhatApp Success = SQS Deletion**
- If WhatsApp message sends successfully → Delete from SQS
- Database operations don't affect this decision
- Prevents duplicate WhatsApp messages

### 2. **Async Database Operations**
- Database writes don't block WhatsApp sending
- Database failures logged but don't fail the message
- Retry logic handles transient database issues

### 3. **Retry Strategy**
- WhatsApp failures → Automatic SQS retry
- Database failures → Exponential backoff retry (3 attempts)
- Permanent failures → Dead letter queue

### 4. **Logging & Monitoring**
- Every operation has a unique `operationId`
- Step-by-step logging with `StepLogger`
- Failed database operations logged to file
- WhatsApp operations logged for tracking

---

## Configuration

### Environment Variables
```bash
# SQS Configuration
RESPONSE_QUEUE_URL=https://sqs.region.amazonaws.com/account/queue

# WhatsApp Configuration
WHATSAPP_ACCESS_TOKEN=xxx
WHATSAPP_PHONE_NUMBER_ID=xxx

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

### SQS Queue Settings
- Visibility timeout: 30 seconds
- Wait time: 20 seconds (long polling)
- Message retention: 14 days
- Dead letter queue: Configured
- Max receive count: 3

---

## Failure Scenarios

### Scenario 1: WhatsApp API Down
```
1. Receive message from SQS
2. Attempt to send WhatsApp message
3. WhatsApp API returns error
4. Throw error → Message not deleted from SQS
5. SQS makes message visible again after timeout
6. Worker retries (max 3 times)
7. After 3 failures → Move to dead letter queue
```

### Scenario 2: Database Down
```
1. Receive message from SQS
2. Send WhatsApp message → ✅ SUCCESS
3. Delete message from SQS → ✅ SUCCESS
4. Start async database operations
5. Database operations fail → Logged to file
6. WhatsApp message already sent, database cleanup later
```

### Scenario 3: Network Interruption
```
1. WhatsApp send succeeds but network drops before receipt
2. Error thrown (conservative)
3. Message not deleted from SQS
4. Retry sends again → Potentially duplicate
5. Duplicate check prevents database duplication
```

---

## Monitoring & Debugging

### Log Files
- `logs/app-YYYY-MM-DD.log` - General application logs
- `logs/conversation-YYYY-MM-DD.log` - Conversation logs
- `logs/database-failures/db-failures-YYYY-MM-DD.log` - Database operation failures
- `logs/error-YYYY-MM-DD.log` - Error logs

### Key Metrics to Monitor
- SQS queue depth
- WhatsApp success rate
- Database failure rate
- Average processing time
- Dead letter queue size

### Debugging
```typescript
// Check worker status
logger.info({ queueDepth }, 'Current queue depth');

// Check for duplicate messages
logger.warn({ isDuplicate }, 'Duplicate detected');

// Monitor database failures
logger.error({ 
  operationId,
  error,
  retryCount 
}, 'Database operation failed');
```

---

## Testing

### Manual Testing
```bash
# Add message to queue
aws sqs send-message \
  --queue-url $RESPONSE_QUEUE_URL \
  --message-body '{"to":"+1234567890","text":"Test message","conversationId":"test-123"}'

# Monitor worker logs
tail -f logs/app-$(date +%Y-%m-%d).log

# Check for errors
grep "❌" logs/app-$(date +%Y-%m-%d).log
```

### Automated Testing
- Mock WhatsApp API for unit tests
- Mock SQS/Lambda event for integration tests
- Test error handling and retry logic
- (Duplicate-detection testing no longer applies to this file — see Step 4 above; that logic lived in `AsyncDatabaseService` and isn't called from the response path anymore)

---

## Deployment

There is no standalone worker process to run locally or in production anymore — `backend/src/workers/responseWorker.ts` was deleted 2026-09-02. The only deployment target for this logic is the Lambda function itself:

```bash
# Build TypeScript (Lambda deployment packages come from this build)
npm run build

# CI (the source of truth) deploys via .github/workflows/deploy.yml against the
# hardcoded function name chatlogix-whatsapp-response-dispatcher.
# The secondary path in this repo:
npm run deploy:lambda -- --functions "response-processor"
```

For local testing, import and call `processResponseMessage()` directly from `backend/src/workers/responseProcessor.ts` (see the "Local Testing" pattern in `backend/src/lambdas/README.md`), or invoke the Lambda handler with a synthetic `SQSEvent`.

---

## Summary

The Response Worker implements a **resilient, two-phase processing** strategy:

1. **Phase 1 (BLOCKING):** Send WhatsApp message
   - Success → Continue to Phase 2
   - Failure → Retry via SQS

2. **Phase 2 (ASYNC):** Database operations
   - Fire-and-forget, non-blocking
   - Independent retry logic
   - Failures don't affect WhatsApp delivery

This ensures:
- ✅ WhatsApp messages are reliably delivered
- ✅ No message loss
- ✅ Database issues don't block WhatsApp delivery
- ✅ Automatic retry for transient failures
- ✅ Comprehensive logging and monitoring

