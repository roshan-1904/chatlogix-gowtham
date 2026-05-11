# Intent Classification System Expansion

**Document Version:** 1.0  
**Date:** December 13, 2025  
**Status:** Planning Phase

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Proposed Intent Expansion](#proposed-intent-expansion)
4. [Detailed Intent Definitions](#detailed-intent-definitions)
5. [Implementation Plan](#implementation-plan)
6. [Technical Specifications](#technical-specifications)
7. [Prompt Engineering Updates](#prompt-engineering-updates)
8. [Test Cases & Validation](#test-cases--validation)
9. [Migration Strategy](#migration-strategy)
10. [Success Metrics](#success-metrics)
11. [Appendix](#appendix)

---

## Executive Summary

### Purpose
Expand the intent classification system from **9 intents** to **17 intents** to improve accuracy, enable better routing, and reduce the "other" category usage from ~29% to <10%.

### Current Performance
- **Current Pass Rate:** 71.13% (138/194 tests passed)
- **"Other" Classification:** ~29% of messages fall into "other" or are misclassified
- **Main Issues:**
  - Payment-related queries classified as "other"
  - Delivery questions mixed with product_inquiry
  - No distinction for complaints/feedback

### Expected Improvements
- **Target Pass Rate:** 85%+ after Priority 1, 90%+ after Priority 2
- **"Other" Reduction:** From ~29% to <10%
- **Better Routing:** Each intent triggers specific workflows
- **Enhanced Analytics:** Track payment questions, complaints, feedback separately

---

## Current State Analysis

### Existing Intents (9)

| Intent | Description | Current Accuracy | Status |
|--------|-------------|-----------------|--------|
| `order_new` | New order placement | 12.28% (7/57) | ⚠️ Needs improvement |
| `order_update` | Modify existing order | 60.00% (18/30) | ✅ Good |
| `order_status` | Check order status | 0.00% (0/12) | ❌ Critical issue |
| `product_inquiry` | Product questions | 79.07% (34/43) | ✅ Best performing |
| `greeting` | Opening salutation | 3.85% (1/26) | ❌ Critical issue |
| `support` | Human handoff | 14.29% (1/7) | ⚠️ Needs improvement |
| `cancel_order` | Cancel order | 0.00% (0/7) | ❌ Critical issue |
| `confirm_order` | Confirm order | 100.00% (12/12) | ✅ Perfect |
| `other` | Fallback category | N/A | ⚠️ Overused |

### Current Issues Identified

1. **Payment Queries Misclassified:**
   - "online payment pannalam" → `other` (should be `payment_inquiry`)
   - "cash kodukalam" → `order_new` (should be `payment_inquiry`)
   - "What payment methods do you accept?" → `product_inquiry` (should be `payment_inquiry`)

2. **Delivery Queries Misclassified:**
   - "Do you deliver to Coimbatore?" → `product_inquiry` (should be `delivery_inquiry`)
   - "What's the delivery time?" → `product_inquiry` (should be `delivery_inquiry`)
   - "free delivery irukka" → `product_inquiry` (should be `delivery_inquiry`)

3. **No Intent for:**
   - Complaints/issues
   - Refund requests
   - Feedback/reviews
   - Return/exchange requests
   - Account management queries

---

## Proposed Intent Expansion

### Expansion Strategy: Phased Approach

#### **Phase 1: Priority 1 Intents (Immediate - High Impact)**
Add 4 new intents that address the most common misclassifications:

1. ✅ `payment_inquiry` - Payment method questions
2. ✅ `delivery_inquiry` - Delivery-related questions
3. ✅ `complaint` - Issues/complaints reporting
4. ✅ `refund_request` - Refund requests

**Expected Impact:** Reduce "other" from ~29% to ~15%

#### **Phase 2: Priority 2 Intents (Next Sprint - Medium Impact)**
Add 4 additional intents for better coverage:

5. ✅ `feedback` - Positive feedback/reviews
6. ✅ `return_request` - Return/exchange requests
7. ✅ `account_inquiry` - Account/profile questions
8. ✅ `repeat_order` - Reorder previous orders

**Expected Impact:** Reduce "other" from ~15% to ~8%

#### **Phase 3: Monitor & Refine**
- Track classification accuracy
- Add more test cases
- Refine prompts based on real usage
- Consider additional intents if needed

---

## Detailed Intent Definitions

### Priority 1: High-Impact Intents

#### 1. `payment_inquiry`

**Purpose:** Handle all payment-related questions and inquiries

**When to Classify:**
- Customer asks about payment methods
- Questions about payment options (cash, UPI, card, online)
- Payment process inquiries
- Payment security questions
- Payment timing questions

**Keywords (English):**
- `payment`, `pay`, `cash`, `UPI`, `card`, `online payment`, `COD`, `cash on delivery`
- `wallet`, `razorpay`, `stripe`, `paytm`, `phonepe`, `gpay`
- `payment method`, `how to pay`, `payment option`, `payment gateway`
- `accept cash`, `take cash`, `give cash`

**Keywords (Multilingual):**
- Tamil: `cash kodukalam`, `payment pannalam`, `online payment pannalam`
- Kannada: `cash kodbeku`, `payment maadbeku`
- Malayalam: `cash kodukkam`, `payment cheyyam`
- Telugu: `cash ivvachu`, `payment cheyachu`
- Tanglish: `cash kodukalam`, `payment pannalam`

**Examples:**
- ✅ "What payment methods do you accept?"
- ✅ "Can I pay by cash?"
- ✅ "Do you accept UPI?"
- ✅ "online payment pannalam" (Tamil)
- ✅ "cash kodukalam" (Tamil)
- ✅ "What's the payment process?"
- ✅ "Is COD available?"

**Distinctions:**
- **vs `order_new`:** Payment inquiry asks "how to pay", order_new says "I want to order"
- **vs `product_inquiry`:** Payment is about payment methods, product_inquiry is about products
- **vs `other`:** Payment questions are specific and actionable

**Handling:**
- Show available payment methods
- Explain payment process
- Provide payment links if applicable
- Store payment preferences in customer insights

---

#### 2. `delivery_inquiry`

**Purpose:** Handle delivery-related questions (separate from order status)

**When to Classify:**
- Questions about delivery availability
- Delivery time/cost inquiries
- Delivery location questions
- Delivery method questions
- Free delivery inquiries

**Keywords (English):**
- `deliver`, `delivery`, `shipping`, `delivery time`, `delivery cost`
- `when will`, `how long`, `delivery available`, `free delivery`
- `deliver to`, `delivery location`, `delivery area`, `pincode`
- `shipping cost`, `delivery charge`, `delivery fee`

**Keywords (Multilingual):**
- Tamil: `delivery time`, `evlo time la varum`, `free delivery irukka`
- Kannada: `delivery time`, `yestu time ge barutte`, `free delivery ideya`
- Malayalam: `delivery time`, `ethra time il varum`, `free delivery unda`
- Telugu: `delivery time`, `enta time ki vastundi`, `free delivery undha`
- Tanglish: `delivery time`, `enna delivery time`

**Examples:**
- ✅ "Do you deliver to Coimbatore?"
- ✅ "What's the delivery time?"
- ✅ "Is free delivery available?"
- ✅ "How long does delivery take?"
- ✅ "free delivery irukka" (Tamil)
- ✅ "evlo time la varum" (Tamil - how long will it take)
- ✅ "Do you deliver to my area?"

**Distinctions:**
- **vs `order_status`:** Delivery inquiry asks "do you deliver?", order_status asks "where is my order?"
- **vs `product_inquiry`:** Delivery is about delivery service, product_inquiry is about products
- **vs `order_update`:** Delivery inquiry is asking, order_update is modifying (already handled via `modify_delivery`)

**Handling:**
- Show delivery areas/availability
- Provide delivery time estimates
- Explain delivery charges
- Store delivery preferences

**Note:** Delivery updates (changing address/time) remain as `order_update` with `orderUpdateType: 'modify_delivery'`

---

#### 3. `complaint` / `issue_report`

**Purpose:** Handle customer complaints and issue reporting

**When to Classify:**
- Customer reports problems
- Quality issues
- Service complaints
- Delivery problems
- Wrong items received
- Damaged items

**Keywords (English):**
- `complaint`, `issue`, `problem`, `wrong`, `damaged`, `broken`
- `bad quality`, `not working`, `disappointed`, `poor service`
- `late`, `delayed`, `missing`, `incorrect`, `mistake`
- `not good`, `terrible`, `awful`, `horrible`

**Keywords (Multilingual):**
- Tamil: `problem`, `issue`, `wrong`, `damaged`
- Kannada: `problem`, `issue`, `wrong`, `damaged`
- Malayalam: `problem`, `issue`, `wrong`, `damaged`
- Telugu: `problem`, `issue`, `wrong`, `damaged`

**Examples:**
- ✅ "My order was damaged"
- ✅ "Wrong item received"
- ✅ "Quality is poor"
- ✅ "Order is late"
- ✅ "Item is broken"
- ✅ "Not satisfied with service"
- ✅ "This is not what I ordered"

**Distinctions:**
- **vs `refund_request`:** Complaint reports issue, refund_request asks for money back
- **vs `order_status`:** Complaint is negative feedback, order_status is neutral inquiry
- **vs `support`:** Complaint is specific issue, support is general help request

**Handling:**
- Log complaint in system
- Escalate to vendor if needed
- Offer resolution (refund, replacement, etc.)
- Track complaint patterns for insights

---

#### 4. `refund_request`

**Purpose:** Handle refund requests (distinct from cancel_order)

**When to Classify:**
- Customer requests money back
- Refund for damaged/wrong items
- Payment refund inquiries
- Compensation requests

**Keywords (English):**
- `refund`, `return money`, `money back`, `reimburse`
- `compensation`, `refund my money`, `give money back`
- `refund for`, `want refund`, `need refund`

**Keywords (Multilingual):**
- Tamil: `refund venum`, `money back venum`
- Kannada: `refund beku`, `money back beku`
- Malayalam: `refund vende`, `money back vende`
- Telugu: `refund kavali`, `money back kavali`

**Examples:**
- ✅ "I want a refund"
- ✅ "Return my money"
- ✅ "Refund for damaged item"
- ✅ "Give me my money back"
- ✅ "I need a refund"

**Distinctions:**
- **vs `cancel_order`:** Refund requests money back, cancel_order cancels order (may or may not involve refund)
- **vs `return_request`:** Refund is about money, return_request is about returning item
- **vs `complaint`:** Refund is action request, complaint is problem report

**Handling:**
- Process refund request
- Check refund eligibility
- Initiate refund process
- Track refund history

---

### Priority 2: Medium-Impact Intents

#### 5. `feedback` / `review`

**Purpose:** Capture positive feedback and reviews

**When to Classify:**
- Positive feedback
- Reviews/ratings
- Appreciation messages
- Thank you messages (after service)

**Keywords (English):**
- `feedback`, `review`, `rating`, `stars`, `good`, `excellent`
- `satisfied`, `happy`, `thank you`, `appreciate`, `great service`
- `loved it`, `amazing`, `wonderful`, `perfect`, `best`

**Keywords (Multilingual):**
- Tamil: `nandri`, `romba nalla irundhuchu`, `super`
- Kannada: `dhanyavadagalu`, `chennagide`, `super`
- Malayalam: `nandi`, `valare nannayirunnu`, `super`
- Telugu: `dhanyavadalu`, `chaala bagundhi`, `super`

**Examples:**
- ✅ "Great service, thank you!"
- ✅ "Product was excellent"
- ✅ "5 stars"
- ✅ "Very happy with order"
- ✅ "Thank you so much"
- ✅ "nandri" (Tamil - thank you, after service)

**Distinctions:**
- **vs `greeting`:** Feedback is after service, greeting is opening
- **vs `other`:** Feedback is positive sentiment, other is unclear

**Handling:**
- Store feedback in customer insights
- Update vendor ratings
- Use for marketing/testimonials
- Track satisfaction metrics

---

#### 6. `return_request` / `exchange_request`

**Purpose:** Handle return and exchange requests

**When to Classify:**
- Customer wants to return item
- Exchange requests
- Swap requests
- Send back requests

**Keywords (English):**
- `return`, `exchange`, `replace`, `swap`, `send back`
- `return item`, `exchange item`, `want to return`
- `take back`, `give back`, `send it back`

**Keywords (Multilingual):**
- Tamil: `return pannanum`, `exchange pannanum`
- Kannada: `return maadi`, `exchange maadi`
- Malayalam: `return cheyyanam`, `exchange cheyyanam`
- Telugu: `return cheyali`, `exchange cheyali`

**Examples:**
- ✅ "I want to return this"
- ✅ "Can I exchange this?"
- ✅ "Return item"
- ✅ "Swap this for another size"
- ✅ "Send it back"

**Distinctions:**
- **vs `cancel_order`:** Return is for received item, cancel is for pending order
- **vs `refund_request`:** Return is about item, refund is about money
- **vs `order_update`:** Return removes item, order_update modifies order

**Handling:**
- Process return/exchange request
- Check return policy
- Generate return label if needed
- Track return history

---

#### 7. `account_inquiry`

**Purpose:** Handle account/profile management queries

**When to Classify:**
- Account information requests
- Profile update requests
- Address update (not for order)
- Phone/email update requests

**Keywords (English):**
- `account`, `profile`, `update address`, `change phone`
- `my details`, `personal information`, `my account`
- `update profile`, `change address`, `update phone`

**Keywords (Multilingual):**
- Tamil: `account update`, `profile update`
- Kannada: `account update`, `profile update`
- Malayalam: `account update`, `profile update`
- Telugu: `account update`, `profile update`

**Examples:**
- ✅ "Update my address"
- ✅ "Change my phone number"
- ✅ "My account details"
- ✅ "Update profile"
- ✅ "Change email address"

**Distinctions:**
- **vs `order_update`:** Account inquiry updates profile, order_update updates order
- **vs `product_inquiry`:** Account is about customer info, product_inquiry is about products

**Handling:**
- Update customer profile
- Store in customer insights
- Confirm updates with customer
- Track profile changes

---

#### 8. `repeat_order` / `reorder`

**Purpose:** Handle repeat/reorder requests

**When to Classify:**
- Customer wants same order as before
- Reorder previous order
- Repeat last order
- Order again

**Keywords (English):**
- `repeat`, `reorder`, `same as last`, `again`
- `previous order`, `last time`, `order again`
- `same order`, `repeat order`, `last order`

**Keywords (Multilingual):**
- Tamil: `same order`, `repeat pannanum`
- Kannada: `same order`, `repeat maadi`
- Malayalam: `same order`, `repeat cheyyanam`
- Telugu: `same order`, `repeat cheyali`

**Examples:**
- ✅ "Same as last time"
- ✅ "Repeat my last order"
- ✅ "Order again"
- ✅ "Same order as before"
- ✅ "I want the same thing"

**Distinctions:**
- **vs `order_new`:** Repeat references previous order, order_new is new order
- **vs `order_status`:** Repeat wants to order again, order_status asks about existing order

**Handling:**
- Fetch last order details
- Pre-fill order with previous items
- Confirm with customer
- Track repeat order patterns

---

## Implementation Plan

### Phase 1: Priority 1 Intents (Week 1)

#### Day 1-2: Type Definitions & Schema Updates

**Files to Update:**
1. `backend/src/types/multiStage.ts`
   - Update `IntentClassification` interface
   - Add new intent types to union

2. `backend/src/services/intentClassificationService.ts`
   - Update function signatures
   - Add keyword detection helpers

**Changes:**
```typescript
// backend/src/types/multiStage.ts
export interface IntentClassification {
  primaryIntent: 
    // Existing (9)
    | 'order_new' 
    | 'order_update' 
    | 'order_status' 
    | 'product_inquiry' 
    | 'greeting' 
    | 'support' 
    | 'cancel_order' 
    | 'confirm_order'
    
    // Priority 1 - NEW (4)
    | 'payment_inquiry'    // NEW
    | 'delivery_inquiry'    // NEW
    | 'complaint'           // NEW
    | 'refund_request'      // NEW
    
    // Fallback
    | 'other';
  // ... rest of interface
}
```

#### Day 3-4: Prompt Engineering Updates

**File:** `backend/src/services/intentClassificationService.ts`

**Update `buildIntentPrompt()` function:**
- Add detailed definitions for 4 new intents
- Add examples and distinctions
- Update priority rules
- Add multilingual keyword patterns

**Key Sections to Add:**
1. Intent definitions (Priority 1 section)
2. Keyword patterns (multilingual support)
3. Distinction rules (vs existing intents)
4. Examples for each new intent

#### Day 5: Fallback Logic Updates

**File:** `backend/src/services/intentClassificationService.ts`

**Update `keywordBasedIntentDetection()` function:**
- Add keyword patterns for new intents
- Update priority order
- Add multilingual support

#### Day 6-7: Testing & Validation

**Files to Create/Update:**
1. `backend/scripts/test-messages/intent-classification-test-cases.json`
   - Add 50+ test cases for new intents
   - Include multilingual examples
   - Cover edge cases

2. Run test suite
   - Validate accuracy improvements
   - Check for regressions
   - Measure "other" reduction

---

### Phase 2: Priority 2 Intents (Week 2)

#### Day 1-2: Type Definitions & Schema Updates
- Add 4 more intent types
- Update interfaces

#### Day 3-4: Prompt Engineering Updates
- Add Priority 2 intent definitions
- Update prompt with examples

#### Day 5: Fallback Logic Updates
- Add keyword patterns for Priority 2 intents

#### Day 6-7: Testing & Validation
- Add test cases
- Run validation
- Measure improvements

---

### Phase 3: Integration & Orchestrator Updates

#### Week 3: Multi-Stage Orchestrator Integration

**File:** `backend/src/services/multiStageOrchestrator.ts`

**Updates Needed:**
1. Add handling logic for new intents in Stage 2 (Context Fetching)
2. Update Stage 3 (Prompt Building) for new intents
3. Add specific workflows for each new intent

**Example Workflows:**

```typescript
// payment_inquiry workflow
if (intent === 'payment_inquiry') {
  // Fetch payment methods from vendor config
  // Show available payment options
  // Store payment preference
}

// delivery_inquiry workflow
if (intent === 'delivery_inquiry') {
  // Fetch delivery areas from vendor config
  // Show delivery time estimates
  // Explain delivery charges
}

// complaint workflow
if (intent === 'complaint') {
  // Log complaint in database
  // Escalate to vendor
  // Offer resolution options
}

// refund_request workflow
if (intent === 'refund_request') {
  // Check refund eligibility
  // Process refund request
  // Track refund history
}
```

---

## Technical Specifications

### Updated Type Definitions

```typescript
// backend/src/types/multiStage.ts

export interface IntentClassification {
  primaryIntent: 
    // Existing (9)
    | 'order_new' 
    | 'order_update' 
    | 'order_status' 
    | 'product_inquiry' 
    | 'greeting' 
    | 'support' 
    | 'cancel_order' 
    | 'confirm_order'
    
    // Priority 1 - NEW (4)
    | 'payment_inquiry'    // Payment method questions
    | 'delivery_inquiry'    // Delivery-related questions
    | 'complaint'           // Issues/complaints
    | 'refund_request'      // Refund requests
    
    // Priority 2 - NEW (4)
    | 'feedback'            // Positive feedback/reviews
    | 'return_request'      // Return/exchange requests
    | 'account_inquiry'     // Account/profile questions
    | 'repeat_order'        // Reorder previous orders
    
    // Fallback
    | 'other';
    
  secondaryIntents?: string[];
  confidence: number;
  extractedInfo: {
    products?: string[];
    quantities?: string[];
    orderUpdateType?: 'add_items' | 'remove_items' | 'change_quantity' | 
                      'modify_delivery' | 'replace_order' | 'partial_update' | null;
    itemsToAdd?: any[];
    itemsToRemove?: string[];
    quantityChanges?: Array<{product: string, newQuantity: number}>;
    hasDeliveryInfo: boolean;
    hasSpecialRequests: boolean;
    mentionsOrder: boolean;
    orderNumber?: string | null;
    urgency: 'low' | 'medium' | 'high';
    
    // NEW: Additional extracted info for new intents
    paymentMethod?: string;           // For payment_inquiry
    deliveryArea?: string;            // For delivery_inquiry
    complaintType?: string;           // For complaint
    refundReason?: string;            // For refund_request
    feedbackType?: 'positive' | 'negative' | 'neutral'; // For feedback
    returnReason?: string;            // For return_request
    accountField?: string;            // For account_inquiry
    previousOrderNumber?: string;     // For repeat_order
  };
  needsMoreContext: boolean;
  reasoning: string;
  tokensUsed?: number;
  cost?: number;
}
```

### Updated Function Signatures

```typescript
// backend/src/services/intentClassificationService.ts

export async function classifyIntent(
  normalizedMessage: any,
  memory: ConversationMemory,
  lastMessages: any[],
  vendorId: string,
  conversationId?: string,
  disableFallback: boolean = false,
  disableCache: boolean = false
): Promise<IntentClassification> {
  // Implementation remains the same
  // Prompt will be updated to include new intents
}
```

---

## Prompt Engineering Updates

### Updated Intent Priority Rules

The prompt should be updated with the following priority order:

```
CRITICAL INTENT CLASSIFICATION RULES (CHECK IN THIS PRIORITY ORDER):

1. "product_inquiry" - HIGHEST PRIORITY if message:
   [existing rules...]

2. "payment_inquiry" - NEW: Payment method questions:
   - Keywords: "payment", "pay", "cash", "UPI", "card", "online payment", "COD"
   - Questions about payment methods, payment process, payment security
   - Pattern: [Payment Question] = payment_inquiry
   - Examples: "What payment methods do you accept?", "Can I pay by cash?", "online payment pannalam"

3. "delivery_inquiry" - NEW: Delivery-related questions:
   - Keywords: "deliver", "delivery", "shipping", "delivery time", "delivery cost"
   - Questions about delivery availability, time, cost, areas
   - Pattern: [Delivery Question] = delivery_inquiry
   - Examples: "Do you deliver to X?", "What's the delivery time?", "free delivery irukka"

4. "order_status" - Asking about existing orders:
   [existing rules...]

5. "complaint" - NEW: Issues/complaints:
   - Keywords: "complaint", "issue", "problem", "wrong", "damaged", "broken", "bad quality"
   - Reports problems, quality issues, service complaints
   - Pattern: [Problem Report] = complaint
   - Examples: "My order was damaged", "Wrong item received", "Quality is poor"

6. "refund_request" - NEW: Refund requests:
   - Keywords: "refund", "return money", "money back", "reimburse"
   - Requests for money back, refund for items
   - Pattern: [Refund Request] = refund_request
   - Examples: "I want a refund", "Return my money", "Refund for damaged item"

7. "order_new" - Placing a NEW order:
   [existing rules...]

8. "order_update" - Modifying EXISTING order:
   [existing rules...]
   Note: Delivery updates remain as order_update with modify_delivery subtype

9. "support" - Requesting human assistance:
   [existing rules...]

10. "greeting" - Opening conversation:
    [existing rules...]

11. "cancel_order" - Canceling an order:
    [existing rules...]

12. "confirm_order" - Confirming an order:
    [existing rules...]

13. "feedback" - NEW (Priority 2): Positive feedback/reviews:
    - Keywords: "feedback", "review", "rating", "stars", "good", "excellent", "thank you"
    - Positive sentiment, appreciation, reviews
    - Pattern: [Positive Feedback] = feedback
    - Examples: "Great service!", "5 stars", "Thank you so much"

14. "return_request" - NEW (Priority 2): Return/exchange requests:
    - Keywords: "return", "exchange", "replace", "swap", "send back"
    - Requests to return or exchange items
    - Pattern: [Return Request] = return_request
    - Examples: "I want to return this", "Can I exchange this?"

15. "account_inquiry" - NEW (Priority 2): Account/profile questions:
    - Keywords: "account", "profile", "update address", "change phone", "my details"
    - Questions about account, profile updates
    - Pattern: [Account Question] = account_inquiry
    - Examples: "Update my address", "Change my phone number"

16. "repeat_order" - NEW (Priority 2): Reorder requests:
    - Keywords: "repeat", "reorder", "same as last", "again", "previous order"
    - Requests to repeat previous orders
    - Pattern: [Repeat Request] = repeat_order
    - Examples: "Same as last time", "Repeat my last order"

17. "other" - Everything else that doesn't fit above categories
```

### Key Distinctions to Add

```
KEY DISTINCTIONS:

payment_inquiry vs order_new:
- "What payment methods do you accept?" → payment_inquiry (asking about payment)
- "I want to order X" → order_new (wanting to order)
- Rule: Payment question = payment_inquiry, Order statement = order_new

delivery_inquiry vs order_status:
- "Do you deliver to X?" → delivery_inquiry (asking about delivery service)
- "Where is my order?" → order_status (asking about existing order)
- Rule: Delivery service question = delivery_inquiry, Order tracking = order_status

delivery_inquiry vs order_update:
- "Do you deliver to X?" → delivery_inquiry (asking)
- "Change address to Y" → order_update (modifying, handled via modify_delivery)
- Rule: Delivery question = delivery_inquiry, Delivery modification = order_update

complaint vs refund_request:
- "My order was damaged" → complaint (reporting issue)
- "I want a refund" → refund_request (requesting money back)
- Rule: Problem report = complaint, Money request = refund_request

complaint vs order_status:
- "Order is late" → complaint (negative feedback)
- "What's the status?" → order_status (neutral inquiry)
- Rule: Negative sentiment = complaint, Neutral inquiry = order_status

refund_request vs cancel_order:
- "I want a refund" → refund_request (money back)
- "Cancel my order" → cancel_order (cancel order, may or may not involve refund)
- Rule: Money focus = refund_request, Order cancellation = cancel_order

return_request vs refund_request:
- "I want to return this" → return_request (returning item)
- "Give me my money back" → refund_request (money back)
- Rule: Item return = return_request, Money refund = refund_request

repeat_order vs order_new:
- "Same as last time" → repeat_order (referencing previous)
- "I want 2kg brownie" → order_new (new order)
- Rule: References previous = repeat_order, New order = order_new
```

---

## Test Cases & Validation

### Test Case Structure

```json
{
  "testCases": [
    {
      "message": "What payment methods do you accept?",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Payment method question"
    },
    {
      "message": "online payment pannalam",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Tamil - Can do online payment"
    },
    {
      "message": "Do you deliver to Coimbatore?",
      "expectedPrimaryIntent": "delivery_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Delivery location question"
    },
    {
      "message": "free delivery irukka",
      "expectedPrimaryIntent": "delivery_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Tamil - Is free delivery available"
    },
    {
      "message": "My order was damaged",
      "expectedPrimaryIntent": "complaint",
      "expectedSecondaryIntents": [],
      "description": "Complaint about damaged order"
    },
    {
      "message": "I want a refund",
      "expectedPrimaryIntent": "refund_request",
      "expectedSecondaryIntents": [],
      "description": "Refund request"
    }
    // ... more test cases
  ]
}
```

### Test Coverage Goals

**Priority 1 Intents:**
- `payment_inquiry`: 30+ test cases (English + multilingual)
- `delivery_inquiry`: 25+ test cases (English + multilingual)
- `complaint`: 20+ test cases
- `refund_request`: 15+ test cases

**Priority 2 Intents:**
- `feedback`: 20+ test cases
- `return_request`: 15+ test cases
- `account_inquiry`: 15+ test cases
- `repeat_order`: 15+ test cases

**Total New Test Cases:** ~155 additional test cases

### Validation Criteria

1. **Accuracy Targets:**
   - Priority 1 intents: 85%+ accuracy
   - Priority 2 intents: 80%+ accuracy
   - Overall system: 85%+ accuracy (up from 71%)

2. **"Other" Reduction:**
   - Target: <10% of messages classified as "other"
   - Current: ~29%

3. **Regression Testing:**
   - Existing intents should maintain or improve accuracy
   - No degradation in current high-performing intents

---

## Migration Strategy

### Backward Compatibility

**Approach:** Additive changes only
- New intents are additions, not replacements
- Existing intents remain unchanged
- `other` category still available as fallback

### Gradual Rollout

**Phase 1: Testing (Week 1-2)**
- Deploy to test environment
- Run comprehensive test suite
- Validate accuracy improvements
- Fix any issues

**Phase 2: Staged Production (Week 3)**
- Enable Priority 1 intents in production
- Monitor classification distribution
- Track accuracy metrics
- Collect feedback

**Phase 3: Full Rollout (Week 4)**
- Enable Priority 2 intents
- Monitor all metrics
- Refine prompts based on real data
- Document learnings

### Rollback Plan

If issues arise:
1. Disable new intents via feature flag
2. Revert to previous prompt version
3. Analyze issues
4. Fix and retry

---

## Success Metrics

### Key Performance Indicators (KPIs)

1. **Classification Accuracy:**
   - Current: 71.13%
   - Target: 85%+ (Priority 1), 90%+ (Priority 2)

2. **"Other" Category Usage:**
   - Current: ~29%
   - Target: <10%

3. **Intent-Specific Accuracy:**
   - `payment_inquiry`: Target 85%+
   - `delivery_inquiry`: Target 85%+
   - `complaint`: Target 80%+
   - `refund_request`: Target 80%+

4. **Response Quality:**
   - More accurate routing
   - Better customer experience
   - Reduced handoffs to human agents

### Monitoring & Analytics

**Metrics to Track:**
1. Intent classification distribution
2. Accuracy by intent type
3. Accuracy by language
4. "Other" category usage over time
5. Customer satisfaction scores
6. Resolution rates by intent

**Dashboards:**
- Intent classification accuracy dashboard
- Intent distribution pie chart
- Language-specific accuracy metrics
- "Other" category trend analysis

---

## Appendix

### A. Multilingual Keyword Reference

#### Payment Inquiry Keywords

| Language | Keywords |
|----------|----------|
| English | payment, pay, cash, UPI, card, online payment, COD |
| Tamil | cash kodukalam, payment pannalam, online payment pannalam |
| Kannada | cash kodbeku, payment maadbeku |
| Malayalam | cash kodukkam, payment cheyyam |
| Telugu | cash ivvachu, payment cheyachu |
| Tanglish | cash kodukalam, payment pannalam |

#### Delivery Inquiry Keywords

| Language | Keywords |
|----------|----------|
| English | deliver, delivery, shipping, delivery time, free delivery |
| Tamil | delivery time, evlo time la varum, free delivery irukka |
| Kannada | delivery time, yestu time ge barutte, free delivery ideya |
| Malayalam | delivery time, ethra time il varum, free delivery unda |
| Telugu | delivery time, enta time ki vastundi, free delivery undha |

### B. Intent Priority Matrix

| Intent | Priority | When to Use | Example |
|--------|----------|-------------|---------|
| `product_inquiry` | 1 | Highest - Product questions | "Do you have X?" |
| `payment_inquiry` | 2 | Payment questions | "What payment methods?" |
| `delivery_inquiry` | 3 | Delivery questions | "Do you deliver to X?" |
| `order_status` | 4 | Order tracking | "Where is my order?" |
| `complaint` | 5 | Issues/problems | "Order was damaged" |
| `refund_request` | 6 | Refund requests | "I want a refund" |
| `order_new` | 7 | New orders | "I want 2kg" |
| `order_update` | 8 | Order modifications | "Make it 5 boxes" |
| `support` | 9 | Human handoff | "Talk to human" |
| `greeting` | 10 | Opening | "Hi" |
| `cancel_order` | 11 | Cancellations | "Cancel order" |
| `confirm_order` | 12 | Confirmations | "Yes, confirm" |
| `feedback` | 13 | Positive feedback | "Great service!" |
| `return_request` | 14 | Returns/exchanges | "Return this" |
| `account_inquiry` | 15 | Account questions | "Update address" |
| `repeat_order` | 16 | Reorders | "Same as last time" |
| `other` | 17 | Fallback | Everything else |

### C. Implementation Checklist

#### Phase 1: Priority 1 Intents
- [ ] Update TypeScript types
- [ ] Update prompt with Priority 1 intent definitions
- [ ] Add keyword patterns for fallback
- [ ] Add 90+ test cases
- [ ] Update orchestrator workflows
- [ ] Run test suite
- [ ] Validate accuracy improvements
- [ ] Deploy to test environment
- [ ] Monitor metrics
- [ ] Deploy to production

#### Phase 2: Priority 2 Intents
- [ ] Update TypeScript types
- [ ] Update prompt with Priority 2 intent definitions
- [ ] Add keyword patterns for fallback
- [ ] Add 65+ test cases
- [ ] Update orchestrator workflows
- [ ] Run test suite
- [ ] Validate accuracy improvements
- [ ] Deploy to test environment
- [ ] Monitor metrics
- [ ] Deploy to production

### D. Reference Documents

- `docs/INTENT_IDENTIFICATION_EXPLAINED.md` - Current intent system explanation
- `docs/INTENT_IDENTIFICATION_FLOW.md` - Current intent flow documentation
- `backend/src/services/intentClassificationService.ts` - Current implementation
- `backend/scripts/test-messages/intent-classification-test-cases.json` - Current test cases

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-13 | AI Assistant | Initial documentation created |

---

**Next Steps:**
1. Review and approve this documentation
2. Begin Phase 1 implementation
3. Create detailed test cases
4. Update prompt engineering
5. Implement and test
6. Deploy and monitor

