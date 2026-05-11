# Detailed Actions for `order_new` Intent

## Overview

The `order_new` intent handles the complete process of creating a new order from customer messages. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "I want 2 boxes of brownies pls 😊"
- Output: `{ original: "I want 2 boxes of brownies pls 😊", cleaned: "I want 2 boxes of brownies please" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Checks if this is the first customer message
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Uses memory to avoid asking for known information

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `order_new` as primary intent

**Process:**
- Analyzes message for ordering keywords ("I want", "I need", "buy", "order")
- Checks for product names and quantities
- Detects secondary intents (e.g., `product_inquiry`)
- Checks for existing pending order (if found, may classify as `order_update` instead)

**Extracted Info:**
- Products mentioned
- Quantities
- Urgency level
- Delivery info flag
- Special requests flag

**Output:** `{ primaryIntent: "order_new", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order (e.g., handle order first, then product inquiry)
- Decides if multiple intents can be handled in one response

**Example:** 
- Message: "I want 2 boxes, do you have chocolate?"
- Result: Handle order first, then answer product question

---

## Stage 1.7: Correction Detection

**Action:** Detects if message corrects a previous one

**Process:**
- Compares with last 5 messages
- Checks for correction patterns ("no, I meant...", "actually...")
- If correction detected, adjusts context

**Output:** `{ isCorrection: true/false, correctedField: "..." }`

---

## Stage 2: Context-Aware Data Fetching

**Action:** Fetches data needed for order creation

**Data Fetched:**

1. **Pending Order:** Checks if order already exists (to avoid duplicates)
2. **Product Catalog:** All active products (for validation)
3. **Customer Insights:** Address, preferences, payment methods
4. **Vendor Config:** Business name, bot name, system prompts, order prefix

**Caching:** Uses Redis cache (product catalog cached for 1 hour)

**Output:** `{ pendingOrder: {...}, products: [...], insights: {...}, vendorConfig: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens vs 3000-4000 legacy)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Help customer place a new order. Gather product details, quantities, and delivery information."
3. **Products Mentioned:** Products customer asked about (if any)
4. **All Available Products:** Full catalog for validation
5. **Customer Information:** Address, preferences (to avoid re-asking)
6. **Conversation Memory:** Key facts, ongoing topics
7. **Recent Messages:** Last 3 customer messages
8. **Full Conversation History:** Last 20 messages
9. **Current Order:** If pending order exists (to avoid duplicates)

**Special Instructions:**
- Only use products from catalog
- Match products using keywords (handles typos/multilingual)
- Don't ask for info already available
- Extract order items only if products match catalog

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response and extracts order data

**Process:**

1. **Calls OpenAI** (GPT-4o-mini or GPT-4o for complex orders)
2. **AI Generates:**
   - Natural response text
   - Extracted order data (products, quantities, delivery info)
   - Clarification needs flag
   - Clarification questions (if needed)
3. **Product Matching:**
   - Validates products against catalog
   - Uses fuzzy matching for typos
   - Supports multi-language matching
   - Auto-corrects product names to exact catalog names

**Extracted Data Structure:**
```json
{
  "orderItems": [
    {"product": "Chocolate Brownie Box", "quantity": 2}
  ],
  "deliveryAddress": "123 Main St...",
  "deliveryInstructions": "Ring doorbell",
  "specialRequests": "Extra sweet"
}
```

**Output:** `{ response: "...", extractedData: {...}, needsClarification: true/false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `order_new` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true`

**Process:**
- Fetches additional data to answer clarification questions
- Checks customer insights for missing info
- Determines if can proceed with defaults

**Example:** If address missing, checks if address exists in customer insights

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed and enrichment available

**Process:**
- Refines response with additional context
- Improves clarification questions
- May reduce need for clarification

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

**Action:** Validates extracted order data before saving

**Validations:**

1. **Product Validation:**
   - All products exist in catalog (using fuzzy matching)
   - Products are in stock
   - Quantities > 0
   - Minimum order quantity per product (if `minOrderQuantity` is set for product)
   - Error message: "Minimum order quantity for {product} is {min}. You ordered {quantity}."

2. **Order Items Validation (Intent-Specific for `order_new`):**
   - Order items array must not be empty
   - At least one item required

3. **Minimum Order Value Validation (Intent-Specific for `order_new`):**
   - Checks vendor's `minimumOrderValue` setting
   - Validates order total meets minimum requirement
   - Error message: "Minimum order value is ₹{amount}. Your order total is ₹{total}."

4. **Customer Name Format Validation (Intent-Specific for `order_new`):**
   - If customer name provided, validates format
   - Length: 2-100 characters
   - Warning if format invalid (doesn't block order creation)

5. **Price Validation:**
   - Calculates total from product prices
   - Validates against extracted total (10% tolerance)

6. **Address Validation:**
   - Checks address format (if provided)
   - Minimum 10 characters

7. **Order Conflict Check:**
   - Checks if order already exists
   - Validates delivery date conflicts

**Output:** `{ isValid: true/false, errors: [...], validatedData: {...} }`

**If Validation Fails:** 
- Errors logged
- Order not created
- Customer notified with specific error messages
- Database update skipped in Stage 8

---

## Stage 8: Database Update

**Action:** Saves order and updates related data

**Process:**

### 8.1 Order Creation

**Checks if pending order exists:**
- If exists: Updates existing order
- If not: Creates new order

**Order Creation Steps:**

1. **Generate Order Number:** Format `ORD-{PREFIX}-{YYYYMM}{4-digit-count}`
   - Example: `ORD-BAKER-2024120001`

2. **Product Matching & Price Calculation:**
   - Matches each product using fuzzy matching
   - Auto-corrects product names
   - Calculates price: `price × quantity` for each item
   - Sums total amount

3. **Create Order Record:**
```typescript
{
  orderNumber: "ORD-BAKER-2024120001",
  vendorId: "...",
  customerId: "...",
  conversationId: "...",
  items: [
    {product: "Chocolate Brownie Box", quantity: 2, price: 500}
  ],
  totalAmount: 1000, // in paise
  status: "pending",
  deliveryAddress: "...",
  deliveryInstructions: "...",
  specialRequests: "..."
}
```

### 8.2 Customer Insights Update

**Saves/Updates:**
- Delivery address (if provided)
- Payment preferences (if mentioned)
- Product preferences
- Communication style

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer ordered 2 boxes of brownies"
- Ongoing topics: ["order_creation"]
- Last order summary: Order details
- Conversation stage: "order_confirmation"
- Increments turn number

### 8.4 Cache Invalidation

**Invalidates:**
- Conversation cache
- Pending order cache
- Customer insights cache (if updated)

---

## Stage 9: Response Queuing

**Action:** Queues message to WhatsApp

**Process:**
- Adds message to response queue
- Message sent to customer via WhatsApp API

**Output:** Message queued for delivery

---

## Summary: Complete Flow for `order_new`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `order_new`
4. **Fetch Data** → Products, customer info, vendor config
5. **Build Prompt** → Focused prompt with relevant context
6. **Generate AI Response** → Natural response + extracted order data
7. **Validate Data** → Check products, prices, addresses
8. **Create Order** → Save to database with order number
9. **Update Memory** → Store conversation facts
10. **Queue Response** → Send message to customer

---

## Key Features for `order_new`

- ✅ **Product Validation:** Only creates orders with valid products from catalog
- ✅ **Fuzzy Matching:** Handles typos and multilingual queries
- ✅ **Smart Defaults:** Uses existing customer info (address, preferences)
- ✅ **Duplicate Prevention:** Checks for existing orders before creating
- ✅ **Price Calculation:** Auto-calculates total from product prices
- ✅ **Order Numbering:** Generates unique order numbers per vendor
- ✅ **Memory Integration:** Remembers conversation context to avoid re-asking

---

## Related Files

- `backend/src/services/multiStageOrchestrator.ts` - Main orchestrator
- `backend/src/services/intentClassificationService.ts` - Intent classification
- `backend/src/services/contextFetcherService.ts` - Data fetching
- `backend/src/services/promptBuilderService.ts` - Prompt construction
- `backend/src/services/primaryAIResponseService.ts` - AI response generation
- `backend/src/services/dataValidationService.ts` - Data validation
- `backend/src/services/dataExtractionService.ts` - Database updates
- `backend/src/services/orderService.ts` - Order creation logic

---

*Last Updated: 2024*

