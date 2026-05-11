# Response Worker - Visual Flow Diagram

## Main Processing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          START                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 Poll SQS Queue                                       │
│  - Queue: RESPONSE_QUEUE_URL                                        │
│  - Batch Size: 10 messages                                          │
│  - Wait Time: 20 seconds (long polling)                            │
│  - Visibility Timeout: 30 seconds                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                  │
            ▼                                  ▼
    ┌───────────────┐              ┌──────────────────────┐
    │ Messages Found│              │   No Messages        │
    │ (Loop through)│              │   Wait & Retry       │
    └───────┬───────┘              └──────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│               Validate Message                                        │
│  - Check if m.Body exists                                           │
│  - Check if m.ReceiptHandle exists                                  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                  │
            ▼                                  ▼
    ┌───────────────┐              ┌──────────────────┐
    │ Valid Message │              │ Invalid          │
    │ (Continue)    │              │ Skip & Continue  │
    └───────┬───────┘              └──────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│               Parse Message Body                                     │
│  - JSON.parse(m.Body)                                               │
│  - Type: ResponseQueueMessage                                       │
│    • to: string                                                      │
│    • text: string                                                    │
│    • conversationId?: string                                         │
│    • vendorId?: string                                               │
│    • customerId?: string                                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                  │
            ▼                                  ▼
    ┌───────────────┐              ┌──────────────────┐
    │ Parse Success │              │ Parse Error      │
    │ (Continue)    │              │ Log & Skip       │
    └───────┬───────┘              └──────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│            PROCESS MESSAGE (Response Processor)                     │
│                                                                     │
│  ╔═══════════════════════════════════════════════════════════╗      │
│  ║  PHASE 1: WhatsApp Sending (BLOCKING - CRITICAL)          ║      │
│  ╠═══════════════════════════════════════════════════════════╣      │
│  ║ 1. Validate payload (to, text required)                   ║      │
│  ║ 2. Call sendWhatsAppText(to, text)                        ║      │
│  ║    - Make POST to Meta WhatsApp Cloud API                 ║      │
│  ║    - Authorization: Bearer token                          ║      │
│  ║    - URL: v18.0/{PHONE_NUMBER_ID}/messages                ║      │
│  ║ 3. Wait for response                                      ║      │
│  ║                                                           ║      │
│  ║  ┌──────────────┐     ┌──────────────┐                    ║      │
│  ║  │   SUCCESS    │     │    FAILURE   │                    ║      │
│  ║  │ (Continue)   │     │ (Throw Error)│                    ║      │
│  ║  └──────┬───────┘     └──────┬───────┘                    ║      │
│  ║         │                    │                            ║      │
│  ║         │                    ▼                            ║      │
│  ║         │        ┌────────────────────────┐               ║      │
│  ║         │        │ Log Error              │               ║      │
│  ║         │        │ Don't Delete from SQS  │               ║      │
│  ║         │        │ Return to Queue        │               ║      │
│  ║         │        │ (Auto-Retry)           │               ║      │
│  ║         │        └────────────────────────┘               ║      │
│  ║         │                                                 ║      │
│  ╚═════════╪═════════════════════════════════════════════════╝      │
│            │                                                        │
│            ▼                                                        │
│  ┌─────────────────────────────────────────────────────┐            │
│  │ Log successful WhatsApp send                        │            │
│  │ - Conversation log                                  │            │
│  │ - Operation log                                     │            │
│  └────────────────────────┬────────────────────────────┘            │
│                           │                                         │
│                           ▼                                         │
│  ┌─────────────────────────────────────────────────────┐            │
│  │  PHASE 2: Database Operations (ASYNC)               │               │
│  │                                                     │               │
│  │  IF conversationId exists:                          │               │
│  │    1. Start async database operations (fire-and-forget)│            │
│  │    2. Check for duplicates                          │               │
│  │    3. Create message record                         │               │
│  │    4. Update customer insights                      │               │
│  │                                                     │               │
│  │    ┌─────────────┐        ┌─────────────┐           │               │
│  │    │   SUCCESS   │        │   FAILURE   │           │               │
│  │    │(Log success)│        │(Log to file)│           │               │
│  │    └──────┬──────┘        └──────┬──────┘           │               │
│  │           │                      │                    │               │
│  │           │                      ▼                    │               │
│  │           │          ┌──────────────────┐            │               │
│  │           │          │ Log to:          │            │               │
│  │           │          │ database-failures│            │               │
│  │           │          │ Retry with exp   │            │               │
│  │           │          │ backoff (3x)     │            │               │
│  │           │          └──────────────────┘            │               │
│  │           │                                           │               │
│  └───────────┴───────────────────────────────────────────┘               │
│                                                                          │
│  IF no conversationId:                                                  │
│    - Skip database operations                                           │
│    - Log warning                                                        │
│                                                                          │
│  Note: Database operations DON'T block SQS deletion                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 Mark Processing as Successful                        │
│  - WhatsApp sent: ✅                                                 │
│  - Database: async (may still be processing)                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│              DELETE MESSAGE FROM SQS                                  │
│  - Use receiptHandle to identify message                             │
│  - AWS SDK DeleteMessageCommand                                      │
│  - Message permanently removed from queue                            │
└────────────────────────────┬────────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                  │
            ▼                                  ▼
    ┌───────────────┐              ┌──────────────────┐
    │ Delete Success│              │  Delete Fails    │
    │ (Log success) │              │  (Log error)     │
    │ Return to loop│              │  Message remains │
    │               │              │  in queue        │
    └───────────────┘              └──────────────────┘
```

## Async Database Operations Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│         handleDatabaseOperationsAsync()                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Step 1: Check for Duplicates                               │
│  - Query last 10 messages from last 5 minutes                         │
│  - Filter by conversationId, type, senderType                         │
│  - Normalize and compare content                                      │
└────────────────────────────┬────────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                  │
            ▼                                  ▼
    ┌───────────────┐              ┌──────────────────┐
    │  Duplicate?    │              │  No Duplicate?    │
    │  YES           │              │  Continue         │
    │  Skip & Return │              │                   │
    └────────────────┘              └─────────┬─────────┘
                                              │
                                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Step 2: Create Message Record                             │
│  - Table: message                                                     │
│  - conversationId                                                     │
│  - senderType: 'system'                                               │
│  - content: text                                                      │
│  - type: 'text'                                                       │
│  - timestamp: now()                                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                  │
            ▼                                  ▼
    ┌───────────────┐              ┌──────────────────┐
    │ Create Success│              │  Create Fail     │
    │ (Continue)    │              │  (Retry with      │
    │               │              │   exp backoff)   │
    └───────┬───────┘              └─────────┬─────────┘
            │                                 │
            │                     ┌──────────┴──────────┐
            │                     │                     │
            │                     ▼                     ▼
            │              ┌──────────────┐   ┌─────────────┐
            │              │  Retry Count │   │ Max Retries │
            │              │  1/2/3?      │   │  Exceeded?  │
            │              └───┬──────┬───┘   └─────┬───────┘
            │                  │      │             │
            │                  ▼      ▼             ▼
            │           ┌──────────┐ ┌──────────┐ ┌────────────┐
            │           │ Wait 1s  │ │ Wait 2s  │ │ Wait 4s    │
            │           │ Retry    │ │ Retry    │ │ Log Failure│
            │           └──────────┘ └──────────┘ └────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Step 3: Update Customer Insights                           │
│  (Only if customerId && vendorId exist)                               │
│                                                                       │
│  1. Extract insights from text:                                      │
│     - Delivery address                                                │
│     - Delivery instructions                                          │
│     - Special requests                                                │
│                                                                       │
│  2. Update customer_insights table                                    │
│     - Use insightsService.updateInsights()                           │
│                                                                       │
│  3. Handle failures gracefully (non-critical)                        │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Complete                                          │
│  ✅ Message created in database                                      │
│  ✅ Insights updated                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Error Occurs                                   │
└────────────────────────────┬────────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            │                                  │
            ▼                                  ▼
┌───────────────────────┐        ┌──────────────────────────┐
│  WhatsApp Error       │        │  Database Error          │
│  (PHASE 1)            │        │  (PHASE 2 - Async)       │
└───────────┬───────────┘        └──────────────┬───────────┘
            │                                    │
            ▼                                    ▼
┌───────────────────────────────────┐  ┌────────────────────────────┐
│ 1. Log error                      │  │ 1. Log error to           │
│ 2. LogWhatsAppFailure()           │  │    database-failures/      │
│ 3. Log conversation failed        │  │ 2. Async retry with       │
│ 4. Throw error                    │  │    exponential backoff     │
└───────────┬───────────────────────┘  │ 3. Max 3 retries           │
            │                          │ 4. After max retries:     │
            ▼                          │    log final failure      │
┌───────────────────────────────────┐  └──────────────┬────────────┘
│ Don't Delete from SQS             │                 │
│ Let SQS Retry                      │                 ▼
│ (Automatic retry)                  │  ┌────────────────────────────┐
└───────────┬───────────────────────┘  │  Database Error HANDLED     │
            │                          │  WhatsApp Message SENT ✅   │
            ▼                          └────────────────────────────┘
┌───────────────────────────────────┐
│ Message becomes visible           │
│ after visibility timeout          │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ Worker picks up message again     │
│ (Retry attempt)                   │
└───────────┬───────────────────────┘
            │
            ▼
    [Back to Start]
```

## Retry Logic

### SQS Retry (WhatsApp Failures)
```
Attempt 1  →  Immediate
Attempt 2  →  After 30 seconds (visibility timeout)
Attempt 3  →  After 30 seconds
Final      →  Move to Dead Letter Queue
```

### Database Retry (Async Operations)
```
Attempt 1  →  Immediate
Attempt 2  →  After 1 second  (2^0 * 1000)
Attempt 3  →  After 2 seconds (2^1 * 1000)
Final      →  Log to db-failures file
```

## State Transitions

```
Message States:
┌─────────┐    Polled    ┌──────────┐
│  QUEUE  │ ──────────> │ PROCESSING │
└─────────┘             └──────┬─────┘
                               │
                 ┌─────────────┼─────────────┐
                 │             │             │
        WhatsApp │             │             │
         Success │             │             │ WhatsApp
                 │             │             │ Failure
                 ▼             ▼             ▼
          ┌──────────┐  ┌──────────┐  ┌────────────┐
          │DELETED   │  │RETRY     │  │RETRY       │
          │FROM SQS  │  │(30 sec)  │  │(30 sec)    │
          └──────────┘  └──────┬───┘  └─────┬──────┘
                               │            │
                               └────────────┘
                                    │
                                    ▼
                            ┌───────────────┐
                            │ RETRY LIMIT   │
                            │  EXCEEDED     │
                            │               │
                            │  → DLQ        │
                            └───────────────┘

Database States (Parallel):
┌──────────┐    Start      ┌──────────┐
│  QUEUED  │ ─────────>  │ PROCESSING│
└──────────┘              └──────┬─────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
              Success│            │            │Failure
                    │            │            │
                    ▼            ▼            ▼
            ┌──────────────┐ ┌───────────┐ ┌──────────┐
            │CREATED       │ │RETRY      │ │RETRY     │
            │IN DATABASE   │ │(1 sec)    │ │(2 sec)   │
            └──────────────┘ └─────┬─────┘ └────┬─────┘
                                   │            │
                                   └────────────┘
                                        │
                                        ▼
                                ┌──────────────┐
                                │RETRY LIMIT   │
                                │EXCEEDED      │
                                │              │
                                │→ Log to file │
                                └──────────────┘
```

## Key Metrics Dashboard

```
┌────────────────────────────────────────────────────┐
│              Response Worker Metrics                │
├────────────────────────────────────────────────────┤
│ Queue Depth:         1,234 messages                │
│ Processing Rate:     50 msg/min                   │
│ WhatsApp Success:    99.8%                        │
│ Database Success:    99.5%                         │
│ Avg Processing Time: 0.5s                         │
│ Retries:            23 in last hour               │
│ DLQ Size:           5 messages                   │
└────────────────────────────────────────────────────┘
```

