# Detailed Actions for `feedback` Intent

## Overview

The `feedback` intent handles positive customer feedback, reviews, ratings, and appreciation messages. This includes thank you messages, product reviews, service appreciation, and ratings. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "great service thank u! 😊"
- Output: `{ original: "great service thank u! 😊", cleaned: "great service thank you!" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for previous feedback
- Uses memory to personalize response

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `feedback` as primary intent

**Process:**
- Analyzes message for feedback keywords:
  - "feedback", "review", "rating", "stars", "good", "excellent", "satisfied", "happy", "thank you", "appreciate", "great service", "loved it", "amazing", "wonderful", "perfect"
- **Multilingual Support:**
  - Tamil: "nandri" (after service), "romba nalla irundhuchu"
  - Kannada: "dhanyavadagalu"
- Detects feedback type: positive, negative, neutral
- Extracts rating (if mentioned, e.g., "5 stars")
- Checks for order context (which order is being reviewed)
- Detects secondary intents (rare for feedback)

**Extracted Info:**
- Feedback type: positive, negative, neutral
- Feedback rating: 1-5 stars (if mentioned)
- Order number (if mentioned)
- Urgency level (usually low)

**Output:** `{ primaryIntent: "feedback", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected (rare for feedback)

**Process:**
- Usually not applicable for feedback

---

## Stage 1.7: Correction Detection

**Action:** Detects if message corrects a previous one

**Process:**
- Compares with last 5 messages
- Checks for correction patterns
- Usually not applicable for feedback

**Output:** `{ isCorrection: false }`

---

## Stage 2: Context-Aware Data Fetching

**Action:** Fetches data needed for feedback handling

**Data Fetched:**

1. **Order History:** Recent orders (for feedback context)
2. **Vendor Config:** Business info, feedback policies

**Caching:** Uses Redis cache

**Output:** `{ orderHistory: [...], vendorConfig: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Acknowledge and appreciate customer feedback. Thank the customer for their feedback. Store feedback for vendor insights. Use positive feedback for testimonials if appropriate."
3. **Recent Orders:** Last orders (for feedback context)
4. **Conversation Memory:** Key facts, ongoing topics
5. **Recent Messages:** Last 3 customer messages
6. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Thank the customer for their feedback
- Store feedback for vendor insights
- Use positive feedback for testimonials if appropriate
- Be warm and appreciative

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response for feedback

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Appreciation message
   - Thank you message
   - Acknowledgment of feedback
   - Encouragement for future orders

**Output:** `{ response: "...", extractedData: { feedbackType: "...", feedbackRating: ... }, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `feedback` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true` (rare for feedback)

**Process:**
- Usually not needed for feedback

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed (rare for feedback)

**Process:**
- Usually not needed for feedback

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures warm and appreciative tone
6. Includes thank you message

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates feedback data

**Validations:**

1. **Feedback Validation:**
   - Feedback type is valid
   - Rating is valid (if provided, 1-5)

**Output:** `{ isValid: true, errors: [], validatedData: {} }`

---

## Stage 8: Database Update

**Action:** Stores feedback and updates data

**Process:**

### 8.1 Feedback Storage

**Steps:**

1. **Store Feedback:**
   - Save feedback text
   - Store feedback type
   - Store rating (if provided)
   - Link to order (if applicable)
   - Set feedback timestamp

2. **Update Order (if applicable):**
   - Link feedback to order
   - Store rating

### 8.2 Customer Insights Update

**Saves/Updates:**
- Feedback history
- Customer satisfaction metrics

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer provided [positive/negative] feedback"
- Ongoing topics: ["feedback"]
- Conversation stage: "feedback_received"
- Increments turn number

### 8.4 Cache Invalidation

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

## Summary: Complete Flow for `feedback`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `feedback` + feedback type
4. **Fetch Data** → Order history, vendor config
5. **Build Prompt** → Focused prompt with feedback context
6. **Generate AI Response** → Appreciation and thank you message
7. **Validate Data** → Validate feedback details
8. **Store Feedback** → Save feedback in database
9. **Update Memory** → Store feedback facts
10. **Queue Response** → Send message to customer

---

## Key Features for `feedback`

- ✅ **Appreciation:** Warm and appreciative responses
- ✅ **Feedback Storage:** Stores feedback for vendor insights
- ✅ **Rating Extraction:** Extracts and stores ratings
- ✅ **Testimonials:** Can use positive feedback for testimonials
- ✅ **Multilingual Support:** Handles feedback in multiple languages

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

