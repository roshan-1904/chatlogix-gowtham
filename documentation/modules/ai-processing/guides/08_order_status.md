# Detailed Actions for `order_status` Intent

## Overview

The `order_status` intent handles customer inquiries about their existing orders. This includes checking order status, tracking orders, viewing order history, and getting order details. This document details every action taken at each stage of the multi-stage AI processing pipeline.

> **Superseded (2026-09):** This describes the OLD 14-stage `multiStageOrchestrator.ts` pipeline, which is **no longer on the hot path** for live WhatsApp messages. Production text messages now run through `backend/src/conversation/*` (LLM-1 draft + cart ops → `CartEngine` → optional LLM-2 verifier), deployed as the `chatlogix-incoming-response-generator` Lambda — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. The new pipeline does not route messages through fixed per-intent stages: `intent` is captured for telemetry only and never drives cart writes (CONVERSATION_PROCESSOR_LAMBDA.md §13). The services referenced below still exist in the codebase, but their only remaining live caller is `catalogImportSandboxService.ts` (catalog import, unrelated to message processing). The stage-by-stage detail below is kept as a historical reference for the old pipeline's behavior.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "where is my order? 😊"
- Output: `{ original: "where is my order? 😊", cleaned: "where is my order?" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for order references in memory
- Uses memory to understand which order customer is asking about

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `order_status` as primary intent

**Process:**
- Analyzes message for status keywords:
  - Status: "status", "where is", "when will", "track", "tracking"
  - Order history: "last order", "previous order", "order details", "my order", "my orders", "order history", "past orders"
- Detects if customer is asking about:
  - Current/pending order status
  - Order tracking
  - Order history
  - Specific order details
- Checks for order number mentions
- Detects secondary intents (e.g., `complaint` if asking about delayed order)

**Extracted Info:**
- Order number (if mentioned)
- Mentions order flag
- Order history request flag
- Urgency level

**Output:** `{ primaryIntent: "order_status", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order
- Decides if multiple intents can be handled in one response

**Example:** 
- Message: "where is my order? it's been delayed"
- Result: Handle order status first, then address complaint

---

## Stage 1.7: Correction Detection

**Action:** Detects if message corrects a previous one

**Process:**
- Compares with last 5 messages
- Checks for correction patterns
- If correction detected, adjusts context

**Output:** `{ isCorrection: true/false, correctedField: "..." }`

---

## Stage 2: Context-Aware Data Fetching

**Action:** Fetches data needed for order status inquiry

**Data Fetched:**

1. **Pending Order:** Current pending/confirmed order (if exists)
2. **Order History:** All orders for this customer (for history requests)

**Caching:** Uses Redis cache (order history cached for 10 minutes)

**Output:** `{ pendingOrder: {...}, orderHistory: [...] }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Provide information about the customer's order status and order history. Use the Order History provided below to answer customer questions about their previous orders."
3. **Current Order:** Pending order details (if exists)
4. **Order History:** Last orders with full details:
   - Order number and date
   - Status with emoji
   - Items ordered and total amount
   - Delivery information
5. **Conversation Memory:** Key facts, ongoing topics
6. **Recent Messages:** Last 3 customer messages
7. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- **CRITICAL:** Use the Order History provided to answer questions
- Display order details EXACTLY as provided, preserving line breaks
- If order history is provided, MUST use it to give specific order details
- DO NOT say you don't have access to order details if order history is provided
- Format orders with line breaks for readability
- Show order number, date, status, items, total, delivery info

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response with order information

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Natural response text with order details
   - Formatted order information:
     - Order number and date
     - Current status with appropriate emoji
     - Items ordered and total amount
     - Delivery information if available
   - Helpful next steps or suggestions
   - Offer to repeat order if order is delivered

**Response Format:**
- Preserves line breaks from order data
- Uses exact formatting provided in order context
- Shows each piece of information on its own line
- Includes appropriate emojis for status

**Output:** `{ response: "...", extractedData: {}, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `order_status` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true` (rare for order_status)

**Process:**
- Fetches additional order details if needed
- Checks for order number if customer mentioned one

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed (rare for order_status)

**Process:**
- Refines response with additional context
- Improves order information display

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Preserves order formatting
5. Adds emojis appropriately
6. Ensures natural conversation flow

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates response data (minimal for order_status)

**Validations:**

1. **Order Existence:**
   - Checks if orders exist (if customer asked about specific order)
   - Validates order number format (if provided)

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Updates conversation memory (no order changes)

**Process:**

### 8.1 No Order Changes
- **No order modifications** - This intent only reads order data

### 8.2 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer asked about order status"
- Ongoing topics: ["order_status"]
- Conversation stage: "order_status_inquiry"
- Increments turn number

### 8.3 Cache Invalidation

**Invalidates:**
- Conversation cache (to reflect new message)

---

## Stage 9: Response Queuing

**Action:** Queues message to WhatsApp

**Process:**
- Adds message to response queue
- Message sent to customer via WhatsApp API

**Output:** Message queued for delivery

---

## Summary: Complete Flow for `order_status`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `order_status`
4. **Fetch Data** → Pending order + order history
5. **Build Prompt** → Focused prompt with order details
6. **Generate AI Response** → Natural response with order information
7. **Validate Data** → Minimal validation (read-only)
8. **Update Memory** → Store conversation facts
9. **Queue Response** → Send message to customer

---

## Key Features for `order_status`

- ✅ **Order History Access:** Fetches and displays full order history
- ✅ **Status Display:** Shows current order status with emojis
- ✅ **Detailed Information:** Displays order number, date, items, total, delivery info
- ✅ **Format Preservation:** Preserves line breaks and formatting from order data
- ✅ **Multiple Orders:** Handles requests for order history
- ✅ **Smart Suggestions:** Offers to repeat orders if delivered
- ✅ **Read-Only:** No order modifications, only information display

---

## Common Customer Queries

### "Where is my order?"
- Fetches pending order
- Shows current status
- Provides tracking information if available

### "What's the status of my order?"
- Fetches pending order
- Shows detailed status with emoji
- Provides estimated delivery time

### "Show me my last order"
- Fetches order history
- Displays most recent order details
- Shows items, total, status

### "My order history"
- Fetches all orders
- Displays multiple orders with details
- Formats for readability

### "Order number ORD-123"
- Searches for specific order
- Displays order details if found
- Handles order not found gracefully

---

## Related Files

- `backend/src/services/multiStageOrchestrator.ts` - Main orchestrator
- `backend/src/services/intentClassificationService.ts` - Intent classification
- `backend/src/services/contextFetcherService.ts` - Data fetching
- `backend/src/services/promptBuilderService.ts` - Prompt construction
- `backend/src/services/primaryAIResponseService.ts` - AI response generation
- `backend/src/services/dataValidationService.ts` - Data validation
- `backend/src/services/dataExtractionService.ts` - Database updates
- `backend/src/services/orderService.ts` - Order retrieval logic

---

*Last Updated: 2024*

