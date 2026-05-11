# Detailed Actions for `repeat_order` Intent

## Overview

The `repeat_order` intent handles customer requests to repeat or reorder their previous orders. This includes "same as last time", "repeat my last order", and "order again" requests. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "same as last time pls 😊"
- Output: `{ original: "same as last time pls 😊", cleaned: "same as last time please" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for previous order references in memory
- Uses memory to understand which order to repeat

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `repeat_order` as primary intent

**Process:**
- Analyzes message for repeat keywords:
  - "repeat", "reorder", "same as last", "again", "previous order", "last time", "order again", "same order", "repeat order", "last order"
- **Multilingual Support:**
  - Tamil: "repeat pannanum"
  - Kannada: "repeat maadi"
- Detects if customer wants to repeat previous order
- Extracts previous order number (if mentioned)
- Checks for order history (REQUIRED for repeat order)
- Detects secondary intents (rare for repeat_order)

**Extracted Info:**
- Previous order number (if mentioned)
- Repeat type: same order, modified repeat
- Urgency level

**Output:** `{ primaryIntent: "repeat_order", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected (rare for repeat_order)

**Process:**
- Usually not applicable for repeat orders

---

## Stage 1.7: Correction Detection

**Action:** Detects if message corrects a previous one

**Process:**
- Compares with last 5 messages
- Checks for correction patterns
- Usually not applicable for repeat orders

**Output:** `{ isCorrection: false }`

---

## Stage 2: Context-Aware Data Fetching

**Action:** Fetches data needed for repeat order

**Data Fetched:**

1. **Order History:** **REQUIRED** - Last order details (to repeat)
2. **Product Catalog:** All active products (to validate products still available)
3. **Vendor Config:** Business info, order policies
4. **Customer Insights:** Customer preferences, address

**Caching:** Uses Redis cache

**Output:** `{ orderHistory: [...], products: [...], vendorConfig: {...}, insights: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Help customer repeat their previous order. Fetch last order details from order history. Pre-fill order with previous items. Confirm with customer before placing. Check if products are still available."
3. **Last Order Details:** Full details of last order:
   - Order number and date
   - Items ordered
   - Quantities
   - Total amount
   - Delivery address
4. **Available Products:** Product catalog (to validate products still available)
5. **Customer Information:** Address, preferences
6. **Conversation Memory:** Key facts, ongoing topics
7. **Recent Messages:** Last 3 customer messages
8. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Use last order details to pre-fill repeat order
- Check if products are still available
- Confirm with customer before placing
- Use existing address if available

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response for repeat order

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Last order summary
   - Repeat order confirmation
   - Product availability check
   - Order pre-fill information
   - Confirmation request

**Output:** `{ response: "...", extractedData: { previousOrderNumber: "...", orderItems: [...] }, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `repeat_order` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true`

**Process:**
- Fetches additional order details if needed
- Gets product availability status

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed

**Process:**
- Refines response with additional context
- Improves order confirmation

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures natural conversation flow
6. Includes last order summary

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates repeat order data before creating repeat order

**Validations:**

1. **Previous Order Existence Validation:**
   - Previous order must exist
   - Error if no previous order found: "No previous order found to repeat"

2. **Order Items Validation:**
   - Previous order must have items
   - Error if order has no items: "Previous order has no items to repeat"

3. **Product Availability Validation:**
   - Products from previous order must still exist in catalog
   - Products must still be active (`isActive: true`)
   - Error message: "Some products from your previous order are no longer available: {product names}"

4. **Product Stock Validation:**
   - Products from previous order must be in stock
   - Error message: "Some products from your previous order are out of stock: {product names}"

5. **Quantity Validation:**
   - All quantities from previous order must be valid (> 0)
   - Error message: "Invalid quantity ({quantity}) for {product name}"

**Validation Checks Performed:**
- Fetches previous order for this conversation and customer
- Validates previous order has items
- Checks each product from previous order against current product catalog
- Verifies products are still available and in stock
- Validates quantities are positive

**Error Messages (Customer-Friendly):**
- No previous order: "No previous order found to repeat"
- No items in previous order: "Previous order has no items to repeat"
- Products unavailable: "Some products from your previous order are no longer available: {product names}"
- Products out of stock: "Some products from your previous order are out of stock: {product names}"
- Invalid quantities: "Invalid quantity ({quantity}) for {product name}"

**Output:** `{ isValid: true/false, errors: [...], validatedData: {} }`

**If Validation Fails:**
- Response message is updated with validation errors
- `needsClarification` flag is set to `true`
- Updated message is stored in `context.validationFailedMessage` for Stage 9
- Repeat order creation is prevented in Stage 8
- Customer receives error message explaining why repeat order cannot be created
- Customer is offered to place a new order instead

---

## Stage 8: Database Update

**Action:** Creates repeat order (similar to order_new)

**Process:**

### 8.1 Repeat Order Creation

**Steps:**

1. **Pre-fill Order from Last Order:**
   - Get items from last order
   - Get quantities from last order
   - Get delivery address from last order
   - Validate products still available

2. **Create New Order:**
   - Generate new order number
   - Create order with pre-filled items
   - Use existing address
   - Set status to pending

3. **Order Creation:**
```typescript
{
  orderNumber: "ORD-BAKER-2024120002",
  items: [...lastOrderItems],
  totalAmount: calculatedTotal,
  deliveryAddress: lastOrderAddress,
  status: "pending"
}
```

### 8.2 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer repeated last order"
- Ongoing topics: ["repeat_order"]
- Last order summary: New repeat order details
- Conversation stage: "order_confirmation"
- Increments turn number

### 8.3 Cache Invalidation

**Invalidates:**
- Conversation cache
- Pending order cache
- Order history cache

---

## Stage 9: Response Queuing

**Action:** Queues message to WhatsApp

**Process:**
- Adds message to response queue
- Message sent to customer via WhatsApp API

**Output:** Message queued for delivery

---

## Summary: Complete Flow for `repeat_order`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `repeat_order`
4. **Fetch Data** → Order history, products, customer info
5. **Build Prompt** → Focused prompt with last order details
6. **Generate AI Response** → Repeat order confirmation
7. **Validate Data** → Validate products still available
8. **Create Repeat Order** → Pre-fill and create new order
9. **Update Memory** → Store repeat order facts
10. **Queue Response** → Send message to customer

---

## Key Features for `repeat_order`

- ✅ **Last Order Access:** Fetches and uses last order details
- ✅ **Product Validation:** Checks if products are still available
- ✅ **Pre-fill Order:** Pre-fills order with last order items
- ✅ **Address Reuse:** Uses existing delivery address
- ✅ **Confirmation:** Confirms with customer before placing

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

