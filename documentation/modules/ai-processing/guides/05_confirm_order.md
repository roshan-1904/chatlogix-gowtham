# Detailed Actions for `confirm_order` Intent

## Overview

The `confirm_order` intent handles customer confirmation of pending orders. This includes finalizing orders, confirming order details, and proceeding with order processing. This document details every action taken at each stage of the multi-stage AI processing pipeline.

> **Superseded (2026-09):** This describes the OLD 14-stage `multiStageOrchestrator.ts` pipeline, which is **no longer on the hot path** for live WhatsApp messages. Production text messages now run through `backend/src/conversation/*` (LLM-1 draft + cart ops → `CartEngine` → optional LLM-2 verifier), deployed as the `chatlogix-incoming-response-generator` Lambda — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. The new pipeline does not route messages through fixed per-intent stages: `intent` is captured for telemetry only and never drives cart writes (CONVERSATION_PROCESSOR_LAMBDA.md §13). Note the `estimatedDelivery` handling below is now a locked product decision the other way: the new pipeline's AI **must not** set an expected delivery date at customer confirm — only the vendor (or a job after vendor confirm) sets it (CONVERSATION_PROCESSOR_LAMBDA.md §16, Q13). The services referenced below still exist in the codebase, but their only remaining live caller is `catalogImportSandboxService.ts` (catalog import, unrelated to message processing). The stage-by-stage detail below is kept as a historical reference for the old pipeline's behavior.

---

## Stage 0: Message Normalization

**Action:** Normalizes the customer message

**Process:**
- Cleans typos, extra spaces, emojis
- Standardizes language variations
- Extracts cleaned text

**Output:** `{ original: "...", cleaned: "..." }`

**Example:** 
- Input: "yes confirm pls 😊"
- Output: `{ original: "yes confirm pls 😊", cleaned: "yes confirm please" }`

---

## Stage 0.5: Conversation Memory Retrieval

**Action:** Loads conversation memory

**Process:**
- Retrieves `ConversationMemory` (key facts, preferences, ongoing topics)
- Checks for pending order context in memory
- Uses memory to understand which order is being confirmed

**Output:** Memory object with conversation context

---

## Stage 1: Intent Classification

**Action:** Identifies `confirm_order` as primary intent

**Process:**
- Analyzes message for confirmation keywords:
  - "confirm", "yes", "ok", "proceed", "go ahead", "finalize"
- **CRITICAL:** Explicit confirmation WITHOUT asking about products
- **NOT product_inquiry:** If message asks about product availability even with confirmation words, classify as `product_inquiry`
- Checks for existing pending order (REQUIRED for confirmation)
- Detects secondary intents (rare for confirm_order)

**Extracted Info:**
- Confirmation type
- Mentions order flag
- Urgency level

**Output:** `{ primaryIntent: "confirm_order", secondaryIntents: [...], extractedInfo: {...} }`

**Examples:**
- ✅ "yes, confirm my order" → `confirm_order`
- ✅ "ok, proceed" → `confirm_order`
- ✅ "confirm" → `confirm_order`
- ❌ "[product] available?" (even if starts with "yes" or "mam") → `product_inquiry`

---

## Stage 1.5: Intent Prioritization (Conditional)

**Action:** Runs only if multiple intents detected (rare for confirm_order)

**Process:**
- Usually not applicable for confirm_order

---

## Stage 1.7: Correction Detection

**Action:** Detects if message corrects a previous one

**Process:**
- Compares with last 5 messages
- Checks for correction patterns
- Usually not applicable for confirmations

**Output:** `{ isCorrection: false }`

---

## Stage 2: Context-Aware Data Fetching

**Action:** Fetches data needed for order confirmation

**Data Fetched:**

1. **Pending Order:** **REQUIRED** - Order to be confirmed
2. **Vendor Config:** Business rules, confirmation policies
3. **Product Catalog:** Only if product name detected (handles typos/spelling)

**Caching:** Uses Redis cache

**Output:** `{ pendingOrder: {...}, vendorConfig: {...}, products: [...] }`

---

## Stage 3: Prompt Construction

**Action:** Builds focused prompt for AI (500-800 tokens)

**Prompt Includes:**

1. **Base Prompt:** Vendor's system prompt + bot personality
2. **Intent Instructions:** "Confirm the customer's pending order."
3. **Current Order:** Full details of order being confirmed
4. **Vendor Config:** Confirmation policies, business rules
5. **Conversation Memory:** Key facts, ongoing topics
6. **Recent Messages:** Last 3 customer messages
7. **Full Conversation History:** Last 20 messages

**Special Instructions:**
- Reference the order being confirmed
- Confirm order details clearly
- Provide next steps (preparation time, delivery estimate)
- Thank customer for confirmation

**Output:** Focused prompt string (~500-800 tokens)

---

## Stage 4: Primary AI Response Generation

**Action:** Generates AI response confirming order

**Process:**

1. **Calls OpenAI** (GPT-4o-mini)
2. **AI Generates:**
   - Confirmation message
   - Order summary
   - Next steps (preparation time, delivery estimate)
   - Thank you message

**Output:** `{ response: "...", extractedData: {}, needsClarification: false }`

---

## Stage 4.5: Order Update Validation

**Action:** **SKIPPED** for `confirm_order` (only runs for `order_update`)

---

## Stage 5: Conditional Data Enrichment (Conditional)

**Action:** Runs only if `needsClarification: true` (rare for confirm_order)

**Process:**
- Usually not needed for confirmations

---

## Stage 6: Response Refinement (Conditional)

**Action:** Runs only if clarification needed (rare for confirm_order)

**Process:**
- Usually not needed for confirmations

---

## Stage 7: Message Composition

**Action:** Formats final message for customer

**Process:**

1. Takes AI response
2. Applies vendor personality and tone
3. Formats with line breaks for readability
4. Adds emojis appropriately
5. Ensures natural conversation flow
6. Includes order summary

**Output:** Final formatted message string

---

## Stage 7.5: Data Validation

**Action:** Validates order confirmation data before confirming order

**Validations:**

1. **Order Validation:**
   - Order exists (must have pending order)
   - Order is in confirmable state (`pending` status only)
   - Order has at least one item

2. **Customer Information Validation:**
   - Customer name is required (must exist in CustomerInsights)
   - Customer name format: 2-100 characters
   - Delivery address is required (in Order or CustomerInsights)
   - Delivery address format: minimum 10 characters

**Validation Checks Performed:**
- Checks if pending order exists for this conversation
- Verifies order status is `pending`
- Validates order has items (not empty)
- Fetches customer insights to verify name and address
- Checks order delivery address if not in customer insights

**Error Messages (Customer-Friendly):**
- Missing customer name: "I need your name to confirm the order. Could you please provide your name?"
- Missing delivery address: "I need your delivery address to confirm the order. Could you please provide your delivery address?"
- Empty order items: "Your order doesn't have any items. Please add items to your order before confirming."
- Order not pending: "This order cannot be confirmed in its current state."
- No pending order: "No pending order found to confirm."

**Output:** `{ isValid: true/false, errors: [...], validatedData: {} }`

**If Validation Fails:**
- Response message is updated with validation errors
- `needsClarification` flag is set to `true`
- Updated message is stored in `context.validationFailedMessage` for Stage 9
- Order confirmation is prevented in Stage 8
- Customer receives error message asking for missing information

---

## Stage 8: Database Update

**Action:** Confirms order and updates status

**Process:**

### 8.1 Order Confirmation

**Steps:**

1. **Update Order Status:**
   - Changes status from `pending` to `confirmed`
   - Sets `confirmedAt` timestamp
   - May set `estimatedDelivery` if provided

2. **Update Order Record:**
```typescript
{
  status: "confirmed",
  confirmedAt: new Date(),
  estimatedDelivery: estimatedDelivery || undefined
}
```

3. **Queue Notification:**
   - Sends order confirmation notification to customer
   - Notifies vendor of confirmed order

### 8.2 Conversation Memory Update

**Updates Memory With:**
- Key facts: "Customer confirmed order"
- Ongoing topics: ["order_confirmed"]
- Conversation stage: "order_confirmed"
- Increments turn number

### 8.3 Cache Invalidation

**Invalidates:**
- Conversation cache
- Pending order cache (critical - order status changed)

---

## Stage 9: Response Queuing

**Action:** Queues message to WhatsApp

**Process:**
- Adds message to response queue
- Message sent to customer via WhatsApp API

**Output:** Message queued for delivery

---

## Summary: Complete Flow for `confirm_order`

1. **Normalize Message** → Clean text
2. **Load Memory** → Get conversation context
3. **Classify Intent** → Identify `confirm_order`
4. **Fetch Data** → Pending order, vendor config
5. **Build Prompt** → Focused prompt with order context
6. **Generate AI Response** → Confirmation message
7. **Validate Data** → Check order can be confirmed
8. **Confirm Order** → Update status to confirmed
9. **Update Memory** → Store confirmation facts
10. **Queue Response** → Send message to customer

---

## Key Features for `confirm_order`

- ✅ **Order Validation:** Only confirms existing pending orders
- ✅ **Status Update:** Changes order status to confirmed
- ✅ **Notification:** Sends confirmation notification
- ✅ **Clear Distinction:** Not confused with product_inquiry
- ✅ **Next Steps:** Provides preparation/delivery timeline

---

## Related Files

- `backend/src/services/multiStageOrchestrator.ts` - Main orchestrator
- `backend/src/services/intentClassificationService.ts` - Intent classification
- `backend/src/services/contextFetcherService.ts` - Data fetching
- `backend/src/services/promptBuilderService.ts` - Prompt construction
- `backend/src/services/primaryAIResponseService.ts` - AI response generation
- `backend/src/services/dataValidationService.ts` - Data validation
- `backend/src/services/dataExtractionService.ts` - Database updates
- `backend/src/services/orderService.ts` - Order confirmation logic

---

*Last Updated: 2024*

