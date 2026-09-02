# Detailed Actions for `greeting` Intent

## Overview

The `greeting` intent handles the opening conversation with customers. This includes welcoming new customers, greeting returning customers, showing available products, and offering repeat order suggestions. This document details every action taken at each stage of the multi-stage AI processing pipeline.

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
- Input: "hi there! 😊"
- Output: `{ original: "hi there! 😊", cleaned: "hi there!" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Checks if this is the **first customer message** (sets `isFirstMessage` flag)
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Determines if customer is new or returning

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `greeting` as primary intent

**Process:**
- Analyzes message for greeting keywords:
  - "hi", "hello", "hey", "good morning", "good evening", "good afternoon"
  - "namaste", "namaskar" (multilingual greetings)
- Detects if message is opening salutation without specific request
- Checks for secondary intents (e.g., `order_new` if customer greets and orders)
- **Note:** If greeting is combined with other intents, greeting may be secondary

**Extracted Info:**
- Greeting type
- Secondary intents (if any)
- Urgency level (usually low)

**Output:** `{ primaryIntent: "greeting", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order
- If greeting + other intent: greeting is primary, other intent is secondary
- Handles both in one response

**Example:** 
- Message: "Hello, I want 2 boxes"
- Result: Greet customer, then handle order

---

## Stage 1.7: Correction Detection

**Action:** Detects if message corrects a previous one

**Process:**
- Compares with last 5 messages
- Checks for correction patterns
- Usually not applicable for greetings

**Output:** `{ isCorrection: false }`

---

## Stage 2: Context-Aware Data Fetching

**Action:** Fetches data needed for greeting

**Data Fetched:**

1. **Customer Insights:** Check if new or returning customer
2. **Product Catalog:** All active products (to show available products)
3. **Order History:** Recent orders (for repeat order suggestions)
4. **Vendor Config:** Business name, bot name, welcome message

**Caching:** Uses Redis cache (product catalog cached for 1 hour)

**Output:** `{ insights: {...}, products: [...], orderHistory: [...], vendorConfig: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Greet the customer warmly and offer assistance."
3. **Customer Type:**
   - New customer: Welcome message
   - Returning customer: Personalized greeting with order history
4. **Available Products:** All products (AI can mention them)
5. **Recent Orders:** Last 3 orders (for repeat order suggestions)
6. **Conversation Memory:** Key facts, preferences
7. **Recent Messages:** Last 3 customer messages
8. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Greet warmly and naturally
- Mention available products if appropriate
- Offer repeat order if customer has previous orders
- Use vendor's bot name and personality
- Keep it friendly and welcoming

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response with greeting

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Warm greeting message
   - Personalized welcome (if returning customer)
   - Product highlights (if appropriate)
   - Repeat order offer (if customer has previous orders)
   - Offer to help with ordering

**Personalization:**
- Uses customer name if available
- References previous orders if returning customer
- Mentions favorite products if known

**Output:** `{ response: "...", extractedData: {}, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `greeting` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true` (rare for greeting)

**Process:**
- Usually not needed for greetings

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed (rare for greeting)

**Process:**
- Usually not needed for greetings

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures natural conversation flow
6. Personalizes with customer name if available

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates response data (minimal for greeting)

**Validations:**

1. **Basic Validation:**
   - Response is not empty
   - Appropriate length

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Updates conversation memory (no order changes)

**Process:**

### 8.1 No Order Changes
- **No order modifications** - This intent only greets customer

### 8.2 Customer Insights Update

**Saves/Updates:**
- First interaction timestamp (if new customer)
- Communication style preferences

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer greeted"
- Ongoing topics: ["greeting"]
- Conversation stage: "greeting"
- Turn number: 1 (if first message)
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

## Summary: Complete Flow for `greeting`

1. **Normalize Message** → Clean text
2. **Load Memory** → Check if first message
3. **Classify Intent** → Identify `greeting`
4. **Fetch Data** → Customer insights, products, order history
5. **Build Prompt** → Focused prompt with customer context
6. **Generate AI Response** → Warm greeting with personalization
7. **Validate Data** → Minimal validation
8. **Update Memory** → Store greeting interaction
9. **Queue Response** → Send message to customer

---

## Key Features for `greeting`

- ✅ **First Message Detection:** Identifies first customer message
- ✅ **New vs Returning:** Distinguishes new and returning customers
- ✅ **Product Showcase:** Can mention available products
- ✅ **Repeat Order Suggestions:** Offers repeat orders for returning customers
- ✅ **Personalization:** Uses customer name and preferences
- ✅ **Warm Welcome:** Friendly and welcoming tone
- ✅ **Multi-Intent Support:** Can handle greeting + other intents

---

## Common Customer Scenarios

### New Customer Greeting
- "Hi"
- Response: Warm welcome, introduce business, show products, offer help

### Returning Customer Greeting
- "Hello"
- Response: Personalized greeting, mention previous orders, offer repeat order

### Greeting + Order
- "Hi, I want 2 boxes"
- Response: Greet customer, then handle order (multi-intent)

### Greeting + Product Inquiry
- "Hello, do you have chocolate?"
- Response: Greet customer, then answer product question (multi-intent)

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

