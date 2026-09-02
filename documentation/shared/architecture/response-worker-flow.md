# Response Worker - Visual Flow Diagram

> **Updated 2026-09-02.** This diagram originally described `backend/src/workers/responseWorker.ts`, a PM2 process that long-polled SQS in an infinite loop. That file was deleted 2026-09-02 (superseded by the `chatlogix-whatsapp-response-dispatcher` Lambda, which the SQS response queue invokes directly — no polling loop exists anymore). The processing logic in "PROCESS MESSAGE (Response Processor)" below is still largely accurate since `backend/src/workers/responseProcessor.ts` (the shared business logic) is unchanged and still runs — **except** the "Async Database Operations" sub-flow, which has narrowed: there's no duplicate check and no message-record creation anymore, only an optional customer-insights update. See `response-worker.md` in this directory for the corrected step-by-step, and `backend/src/lambdas/README.md` for the current deployment.

## Main Processing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          START                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│      SQS Event Source Mapping Invokes the Lambda                     │
│  - Queue: RESPONSE_QUEUE_URL (chatlogix-response-queue-prod)         │
│  - Function: chatlogix-whatsapp-response-dispatcher                  │
│  - Batch Size: up to 10 messages per invocation                     │
│  - Event-driven — no polling, no long-lived process                 │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
    ┌───────────────────────────────────────────┐
    │ event.Records (loop via Promise.allSettled)│
    └───────┬─────────────────────────────────────┘
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
│  Only reached if conversationId && customerId && vendorId are all    │
│  present, and the message isn't a template/notification send.       │
│  NOTE: as of current code, there is no duplicate check and no        │
│  message-record creation here — the outbound Message row was        │
│  already created upstream, in the incoming-response-generator        │
│  pipeline. This step's only responsibility is the insights update.  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Update Customer Insights                                  │
│  (Only if customerId && vendorId && text exist)                      │
│                                                                       │
│  1. Extract insights from text (extractInsightsFromMessage):         │
│     - Delivery address                                                │
│     - Delivery instructions                                          │
│     - Special requests                                                │
│                                                                       │
│  2. Update customer_insights table                                    │
│     - Use insightsService.updateInsights()                           │
│                                                                       │
│  3. Failure is logged (logDatabaseFailure) and re-thrown to the      │
│     caller, but the caller only .catch()-logs it — this never        │
│     affects WhatsApp delivery, which already completed in Step 1.    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Complete                                          │
│  ✅ Insights updated (or failure logged, non-fatal)                  │
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
│  WhatsApp Error       │        │  Insights Update Error   │
│  (PHASE 1)            │        │  (PHASE 2 - Async)       │
└───────────┬───────────┘        └──────────────┬───────────┘
            │                                    │
            ▼                                    ▼
┌───────────────────────────────────┐  ┌────────────────────────────┐
│ 1. Log error                      │  │ 1. logDatabaseFailure()   │
│ 2. logWhatsAppFailure()           │  │ 2. No retry — the promise │
│ 3. Log conversation failed        │  │    rejection is only      │
│ 4. Throw error                    │  │    .catch()-logged by the │
└───────────┬───────────────────────┘  │    fire-and-forget caller │
            │                          └──────────────┬────────────┘
            ▼                                          │
┌───────────────────────────────────┐                  ▼
│ SQS/Lambda treats this record as  │  ┌────────────────────────────┐
│ failed — event source mapping     │  │  Insights failure ignored  │
│ retries per its redrive policy    │  │  WhatsApp Message SENT ✅  │
└───────────┬───────────────────────┘  └────────────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ Message becomes visible again      │
│ after the queue's visibility       │
│ timeout, if still undeleted        │
└───────────┬───────────────────────┘
            │
            ▼
┌───────────────────────────────────┐
│ Lambda is invoked again with the  │
│ message (new invocation, not a    │
│ "worker picking it up")           │
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

### Insights Update (Async Operation)
There is no retry loop for this step in current code — it is a single attempt. On failure it's logged via `logDatabaseFailure()` and the rejection is swallowed by the caller's `.catch()`; nothing re-queues or re-attempts it. (The exponential-backoff retry machinery this doc originally described lives in `AsyncDatabaseService`, but that service isn't called from this path today — see `response-worker.md`.)

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

Insights Update (Parallel, single attempt, no retry):
┌──────────┐    Start      ┌────────────┐
│ TRIGGERED│ ─────────>   │ IN PROGRESS │
└──────────┘               └──────┬──────┘
                                  │
                     ┌────────────┴────────────┐
                     │                          │
               Success│                          │Failure
                     │                          │
                     ▼                          ▼
             ┌──────────────┐           ┌──────────────────┐
             │INSIGHTS      │           │LOGGED via         │
             │UPDATED       │           │logDatabaseFailure  │
             └──────────────┘           │(no retry, no DLQ) │
                                         └──────────────────┘
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

