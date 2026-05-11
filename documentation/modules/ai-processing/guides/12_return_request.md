# Detailed Actions for `return_request` Intent

## Overview

The `return_request` intent handles customer requests to return or exchange items, including return requests, exchange requests, and item replacement requests. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "i want to return this pls 😊"
- Output: `{ original: "i want to return this pls 😊", cleaned: "i want to return this please" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for return history
- Uses memory to understand return context

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `return_request` as primary intent

**Process:**
- Analyzes message for return keywords:
  - "return", "exchange", "replace", "swap", "send back", "take back", "return item", "exchange item", "want to return"
- **Multilingual Support:**
  - Tamil: "return pannanum", "exchange pannanum"
  - Kannada: "return maadi"
- Detects return type: return, exchange, replace
- Extracts return reason (if mentioned)
- Checks for order context (which order/item needs return)
- Detects secondary intents (e.g., `complaint` if customer complains before requesting return)

**Extracted Info:**
- Return reason
- Return item (if mentioned)
- Order number (if mentioned)
- Return type: return, exchange, replace
- Urgency level

**Output:** `{ primaryIntent: "return_request", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order
- Return request often handled alongside complaint

**Example:** 
- Message: "This item is damaged, I want to return it"
- Result: Handle complaint first, then process return request

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

**Action:** Fetches data needed for return processing

**Data Fetched:**

1. **Pending Order:** Check if order exists (if return is for current order)
2. **Order History:** Return history, order details
3. **Vendor Config:** Return policy, return process
4. **Product Catalog:** Exchange options (if exchange requested)

**Caching:** Uses Redis cache

**Output:** `{ pendingOrder: {...}, orderHistory: [...], vendorConfig: {...}, products: [...] }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Handle return and exchange requests. Check return policy. Process return/exchange request. Provide return instructions. Generate return label if needed."
3. **Order Context:** Order details (if return is for specific order)
4. **Return History:** Previous returns (if any)
5. **Vendor Return Policy:** Return eligibility, process, instructions
6. **Product Catalog:** Exchange options (if exchange requested)
7. **Conversation Memory:** Key facts, ongoing topics
8. **Recent Messages:** Last 3 customer messages
9. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Check return policy
- Process return/exchange request
- Provide return instructions
- Generate return label if needed

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response for return request

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Return policy information
   - Return process explanation
   - Return instructions
   - Exchange options (if exchange requested)
   - Next steps

**Output:** `{ response: "...", extractedData: { returnReason: "...", returnItem: "..." }, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `return_request` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true`

**Process:**
- Fetches additional order details if needed
- Gets return policy details
- Gets exchange options

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed

**Process:**
- Refines response with additional context
- Improves return instructions

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures professional and clear tone
6. Includes return instructions

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates return request data

**Validations:**

1. **Return Validation:**
   - Order exists (if return is for specific order)
   - Order is eligible for return
   - Return item exists (if specified)

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Processes return and updates data

**Process:**

### 8.1 Return Processing

**Steps:**

1. **Check Return Eligibility:**
   - Verify order status
   - Check vendor return policy
   - Validate return reason

2. **Initiate Return (if eligible):**
   - Create return record
   - Link to order
   - Set return status
   - Store return reason

3. **Update Order (if applicable):**
   - Link return to order
   - Update order status if needed

### 8.2 Customer Insights Update

**Saves/Updates:**
- Return history
- Return patterns

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer requested return for [item]"
- Ongoing topics: ["return_request"]
- Conversation stage: "return_processing"
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

## Summary: Complete Flow for `return_request`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `return_request` + return type
4. **Fetch Data** → Order status, order history, vendor return policy, products
5. **Build Prompt** → Focused prompt with return context
6. **Generate AI Response** → Return policy and process information
7. **Validate Data** → Validate return eligibility
8. **Process Return** → Initiate return if eligible
9. **Update Memory** → Store return facts
10. **Queue Response** → Send message to customer

---

## Key Features for `return_request`

- ✅ **Return Policy:** Checks and explains return policy
- ✅ **Return Processing:** Initiates return if eligible
- ✅ **Exchange Options:** Provides exchange options if requested
- ✅ **Return Instructions:** Provides clear return instructions
- ✅ **Multilingual Support:** Handles return requests in multiple languages

---

## Return Types

### Return
- Customer wants to return item and get refund
- Process: Return item, process refund

### Exchange
- Customer wants to exchange item for different item
- Process: Return item, provide exchange options, process exchange

### Replace
- Customer wants to replace item with same item
- Process: Return item, send replacement

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

