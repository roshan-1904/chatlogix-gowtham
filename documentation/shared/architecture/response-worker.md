# Response Worker - Step-by-Step Implementation Guide

## Overview
The Response Worker is a critical component that processes outbound WhatsApp messages from the SQS queue. It ensures reliable message delivery by separating WhatsApp sending from database operations.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SQS Queue                                │
│              (RESPONSE_QUEUE_URL)                                │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Poll messages (batch of 10)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Response Worker Loop                            │
│  (backend/src/workers/responseWorker.ts)                        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ For each message
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│              Response Processor                                  │
│  (backend/src/workers/responseProcessor.ts)                     │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐       ┌────────────────────────┐
│  STEP 1       │       │  STEP 2                │
│  WhatsApp API │       │  Database Operations   │
│  (BLOCKING)   │       │  (ASYNC/FIRE-FORGET)   │
│               │       │                        │
│   Success =   │       │  Create Message Record │
│  Delete from  │       │  Update Insights       │
│  SQS          │       │  (Doesn't block SQS)   │
└───────────────┘       └────────────────────────┘
```

---

## Step-by-Step Implementation

### **Step 1: Worker Initialization**

**Location:** `backend/src/workers/responseWorker.ts`

```typescript
async function loop() {
  logger.info('Response worker started');
  while (true) {
    // Poll SQS queue for messages
    const messages = await receiveMessages(env.RESPONSE_QUEUE_URL, 10);
    
    for (const m of messages) {
      // Process each message
    }
  }
}
```

**Key Points:**
- Infinite polling loop continuously checks for messages
- Fetches up to 10 messages per poll
- Each message processed independently
- Uses SQS long polling (20 seconds wait time)

---

### **Step 2: Message Validation & Parsing**

```typescript
if (!m.Body || !m.ReceiptHandle) {
  stepLogger.warn('Skipping message without body or receipt handle');
  continue;
}

stepLogger.step('Parsing message body');
const body = JSON.parse(m.Body) as ResponseQueueMessage;
```

**Message Structure:**
```typescript
type ResponseQueueMessage = {
  to: string;              // Phone number
  text: string;            // Message content
  conversationId?: string;  // Optional conversation ID
  vendorId?: string;        // Optional vendor ID
  customerId?: string;      // Optional customer ID
};
```

**Key Points:**
- Validates message has body and receipt handle
- Parses JSON body to typed message object
- Receipt handle used to delete message from SQS after processing

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

#### **3.2: Start Async Database Operations (NON-BLOCKING)**

```typescript
// STEP 2: Handle database operations asynchronously (NON-BLOCKING)
if (body.conversationId) {
  stepLogger.step('Initiating async database operations');
  
  // Fire-and-forget: Don't await - let it run in background
  this.handleDatabaseOperationsAsync(body, operationId).catch(error => {
    logger.error({
      operationId,
      conversationId: body.conversationId,
      error: error instanceof Error ? error.message : String(error),
      asyncDbOperation: true
    }, '❌ Async database operation failed - logged to failure file');
  });
}
```

**Key Points:**
- ⚡ **FIRE-AND-FORGET**: Does NOT await database operations
- Database failures do NOT prevent SQS deletion
- Uses `.catch()` to log errors without crashing
- Only runs if `conversationId` is provided

---

### **Step 4: Async Database Operations**

**Location:** `backend/src/services/asyncDatabaseService.ts`

#### **4.1: Check for Duplicates**

```typescript
// 1. Check for duplicate message (system sender)
const isDuplicate = await AsyncDatabaseService.checkDuplicateAsync(
  conversationId!, 
  text, 
  'text', 
  'system'
);

if (isDuplicate) {
  logger.warn('⚠️ Duplicate message detected, skipping database creation');
  return;
}
```

**Duplicate Check Logic:**
- Checks last 10 messages from last 5 minutes
- Compares normalized content (lowercase, whitespace trimmed)
- Prevents same message from being saved twice

#### **4.2: Create Message Record**

```typescript
// 2. Create message record
await AsyncDatabaseService.createMessageAsync(
  conversationId!,
  'system',
  text,
  'text',
  operationId
);
```

**Database Operation with Retry:**
```typescript
static async createMessageAsync(conversationId, senderType, content, type, messageId) {
  const operation: DatabaseOperation = {
    operation: 'create',
    table: 'message',
    data: { conversationId, senderType, content, type },
    conversationId,
    messageId,
    timestamp: new Date()
  };
  
  // Process with retry logic
  this.processAsync(operation);
}
```

**Retry Strategy:**
- Max 3 retries with exponential backoff
- Retry delays: 1s, 2s, 4s
- Failures logged to `logs/database-failures/db-failures-YYYY-MM-DD.log`

#### **4.3: Update Customer Insights**

```typescript
// 3. Update customer insights if customerId and vendorId are provided
if (customerId && vendorId) {
  const insights = this.extractInsightsFromMessage(text);
  
  if (Object.keys(insights).length > 0) {
    await this.insightsService.updateInsights(customerId, vendorId, insights);
  }
}
```

**Insights Extraction:**
- Extracts delivery address from text patterns
- Extracts delivery instructions
- Extracts special requests
- Updates customer preferences in database

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

**Location:** `backend/src/lambda/responseWorker.ts`

For AWS Lambda deployment:

```typescript
export const handler: SQSHandler = async (event) => {
  const results = await Promise.allSettled(
    event.Records.map(async (record: SQSRecord) => {
      const payload = JSON.parse(record.body);
      await processResponseMessage(payload, operationId);
    })
  );
  
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    throw new Error(`Failed items: ${failed.length}/${results.length}`);
  }
};
```

**Lambda Configuration:**
- Trigger: SQS queue event
- Batch size: 10 messages
- Concurrency: Based on queue depth
- Dead letter queue: Configured for permanently failed messages

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
- Mock SQS for integration tests
- Test duplicate detection
- Test error handling and retry logic

---

## Deployment

### Local Development
```bash
npm run dev:worker
```

### Production Deployment
```bash
# Build TypeScript
npm run build

# Start worker
node dist/workers/responseWorker.js
```

### Lambda Deployment
```bash
# Deploy to AWS Lambda
npm run deploy:lambda
```

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

