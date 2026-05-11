# Detailed Actions for `support` Intent

## Overview

The `support` intent handles customer requests for human assistance, including requests to speak with a real person, agent requests, and customer service escalations. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "i want to talk to a human pls 😊"
- Output: `{ original: "i want to talk to a human pls 😊", cleaned: "i want to talk to a human please" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for handoff confirmation status
- Uses memory to understand support context

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `support` as primary intent

**Process:**
- Analyzes message for support keywords:
  - "human", "agent", "person", "talk to someone", "speak to agent", "customer service", "help me human"
- Detects explicit request to speak with a real person
- Checks for handoff confirmation pending status
- Detects secondary intents (rare for support)

**Extracted Info:**
- Support type: human agent, customer service
- Urgency level (usually high)

**Output:** `{ primaryIntent: "support", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected (rare for support)

**Process:**
- Usually not applicable for support requests

---

## Stage 1.7: Correction Detection

**Action:** Detects if message corrects a previous one

**Process:**
- Compares with last 5 messages
- Checks for correction patterns
- Usually not applicable for support requests

**Output:** `{ isCorrection: false }`

---

## Stage 2: Context-Aware Data Fetching

**Action:** Fetches data needed for support handoff

**Data Fetched:**

1. **Vendor Config:** Escalation info, support contact

**Caching:** Uses Redis cache

**Output:** `{ vendorConfig: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Handle customer request for human assistance. Escalate to vendor if needed."
3. **Vendor Config:** Support contact information
4. **Conversation Memory:** Key facts, ongoing topics
5. **Recent Messages:** Last 3 customer messages
6. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Acknowledge support request
- Provide escalation information
- Escalate to vendor if needed

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response for support request

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Support request acknowledgment
   - Escalation information
   - Support contact details
   - Next steps

**Output:** `{ response: "...", extractedData: {}, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `support` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true` (rare for support)

**Process:**
- Usually not needed for support requests

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed (rare for support)

**Process:**
- Usually not needed for support requests

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures professional and helpful tone
6. Includes support contact information

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates response data (minimal for support)

**Validations:**

1. **Basic Validation:**
   - Response is not empty

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Updates conversation and escalates if needed

**Process:**

### 8.1 Support Escalation

**Steps:**

1. **Set Handoff Status:**
   - Set handoff confirmation pending (if needed)
   - Mark conversation for human review

2. **Escalate to Vendor:**
   - Notify vendor of support request
   - Provide conversation context

### 8.2 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer requested human support"
- Ongoing topics: ["support"]
- Conversation stage: "support_requested"
- Handoff confirmation pending: true
- Increments turn number

### 8.3 Cache Invalidation

**Invalidates:**
- Conversation cache

---

## Stage 9: Response Queuing

**Action:** Queues message to WhatsApp

**Process:**
- Adds message to response queue
- Message sent to customer via WhatsApp API

**Output:** Message queued for delivery

---

## Summary: Complete Flow for `support`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `support`
4. **Fetch Data** → Vendor config (escalation info)
5. **Build Prompt** → Focused prompt with support context
6. **Generate AI Response** → Support acknowledgment and escalation info
7. **Validate Data** → Minimal validation
8. **Escalate Support** → Set handoff status, notify vendor
9. **Update Memory** → Store support request facts
10. **Queue Response** → Send message to customer

---

## Key Features for `support`

- ✅ **Human Escalation:** Escalates to human agent
- ✅ **Handoff Management:** Manages handoff confirmation
- ✅ **Vendor Notification:** Notifies vendor of support request
- ✅ **Support Contact:** Provides support contact information

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

