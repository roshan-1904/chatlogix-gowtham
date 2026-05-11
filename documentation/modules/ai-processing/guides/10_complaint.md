# Detailed Actions for `complaint` Intent

## Overview

The `complaint` intent handles customer complaints and issues, including quality problems, delivery issues, service complaints, wrong items, and damaged products. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "my order was damaged 😞"
- Output: `{ original: "my order was damaged 😞", cleaned: "my order was damaged" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for previous complaint history
- Uses memory to understand complaint context

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `complaint` as primary intent

**Process:**
- Analyzes message for complaint keywords:
  - "complaint", "issue", "problem", "wrong", "damaged", "broken", "bad quality", "not working", "disappointed", "poor", "late", "delayed", "missing", "incorrect"
- Detects complaint types:
  - Quality issues: "bad quality", "poor"
  - Delivery problems: "late", "delayed"
  - Wrong items: "wrong", "incorrect"
  - Damaged items: "damaged", "broken"
  - Service complaints: "disappointed", "not satisfied"
- Checks for order context (which order is being complained about)
- Detects secondary intents (e.g., `refund_request` if customer wants refund)

**Extracted Info:**
- Complaint type: quality, delivery, service, wrong_item, damaged, other
- Order number (if mentioned)
- Complaint details
- Urgency level (usually high)

**Output:** `{ primaryIntent: "complaint", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order
- Complaint often handled alongside refund_request

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

**Action:** Fetches data needed for complaint handling

**Data Fetched:**

1. **Pending Order:** Order context (if complaint is about current order)
2. **Order History:** Recent orders (for complaint history)
3. **Vendor Config:** Escalation info, complaint handling policies
4. **Customer Insights:** Customer info, previous complaints

**Caching:** Uses Redis cache

**Output:** `{ pendingOrder: {...}, orderHistory: [...], vendorConfig: {...}, insights: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Handle customer complaints professionally and empathetically. Acknowledge the issue, apologize if appropriate, offer solutions (refund, replacement, etc.), escalate to vendor if needed, log complaint details for tracking."
3. **Order Context:** Order details (if complaint is about specific order)
4. **Recent Orders:** Last 3 orders (for complaint context)
5. **Complaint History:** Previous complaints (if any)
6. **Conversation Memory:** Key facts, ongoing topics
7. **Recent Messages:** Last 3 customer messages
8. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Acknowledge the issue empathetically
- Apologize if appropriate
- Offer solutions (refund, replacement, etc.)
- Escalate to vendor if needed
- Log complaint details for tracking

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response for complaint

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Empathetic acknowledgment
   - Apology (if appropriate)
   - Solution offers (refund, replacement, etc.)
   - Escalation information (if needed)
   - Complaint tracking information

**Output:** `{ response: "...", extractedData: { complaintType: "..." }, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `complaint` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true`

**Process:**
- Fetches additional order details if needed
- Gets more complaint context

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed

**Process:**
- Refines response with additional context
- Improves solution offers

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures empathetic and professional tone
6. Includes complaint tracking information

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates complaint data

**Validations:**

1. **Complaint Validation:**
   - Complaint type is valid
   - Order exists (if complaint is about specific order)

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Logs complaint and updates data

**Process:**

### 8.1 Complaint Logging

**Steps:**

1. **Log Complaint:**
   - Store complaint details
   - Link to order (if applicable)
   - Store complaint type
   - Set complaint status

2. **Update Order (if applicable):**
   - Mark order as having complaint
   - Store complaint reference

### 8.2 Customer Insights Update

**Saves/Updates:**
- Complaint history
- Complaint patterns

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer complained about [issue]"
- Ongoing topics: ["complaint"]
- Conversation stage: "complaint_handling"
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

## Summary: Complete Flow for `complaint`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `complaint` + complaint type
4. **Fetch Data** → Order context, order history, vendor config
5. **Build Prompt** → Focused prompt with complaint context
6. **Generate AI Response** → Empathetic response with solutions
7. **Validate Data** → Validate complaint details
8. **Log Complaint** → Store complaint in database
9. **Update Memory** → Store complaint facts
10. **Queue Response** → Send message to customer

---

## Key Features for `complaint`

- ✅ **Empathetic Handling:** Professional and empathetic responses
- ✅ **Solution Offers:** Provides refund, replacement options
- ✅ **Complaint Logging:** Tracks complaints for vendor review
- ✅ **Order Context:** Links complaints to specific orders
- ✅ **Escalation:** Can escalate to vendor if needed

---

## Complaint Types

### Quality Issues
- "bad quality", "poor quality"
- Solution: Replacement or refund

### Delivery Problems
- "late", "delayed"
- Solution: Apology, delivery update, compensation

### Wrong Items
- "wrong", "incorrect"
- Solution: Replacement with correct item

### Damaged Items
- "damaged", "broken"
- Solution: Replacement or refund

### Service Complaints
- "disappointed", "not satisfied"
- Solution: Apology, service improvement, compensation

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

