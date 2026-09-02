# Detailed Actions for `refund_request` Intent

## Overview

The `refund_request` intent handles customer requests for refunds, including money back requests, payment refunds, and compensation requests. This document details every action taken at each stage of the multi-stage AI processing pipeline.

> **Superseded (2026-09):** This describes the OLD 14-stage `multiStageOrchestrator.ts` pipeline, which is **no longer on the hot path** for live WhatsApp messages. Production text messages now run through `backend/src/conversation/*` (LLM-1 draft + cart ops → `CartEngine` → optional LLM-2 verifier), deployed as the `chatlogix-incoming-response-generator` Lambda — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. The new pipeline does not route messages through fixed per-intent stages: `intent` is captured for telemetry only and never drives cart writes (CONVERSATION_PROCESSOR_LAMBDA.md §13). The services referenced below still exist in the codebase, but their only remaining live caller is `catalogImportSandboxService.ts` (catalog import, unrelated to message processing). The stage-by-stage detail below is kept as a historical reference for the old pipeline's behavior — including the gap it documents (refund requests were detection-only, with no refund record or vendor alert actually wired up; see `MULTI_STAGE_WORKER_ANALYSIS.md` Gap 3 in this directory), which was never carried forward as a completed feature into the new pipeline either.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "i want refund pls 😊"
- Output: `{ original: "i want refund pls 😊", cleaned: "i want refund please" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for refund history
- Uses memory to understand refund context

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `refund_request` as primary intent

**Process:**
- Analyzes message for refund keywords:
  - "refund", "return money", "money back", "reimburse", "compensation", "refund my money", "give money back"
- **Multilingual Support:**
  - Tamil: "refund venum", "money back venum"
  - Kannada: "refund beku"
- Detects refund reason (if mentioned)
- Checks for order context (which order needs refund)
- Detects secondary intents (e.g., `complaint` if customer complains before requesting refund)

**Extracted Info:**
- Refund reason
- Refund amount (if mentioned)
- Order number (if mentioned)
- Urgency level (usually high)

**Output:** `{ primaryIntent: "refund_request", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order
- Refund request often handled alongside complaint

**Example:** 
- Message: "My order was damaged, I want a refund"
- Result: Handle complaint first, then process refund request

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

**Action:** Fetches data needed for refund processing

**Data Fetched:**

1. **Pending Order:** Check order status (if refund is for current order)
2. **Order History:** Check refund history, order details
3. **Vendor Config:** Refund policy, refund process
4. **Customer Insights:** Customer info, refund history

**Caching:** Uses Redis cache

**Output:** `{ pendingOrder: {...}, orderHistory: [...], vendorConfig: {...}, insights: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Process refund requests. Check refund eligibility based on order status and vendor policy. Explain refund process. Initiate refund if eligible. Provide timeline for refund processing."
3. **Order Context:** Order details (if refund is for specific order)
4. **Refund History:** Previous refunds (if any)
5. **Vendor Refund Policy:** Refund eligibility, process, timeline
6. **Conversation Memory:** Key facts, ongoing topics
7. **Recent Messages:** Last 3 customer messages
8. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Check refund eligibility based on order status and vendor policy
- Explain refund process clearly
- Initiate refund if eligible
- Provide timeline for refund processing

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response for refund request

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Refund eligibility check
   - Refund process explanation
   - Refund initiation (if eligible)
   - Refund timeline
   - Next steps

**Output:** `{ response: "...", extractedData: { refundReason: "...", refundAmount: ... }, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `refund_request` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true`

**Process:**
- Fetches additional order details if needed
- Gets refund policy details

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed

**Process:**
- Refines response with additional context
- Improves refund process explanation

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures professional and clear tone
6. Includes refund timeline

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates refund request data

**Validations:**

1. **Refund Validation:**
   - Order exists (if refund is for specific order)
   - Order is eligible for refund
   - Refund amount is valid (if specified)

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Processes refund and updates data

**Process:**

### 8.1 Refund Processing

**Steps:**

1. **Check Refund Eligibility:**
   - Verify order status
   - Check vendor refund policy
   - Validate refund reason

2. **Initiate Refund (if eligible):**
   - Create refund record
   - Update order status
   - Set refund amount
   - Set refund status

3. **Update Order:**
   - Link refund to order
   - Update order status if needed

### 8.2 Customer Insights Update

**Saves/Updates:**
- Refund history
- Refund patterns

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer requested refund for [reason]"
- Ongoing topics: ["refund_request"]
- Conversation stage: "refund_processing"
- Increments turn number

### 8.4 Cache Invalidation

**Invalidates:**
- Conversation cache
- Order cache (if order updated)

---

## Stage 9: Response Queuing

**Action:** Queues message to WhatsApp

**Process:**
- Adds message to response queue
- Message sent to customer via WhatsApp API

**Output:** Message queued for delivery

---

## Summary: Complete Flow for `refund_request`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `refund_request` + refund reason
4. **Fetch Data** → Order status, order history, vendor refund policy
5. **Build Prompt** → Focused prompt with refund context
6. **Generate AI Response** → Refund eligibility and process information
7. **Validate Data** → Validate refund eligibility
8. **Process Refund** → Initiate refund if eligible
9. **Update Memory** → Store refund facts
10. **Queue Response** → Send message to customer

---

## Key Features for `refund_request`

- ✅ **Eligibility Check:** Validates refund eligibility based on order status and policy
- ✅ **Refund Processing:** Initiates refund if eligible
- ✅ **Clear Timeline:** Provides refund processing timeline
- ✅ **Policy Compliance:** Follows vendor refund policy
- ✅ **Multilingual Support:** Handles refund requests in multiple languages

---

## Related Files

- `backend/src/services/multiStageOrchestrator.ts` - Main orchestrator
- `backend/src/services/intentClassificationService.ts` - Intent classification
- `backend/src/services/contextFetcherService.ts` - Data fetching
- `backend/src/services/promptBuilderService.ts` - Prompt construction
- `backend/src/services/primaryAIResponseService.ts` - AI response generation
- `backend/src/services/dataValidationService.ts` - Data validation
- `backend/src/services/dataExtractionService.ts` - Database updates

---

*Last Updated: 2024*

