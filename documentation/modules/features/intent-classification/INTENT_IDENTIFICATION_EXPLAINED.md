# Intent Identification Logic - Detailed Explanation

## Overview

The Intent Identification system is a sophisticated multi-layered approach that classifies customer messages into actionable intents. It's part of **Stage 1** of the Multi-Stage AI Processing pipeline and uses a combination of AI-powered classification, pattern detection, and keyword-based fallbacks.

---

## Architecture Flow

```
Customer Message
    ↓
Stage 0: Message Normalization (cleaning, typo correction)
    ↓
Stage 0.5: Conversation Memory Retrieval (context from past messages)
    ↓
Stage 1: Intent Classification ← **THIS IS WHERE INTENT IDENTIFICATION HAPPENS**
    ↓
Stage 1.5: Intent Prioritization (if multiple intents detected)
    ↓
Stage 1.7: Correction Detection
    ↓
[Rest of pipeline...]
```

---

## Core Components

### 1. **Main Classification Function: `classifyIntent()`**

**Location:** `backend/src/services/intentClassificationService.ts`

**Input Parameters:**
- `normalizedMessage`: Cleaned message from Stage 0
- `memory`: Conversation memory (key facts, ongoing topics, customer preferences)
- `lastMessages`: Last 10 messages in the conversation (for context)
- `vendorId`: Vendor identifier
- `conversationId`: Optional - used to check for existing pending orders

**Output:** `IntentClassification` object with:
- `primaryIntent`: Main intent detected
- `secondaryIntents`: Additional intents in the same message
- `confidence`: Confidence score (0.0 - 1.0)
- `extractedInfo`: Extracted data (products, quantities, delivery info, etc.)
- `needsMoreContext`: Whether more information is needed
- `reasoning`: Explanation of classification decision

---

## Classification Process (Step-by-Step)

### Step 1: Cache Check
```typescript
const cacheKey = getIntentCacheKey(normalizedMessage.cleaned);
const cached = await getCached<IntentClassification>(cacheKey);
if (cached) {
  return cached; // Return cached result if available
}
```
- **Purpose:** Avoid redundant AI calls for identical messages
- **Cache Key:** Based on cleaned message text
- **TTL:** Defined in `CACHE_TTL.INTENT_CLASSIFICATION`

### Step 2: Check for Existing Pending Order
```typescript
if (conversationId) {
  existingOrder = await checkExistingPendingOrder(conversationId, vendorId);
}
```
- **Purpose:** Context-aware classification
- **Impact:** If a pending order exists, messages are more likely to be `order_update` rather than `order_new`
- **Example:** "make it 5 boxes" → `order_update` (not `order_new`) if order exists

### Step 3: Pre-Detection (Before AI Call)

#### A. Order Update Pattern Detection
```typescript
function detectOrderUpdatePatterns(message: string): boolean
```
**Patterns Detected:**
- `"make it 5"`, `"make it as 5"`
- `"change to 5"`, `"change it to 5"`
- `"I want it as 5"`
- `"I like to make it as 5"`
- `"update to"`, `"update quantity"`
- `"add 2 more"`
- `"remove X from"`
- `"increase to"`, `"decrease to"`

**Purpose:** Catch order updates that AI might miss, especially quantity changes

#### B. Multiple Intent Detection
```typescript
function detectMultipleIntents(message: string, existingOrder?: any): string[]
```
**Detects:**
- Greetings: `"hi"`, `"hello"`, `"hey"`, `"namaste"`
- Product inquiries: `"available"`, `"have"`, `"stock"`, `"price"`, `"do you have"`
- Order updates: Based on patterns above
- Order new: `"I want"`, `"buy"`, `"order"`, `"give me"`
- Order status: `"status"`, `"where is"`, `"track"`, `"my order"`
- Support: `"human"`, `"agent"`, `"customer service"`
- Confirm: `"confirm"`, `"yes"`, `"ok"`, `"proceed"`
- Cancel: `"cancel"`, `"remove order"`, `"don't want"`

**Purpose:** Identify when a single message contains multiple queries

### Step 4: Build AI Prompt

The prompt includes:
1. **Customer Message:** The cleaned message
2. **Conversation Memory:** Key facts, ongoing topics, conversation stage
3. **Previous Messages:** Last 10 messages for context
4. **Existing Order Context:** If pending order exists (order number, items, total, delivery address)
5. **Special Hints:**
   - Order update pattern hint (if detected)
   - Multiple intent hint (if multiple intents detected)

### Step 5: AI Classification

**Model:** Uses OpenAI via `AIService.generateResponse()`

**Prompt Structure:**
```
You are an intent classifier for a WhatsApp business assistant...

CRITICAL INTENT CLASSIFICATION RULES (CHECK IN THIS PRIORITY ORDER):

1. product_inquiry - HIGHEST PRIORITY if message:
   - Contains availability keywords: "available", "have", "stock", "do you have"
   - Asks about product details: "what is", "tell me about", "show me"
   - Asks about pricing: "price of", "how much", "cost"
   
2. order_status - Asking about existing orders:
   - Status keywords: "status", "where is", "when will", "track"
   - Order history: "last order", "previous order", "my order"
   
3. order_new - Placing a NEW order:
   - Ordering keywords: "I want", "I need", "buy", "order"
   
4. order_update - Modifying EXISTING order:
   - Update keywords: "change", "update", "modify", "add", "remove"
   - Quantity change patterns: "make it [X]", "change to [X]"
   - CRITICAL: If existing order + delivery address/special requests → order_update
   
5. support - Requesting human assistance
6. greeting - Opening conversation
7. cancel_order - Canceling an order
8. confirm_order - Confirming an order
9. other - Everything else
```

**Key Distinctions Explained:**
- **order_update vs product_inquiry:** 
  - `"make it 5 boxes"` → `order_update` (quantity change)
  - `"do you have [product]?"` → `product_inquiry` (availability question)
  
- **product_inquiry vs confirm_order:**
  - `"is [product] available?"` → `product_inquiry` (even with "yes" or "mam")
  - `"yes, confirm my order"` → `confirm_order`

- **order_new vs order_update:**
  - `"I want [product]"` → `order_new` (new purchase)
  - `"add [quantity] more"` → `order_update` (modifying existing)

### Step 6: Response Parsing & Validation

```typescript
// Extract JSON from response (handles markdown/code blocks)
const jsonMatch = response.match(/\{[\s\S]*\}/);
parsed = JSON.parse(jsonMatch[0]);

// Validate parsed result
if (!parsed.primaryIntent) {
  return keywordBasedIntentDetection(...); // Fallback
}
```

**Error Handling:**
- If JSON parsing fails → Retry with explicit JSON instruction
- If retry fails → Use keyword-based fallback
- If invalid result → Use keyword-based fallback

### Step 7: Post-Validation Override

**Critical Enhancement:** If order update pattern detected but AI classified differently:
```typescript
if (hasOrderUpdatePattern && existingOrder && parsed.primaryIntent !== 'order_update') {
  // Override to order_update
  parsed.primaryIntent = 'order_update';
  parsed.confidence = Math.max(parsed.confidence || 0.5, 0.8);
  parsed.reasoning = `Order update pattern detected...`;
}
```

**Purpose:** Ensure quantity change patterns are always classified correctly

### Step 8: Result Construction

```typescript
const result: IntentClassification = {
  primaryIntent: parsed.primaryIntent || 'other',
  secondaryIntents: parsed.secondaryIntents || [],
  confidence: parsed.confidence || 0.5,
  extractedInfo: {
    products: parsed.extractedInfo?.products || [],
    quantities: parsed.extractedInfo?.quantities || [],
    orderUpdateType: parsed.extractedInfo?.orderUpdateType || null,
    itemsToAdd: parsed.extractedInfo?.itemsToAdd || [],
    itemsToRemove: parsed.extractedInfo?.itemsToRemove || [],
    quantityChanges: parsed.extractedInfo?.quantityChanges || [],
    hasDeliveryInfo: checkForDeliveryInfo(cleanedMessage),
    hasSpecialRequests: checkForSpecialRequests(cleanedMessage),
    mentionsOrder: existingOrder !== null,
    orderNumber: parsed.extractedInfo?.orderNumber || null,
    urgency: parsed.extractedInfo?.urgency || 'low'
  },
  needsMoreContext: parsed.needsMoreContext !== undefined ? parsed.needsMoreContext : true,
  reasoning: parsed.reasoning || 'AI-based classification',
  tokensUsed: 300, // Estimate
  cost: 0.00005 // Estimate
};
```

### Step 9: Cache Result
```typescript
await setCached(cacheKey, result, CACHE_TTL.INTENT_CLASSIFICATION);
```

---

## Intent Types

### 1. **order_new**
- **When:** Customer wants to place a new order
- **Keywords:** `"I want"`, `"I need"`, `"buy"`, `"purchase"`, `"order"`, `"give me"`
- **Example:** `"I want 2 boxes of brownies"`

### 2. **order_update**
- **When:** Customer wants to modify an existing order
- **Keywords:** `"change"`, `"update"`, `"modify"`, `"add"`, `"remove"`, `"make it X"`
- **Patterns:** `"make it 5"`, `"change to 3"`, `"add 2 more"`
- **Example:** `"make it as 5 boxes"` (when order exists)

### 3. **order_status**
- **When:** Customer asks about order status or history
- **Keywords:** `"status"`, `"where is"`, `"when will"`, `"track"`, `"my order"`
- **Example:** `"where is my order?"`

### 4. **product_inquiry**
- **When:** Customer asks about product availability, details, or pricing
- **Keywords:** `"available"`, `"have"`, `"stock"`, `"price"`, `"do you have"`, `"what is"`
- **Example:** `"do you have chocolate brownies?"`
- **Priority:** HIGHEST - checked first

### 5. **greeting**
- **When:** Opening salutation
- **Keywords:** `"hi"`, `"hello"`, `"hey"`, `"namaste"`
- **Example:** `"Hello, good morning"`

### 6. **support**
- **When:** Customer requests human assistance
- **Keywords:** `"human"`, `"agent"`, `"person"`, `"customer service"`
- **Example:** `"can I talk to a human?"`

### 7. **cancel_order**
- **When:** Customer wants to cancel an order
- **Keywords:** `"cancel"`, `"remove order"`, `"don't want"`, `"delete order"`
- **Example:** `"cancel my order"`

### 8. **confirm_order**
- **When:** Customer confirms an order
- **Keywords:** `"confirm"`, `"yes"`, `"ok"`, `"proceed"`, `"go ahead"`
- **Note:** NOT product_inquiry even if starts with "yes"
- **Example:** `"yes, confirm my order"`

### 9. **other**
- **When:** Doesn't fit any category above
- **Example:** General conversation, unclear intent

---

## Multiple Intent Handling

### Detection
The system can detect multiple intents in a single message:
- **Primary Intent:** Most important/actionable intent
- **Secondary Intents:** Other intents present

### Examples

**Example 1:**
```
Message: "I like to make it as 5 boxes, and do you have any other varieties?"
→ primaryIntent: "order_update"
→ secondaryIntents: ["product_inquiry"]
```

**Example 2:**
```
Message: "Hi, what's the price of X? Also, I need to update my delivery address"
→ primaryIntent: "product_inquiry"
→ secondaryIntents: ["order_update", "greeting"]
```

**Example 3:**
```
Message: "I want to order Y, and can you tell me about Z?"
→ primaryIntent: "order_new"
→ secondaryIntents: ["product_inquiry"]
```

### Prioritization Rules
1. Order modification + product inquiry → `order_update` (primary), `product_inquiry` (secondary)
2. Order placement + product inquiry → `order_new` (primary), `product_inquiry` (secondary)
3. Greeting + other intent → `greeting` (primary), other intent (secondary)
4. Multiple product inquiries → `product_inquiry` (primary), `product_inquiry` (secondary)

---

## Fallback Mechanism

### Keyword-Based Fallback
**Location:** `keywordBasedIntentDetection()` function

**When Used:**
- AI classification fails
- JSON parsing fails after retry
- Invalid classification result

**Priority Order:**
1. **product_inquiry** (highest priority)
2. **support**
3. **order_status**
4. **greeting**
5. **cancel_order**
6. **order_update** (with pattern detection)
7. **order_new**
8. **confirm_order** (lowest priority)

**Confidence Scores:**
- Pattern-based detection: 0.75-0.85
- Keyword-based detection: 0.6-0.8
- Default: 0.5

---

## Helper Functions

### 1. `checkForDeliveryInfo(message: string): boolean`
- Detects address keywords: `"address"`, `"deliver"`, `"location"`, `"road"`, `"street"`, `"area"`, `"pincode"`
- Checks for numbers (addresses usually have numbers)
- Returns `true` if likely contains delivery information

### 2. `checkForSpecialRequests(message: string): boolean`
- Detects request keywords: `"sweet"`, `"spicy"`, `"make sure"`, `"please"`, `"request"`, `"preference"`
- Returns `true` if likely contains special requests

### 3. `checkExistingPendingOrder(conversationId, vendorId)`
- Queries database for pending orders
- Returns order details if found
- Used for context-aware classification

---

## Integration Points

### Called From: `MultiStageOrchestrator.executeStage1()`

**Flow:**
```typescript
// Stage 1: Intent Understanding
const intentResult = await this.executeStage1(context);
context.intentResult = intentResult;

// Stage 1.5: Intent Prioritization (conditional)
if (intentResult.secondaryIntents?.length > 0) {
  await this.executeStage1_5(context);
}

// Stage 1.7: Correction Detection
await this.executeStage1_7(context);
```

**Context Used:**
- Last 10 messages (for conversation context)
- Conversation memory (key facts, ongoing topics)
- Existing pending order (if any)
- Normalized message (cleaned, typo-corrected)

---

## Performance Optimizations

### 1. **Caching**
- Results cached by message text
- Avoids redundant AI calls
- TTL: `CACHE_TTL.INTENT_CLASSIFICATION`

### 2. **Pre-Detection**
- Pattern detection before AI call
- Reduces AI processing time
- Provides hints to AI for better accuracy

### 3. **Token Estimation**
- Estimated tokens: ~300
- Estimated cost: ~$0.00005 per classification

### 4. **Fallback Speed**
- Keyword-based fallback is instant
- No AI call needed if fallback used

---

## Error Handling

### Levels of Fallback:
1. **Primary:** AI classification with retry
2. **Secondary:** Keyword-based detection
3. **Tertiary:** Default to `"other"` intent

### Error Scenarios:
- AI service unavailable → Keyword fallback
- JSON parsing fails → Retry, then keyword fallback
- Invalid classification → Keyword fallback
- Database error (checking order) → Continue without order context

---

## Key Enhancements

### 1. **Order Update Pattern Detection**
- Catches quantity changes that AI might miss
- Overrides AI classification if pattern detected + order exists
- Examples: `"make it 5"`, `"change to 3"`

### 2. **Multiple Intent Detection**
- Identifies when message contains multiple queries
- Provides hints to AI for better classification
- Handles complex customer messages

### 3. **Context-Aware Classification**
- Checks for existing pending orders
- Uses conversation memory
- Considers last 10 messages

### 4. **Post-Validation Override**
- Ensures critical patterns are always classified correctly
- Increases confidence when override applied
- Logs override decisions for debugging

---

## Example Scenarios

### Scenario 1: Simple Order Update
```
Message: "make it 5 boxes"
Existing Order: Yes (3 boxes)
→ Pattern Detected: ✅ ("make it X")
→ Classification: order_update (primaryIntent)
→ Confidence: 0.8 (increased due to pattern)
→ Extracted: quantityChanges: [{product: "boxes", newQuantity: 5}]
```

### Scenario 2: Multiple Intents
```
Message: "I like to make it as 5 boxes, and do you have any other varieties?"
Existing Order: Yes
→ Multiple Intents Detected: ✅ (order_update, product_inquiry)
→ Classification: order_update (primaryIntent), product_inquiry (secondaryIntents)
→ Extracted: quantityChanges + products: ["other varieties"]
```

### Scenario 3: Product Inquiry (High Priority)
```
Message: "do you have chocolate brownies available?"
Existing Order: No
→ Classification: product_inquiry (primaryIntent)
→ Confidence: 0.85
→ Extracted: products: ["chocolate brownies"]
```

### Scenario 4: Order Status Query
```
Message: "where is my order?"
Existing Order: Yes
→ Classification: order_status (primaryIntent)
→ Extracted: mentionsOrder: true
```

### Scenario 5: Fallback Scenario
```
Message: "I need help"
AI Service: Unavailable
→ Fallback: Keyword-based detection
→ Classification: order_new (primaryIntent) - based on "need"
→ Confidence: 0.7
```

---

## Debugging & Monitoring

### Logging Points:
1. **Cache hits:** Logged when cached result returned
2. **Pattern detection:** Logged when patterns detected
3. **Multiple intent detection:** Logged when multiple intents found
4. **Override decisions:** Logged when AI classification overridden
5. **Fallback usage:** Logged when keyword fallback used
6. **Errors:** Logged with full context

### Metrics Tracked:
- Classification confidence scores
- Token usage (estimated)
- Cost per classification (estimated)
- Fallback usage rate
- Override frequency

---

## Future Improvements

### Potential Enhancements:
1. **Machine Learning Model:** Train custom model on historical data
2. **Multi-Language Support:** Better handling of regional languages
3. **Intent Confidence Thresholds:** Different thresholds for different intents
4. **A/B Testing:** Test different prompt variations
5. **Real-time Learning:** Update patterns based on misclassifications

---

## Summary

The Intent Identification system is a **sophisticated, multi-layered approach** that:

1. ✅ Uses **AI-powered classification** with comprehensive prompts
2. ✅ Implements **pattern detection** for critical cases (order updates)
3. ✅ Supports **multiple intent detection** in single messages
4. ✅ Provides **context-aware classification** using conversation memory
5. ✅ Has **robust fallback mechanisms** for reliability
6. ✅ Includes **post-validation overrides** for accuracy
7. ✅ Optimizes performance with **caching** and **pre-detection**
8. ✅ Handles **edge cases** gracefully

The system prioritizes **accuracy** (especially for order updates) while maintaining **performance** and **reliability** through multiple fallback layers.

