# Detailed Actions for `order_update` Intent

## Overview

The `order_update` intent handles modifications to existing pending or confirmed orders. This includes adding items, removing items, changing quantities, modifying delivery information, and replacing entire orders. This document details every action taken at each stage of the multi-stage AI processing pipeline.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "make it 5 boxes pls 😊"
- Output: `{ original: "make it 5 boxes pls 😊", cleaned: "make it 5 boxes please" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for existing order context in memory
- Uses memory to understand what order is being modified

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `order_update` as primary intent

**Process:**
- Analyzes message for update keywords ("change", "update", "modify", "add", "remove", "make it", "more", "less")
- Detects order update patterns:
  - Quantity changes: "make it 5 boxes", "change to 3 pieces"
  - Item additions: "add 2 more", "I also want..."
  - Item removals: "remove X", "don't want Y"
  - Delivery modifications: address changes, delivery time changes
- Checks for existing pending order (REQUIRED for order_update)
- Detects secondary intents (e.g., `product_inquiry`)

**Extracted Info:**
- Products mentioned
- Quantities
- Order update type: `add_items`, `remove_items`, `change_quantity`, `modify_delivery`, `replace_order`, `partial_update`
- Items to add/remove
- Quantity changes
- Delivery info changes
- Urgency level

**Output:** `{ primaryIntent: "order_update", secondaryIntents: [...], extractedInfo: {...} }`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected

**Process:**
- Determines handling order (order update takes priority over product inquiry)
- Decides if multiple intents can be handled in one response

**Example:** 
- Message: "make it 5 boxes, do you have chocolate?"
- Result: Handle order update first, then answer product question

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

**Action:** Fetches data needed for order update

**Data Fetched:**

1. **Pending Order:** **REQUIRED** - Current order being modified
2. **Product Catalog:** All active products (for validation of new items)
3. **Customer Insights:** Address, preferences (for delivery modifications)
4. **Vendor Config:** Business rules, order policies

**Special Fetching Based on Update Type:**
- `add_items`: Fetches product catalog to validate new items
- `modify_delivery`: Fetches customer insights for address validation
- `remove_items`: Only needs current order
- `change_quantity`: Needs current order and product catalog

**Caching:** Uses Redis cache (product catalog cached for 1 hour)

**Output:** `{ pendingOrder: {...}, products: [...], insights: {...}, vendorConfig: {...} }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Help the customer update their existing order."
3. **Current Order:** Full details of order being modified
4. **Products Mentioned:** Products customer wants to add/modify (if any)
5. **All Available Products:** Full catalog for validation
6. **Customer Information:** Address, preferences (to avoid re-asking)
7. **Conversation Memory:** Key facts, ongoing topics
8. **Recent Messages:** Last 3 customer messages
9. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Reference the current order being modified
- Only use products from catalog
- Match products using keywords (handles typos/multilingual)
- Extract order update type correctly
- Don't ask for info already available

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response and extracts order update data

**Process:**

1. **Calls OpenAI** (GPT-4o-mini or GPT-4o for complex updates)
2. **AI Generates:**
   - Natural response text acknowledging the update
   - Extracted order update data:
     - Order update type
     - Items to add/remove
     - Quantity changes
     - Delivery modifications
   - Clarification needs flag
   - Clarification questions (if needed)
3. **Product Matching:**
   - Validates new products against catalog
   - Uses fuzzy matching for typos
   - Supports multi-language matching
   - Auto-corrects product names to exact catalog names

**Extracted Data Structure:**
```json
{
  "orderUpdateType": "change_quantity",
  "quantityChanges": [
    {"product": "Chocolate Brownie Box", "newQuantity": 5}
  ],
  "deliveryAddress": "123 New St...",
  "specialRequests": "Extra sweet"
}
```

**Output:** `{ response: "...", extractedData: {...}, needsClarification: true/false }`

---

## Stage 4.5: Order Update Validation ⚠️ **CRITICAL STAGE**

**Action:** Validates order update for consistency and conflicts

**Process:**

1. **Product Validation:**
   - Validates all products exist in catalog
   - Checks products are in stock
   - Validates quantities > 0
   - Auto-corrects product names

2. **Order Consistency Check:**
   - Validates update doesn't conflict with current order
   - Checks if items being removed actually exist in order
   - Validates quantity changes are reasonable

3. **Price Calculation:**
   - Calculates new total based on changes
   - Identifies price changes (increase/decrease)
   - Validates price calculations

4. **Conflict Detection:**
   - Checks for product unavailability
   - Validates delivery address format (if modified)
   - Checks for delivery date conflicts

**Output:** `{ isValid: true/false, conflicts: [...], priceChanges: {...}, requiresConfirmation: true/false }`

**If Validation Fails:** Errors logged, update not applied, customer notified

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true`

**Process:**
- Fetches additional data to answer clarification questions
- Checks customer insights for missing info
- Determines if can proceed with defaults

**Example:** If quantity unclear, checks order history for typical quantities

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
6. References the order being updated
7. Shows updated order summary (if applicable)

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates extracted order update data before saving

**Validations:**

1. **Order Existence Validation:**
   - Current order must exist
   - Error if order not found: "No order found to update"

2. **Order State Validation:**
   - Order must be in updatable state (`pending` or `confirmed` only)
   - Error if order is in non-updatable state: "Order is {status}, cannot update. Only pending or confirmed orders can be updated."

3. **Product Validation:**
   - All products exist in catalog (using fuzzy matching)
   - Products are in stock
   - Quantities > 0
   - Minimum order quantity per product (if `minOrderQuantity` is set for product)
   - Error message: "Minimum order quantity for {product} is {min}. You ordered {quantity}."

4. **Items Removal Validation:**
   - Cannot remove all items from order
   - Order must have at least one item after update
   - Error: "Cannot remove all items from order. Order must have at least one item."

5. **Price Change Validation:**
   - Calculates new total correctly
   - Validates price changes
   - Flags price changes >20% for confirmation
   - Warning: "Price change exceeds 20% ({percent}%). This requires confirmation."

6. **Address Validation:**
   - Checks address format (if modified)
   - Minimum 10 characters

**Output:** `{ isValid: true/false, conflicts: [...], validatedData: {...} }`

**If Validation Fails:** 
- Errors logged
- Update not applied
- Customer notified with specific error messages
- Database update skipped in Stage 8

---

## Stage 8: Database Update

**Action:** Updates order and related data

**Process:**

### 8.1 Order Update (Based on Update Type)

**Checks if pending order exists:**
- If not found: May create new order (fallback behavior)
- If found: Updates existing order based on update type

**Update Types:**

#### `add_items`
- Adds new items to existing order
- Validates products against catalog
- Calculates new total
- Updates order items array

#### `remove_items`
- Removes specified items from order
- Recalculates total
- Updates order items array

#### `change_quantity`
- Updates quantities for existing items
- Recalculates total
- Updates order items array

#### `modify_delivery`
- Updates delivery address
- Updates delivery instructions
- Updates special requests
- May update estimated delivery time

#### `replace_order`
- Replaces entire order with new items
- Validates all new products
- Recalculates total
- Updates order items array

#### `partial_update`
- Updates specific fields without full replacement
- Merges changes with existing order

**Order Update Steps:**

1. **Fetch Current Order:**
   - Gets order with current items and total

2. **Apply Changes:**
   - Based on `orderUpdateType`, applies appropriate update
   - Uses fuzzy matching for product names
   - Auto-corrects product names

3. **Recalculate Total:**
   - Calculates new total from updated items
   - Updates `totalAmount` field

4. **Update Order Record:**
```typescript
{
  items: [...updatedItems],
  totalAmount: newTotal,
  deliveryAddress: updatedAddress || existingAddress,
  deliveryInstructions: updatedInstructions || existingInstructions,
  specialRequests: updatedRequests || existingRequests
}
```

### 8.2 Customer Insights Update

**Saves/Updates:**
- Delivery address (if modified)
- Payment preferences (if mentioned)
- Product preferences
- Communication style

### 8.3 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer updated order to 5 boxes"
- Ongoing topics: ["order_update"]
- Last order summary: Updated order details
- Conversation stage: "order_confirmation" or "order_update"
- Increments turn number

### 8.4 Cache Invalidation

**Invalidates:**
- Conversation cache
- Pending order cache (critical - order changed)
- Customer insights cache (if updated)

---

## Stage 9: Response Queuing

**Action:** Queues message to WhatsApp

**Process:**
- Adds message to response queue
- Message sent to customer via WhatsApp API

**Output:** Message queued for delivery

---

## Summary: Complete Flow for `order_update`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `order_update` + update type
4. **Fetch Data** → Current order, products, customer info
5. **Build Prompt** → Focused prompt with order context
6. **Generate AI Response** → Natural response + extracted update data
7. **Validate Update** → **Stage 4.5** - Check conflicts and consistency
8. **Validate Data** → Check products, prices, addresses
9. **Update Order** → Apply changes to database
10. **Update Memory** → Store conversation facts
11. **Queue Response** → Send message to customer

---

## Key Features for `order_update`

- ✅ **Order Validation:** Only updates existing orders (pending/confirmed)
- ✅ **Update Type Detection:** Identifies specific type of update needed
- ✅ **Conflict Detection:** Validates updates don't create conflicts
- ✅ **Price Recalculation:** Auto-calculates new total after changes
- ✅ **Product Validation:** Validates new products against catalog
- ✅ **Fuzzy Matching:** Handles typos and multilingual queries
- ✅ **Memory Integration:** Remembers conversation context
- ✅ **Multiple Update Types:** Supports add, remove, change quantity, modify delivery, replace

---

## Order Update Types

### `add_items`
- Customer wants to add more items to existing order
- Example: "add 2 chocolate brownies"
- Process: Validates products, adds to order, recalculates total

### `remove_items`
- Customer wants to remove items from order
- Example: "remove the vanilla ones"
- Process: Finds items in order, removes them, recalculates total

### `change_quantity`
- Customer wants to change quantity of existing items
- Example: "make it 5 boxes"
- Process: Updates quantities, recalculates total

### `modify_delivery`
- Customer wants to change delivery address or instructions
- Example: "change address to 123 New St"
- Process: Updates delivery fields, validates address

### `replace_order`
- Customer wants to replace entire order
- Example: "actually, I want different items"
- Process: Replaces all items, validates products, recalculates total

### `partial_update`
- Customer wants to update specific fields
- Example: "add special note: no nuts"
- Process: Updates specific fields without full replacement

---

## Related Files

- `backend/src/services/multiStageOrchestrator.ts` - Main orchestrator
- `backend/src/services/intentClassificationService.ts` - Intent classification
- `backend/src/services/contextFetcherService.ts` - Data fetching
- `backend/src/services/promptBuilderService.ts` - Prompt construction
- `backend/src/services/primaryAIResponseService.ts` - AI response generation
- `backend/src/services/orderUpdateValidationService.ts` - **Order update validation**
- `backend/src/services/dataValidationService.ts` - Data validation
- `backend/src/services/dataExtractionService.ts` - Database updates
- `backend/src/services/orderService.ts` - Order update logic

---

*Last Updated: 2024*

