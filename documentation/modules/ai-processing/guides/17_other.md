# Detailed Actions for `other` Intent

## Overview

The `other` intent handles messages that don't fit into any specific intent category. This is a catch-all intent for unclear messages, general questions, and messages that don't match any defined intent patterns. This document details every action taken at each stage of the multi-stage AI processing pipeline.

> **Superseded (2026-09):** This describes the OLD 14-stage `multiStageOrchestrator.ts` pipeline, which is **no longer on the hot path** for live WhatsApp messages. Production text messages now run through `backend/src/conversation/*` (LLM-1 draft + cart ops → `CartEngine` → optional LLM-2 verifier), deployed as the `chatlogix-incoming-response-generator` Lambda — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. The new pipeline does not route messages through fixed per-intent stages: `intent` is captured for telemetry only and never drives cart writes (CONVERSATION_PROCESSOR_LAMBDA.md §13); an unmatched/unclear message maps to a `noop` op plus a clarifying `draftReply`. The services referenced below still exist in the codebase, but their only remaining live caller is `catalogImportSandboxService.ts` (catalog import, unrelated to message processing). The stage-by-stage detail below is kept as a historical reference for the old pipeline's behavior.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "what's the weather? 😊"
- Output: `{ original: "what's the weather? 😊", cleaned: "what's the weather?" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Uses memory to understand context
- May help clarify unclear messages

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `other` as primary intent

**Process:**
- Analyzes message for all intent keywords
- If no specific intent patterns match, classifies as `other`
- May detect product names (for intelligent product detection)
- Detects secondary intents (rare for other)

**Extracted Info:**
- Products mentioned (if product detection finds any)
- Urgency level (usually low)

**Output:** `{ primaryIntent: "other", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected (rare for other)

**Process:**
- Usually not applicable for other intent

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

**Action:** Fetches data based on intelligent detection

**Data Fetched:**

1. **Vendor Config:** Always fetched (business info)
2. **Product Catalog:** Only if product name detected (handles typos/spelling)

**Caching:** Uses Redis cache

**Output:** `{ vendorConfig: {...}, products: [...] }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Handle general questions and unclear messages. Be helpful and try to understand customer intent."
3. **Products (if detected):** Product catalog (if product names detected)
4. **Conversation Memory:** Key facts, ongoing topics
5. **Recent Messages:** Last 3 customer messages
6. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Be helpful and understanding
- Try to clarify customer intent
- Offer assistance
- If product detected, provide product information

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response for unclear message

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Helpful response
   - Clarification questions (if needed)
   - General assistance
   - Product information (if products detected)

**Output:** `{ response: "...", extractedData: {}, needsClarification: true/false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `other` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true`

**Process:**
- Fetches additional context if needed
- Gets more information to help clarify

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed

**Process:**
- Refines response with additional context
- Improves clarification questions

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures helpful and understanding tone
6. Offers assistance

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates response data (minimal for other)

**Validations:**

1. **Basic Validation:**
   - Response is not empty

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Updates conversation memory (no order changes)

**Process:**

### 8.1 No Order Changes
- **No order modifications** - This intent handles general questions

### 8.2 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer asked unclear question"
- Ongoing topics: ["general_inquiry"]
- Conversation stage: "general_inquiry"
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

## Summary: Complete Flow for `other`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `other` (catch-all)
4. **Fetch Data** → Vendor config, products (if detected)
5. **Build Prompt** → Focused prompt with general context
6. **Generate AI Response** → Helpful response with clarification
7. **Validate Data** → Minimal validation
8. **Update Memory** → Store general inquiry facts
9. **Queue Response** → Send message to customer

---

## Key Features for `other`

- ✅ **Catch-All Intent:** Handles messages that don't fit other categories
- ✅ **Intelligent Detection:** Detects products even in unclear messages
- ✅ **Helpful Responses:** Provides helpful and understanding responses
- ✅ **Clarification:** Asks clarification questions when needed
- ✅ **General Assistance:** Offers general help and assistance

---

## Common Scenarios

### Unclear Messages
- "what?"
- Response: Helpful clarification, ask what customer needs

### General Questions
- "how are you?"
- Response: Friendly response, offer assistance

### Off-Topic Messages
- "what's the weather?"
- Response: Polite redirect, offer business-related help

### Product Mentions (Unclear Context)
- "something about chocolate"
- Response: If product detected, provide product information

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

