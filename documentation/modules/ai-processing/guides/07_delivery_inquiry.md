# Detailed Actions for `delivery_inquiry` Intent

## Overview

The `delivery_inquiry` intent handles customer questions about delivery services, including delivery availability, delivery time, delivery areas, delivery charges, and delivery options. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "do u deliver to coimbatore? 😊"
- Output: `{ original: "do u deliver to coimbatore? 😊", cleaned: "do you deliver to coimbatore?" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for delivery preferences in memory
- Uses memory to personalize delivery information

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `delivery_inquiry` as primary intent

**Process:**
- Analyzes message for delivery keywords:
  - "deliver", "delivery", "shipping", "delivery time", "delivery cost", "free delivery", "delivery available", "deliver to", "delivery area"
- Detects delivery-related questions:
  - Delivery availability: "Do you deliver to [area]?"
  - Delivery time: "What's the delivery time?"
  - Delivery cost: "How much for delivery?"
  - Free delivery: "Is free delivery available?"
- **Multilingual Support:**
  - Tamil: "free delivery irukka", "evlo time la varum"
  - Kannada: "delivery ideya"
- **Note:** Delivery updates (changing address/time) remain as `order_update` with `modify_delivery` subtype
- Detects secondary intents (e.g., `order_new` if customer wants to order after delivery question)

**Extracted Info:**
- Delivery area mentioned (if any)
- Delivery time inquiry flag
- Inquiry type: availability, time, cost, areas
- Urgency level

**Output:** `{ primaryIntent: "delivery_inquiry", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order
- Delivery inquiry often handled alongside order intents

**Example:** 
- Message: "I want to order, do you deliver?"
- Result: Handle order first, then answer delivery question

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

**Action:** Fetches data needed for delivery inquiry

**Data Fetched:**

1. **Vendor Config:** **REQUIRED** - Delivery areas, delivery time, delivery charges
2. **Customer Insights:** Customer location (for area-specific delivery info)

**Caching:** Uses Redis cache (vendor config cached for 30 minutes)

**Output:** `{ vendorConfig: {...}, insights: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Answer questions about delivery availability, delivery time, delivery areas, and delivery charges."
3. **Delivery Configuration:** From vendor config:
   - Delivery areas (if available)
   - Delivery time estimates
   - Delivery charges
   - Free delivery threshold (if applicable)
4. **Customer Location:** From customer insights (if available)
5. **Conversation Memory:** Key facts, preferences
6. **Recent Messages:** Last 3 customer messages
7. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- If delivery areas are available in vendor config, mention them
- Provide delivery time estimates
- Explain delivery charges and free delivery thresholds if applicable
- Be clear and helpful about delivery options

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response with delivery information

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Delivery availability information
   - Delivery areas covered
   - Delivery time estimates
   - Delivery charges
   - Free delivery information
   - Helpful suggestions

**Output:** `{ response: "...", extractedData: { deliveryArea: "...", deliveryTime: "..." }, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `delivery_inquiry` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true` (rare for delivery_inquiry)

**Process:**
- Fetches additional delivery details if needed

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed (rare for delivery_inquiry)

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
6. Lists delivery areas clearly

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates response data (minimal for delivery_inquiry)

**Validations:**

1. **Basic Validation:**
   - Response is not empty
   - Delivery information is valid

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Updates customer insights (no order changes)

**Process:**

### 8.1 No Order Changes
- **No order modifications** - This intent only provides information

### 8.2 Customer Insights Update

**Saves/Updates:**
- Delivery area preference (if customer mentioned area)
- Delivery preferences

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer asked about delivery"
- Ongoing topics: ["delivery_inquiry"]
- Customer preferences: Delivery area preference
- Conversation stage: "delivery_inquiry"
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

## Summary: Complete Flow for `delivery_inquiry`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `delivery_inquiry`
4. **Fetch Data** → Vendor config (delivery info), customer insights
5. **Build Prompt** → Focused prompt with delivery information
6. **Generate AI Response** → Delivery availability, time, areas, charges
7. **Validate Data** → Minimal validation (read-only)
8. **Update Memory** → Store delivery preferences
9. **Queue Response** → Send message to customer

---

## Key Features for `delivery_inquiry`

- ✅ **Delivery Areas:** Lists all delivery areas from vendor config
- ✅ **Delivery Time:** Provides delivery time estimates
- ✅ **Delivery Charges:** Explains delivery charges and free delivery thresholds
- ✅ **Multilingual Support:** Handles delivery questions in multiple languages
- ✅ **Preference Storage:** Saves customer delivery preferences
- ✅ **Read-Only:** No order modifications, only information

---

## Common Customer Queries

### "Do you deliver to Coimbatore?"
- Checks if area is in delivery areas
- Confirms delivery availability
- Provides delivery time and charges

### "What's the delivery time?"
- Provides delivery time estimates
- Explains delivery process

### "Is free delivery available?"
- Checks free delivery threshold
- Confirms free delivery availability
- Explains free delivery conditions

### "free delivery irukka" (Tamil)
- Confirms free delivery availability
- Provides free delivery information

### "evlo time la varum" (Tamil - how long will it take)
- Provides delivery time estimates
- Explains delivery timeline

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

