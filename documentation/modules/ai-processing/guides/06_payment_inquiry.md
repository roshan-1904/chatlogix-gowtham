# Detailed Actions for `payment_inquiry` Intent

## Overview

The `payment_inquiry` intent handles customer questions about payment methods, payment processes, and payment options. This includes questions about accepted payment methods, payment security, payment timing, and payment preferences. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "what payment methods do u accept? 😊"
- Output: `{ original: "what payment methods do u accept? 😊", cleaned: "what payment methods do you accept?" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for payment preferences in memory
- Uses memory to personalize payment information

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `payment_inquiry` as primary intent

**Process:**
- Analyzes message for payment keywords:
  - "payment", "pay", "cash", "UPI", "card", "online payment", "COD", "cash on delivery", "payment method", "how to pay"
- Detects payment-related questions:
  - Payment methods: "What payment methods do you accept?"
  - Payment process: "How do I pay?"
  - Payment security: "Is payment secure?"
  - Payment timing: "When do I pay?"
- **Multilingual Support:**
  - Tamil: "cash kodukalam", "payment pannalam"
  - Kannada: "cash kodbeku", "payment maadbeku"
- Detects secondary intents (e.g., `order_new` if customer wants to order after payment question)

**Extracted Info:**
- Payment method mentioned (if any)
- Inquiry type: methods, process, security, timing
- Urgency level

**Output:** `{ primaryIntent: "payment_inquiry", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order
- Payment inquiry often handled alongside order intents

**Example:** 
- Message: "I want to order, how do I pay?"
- Result: Handle order first, then answer payment question

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

**Action:** Fetches data needed for payment inquiry

**Data Fetched:**

1. **Vendor Config:** **REQUIRED** - Payment methods, payment policies
2. **Customer Insights:** Payment preferences (if available)

**Caching:** Uses Redis cache (vendor config cached for 30 minutes)

**Output:** `{ vendorConfig: {...}, insights: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Answer questions about payment methods, payment process, and payment options."
3. **Available Payment Methods:** From vendor config:
   - Payment methods list (Cash, UPI, Card, Online, COD)
   - Default payment method
   - COD availability
4. **Customer Payment Preferences:** From customer insights (if available)
5. **Conversation Memory:** Key facts, preferences
6. **Recent Messages:** Last 3 customer messages
7. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- List payment methods clearly if available in vendor config
- Explain payment process if asked
- Store customer payment preferences if mentioned
- Be clear and helpful about payment options

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response with payment information

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Payment methods available
   - Payment process explanation
   - Payment security information (if asked)
   - Payment timing information (if asked)
   - Helpful suggestions

**Output:** `{ response: "...", extractedData: { paymentMethod: "..." }, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `payment_inquiry` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true` (rare for payment_inquiry)

**Process:**
- Fetches additional payment details if needed

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed (rare for payment_inquiry)

**Process:**
- Refines response with additional context

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures natural conversation flow
6. Lists payment methods clearly

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates response data (minimal for payment_inquiry)

**Validations:**

1. **Basic Validation:**
   - Response is not empty
   - Payment methods are valid

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Updates customer insights (no order changes)

**Process:**

### 8.1 No Order Changes
- **No order modifications** - This intent only provides information

### 8.2 Customer Insights Update

**Saves/Updates:**
- Payment preferences (if customer mentioned preference)
- Payment method preference

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer asked about payment methods"
- Ongoing topics: ["payment_inquiry"]
- Customer preferences: Payment method preference
- Conversation stage: "payment_inquiry"
- Increments turn number

### 8.4 Cache Invalidation

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

## Summary: Complete Flow for `payment_inquiry`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `payment_inquiry`
4. **Fetch Data** → Vendor config (payment methods), customer insights
5. **Build Prompt** → Focused prompt with payment information
6. **Generate AI Response** → Payment methods and process information
7. **Validate Data** → Minimal validation (read-only)
8. **Update Memory** → Store payment preferences
9. **Queue Response** → Send message to customer

---

## Key Features for `payment_inquiry`

- ✅ **Payment Methods:** Lists all available payment methods
- ✅ **Multilingual Support:** Handles payment questions in multiple languages
- ✅ **Preference Storage:** Saves customer payment preferences
- ✅ **Clear Information:** Explains payment process clearly
- ✅ **Read-Only:** No order modifications, only information

---

## Common Customer Queries

### "What payment methods do you accept?"
- Lists all available payment methods from vendor config
- Shows default payment method if set
- Indicates COD availability

### "Can I pay by cash?"
- Confirms cash payment availability
- Provides payment process information

### "Do you accept UPI?"
- Confirms UPI payment availability
- Provides UPI payment details

### "online payment pannalam" (Tamil)
- Confirms online payment availability
- Provides online payment process

### "cash kodukalam" (Tamil)
- Confirms cash payment availability
- Provides cash payment process

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

