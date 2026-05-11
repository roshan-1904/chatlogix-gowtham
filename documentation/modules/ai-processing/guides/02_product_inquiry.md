# Detailed Actions for `product_inquiry` Intent

## Overview

The `product_inquiry` intent handles customer questions about products, including availability, pricing, details, and product information. This is the **HIGHEST PRIORITY** intent when availability keywords are detected. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "do u have chocolate brownies? 😊"
- Output: `{ original: "do u have chocolate brownies? 😊", cleaned: "do you have chocolate brownies?" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for product preferences in memory
- Uses memory to personalize recommendations

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `product_inquiry` as primary intent

**Process:**
- Analyzes message for availability keywords:
  - **HIGHEST PRIORITY:** "available", "availiable", "avail", "have", "stock", "in stock", "do you have", "do you sell", "is [something] available"
- Detects product inquiry patterns:
  - Availability questions: "do you have [product]?", "is [product] available?"
  - Pricing questions: "price of [product]", "how much for [product]", "cost of [product]"
  - Product details: "what is [product]?", "tell me about [product]", "show me [product]"
- **CRITICAL:** Even if message contains confirmation words like "yes", "mam", "ok" - if it asks about product availability, classify as `product_inquiry`
- Extracts product names mentioned
- Detects secondary intents (e.g., `order_new` if customer wants to order after inquiry)

**Extracted Info:**
- Products mentioned
- Inquiry type: availability, pricing, details
- Urgency level

**Output:** `{ primaryIntent: "product_inquiry", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order
- Product inquiry often handled alongside order intents

**Example:** 
- Message: "I want 2 boxes, do you have chocolate?"
- Result: Handle order first, then answer product question

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

**Action:** Fetches data needed for product inquiry

**Data Fetched:**

1. **Product Catalog:** **REQUIRED** - All active products (for availability/pricing)
2. **Order History:** Customer's order history (for personalized recommendations)
3. **Vendor Config:** Business info, product policies

**Caching:** Uses Redis cache (product catalog cached for 1 hour)

**Output:** `{ products: [...], orderHistory: [...], vendorConfig: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Answer questions about products, pricing, and availability."
3. **Products Mentioned:** Products customer asked about (if any)
4. **All Available Products:** Full catalog with:
   - Product names
   - Prices
   - Units
   - Availability status
   - Descriptions
   - Keywords (for matching)
5. **Customer Order History:** Recent orders (for personalized recommendations)
6. **Conversation Memory:** Key facts, preferences
7. **Recent Messages:** Last 3 customer messages
8. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- **CRITICAL:** Match customer queries using KEYWORDS and product names
- Be flexible and intelligent with matching
- Support multi-language matching (Tamil, Hindi, English, etc.)
- Use product keywords to match partial queries and typos
- **DO NOT say "I don't have that product"** if a similar product exists
- Instead say "I have [product name] which includes [what customer asked for]"
- Only say "I don't have that product" if NO products in catalog match
- Always use EXACT product names from catalog when mentioning products
- Format with line breaks for readability

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response with product information

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Natural response text answering product question
   - Product information:
     - Availability status
     - Pricing details
     - Product descriptions
     - Recommendations based on order history
   - Helpful suggestions
   - Natural transition to ordering (if appropriate)

**Product Matching:**
- Matches customer query to products using keywords
- Handles typos and partial names
- Supports multi-language queries
- Uses fuzzy matching when needed

**Output:** `{ response: "...", extractedData: {}, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `product_inquiry` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true` (rare for product_inquiry)

**Process:**
- Fetches additional product details if needed
- Checks for similar products if exact match not found

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed (rare for product_inquiry)

**Process:**
- Refines response with additional context
- Improves product recommendations

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures natural conversation flow
6. Validates product names are exact (from catalog)

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates response data (minimal for product_inquiry)

**Validations:**

1. **Product Validation:**
   - Checks if mentioned products exist in catalog
   - Validates product names are correct

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Updates conversation memory (no order changes)

**Process:**

### 8.1 No Order Changes
- **No order modifications** - This intent only provides information

### 8.2 Customer Insights Update

**Saves/Updates:**
- Product preferences (if customer shows interest)
- Inquiry patterns

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer asked about [product]"
- Ongoing topics: ["product_inquiry"]
- Customer preferences: Product interests
- Conversation stage: "product_inquiry"
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

## Summary: Complete Flow for `product_inquiry`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `product_inquiry` (HIGHEST PRIORITY)
4. **Fetch Data** → Product catalog + order history
5. **Build Prompt** → Focused prompt with product catalog
6. **Generate AI Response** → Natural response with product information
7. **Validate Data** → Minimal validation (read-only)
8. **Update Memory** → Store product preferences
9. **Queue Response** → Send message to customer

---

## Key Features for `product_inquiry`

- ✅ **Highest Priority:** Classified as primary intent when availability keywords detected
- ✅ **Smart Matching:** Uses keywords, fuzzy matching, multi-language support
- ✅ **Product Catalog:** Full access to all products with prices and availability
- ✅ **Personalized Recommendations:** Uses order history for suggestions
- ✅ **Flexible Matching:** Handles typos, partial names, different languages
- ✅ **Helpful Responses:** Doesn't say "don't have" if similar product exists
- ✅ **Read-Only:** No order modifications, only information

---

## Common Customer Queries

### "Do you have chocolate brownies?"
- Matches "chocolate brownies" to products
- Shows availability and pricing
- Provides product details

### "What's the price of X?"
- Finds product in catalog
- Shows exact price and unit
- Provides additional product info

### "Is [product] available?"
- Checks product availability
- Shows stock status
- Provides alternatives if out of stock

### "Tell me about [product]"
- Provides product description
- Shows pricing and availability
- Offers to help with ordering

### "[Product] available?" (with confirmation words)
- **CRITICAL:** Still classified as `product_inquiry`
- Answers availability question
- Ignores confirmation words if asking about products

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

