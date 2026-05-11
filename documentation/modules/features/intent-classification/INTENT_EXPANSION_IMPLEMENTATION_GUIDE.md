# Intent Expansion Implementation Guide

**Complete Step-by-Step Implementation Guide**  
**Version:** 2.0  
**Last Updated:** December 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step-by-Step Implementation](#step-by-step-implementation)
4. [Database Schema Considerations](#database-schema-considerations)
5. [Service Functions to Create](#service-functions-to-create)
6. [Follow-Up Question Handling](#follow-up-question-handling)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Checklist](#deployment-checklist)
9. [Troubleshooting](#troubleshooting)
10. [Quick Reference](#quick-reference)

---

## Overview

This guide provides **complete, detailed instructions** for expanding intent classification from **9 to 17 intents**. Every step includes exact file locations, code changes, and implementation details.

### New Intents Being Added

**Priority 1 (4 intents):**
- `payment_inquiry` - Payment method questions
- `delivery_inquiry` - Delivery-related questions  
- `complaint` - Issues/complaints reporting
- `refund_request` - Refund requests

**Priority 2 (4 intents):**
- `feedback` - Positive feedback/reviews
- `return_request` - Return/exchange requests
- `account_inquiry` - Account/profile questions
- `repeat_order` - Reorder previous orders

### Expected Impact

- **Accuracy:** 71% → 85%+ (Priority 1), 90%+ (Priority 2)
- **"Other" Category:** 29% → <10%
- **Better Routing:** Each intent triggers specific workflows
- **Enhanced Analytics:** Track payment questions, complaints, feedback separately

---

## Prerequisites

Before starting implementation:

1. ✅ Review main requirements: `docs/INTENT_CLASSIFICATION_EXPANSION.md`
2. ✅ Understand current system: `docs/INTENT_IDENTIFICATION_EXPLAINED.md`
3. ✅ Backup current codebase
4. ✅ Set up test environment
5. ✅ Review existing test cases: `backend/scripts/test-messages/intent-classification-test-cases.json`

---

## Step-by-Step Implementation

### Step 0: Database Schema Updates (Optional but Recommended)

**Purpose:** Add fields to store payment and delivery configuration if not already present.

**File:** `backend/prisma/schema.prisma`

**Decision Point:** Check if vendor config already stores payment/delivery info in JSON fields. If yes, skip this step. If no, add:

```prisma
model Vendor {
  // ... existing fields ...
  
  // NEW: Payment and Delivery Configuration (JSON fields)
  paymentConfig Json? // { methods: ["Cash", "UPI", "Online"], defaultMethod: "UPI", codAvailable: true }
  deliveryConfig Json? // { areas: ["Area1", "Area2"], time: "2-3 hours", freeDeliveryThreshold: 500, charges: {...} }
  
  // ... rest of model ...
}
```

**Migration:** Create migration file:
```bash
npx prisma migrate dev --name add_payment_delivery_config
```

**Note:** If you prefer storing this in `aiSystemPrompt` or vendor instructions, you can skip this step. The system will use defaults.

---

### Step 1: Update Type Definitions

**File:** `backend/src/types/multiStage.ts`

**Location:** Lines 70-94 (IntentClassification interface)

**Exact Changes:**

```typescript
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
    | 'delivery_inquiry'   // NEW
    | 'complaint'          // NEW
    | 'refund_request'     // NEW
    
    // Priority 2 - NEW (4)
    | 'feedback'           // NEW
    | 'return_request'     // NEW
    | 'account_inquiry'    // NEW
    | 'repeat_order'       // NEW
    
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
    
    // NEW: Additional fields for new intents (add after urgency)
    paymentMethod?: 'cash' | 'UPI' | 'card' | 'online' | 'COD' | null;  // For payment_inquiry
    deliveryArea?: string | null;                                        // For delivery_inquiry
    deliveryTime?: string | null;                                        // For delivery_inquiry
    complaintType?: 'quality' | 'delivery' | 'service' | 'wrong_item' | 'damaged' | 'other' | null; // For complaint
    refundReason?: string | null;                                        // For refund_request
    refundAmount?: number | null;                                        // For refund_request
    feedbackType?: 'positive' | 'negative' | 'neutral' | null;         // For feedback
    feedbackRating?: number | null;                                      // For feedback (1-5 stars)
    returnReason?: string | null;                                        // For return_request
    returnItem?: string | null;                                          // For return_request
    accountField?: 'address' | 'phone' | 'email' | 'name' | 'other' | null; // For account_inquiry
    previousOrderNumber?: string | null;                                 // For repeat_order
  };
  needsMoreContext: boolean;
  reasoning: string;
  tokensUsed?: number;
  cost?: number;
}
```

**Action:** Replace the entire `IntentClassification` interface with the updated version above.

**Verification:** Run TypeScript compiler to check for errors:
```bash
cd backend && npm run build
```

---

### Step 2: Update Intent Classification Prompt

**File:** `backend/src/services/intentClassificationService.ts`

**Location:** `buildIntentPrompt()` function (starts around line 328)

**Changes Required:**

#### 2.1: Add Priority 1 Intent Definitions

**Location:** After line 392 (after product_inquiry definition, before order_status)

**Add:**

```typescript
2. "payment_inquiry" - Payment method questions:
   - Keywords: "payment", "pay", "cash", "UPI", "card", "online payment", "COD", "cash on delivery", "payment method", "how to pay"
   - Questions about payment methods, payment process, payment security, payment timing
   - Multilingual: "cash kodukalam" (Tamil), "payment pannalam" (Tamil), "cash kodbeku" (Kannada), "payment maadbeku" (Kannada)
   - Pattern: [Payment Question] = payment_inquiry
   - Examples: 
     * "What payment methods do you accept?"
     * "Can I pay by cash?"
     * "Do you accept UPI?"
     * "online payment pannalam" (Tamil)
     * "cash kodukalam" (Tamil)
     * "What's the payment process?"
     * "Is COD available?"
   - Distinction: 
     * vs order_new: Payment inquiry asks "how to pay", order_new says "I want to order"
     * vs product_inquiry: Payment is about payment methods, product_inquiry is about products
     * vs other: Payment questions are specific and actionable

3. "delivery_inquiry" - Delivery-related questions:
   - Keywords: "deliver", "delivery", "shipping", "delivery time", "delivery cost", "free delivery", "delivery available", "deliver to", "delivery area"
   - Questions about delivery availability, time, cost, areas, locations
   - Multilingual: "delivery time" (all languages), "free delivery irukka" (Tamil), "evlo time la varum" (Tamil), "delivery ideya" (Kannada)
   - Pattern: [Delivery Question] = delivery_inquiry
   - Examples:
     * "Do you deliver to Coimbatore?"
     * "What's the delivery time?"
     * "Is free delivery available?"
     * "How long does delivery take?"
     * "free delivery irukka" (Tamil)
     * "evlo time la varum" (Tamil - how long will it take)
     * "Do you deliver to my area?"
   - Distinction:
     * vs order_status: Delivery inquiry asks "do you deliver?", order_status asks "where is my order?"
     * vs product_inquiry: Delivery is about delivery service, product_inquiry is about products
     * vs order_update: Delivery inquiry is asking, order_update is modifying (delivery updates handled via modify_delivery subtype)
   - Note: Delivery updates (changing address/time) remain as order_update with modify_delivery subtype

5. "complaint" - Issues/complaints:
   - Keywords: "complaint", "issue", "problem", "wrong", "damaged", "broken", "bad quality", "not working", "disappointed", "poor", "late", "delayed", "missing", "incorrect"
   - Reports problems, quality issues, service complaints, delivery problems, wrong items
   - Pattern: [Problem Report] = complaint
   - Examples:
     * "My order was damaged"
     * "Wrong item received"
     * "Quality is poor"
     * "Order is late"
     * "Item is broken"
     * "Not satisfied with service"
     * "This is not what I ordered"
   - Distinction:
     * vs refund_request: Complaint reports issue, refund_request asks for money back
     * vs order_status: Complaint is negative feedback, order_status is neutral inquiry
     * vs support: Complaint is specific issue, support is general help request

6. "refund_request" - Refund requests:
   - Keywords: "refund", "return money", "money back", "reimburse", "compensation", "refund my money", "give money back"
   - Requests for money back, refund for items, payment refund inquiries
   - Multilingual: "refund venum" (Tamil), "money back venum" (Tamil), "refund beku" (Kannada)
   - Pattern: [Refund Request] = refund_request
   - Examples:
     * "I want a refund"
     * "Return my money"
     * "Refund for damaged item"
     * "Give me my money back"
     * "I need a refund"
   - Distinction:
     * vs cancel_order: Refund requests money back, cancel_order cancels order (may or may not involve refund)
     * vs return_request: Refund is about money, return_request is about returning item
     * vs complaint: Refund is action request, complaint is problem report
```

#### 2.2: Add Priority 2 Intent Definitions

**Location:** After line 444 (after confirm_order definition, before "other")

**Add:**

```typescript
13. "feedback" - Positive feedback/reviews:
    - Keywords: "feedback", "review", "rating", "stars", "good", "excellent", "satisfied", "happy", "thank you", "appreciate", "great service", "loved it", "amazing", "wonderful", "perfect"
    - Positive sentiment, appreciation, reviews (after service)
    - Multilingual: "nandri" (Tamil - after service), "dhanyavadagalu" (Kannada), "romba nalla irundhuchu" (Tamil)
    - Pattern: [Positive Feedback] = feedback
    - Examples:
      * "Great service, thank you!"
      * "Product was excellent"
      * "5 stars"
      * "Very happy with order"
      * "Thank you so much"
      * "nandri" (Tamil - thank you, after service)
    - Distinction:
      * vs greeting: Feedback is after service, greeting is opening
      * vs other: Feedback is positive sentiment, other is unclear
      * vs complaint: Feedback is positive, complaint is negative

14. "return_request" - Return/exchange requests:
    - Keywords: "return", "exchange", "replace", "swap", "send back", "take back", "return item", "exchange item", "want to return"
    - Requests to return or exchange items (not money refund)
    - Multilingual: "return pannanum" (Tamil), "exchange pannanum" (Tamil), "return maadi" (Kannada)
    - Pattern: [Return Request] = return_request
    - Examples:
      * "I want to return this"
      * "Can I exchange this?"
      * "Return item"
      * "Swap this for another size"
      * "Send it back"
    - Distinction:
      * vs refund_request: Return is about item, refund is about money
      * vs cancel_order: Return is for received item, cancel is for pending order
      * vs order_update: Return removes item, order_update modifies order

15. "account_inquiry" - Account/profile questions:
    - Keywords: "account", "profile", "update address", "change phone", "my details", "personal information", "update profile", "change address", "update phone", "my account"
    - Questions about account, profile updates (not for order)
    - Pattern: [Account Question] = account_inquiry
    - Examples:
      * "Update my address"
      * "Change my phone number"
      * "My account details"
      * "Update profile"
      * "Change email address"
    - Distinction:
      * vs order_update: Account inquiry updates profile, order_update updates order
      * vs product_inquiry: Account is about customer info, product_inquiry is about products

16. "repeat_order" - Reorder requests:
    - Keywords: "repeat", "reorder", "same as last", "again", "previous order", "last time", "order again", "same order", "repeat order", "last order"
    - Requests to repeat previous orders
    - Multilingual: "same order" (all languages), "repeat pannanum" (Tamil), "repeat maadi" (Kannada)
    - Pattern: [Repeat Request] = repeat_order
    - Examples:
      * "Same as last time"
      * "Repeat my last order"
      * "Order again"
      * "Same order as before"
      * "I want the same thing"
    - Distinction:
      * vs order_new: Repeat references previous order, order_new is new order
      * vs order_status: Repeat wants to order again, order_status asks about existing order
```

#### 2.3: Update JSON Schema in Prompt Return Statement

**Location:** Around line 507-528 (the return statement with JSON schema)

**Find this section:**
```typescript
Return ONLY valid JSON (no markdown, no code blocks, no explanations, no additional text):
{
  "primaryIntent": "order_new|order_update|order_status|product_inquiry|greeting|support|cancel_order|confirm_order|other",
```

**Replace with:**
```typescript
Return ONLY valid JSON (no markdown, no code blocks, no explanations, no additional text):
{
  "primaryIntent": "order_new|order_update|order_status|product_inquiry|greeting|support|cancel_order|confirm_order|payment_inquiry|delivery_inquiry|complaint|refund_request|feedback|return_request|account_inquiry|repeat_order|other",
```

**Then find the extractedInfo section and update it:**

**Find:**
```typescript
  "extractedInfo": {
    "products": ["product1", "product2"],
    "quantities": ["2kg", "3 pieces"],
    "orderUpdateType": "add_items|remove_items|change_quantity|modify_delivery|replace_order|partial_update" | null,
    "itemsToAdd": [],
    "itemsToRemove": [],
    "quantityChanges": [{"product": "product_name", "newQuantity": 3}],
    "hasDeliveryInfo": true|false,
    "hasSpecialRequests": true|false,
    "mentionsOrder": true|false,
    "orderNumber": "ORD-123" | null,
    "urgency": "low|medium|high"
  },
```

**Replace with:**
```typescript
  "extractedInfo": {
    "products": ["product1", "product2"],
    "quantities": ["2kg", "3 pieces"],
    "orderUpdateType": "add_items|remove_items|change_quantity|modify_delivery|replace_order|partial_update" | null,
    "itemsToAdd": [],
    "itemsToRemove": [],
    "quantityChanges": [{"product": "product_name", "newQuantity": 3}],
    "hasDeliveryInfo": true|false,
    "hasSpecialRequests": true|false,
    "mentionsOrder": true|false,
    "orderNumber": "ORD-123" | null,
    "urgency": "low|medium|high",
    // NEW: Additional fields for new intents (only include if relevant)
    "paymentMethod": "cash|UPI|card|online|COD" | null,        // For payment_inquiry
    "deliveryArea": "string" | null,                           // For delivery_inquiry
    "deliveryTime": "string" | null,                           // For delivery_inquiry
    "complaintType": "quality|delivery|service|wrong_item|damaged|other" | null, // For complaint
    "refundReason": "string" | null,                          // For refund_request
    "refundAmount": "number" | null,                          // For refund_request
    "feedbackType": "positive|negative|neutral" | null,       // For feedback
    "feedbackRating": "number (1-5)" | null,                 // For feedback
    "returnReason": "string" | null,                         // For return_request
    "returnItem": "string" | null,                           // For return_request
    "accountField": "address|phone|email|name|other" | null,  // For account_inquiry
    "previousOrderNumber": "ORD-123" | null                   // For repeat_order
  },
```

**Verification:** Check that the prompt still compiles and the JSON schema is valid.

---

### Step 3: Update Fallback Keyword Detection

**File:** `backend/src/services/intentClassificationService.ts`

**Location:** `keywordBasedIntentDetection()` function (starts around line 546)

**Changes Required:**

#### 3.1: Add Priority 1 Intent Keywords

**Location:** After PRIORITY 1 (product_inquiry) check, before PRIORITY 2 (support)

**Find:**
```typescript
  // PRIORITY 1: Product inquiry (check FIRST - highest priority)
  // [existing code...]
  
  // PRIORITY 2: Support
```

**Add before PRIORITY 2:**
```typescript
  // PRIORITY 2: Payment inquiry (NEW)
  if (lower.includes('payment') || lower.includes('pay') || 
      lower.includes('cash') || lower.includes('upi') || 
      lower.includes('cod') || lower.includes('online payment') ||
      lower.includes('cash kodukalam') || lower.includes('payment pannalam') ||
      lower.includes('cash kodbeku') || lower.includes('payment maadbeku') ||
      lower.includes('cash kodukkam') || lower.includes('payment cheyyam') ||
      lower.includes('cash ivvachu') || lower.includes('payment cheyachu') ||
      lower.includes('payment method') || lower.includes('how to pay')) {
    primaryIntent = 'payment_inquiry';
    confidence = 0.85;
  }
  // PRIORITY 3: Delivery inquiry (NEW)
  else if (lower.includes('deliver') || lower.includes('delivery') || 
           lower.includes('shipping') || lower.includes('delivery time') ||
           lower.includes('free delivery') || lower.includes('delivery cost') ||
           lower.includes('delivery irukka') || lower.includes('delivery ideya') ||
           lower.includes('delivery unda') || lower.includes('delivery undha') ||
           lower.includes('evlo time la varum') || lower.includes('yestu time ge barutte') ||
           lower.includes('ethra time il varum') || lower.includes('enta time ki vastundi') ||
           lower.includes('deliver to') || lower.includes('delivery area')) {
    primaryIntent = 'delivery_inquiry';
    confidence = 0.85;
  }
  // PRIORITY 4: Complaint (NEW)
  else if (lower.includes('complaint') || lower.includes('issue') || 
           lower.includes('problem') || lower.includes('wrong') ||
           lower.includes('damaged') || lower.includes('broken') ||
           lower.includes('bad quality') || lower.includes('not working') ||
           lower.includes('disappointed') || lower.includes('poor') ||
           lower.includes('late') || lower.includes('delayed') ||
           lower.includes('missing') || lower.includes('incorrect')) {
    primaryIntent = 'complaint';
    confidence = 0.8;
  }
  // PRIORITY 5: Refund request (NEW)
  else if (lower.includes('refund') || lower.includes('return money') ||
           lower.includes('money back') || lower.includes('reimburse') ||
           lower.includes('refund venum') || lower.includes('money back venum') ||
           lower.includes('refund beku') || lower.includes('money back beku') ||
           lower.includes('refund vende') || lower.includes('money back vende') ||
           lower.includes('refund kavali') || lower.includes('money back kavali')) {
    primaryIntent = 'refund_request';
    confidence = 0.8;
  }
  // PRIORITY 6: Support
```

#### 3.2: Add Priority 2 Intent Keywords

**Location:** After PRIORITY 12 (confirm_order), before PRIORITY 13 (product inquiry fallback)

**Find:**
```typescript
  // PRIORITY 12: Confirm order (lowest priority - only if explicit confirmation)
  else if ((lower.includes('confirm') || lower.includes('yes') || lower.includes('ok')) && 
           !hasProductInquiryKeyword) {
    primaryIntent = 'confirm_order';
    confidence = 0.6;
  }
  // PRIORITY 13: Product inquiry fallback (if product name detected)
```

**Add before PRIORITY 13:**
```typescript
  // PRIORITY 13: Feedback (NEW - Priority 2)
  else if (lower.includes('feedback') || lower.includes('review') ||
           lower.includes('rating') || lower.includes('stars') ||
           (lower.includes('thank') && lower.includes('you')) ||
           lower.includes('great') || lower.includes('excellent') ||
           lower.includes('satisfied') || lower.includes('happy') ||
           lower.includes('nandri') || lower.includes('dhanyavadagalu') ||
           lower.includes('romba nalla') || lower.includes('super') ||
           lower.includes('amazing') || lower.includes('wonderful') ||
           lower.includes('perfect') || lower.includes('loved it')) {
    primaryIntent = 'feedback';
    confidence = 0.75;
  }
  // PRIORITY 14: Return request (NEW - Priority 2)
  else if ((lower.includes('return') && !lower.includes('money')) ||
           lower.includes('exchange') || lower.includes('replace') ||
           lower.includes('swap') || lower.includes('send back') ||
           lower.includes('return pannanum') || lower.includes('exchange pannanum') ||
           lower.includes('return maadi') || lower.includes('exchange maadi') ||
           lower.includes('return cheyyanam') || lower.includes('exchange cheyyanam') ||
           lower.includes('return cheyali') || lower.includes('exchange cheyali')) {
    primaryIntent = 'return_request';
    confidence = 0.75;
  }
  // PRIORITY 15: Account inquiry (NEW - Priority 2)
  else if (lower.includes('account') || lower.includes('profile') ||
           lower.includes('update address') || lower.includes('change phone') ||
           lower.includes('my details') || lower.includes('personal information') ||
           lower.includes('update profile') || lower.includes('change address') ||
           lower.includes('update phone') || lower.includes('my account')) {
    primaryIntent = 'account_inquiry';
    confidence = 0.7;
  }
  // PRIORITY 16: Repeat order (NEW - Priority 2)
  else if (lower.includes('repeat') || lower.includes('reorder') ||
           lower.includes('same as last') || lower.includes('again') ||
           lower.includes('previous order') || lower.includes('last time') ||
           lower.includes('order again') || lower.includes('same order') ||
           lower.includes('repeat pannanum') || lower.includes('repeat maadi')) {
    primaryIntent = 'repeat_order';
    confidence = 0.7;
  }
  // PRIORITY 17: Product inquiry fallback (if product name detected)
```

**Verification:** Test the fallback function with sample messages to ensure keywords are detected correctly.

---

### Step 4: Update Context Fetcher Service

**File:** `backend/src/services/contextFetcherService.ts`

**Location:** `fetchRelevantData()` function, switch statement (starts around line 136)

**Changes Required:**

**Find the switch statement:**
```typescript
  // Determine what to fetch based on intent
  switch(intent) {
    case 'order_new':
      // ... existing code ...
      break;
    
    case 'order_update':
      // ... existing code ...
      break;
    
    case 'order_status':
      // ... existing code ...
      break;
    
    case 'product_inquiry':
      // ... existing code ...
      break;
    
    case 'greeting':
      // ... existing code ...
      break;
    
    case 'confirm_order':
      // ... existing code ...
      break;
    
    case 'cancel_order':
      // ... existing code ...
      break;
    
    default:
      // ... existing code ...
      break;
  }
```

**Add new cases BEFORE the default case:**

```typescript
    case 'payment_inquiry':
      dataToFetch.vendorConfig = true; // For payment methods
      dataToFetch.customerInsights = true; // For payment preferences
      break;
    
    case 'delivery_inquiry':
      dataToFetch.vendorConfig = true; // For delivery areas/time
      dataToFetch.customerInsights = true; // For customer location
      break;
    
    case 'complaint':
      dataToFetch.pendingOrder = true; // For order context
      dataToFetch.orderHistory = true; // For complaint history
      dataToFetch.vendorConfig = true; // For escalation info
      dataToFetch.customerInsights = true; // For customer info
      break;
    
    case 'refund_request':
      dataToFetch.pendingOrder = true; // Check order status
      dataToFetch.orderHistory = true; // Check refund history
      dataToFetch.vendorConfig = true; // For refund policy
      dataToFetch.customerInsights = true; // For customer info
      break;
    
    case 'feedback':
      dataToFetch.orderHistory = true; // For recent orders
      dataToFetch.vendorConfig = true; // For business info
      break;
    
    case 'return_request':
      dataToFetch.pendingOrder = true; // Check if order exists
      dataToFetch.orderHistory = true; // For return history
      dataToFetch.vendorConfig = true; // For return policy
      dataToFetch.productCatalog = true; // For exchange options
      break;
    
    case 'account_inquiry':
      dataToFetch.customerInsights = true; // For account info
      dataToFetch.vendorConfig = true; // For business info
      break;
    
    case 'repeat_order':
      dataToFetch.orderHistory = true; // Fetch last order
      dataToFetch.productCatalog = true; // Validate products still available
      dataToFetch.vendorConfig = true; // For business info
      dataToFetch.customerInsights = true; // For customer preferences
      break;
    
    default:
```

**Verification:** Ensure all new intents have appropriate data fetching logic.

---

### Step 5: Update Prompt Builder Service

**File:** `backend/src/services/promptBuilderService.ts`

**Location:** `getBasePromptForIntent()` function (starts around line 151)

**Changes Required:**

**Find the switch statement:**
```typescript
  // Add intent-specific instructions
  let intentInstructions = '';
  switch(intent) {
    case 'order_new':
      intentInstructions = '\n\nCurrent Task: Help the customer place a new order. Gather product details, quantities, and delivery information.';
      break;
    case 'order_update':
      intentInstructions = '\n\nCurrent Task: Help the customer update their existing order.';
      break;
    case 'order_status':
      intentInstructions = '\n\nCurrent Task: Provide information about the customer\'s order status and order history.\nCRITICAL: Use the Order History provided below to answer customer questions about their previous orders. If order history is provided, you MUST use it to give specific order details. DO NOT say you don\'t have access to order details if order history is provided.';
      break;
    case 'product_inquiry':
      intentInstructions = '\n\nCurrent Task: Answer questions about products, pricing, and availability.';
      break;
    case 'greeting':
      intentInstructions = '\n\nCurrent Task: Greet the customer warmly and offer assistance.';
      break;
  }
```

**Add new cases:**

```typescript
    case 'payment_inquiry':
      intentInstructions = '\n\nCurrent Task: Answer questions about payment methods, payment process, and payment options.\n- If payment methods are available in vendor config, list them clearly\n- Explain payment process if asked\n- Store customer payment preferences if mentioned';
      break;
    
    case 'delivery_inquiry':
      intentInstructions = '\n\nCurrent Task: Answer questions about delivery availability, delivery time, delivery areas, and delivery charges.\n- If delivery areas are available in vendor config, mention them\n- Provide delivery time estimates\n- Explain delivery charges and free delivery thresholds if applicable';
      break;
    
    case 'complaint':
      intentInstructions = '\n\nCurrent Task: Handle customer complaints professionally and empathetically.\n- Acknowledge the issue\n- Apologize if appropriate\n- Offer solutions (refund, replacement, etc.)\n- Escalate to vendor if needed\n- Log complaint details for tracking';
      break;
    
    case 'refund_request':
      intentInstructions = '\n\nCurrent Task: Process refund requests.\n- Check refund eligibility based on order status and vendor policy\n- Explain refund process\n- Initiate refund if eligible\n- Provide timeline for refund processing';
      break;
    
    case 'feedback':
      intentInstructions = '\n\nCurrent Task: Acknowledge and appreciate customer feedback.\n- Thank the customer for their feedback\n- Store feedback for vendor insights\n- Use positive feedback for testimonials if appropriate';
      break;
    
    case 'return_request':
      intentInstructions = '\n\nCurrent Task: Handle return and exchange requests.\n- Check return policy\n- Process return/exchange request\n- Provide return instructions\n- Generate return label if needed';
      break;
    
    case 'account_inquiry':
      intentInstructions = '\n\nCurrent Task: Help with account and profile management.\n- Update customer information as requested\n- Confirm updates with customer\n- Store changes in customer insights';
      break;
    
    case 'repeat_order':
      intentInstructions = '\n\nCurrent Task: Help customer repeat their previous order.\n- Fetch last order details from order history\n- Pre-fill order with previous items\n- Confirm with customer before placing\n- Check if products are still available';
      break;
```

**Also update `buildFocusedPrompt()` function to handle new intents:**

**Location:** Around line 67-90 (where order context is added)

**Add after order_status handling:**

```typescript
  // Add payment context for payment_inquiry
  if (intent === 'payment_inquiry' && fetchedData?.vendorConfig) {
    const paymentConfig = fetchedData.vendorConfig.paymentConfig;
    if (paymentConfig) {
      const methods = paymentConfig.methods || ['Cash', 'UPI', 'Online'];
      contextSections.push(`Available Payment Methods: ${methods.join(', ')}`);
      if (paymentConfig.defaultMethod) {
        contextSections.push(`Default Payment Method: ${paymentConfig.defaultMethod}`);
      }
      if (paymentConfig.codAvailable !== undefined) {
        contextSections.push(`COD Available: ${paymentConfig.codAvailable ? 'Yes' : 'No'}`);
      }
    }
  }
  
  // Add delivery context for delivery_inquiry
  if (intent === 'delivery_inquiry' && fetchedData?.vendorConfig) {
    const deliveryConfig = fetchedData.vendorConfig.deliveryConfig;
    if (deliveryConfig) {
      if (deliveryConfig.areas && Array.isArray(deliveryConfig.areas)) {
        contextSections.push(`Delivery Areas: ${deliveryConfig.areas.join(', ')}`);
      }
      if (deliveryConfig.time) {
        contextSections.push(`Delivery Time: ${deliveryConfig.time}`);
      }
      if (deliveryConfig.freeDeliveryThreshold) {
        contextSections.push(`Free Delivery Threshold: ₹${deliveryConfig.freeDeliveryThreshold}`);
      }
    }
  }
  
  // Add order history for repeat_order
  if (intent === 'repeat_order' && fetchedData?.orderHistory && fetchedData.orderHistory.length > 0) {
    const lastOrder = fetchedData.orderHistory[0];
    contextSections.push(`Last Order Details:\n${formatOrder(lastOrder)}\n\nUse this to pre-fill the repeat order.`);
  }
  
  // Add order context for complaint and refund_request
  if ((intent === 'complaint' || intent === 'refund_request') && fetchedData?.pendingOrder) {
    contextSections.push(`Order Context:\n${formatOrder(fetchedData.pendingOrder)}`);
  }
  
  // Add order history for complaint
  if (intent === 'complaint' && fetchedData?.orderHistory && fetchedData.orderHistory.length > 0) {
    contextSections.push(`Recent Orders:\n${formatOrderHistory(fetchedData.orderHistory.slice(0, 3))}`);
  }
```

**Verification:** Ensure prompt builder handles all new intents correctly.

---

### Step 6: Create Missing Service Functions

**Purpose:** Create helper functions referenced in orchestrator but may not exist yet.

#### 6.1: Create Complaint Logging Service

**File:** `backend/src/services/complaintService.ts` (NEW FILE)

**Create:**

```typescript
/**
 * Complaint Service
 * Handles logging and tracking customer complaints
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { IntentClassification } from '../types/multiStage.js';

export interface ComplaintLog {
  conversationId: string;
  vendorId: string;
  customerId: string;
  complaintType: string;
  description: string;
  orderNumber?: string | null;
  status: 'open' | 'resolved' | 'escalated';
  createdAt: Date;
}

/**
 * Log a customer complaint
 */
export async function logComplaint(
  conversationId: string,
  vendorId: string,
  intentResult: IntentClassification
): Promise<void> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true }
    });

    if (!conversation) {
      logger.warn({ conversationId }, 'Conversation not found for complaint logging');
      return;
    }

    const complaintType = intentResult.extractedInfo?.complaintType || 'other';
    const orderNumber = intentResult.extractedInfo?.orderNumber || null;

    // Log to database (using existing logging mechanism or create Complaint model)
    // For now, log to conversation memory or create a separate log entry
    logger.info({
      conversationId,
      vendorId,
      customerId: conversation.customerId,
      complaintType,
      orderNumber,
      intent: intentResult.primaryIntent,
      reasoning: intentResult.reasoning
    }, 'Customer complaint logged');

    // TODO: Create Complaint model in Prisma if needed for tracking
    // await prisma.complaint.create({ ... });
    
  } catch (error) {
    logger.error({ err: error, conversationId, vendorId }, 'Failed to log complaint');
  }
}

/**
 * Check if complaint should be escalated to vendor
 */
export async function shouldEscalateComplaint(
  complaintType: string,
  vendorId: string
): Promise<boolean> {
  // Escalate quality issues, wrong items, and service complaints
  const escalateTypes = ['quality', 'wrong_item', 'service'];
  return escalateTypes.includes(complaintType);
}
```

#### 6.2: Create Refund Eligibility Service

**File:** `backend/src/services/refundService.ts` (NEW FILE)

**Create:**

```typescript
/**
 * Refund Service
 * Handles refund eligibility checks and processing
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';

export interface RefundEligibility {
  eligible: boolean;
  reason: string;
  orderNumber?: string | null;
  refundAmount?: number | null;
  processingTime?: string;
}

/**
 * Check refund eligibility for a customer request
 */
export async function checkRefundEligibility(
  conversationId: string,
  vendorId: string,
  orderNumber?: string | null
): Promise<RefundEligibility> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true }
    });

    if (!conversation) {
      return {
        eligible: false,
        reason: 'Conversation not found'
      };
    }

    // Find relevant order
    let order = null;
    if (orderNumber) {
      order = await prisma.order.findFirst({
        where: {
          orderNumber,
          vendorId,
          customerId: conversation.customerId
        }
      });
    } else {
      // Find most recent order
      order = await prisma.order.findFirst({
        where: {
          vendorId,
          customerId: conversation.customerId
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!order) {
      return {
        eligible: false,
        reason: 'No order found'
      };
    }

    // Check order status - only pending/confirmed orders can be refunded
    const refundableStatuses = ['pending', 'confirmed'];
    if (!refundableStatuses.includes(order.status)) {
      return {
        eligible: false,
        reason: `Order status is ${order.status}. Only pending or confirmed orders can be refunded.`,
        orderNumber: order.orderNumber || null
      };
    }

    // Check time limit (e.g., within 7 days)
    const orderDate = new Date(order.createdAt);
    const daysSinceOrder = (Date.now() - orderDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceOrder > 7) {
      return {
        eligible: false,
        reason: 'Refund request is outside the 7-day window',
        orderNumber: order.orderNumber || null
      };
    }

    return {
      eligible: true,
      reason: 'Order is eligible for refund',
      orderNumber: order.orderNumber || null,
      refundAmount: order.totalAmount,
      processingTime: '3-5 business days'
    };

  } catch (error) {
    logger.error({ err: error, conversationId, vendorId }, 'Failed to check refund eligibility');
    return {
      eligible: false,
      reason: 'Error checking eligibility'
    };
  }
}
```

**Verification:** Ensure these services compile and can be imported.

---

### Step 7: Update Multi-Stage Orchestrator (Optional Enhancements)

**File:** `backend/src/services/multiStageOrchestrator.ts`

**Purpose:** Add specific handling for new intents if needed. The orchestrator should already work with new intents through context fetching, but you can add specific logic.

**Location:** `executeStage2()` method (around line 838)

**Optional Enhancement:** Add intent-specific data enrichment after fetching:

```typescript
// After fetching data, add intent-specific enrichment
if (context.intentResult?.primaryIntent === 'complaint') {
  // Import complaint service
  const { logComplaint, shouldEscalateComplaint } = await import('./complaintService.js');
  await logComplaint(context.conversationId, context.vendorId, context.intentResult);
  
  const complaintType = context.intentResult.extractedInfo?.complaintType || 'other';
  const shouldEscalate = await shouldEscalateComplaint(complaintType, context.vendorId);
  
  if (shouldEscalate) {
    // Add escalation flag to context
    data.escalationNeeded = true;
  }
}

if (context.intentResult?.primaryIntent === 'refund_request') {
  // Import refund service
  const { checkRefundEligibility } = await import('./refundService.js');
  const eligibility = await checkRefundEligibility(
    context.conversationId,
    context.vendorId,
    context.intentResult.extractedInfo?.orderNumber || null
  );
  
  // Add eligibility info to context
  data.refundEligibility = eligibility;
}
```

**Note:** This is optional. The system will work without these enhancements, but they provide better context for AI responses.

---

### Step 8: Add Comprehensive Test Cases

**File:** `backend/scripts/test-messages/intent-classification-test-cases.json`

**Add test cases for all new intents:**

```json
{
  "testCases": [
    // ... existing test cases ...
    
    // ========== PAYMENT INQUIRY TEST CASES ==========
    {
      "message": "What payment methods do you accept?",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Payment method question - English"
    },
    {
      "message": "Can I pay by cash?",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Cash payment question"
    },
    {
      "message": "Do you accept UPI?",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "UPI payment question"
    },
    {
      "message": "online payment pannalam",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Tamil - Can do online payment"
    },
    {
      "message": "cash kodukalam",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Tamil - Can give cash"
    },
    {
      "message": "cash kodbeku",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Kannada - Need cash"
    },
    {
      "message": "What's the payment process?",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Payment process question"
    },
    {
      "message": "Is COD available?",
      "expectedPrimaryIntent": "payment_inquiry",
      "expectedSecondaryIntents": [],
      "description": "COD availability question"
    },
    
    // ========== DELIVERY INQUIRY TEST CASES ==========
    {
      "message": "Do you deliver to Coimbatore?",
      "expectedPrimaryIntent": "delivery_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Delivery location question"
    },
    {
      "message": "What's the delivery time?",
      "expectedPrimaryIntent": "delivery_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Delivery time question"
    },
    {
      "message": "Is free delivery available?",
      "expectedPrimaryIntent": "delivery_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Free delivery question"
    },
    {
      "message": "free delivery irukka",
      "expectedPrimaryIntent": "delivery_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Tamil - Is free delivery available"
    },
    {
      "message": "evlo time la varum",
      "expectedPrimaryIntent": "delivery_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Tamil - In how much time will it come"
    },
    {
      "message": "How long does delivery take?",
      "expectedPrimaryIntent": "delivery_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Delivery duration question"
    },
    {
      "message": "Do you deliver to my area?",
      "expectedPrimaryIntent": "delivery_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Delivery area question"
    },
    
    // ========== COMPLAINT TEST CASES ==========
    {
      "message": "My order was damaged",
      "expectedPrimaryIntent": "complaint",
      "expectedSecondaryIntents": [],
      "description": "Complaint about damaged order"
    },
    {
      "message": "Wrong item received",
      "expectedPrimaryIntent": "complaint",
      "expectedSecondaryIntents": [],
      "description": "Complaint about wrong item"
    },
    {
      "message": "Quality is poor",
      "expectedPrimaryIntent": "complaint",
      "expectedSecondaryIntents": [],
      "description": "Quality complaint"
    },
    {
      "message": "Order is late",
      "expectedPrimaryIntent": "complaint",
      "expectedSecondaryIntents": [],
      "description": "Delivery delay complaint"
    },
    {
      "message": "Item is broken",
      "expectedPrimaryIntent": "complaint",
      "expectedSecondaryIntents": [],
      "description": "Broken item complaint"
    },
    {
      "message": "Not satisfied with service",
      "expectedPrimaryIntent": "complaint",
      "expectedSecondaryIntents": [],
      "description": "Service complaint"
    },
    
    // ========== REFUND REQUEST TEST CASES ==========
    {
      "message": "I want a refund",
      "expectedPrimaryIntent": "refund_request",
      "expectedSecondaryIntents": [],
      "description": "Refund request"
    },
    {
      "message": "Return my money",
      "expectedPrimaryIntent": "refund_request",
      "expectedSecondaryIntents": [],
      "description": "Money back request"
    },
    {
      "message": "Refund for damaged item",
      "expectedPrimaryIntent": "refund_request",
      "expectedSecondaryIntents": [],
      "description": "Refund for specific reason"
    },
    {
      "message": "refund venum",
      "expectedPrimaryIntent": "refund_request",
      "expectedSecondaryIntents": [],
      "description": "Tamil - Need refund"
    },
    {
      "message": "Give me my money back",
      "expectedPrimaryIntent": "refund_request",
      "expectedSecondaryIntents": [],
      "description": "Money back request"
    },
    
    // ========== FEEDBACK TEST CASES ==========
    {
      "message": "Great service, thank you!",
      "expectedPrimaryIntent": "feedback",
      "expectedSecondaryIntents": [],
      "description": "Positive feedback"
    },
    {
      "message": "Product was excellent",
      "expectedPrimaryIntent": "feedback",
      "expectedSecondaryIntents": [],
      "description": "Product feedback"
    },
    {
      "message": "5 stars",
      "expectedPrimaryIntent": "feedback",
      "expectedSecondaryIntents": [],
      "description": "Rating feedback"
    },
    {
      "message": "Very happy with order",
      "expectedPrimaryIntent": "feedback",
      "expectedSecondaryIntents": [],
      "description": "Satisfaction feedback"
    },
    {
      "message": "nandri",
      "expectedPrimaryIntent": "feedback",
      "expectedSecondaryIntents": [],
      "description": "Tamil - Thank you (after service)"
    },
    
    // ========== RETURN REQUEST TEST CASES ==========
    {
      "message": "I want to return this",
      "expectedPrimaryIntent": "return_request",
      "expectedSecondaryIntents": [],
      "description": "Return request"
    },
    {
      "message": "Can I exchange this?",
      "expectedPrimaryIntent": "return_request",
      "expectedSecondaryIntents": [],
      "description": "Exchange request"
    },
    {
      "message": "Return item",
      "expectedPrimaryIntent": "return_request",
      "expectedSecondaryIntents": [],
      "description": "Simple return request"
    },
    {
      "message": "Swap this for another size",
      "expectedPrimaryIntent": "return_request",
      "expectedSecondaryIntents": [],
      "description": "Exchange for different size"
    },
    
    // ========== ACCOUNT INQUIRY TEST CASES ==========
    {
      "message": "Update my address",
      "expectedPrimaryIntent": "account_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Address update request"
    },
    {
      "message": "Change my phone number",
      "expectedPrimaryIntent": "account_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Phone update request"
    },
    {
      "message": "My account details",
      "expectedPrimaryIntent": "account_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Account details request"
    },
    {
      "message": "Update profile",
      "expectedPrimaryIntent": "account_inquiry",
      "expectedSecondaryIntents": [],
      "description": "Profile update request"
    },
    
    // ========== REPEAT ORDER TEST CASES ==========
    {
      "message": "Same as last time",
      "expectedPrimaryIntent": "repeat_order",
      "expectedSecondaryIntents": [],
      "description": "Repeat last order"
    },
    {
      "message": "Repeat my last order",
      "expectedPrimaryIntent": "repeat_order",
      "expectedSecondaryIntents": [],
      "description": "Explicit repeat request"
    },
    {
      "message": "Order again",
      "expectedPrimaryIntent": "repeat_order",
      "expectedSecondaryIntents": [],
      "description": "Reorder request"
    },
    {
      "message": "Same order as before",
      "expectedPrimaryIntent": "repeat_order",
      "expectedSecondaryIntents": [],
      "description": "Same order request"
    },
    {
      "message": "I want the same thing",
      "expectedPrimaryIntent": "repeat_order",
      "expectedSecondaryIntents": [],
      "description": "Same items request"
    }
  ]
}
```

**Verification:** Run test suite to ensure all test cases pass.

---

## Database Schema Considerations

### Option 1: JSON Fields in Vendor Table (Recommended)

Add to `Vendor` model:
```prisma
paymentConfig Json? // { methods: ["Cash", "UPI", "Online"], defaultMethod: "UPI", codAvailable: true }
deliveryConfig Json? // { areas: ["Area1", "Area2"], time: "2-3 hours", freeDeliveryThreshold: 500 }
```

### Option 2: Use Existing Fields

Store payment/delivery info in:
- `aiSystemPrompt` (vendor instructions)
- `aiContentImportantInstructions` (vendor-specific instructions)
- Vendor can configure via admin panel

### Option 3: Create Separate Models (If Needed)

Only if you need complex tracking:
```prisma
model Complaint {
  id            String   @id @default(uuid())
  conversationId String
  vendorId      String
  customerId    String
  complaintType String
  description   String
  orderNumber   String?
  status        String   @default("open")
  createdAt     DateTime @default(now())
  
  conversation  Conversation @relation(fields: [conversationId], references: [id])
  vendor        Vendor @relation(fields: [vendorId], references: [id])
  
  @@map("Complaint")
}
```

**Recommendation:** Start with Option 1 or 2. Add Option 3 only if you need detailed complaint tracking.

---

## Service Functions to Create

### Already Created in Step 6:
- ✅ `logComplaint()` - `backend/src/services/complaintService.ts`
- ✅ `checkRefundEligibility()` - `backend/src/services/refundService.ts`

### Additional Functions (Optional):

**File:** `backend/src/services/complaintService.ts`

Add:
```typescript
export async function escalateComplaint(complaintId: string, vendorId: string): Promise<void> {
  // Notify vendor about complaint
  // Could use notification service or webhook
}
```

**File:** `backend/src/services/refundService.ts`

Add:
```typescript
export async function processRefund(orderNumber: string, amount: number): Promise<void> {
  // Process actual refund
  // Update order status
  // Create refund record
}
```

---

## Follow-Up Question Handling

The system already supports follow-up questions through:

1. **`needsMoreContext`** flag in `IntentClassification`
   - Set to `true` when AI needs more information
   - Used by orchestrator to trigger clarification

2. **`needsClarification`** flag in `PrimaryAIResponse`
   - Set to `true` when response needs refinement
   - Triggers Stage 5 (Data Enrichment) and Stage 6 (Response Refinement)

3. **Clarification Strategy** (Stage 4)
   - AI determines what information is missing
   - Asks one question at a time
   - Uses defaults when appropriate

### For New Intents:

**Payment Inquiry:**
- If payment method not specified → Ask: "Which payment method would you prefer: Cash, UPI, or Online?"
- Use `needsMoreContext: true` if payment method unclear

**Delivery Inquiry:**
- If delivery area not specified → Ask: "Which area would you like delivery to?"
- Use `needsMoreContext: true` if area unclear

**Complaint:**
- If complaint details unclear → Ask: "Could you please provide more details about the issue?"
- Use `needsMoreContext: true` if details insufficient

**Refund Request:**
- If order number not specified → Ask: "Which order would you like a refund for?"
- Use `needsMoreContext: true` if order unclear

**Account Inquiry:**
- If field to update unclear → Ask: "What would you like to update: address, phone, or email?"
- Use `needsMoreContext: true` if field unclear

**Repeat Order:**
- If previous order unclear → Ask: "Would you like to repeat your last order?"
- Use `needsMoreContext: true` if order history unavailable

---

## Testing Strategy

### Phase 1: Unit Testing

1. **Test Type Definitions:**
   ```bash
   cd backend && npm run build
   ```
   - Should compile without errors
   - All new intent types should be recognized

2. **Test Keyword Detection:**
   ```bash
   # Run test script
   npm run test:intent-classification
   ```
   - All keyword patterns should match
   - Confidence scores should be appropriate

3. **Test Context Fetching:**
   - Manually test each new intent
   - Verify correct data is fetched

### Phase 2: Integration Testing

1. **Test Full Flow:**
   - Send test messages for each new intent
   - Verify intent classification
   - Verify context fetching
   - Verify prompt building
   - Verify AI response

2. **Test Edge Cases:**
   - Multilingual messages
   - Multiple intents in one message
   - Ambiguous messages
   - Follow-up questions

### Phase 3: Regression Testing

1. **Test Existing Intents:**
   - Ensure no regressions
   - Verify existing intents still work
   - Check accuracy hasn't decreased

2. **Test "Other" Category:**
   - Verify "other" usage decreased
   - Check that new intents are not misclassified as "other"

### Test Execution:

```bash
# Run intent classification tests
cd backend
npm run test:intent-classification

# Run full test suite
npm test

# Manual testing
npm run dev
# Send test messages via WhatsApp or API
```

---

## Deployment Checklist

### Pre-Deployment:

- [ ] All code changes completed
- [ ] TypeScript compiles without errors
- [ ] All tests pass
- [ ] Test cases added for all new intents
- [ ] Database migrations applied (if needed)
- [ ] Service functions created and tested
- [ ] Context fetcher updated for all intents
- [ ] Prompt builder updated for all intents
- [ ] Documentation updated

### Deployment Steps:

1. **Deploy to Test Environment:**
   ```bash
   # Build
   npm run build
   
   # Run migrations (if needed)
   npx prisma migrate deploy
   
   # Deploy to test
   ```

2. **Test in Test Environment:**
   - Send test messages
   - Verify intent classification
   - Check logs for errors
   - Monitor metrics

3. **Deploy to Production:**
   - Gradual rollout (feature flag)
   - Monitor classification distribution
   - Track accuracy metrics
   - Collect feedback

4. **Post-Deployment:**
   - Monitor "other" category usage
   - Track accuracy by intent
   - Collect real-world examples
   - Refine prompts based on data

### Rollback Plan:

If issues arise:
1. Disable new intents via feature flag
2. Revert to previous prompt version
3. Analyze issues
4. Fix and retry

---

## Troubleshooting

### Issue: New intents not being classified

**Symptoms:**
- Messages that should be new intents are classified as "other"
- Keyword detection not working

**Solutions:**
1. Check prompt includes new intent definitions
2. Verify keyword patterns in fallback function
3. Check test cases are correct
4. Review AI response for reasoning
5. Check confidence thresholds

### Issue: Existing intents accuracy decreased

**Symptoms:**
- Existing intents misclassified
- Accuracy dropped

**Solutions:**
1. Check priority order in prompt
2. Verify distinction rules
3. Review test cases for regressions
4. Adjust prompt if needed
5. Check keyword detection priority

### Issue: Too many "other" classifications

**Symptoms:**
- "Other" category still high (>15%)
- New intents not catching messages

**Solutions:**
1. Add more keyword patterns
2. Improve prompt examples
3. Add more test cases
4. Review AI reasoning for patterns
5. Lower confidence thresholds if needed

### Issue: Context fetching errors

**Symptoms:**
- Errors when fetching data for new intents
- Missing data in responses

**Solutions:**
1. Check context fetcher switch statement
2. Verify all new intents have cases
3. Check database queries
4. Verify vendor config structure

### Issue: Prompt builder errors

**Symptoms:**
- Errors building prompts for new intents
- Missing context in prompts

**Solutions:**
1. Check prompt builder switch statement
2. Verify all new intents have cases
3. Check context sections are added
4. Verify data is available

---

## Quick Reference

### Intent Priority Order (in Prompt)

1. `product_inquiry` (highest)
2. `payment_inquiry` (NEW)
3. `delivery_inquiry` (NEW)
4. `order_status`
5. `complaint` (NEW)
6. `refund_request` (NEW)
7. `order_new`
8. `order_update`
9. `support`
10. `greeting`
11. `cancel_order`
12. `confirm_order`
13. `feedback` (NEW)
14. `return_request` (NEW)
15. `account_inquiry` (NEW)
16. `repeat_order` (NEW)
17. `other` (fallback)

### Files Modified

1. `backend/src/types/multiStage.ts` - Type definitions
2. `backend/src/services/intentClassificationService.ts` - Prompt and keyword detection
3. `backend/src/services/contextFetcherService.ts` - Context fetching
4. `backend/src/services/promptBuilderService.ts` - Prompt building
5. `backend/src/services/multiStageOrchestrator.ts` - Orchestrator (optional)
6. `backend/scripts/test-messages/intent-classification-test-cases.json` - Test cases

### Files Created

1. `backend/src/services/complaintService.ts` - Complaint logging
2. `backend/src/services/refundService.ts` - Refund eligibility

### Key Functions

- `classifyIntent()` - Main classification function
- `keywordBasedIntentDetection()` - Fallback keyword detection
- `fetchRelevantData()` - Context fetching
- `buildFocusedPrompt()` - Prompt building
- `logComplaint()` - Complaint logging
- `checkRefundEligibility()` - Refund checking

---

## Support & Questions

For questions or issues:
1. Check main documentation: `docs/INTENT_CLASSIFICATION_EXPANSION.md`
2. Review test cases: `backend/scripts/test-messages/intent-classification-test-cases.json`
3. Check implementation: `backend/src/services/intentClassificationService.ts`
4. Review this guide for troubleshooting

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-13 | AI Assistant | Initial guide created |
| 2.0 | 2025-12-13 | AI Assistant | Comprehensive update with all details |

---

**Next Steps:**
1. Review this guide thoroughly
2. Start with Step 0 (Database Schema) if needed
3. Follow steps 1-8 in order
4. Test after each step
5. Deploy to test environment
6. Monitor and refine
