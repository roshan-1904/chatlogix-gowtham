# Detailed Actions for `cancel_order` Intent

## Overview

The `cancel_order` intent handles customer requests to cancel existing orders. This includes canceling pending orders, removing orders, and handling cancellation requests. This document details every action taken at each stage of the multi-stage AI processing pipeline.

> **Superseded (2026-09):** This describes the OLD 14-stage `multiStageOrchestrator.ts` pipeline, which is **no longer on the hot path** for live WhatsApp messages. Production text messages now run through `backend/src/conversation/*` (LLM-1 draft + cart ops → `CartEngine` → optional LLM-2 verifier), deployed as the `chatlogix-incoming-response-generator` Lambda — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. The new pipeline does not route messages through fixed per-intent stages: `intent` is captured for telemetry only and never drives cart writes (CONVERSATION_PROCESSOR_LAMBDA.md §13); a `cancel` op is the current equivalent, applied by `CartEngine` only for `pending`/`confirmed` orders. The services referenced below still exist in the codebase, but their only remaining live caller is `catalogImportSandboxService.ts` (catalog import, unrelated to message processing). The stage-by-stage detail below is kept as a historical reference for the old pipeline's behavior.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "cancel my order pls 😊"
- Output: `{ original: "cancel my order pls 😊", cleaned: "cancel my order please" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for pending order context in memory
- Uses memory to understand which order is being canceled

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `cancel_order` as primary intent

**Process:**
- Analyzes message for cancel keywords:
  - "cancel", "remove order", "don't want", "delete order", "stop order"
- Detects if customer wants to cancel or remove an existing order
- Checks for existing pending order (REQUIRED for cancellation)
- Detects secondary intents (rare for cancel_order)

**Extracted Info:**
- Cancellation type
- Mentions order flag
- Cancellation reason (if mentioned)
- Urgency level

**Output:** `{ primaryIntent: "cancel_order", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected (rare for cancel_order)

**Process:**
- Usually not applicable for cancellations

---

## Stage 1.7: Correction Detection

**Action:** Detects if message corrects a previous one

**Process:**
- Compares with last 5 messages
- Checks for correction patterns
- Usually not applicable for cancellations

**Output:** `{ isCorrection: false }`

---

## Stage 2: Context-Aware Data Fetching

**Action:** Fetches data needed for order cancellation

**Data Fetched:**

1. **Pending Order:** **REQUIRED** - Order to be canceled
2. **Vendor Config:** Cancellation policies, business rules

**Caching:** Uses Redis cache

**Output:** `{ pendingOrder: {...}, vendorConfig: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Handle the customer's order cancellation request."
3. **Current Order:** Full details of order being canceled
4. **Vendor Config:** Cancellation policies
5. **Conversation Memory:** Key facts, ongoing topics
6. **Recent Messages:** Last 3 customer messages
7. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Reference the order being canceled
- Confirm cancellation clearly
- Offer to help with new order
- Be empathetic and understanding

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response for cancellation

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Cancellation confirmation message
   - Order number reference
   - Offer to help with new order
   - Empathetic response

**Output:** `{ response: "...", extractedData: {}, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `cancel_order` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true` (rare for cancel_order)

**Process:**
- Usually not needed for cancellations

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed (rare for cancel_order)

**Process:**
- Usually not needed for cancellations

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures natural conversation flow
6. Includes order number reference

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates order cancellation data before cancelling order

**Validations:**

1. **Order Existence Validation:**
   - Order must exist
   - Error if order not found: "No order found to cancel"

2. **Customer Ownership Validation:**
   - Order must belong to the customer making the request
   - Error if order doesn't belong to customer: "Order does not belong to this customer"

3. **Order State Validation:**
   - Order must be in cancellable state (`pending` or `confirmed` only)
   - Orders in `preparing`, `ready`, `out_for_delivery`, or `delivered` status cannot be cancelled
   - Error if order not cancellable: "Order is {status}, cannot cancel. Only pending or confirmed orders can be cancelled."

4. **Already Cancelled Check:**
   - Order must not already be cancelled
   - Error if already cancelled: "Order is already cancelled"

**Validation Checks Performed:**
- Checks if order exists for this conversation and customer
- Verifies order status is `pending` or `confirmed`
- Confirms order belongs to the requesting customer
- Prevents cancellation of already cancelled orders

**Error Messages (Customer-Friendly):**
- No order found: "No order found to cancel"
- Order doesn't belong to customer: "Order does not belong to this customer"
- Order not cancellable: "Order is {status}, cannot cancel. Only pending or confirmed orders can be cancelled."
- Already cancelled: "Order is already cancelled"

**Output:** `{ isValid: true/false, errors: [...], validatedData: {} }`

**If Validation Fails:**
- Response message is updated with validation errors
- `needsClarification` flag is set to `true`
- Updated message is stored in `context.validationFailedMessage` for Stage 9
- Order cancellation is prevented in Stage 8
- Customer receives error message explaining why cancellation cannot proceed

---

## Stage 8: Database Update

**Action:** Cancels order and updates status

**Process:**

### 8.1 Order Cancellation

**Steps:**

1. **Update Order Status:**
   - Changes status to `cancelled`
   - Sets `cancelledAt` timestamp
   - Sets `cancellationReason` (if provided)

2. **Update Order Record:**
```typescript
{
  status: "cancelled",
  cancelledAt: new Date(),
  cancellationReason: reason || "Customer requested cancellation"
}
```

3. **Queue Notification:**
   - Sends cancellation notification to customer
   - Notifies vendor of cancelled order

### 8.2 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer cancelled order"
- Ongoing topics: ["order_cancelled"]
- Conversation stage: "order_cancelled"
- Increments turn number

### 8.3 Cache Invalidation

**Invalidates:**
- Conversation cache
- Pending order cache (critical - order cancelled)

---

## Stage 9: Response Queuing

**Action:** Queues message to WhatsApp

**Process:**
- Adds message to response queue
- Message sent to customer via WhatsApp API

**Output:** Message queued for delivery

---

## Summary: Complete Flow for `cancel_order`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `cancel_order`
4. **Fetch Data** → Pending order, vendor config
5. **Build Prompt** → Focused prompt with order context
6. **Generate AI Response** → Cancellation confirmation message
7. **Validate Data** → Check order can be cancelled
8. **Cancel Order** → Update status to cancelled
9. **Update Memory** → Store cancellation facts
10. **Queue Response** → Send message to customer

---

## Key Features for `cancel_order`

- ✅ **Order Validation:** Only cancels existing orders
- ✅ **Status Update:** Changes order status to cancelled
- ✅ **Notification:** Sends cancellation notification
- ✅ **Reason Tracking:** Stores cancellation reason
- ✅ **Helpful Response:** Offers to help with new order

---

## Related Files

- `backend/src/services/multiStageOrchestrator.ts` - Main orchestrator
- `backend/src/services/intentClassificationService.ts` - Intent classification
- `backend/src/services/contextFetcherService.ts` - Data fetching
- `backend/src/services/promptBuilderService.ts` - Prompt construction
- `backend/src/services/primaryAIResponseService.ts` - AI response generation
- `backend/src/services/dataValidationService.ts` - Data validation
- `backend/src/services/dataExtractionService.ts` - Database updates
- `backend/src/services/orderService.ts` - Order cancellation logic

---

*Last Updated: 2024*

