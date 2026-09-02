# Intent Expansion Test Cases

**Test Cases for New Intent Classification**

> **Architecture note (2026-09-02):** These test cases target `intentClassificationService.ts` (OLD multi-stage pipeline), which is **no longer wired to live WhatsApp traffic**. Production now runs `backend/src/conversation/*`. See `INTENT_CLASSIFICATION_EXPANSION.md` for details and `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for the current architecture.

---

## Priority 1: High-Impact Intents

### Payment Inquiry (`payment_inquiry`)

#### English Test Cases
```json
{
  "message": "What payment methods do you accept?",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Payment method question"
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
  "message": "What payment options are available?",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Payment options question"
},
{
  "message": "Is COD available?",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "COD availability question"
},
{
  "message": "How can I pay?",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Payment process question"
},
{
  "message": "Do you take online payment?",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Online payment question"
},
{
  "message": "Payment process enna",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Tanglish - What payment process"
}
```

#### Tamil Test Cases
```json
{
  "message": "cash kodukalam",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Tamil - Can give cash"
},
{
  "message": "payment pannalam",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Tamil - Can do payment"
},
{
  "message": "online payment pannalam",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Tamil - Can do online payment"
},
{
  "message": "payment method enna",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Tamil - What payment method"
}
```

#### Kannada Test Cases
```json
{
  "message": "cash kodbeku",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Kannada - Want to give cash"
},
{
  "message": "payment maadbeku",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Kannada - Want to do payment"
}
```

#### Malayalam Test Cases
```json
{
  "message": "cash kodukkam",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Malayalam - Can give cash"
},
{
  "message": "payment cheyyam",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Malayalam - Can do payment"
}
```

#### Telugu Test Cases
```json
{
  "message": "cash ivvachu",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Telugu - Can give cash"
},
{
  "message": "payment cheyachu",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Telugu - Can do payment"
}
```

---

### Delivery Inquiry (`delivery_inquiry`)

#### English Test Cases
```json
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
  "message": "How long does delivery take?",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Delivery duration question"
},
{
  "message": "Is free delivery available?",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Free delivery question"
},
{
  "message": "What's the delivery cost?",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Delivery cost question"
},
{
  "message": "Do you deliver to my area?",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Delivery area question"
}
```

#### Tamil Test Cases
```json
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
  "message": "delivery time enna",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Tamil - What delivery time"
},
{
  "message": "enna area ku deliver pannuvinga",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Tamil - Do you deliver to which area"
}
```

#### Kannada Test Cases
```json
{
  "message": "free delivery ideya",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Kannada - Is free delivery available"
},
{
  "message": "yestu time ge barutte",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Kannada - In how much time will it come"
}
```

#### Malayalam Test Cases
```json
{
  "message": "free delivery unda",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Malayalam - Is free delivery available"
},
{
  "message": "ethra time il varum",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Malayalam - In how much time will it come"
}
```

#### Telugu Test Cases
```json
{
  "message": "free delivery undha",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Telugu - Is free delivery available"
},
{
  "message": "enta time ki vastundi",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Telugu - In how much time will it come"
}
```

---

### Complaint (`complaint`)

#### English Test Cases
```json
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
{
  "message": "This is not what I ordered",
  "expectedPrimaryIntent": "complaint",
  "expectedSecondaryIntents": [],
  "description": "Wrong order complaint"
}
```

#### Multilingual Test Cases
```json
{
  "message": "order damage aayirunnu",
  "expectedPrimaryIntent": "complaint",
  "expectedSecondaryIntents": [],
  "description": "Malayalam - Order was damaged"
},
{
  "message": "wrong item vandhuchu",
  "expectedPrimaryIntent": "complaint",
  "expectedSecondaryIntents": [],
  "description": "Tamil - Wrong item came"
}
```

---

### Refund Request (`refund_request`)

#### English Test Cases
```json
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
  "message": "Give me my money back",
  "expectedPrimaryIntent": "refund_request",
  "expectedSecondaryIntents": [],
  "description": "Money refund request"
},
{
  "message": "I need a refund",
  "expectedPrimaryIntent": "refund_request",
  "expectedSecondaryIntents": [],
  "description": "Refund need statement"
}
```

#### Multilingual Test Cases
```json
{
  "message": "refund venum",
  "expectedPrimaryIntent": "refund_request",
  "expectedSecondaryIntents": [],
  "description": "Tamil - Want refund"
},
{
  "message": "money back venum",
  "expectedPrimaryIntent": "refund_request",
  "expectedSecondaryIntents": [],
  "description": "Tamil - Want money back"
}
```

---

## Priority 2: Medium-Impact Intents

### Feedback (`feedback`)

#### English Test Cases
```json
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
  "message": "Thank you so much",
  "expectedPrimaryIntent": "feedback",
  "expectedSecondaryIntents": [],
  "description": "Appreciation (after service)"
}
```

#### Multilingual Test Cases
```json
{
  "message": "nandri",
  "expectedPrimaryIntent": "feedback",
  "expectedSecondaryIntents": [],
  "description": "Tamil - Thank you (after service)"
},
{
  "message": "romba nalla irundhuchu",
  "expectedPrimaryIntent": "feedback",
  "expectedSecondaryIntents": [],
  "description": "Tamil - Was very good"
}
```

---

### Return Request (`return_request`)

#### English Test Cases
```json
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
}
```

---

### Account Inquiry (`account_inquiry`)

#### English Test Cases
```json
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
  "description": "Account information request"
},
{
  "message": "Update profile",
  "expectedPrimaryIntent": "account_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Profile update request"
}
```

---

### Repeat Order (`repeat_order`)

#### English Test Cases
```json
{
  "message": "Same as last time",
  "expectedPrimaryIntent": "repeat_order",
  "expectedSecondaryIntents": [],
  "description": "Repeat previous order"
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
  "description": "Same order reference"
}
```

---

## Edge Cases & Distinctions

### Payment Inquiry vs Order New
```json
{
  "message": "What payment methods do you accept?",
  "expectedPrimaryIntent": "payment_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Payment question - should be payment_inquiry, not order_new"
},
{
  "message": "I want to order 2kg brownie",
  "expectedPrimaryIntent": "order_new",
  "expectedSecondaryIntents": [],
  "description": "Order statement - should be order_new, not payment_inquiry"
}
```

### Delivery Inquiry vs Order Status
```json
{
  "message": "Do you deliver to Coimbatore?",
  "expectedPrimaryIntent": "delivery_inquiry",
  "expectedSecondaryIntents": [],
  "description": "Delivery service question - should be delivery_inquiry"
},
{
  "message": "Where is my order?",
  "expectedPrimaryIntent": "order_status",
  "expectedSecondaryIntents": [],
  "description": "Order tracking - should be order_status"
}
```

### Complaint vs Refund Request
```json
{
  "message": "My order was damaged",
  "expectedPrimaryIntent": "complaint",
  "expectedSecondaryIntents": [],
  "description": "Problem report - should be complaint"
},
{
  "message": "I want a refund",
  "expectedPrimaryIntent": "refund_request",
  "expectedSecondaryIntents": [],
  "description": "Money request - should be refund_request"
}
```

### Feedback vs Greeting
```json
{
  "message": "Thank you so much",
  "expectedPrimaryIntent": "feedback",
  "expectedSecondaryIntents": [],
  "description": "Thank you after service - should be feedback",
  "context": {
    "conversationStage": "closing"
  }
},
{
  "message": "Hi",
  "expectedPrimaryIntent": "greeting",
  "expectedSecondaryIntents": [],
  "description": "Opening greeting - should be greeting",
  "context": {
    "conversationStage": "greeting"
  }
}
```

---

## Test Case Statistics

### Priority 1 Intents
- `payment_inquiry`: 30+ test cases
- `delivery_inquiry`: 25+ test cases
- `complaint`: 20+ test cases
- `refund_request`: 15+ test cases
- **Total Priority 1:** ~90 test cases

### Priority 2 Intents
- `feedback`: 20+ test cases
- `return_request`: 15+ test cases
- `account_inquiry`: 15+ test cases
- `repeat_order`: 15+ test cases
- **Total Priority 2:** ~65 test cases

### Grand Total
- **New Test Cases:** ~155
- **Existing Test Cases:** 194
- **Total After Expansion:** ~349 test cases

---

## Validation Criteria

### Accuracy Targets
- Priority 1 intents: **85%+ accuracy**
- Priority 2 intents: **80%+ accuracy**
- Overall system: **85%+ accuracy** (up from 71.13%)

### Coverage Goals
- Each intent: Minimum 15 test cases
- Multilingual coverage: All major languages
- Edge cases: Distinction tests for similar intents
- Real-world scenarios: Natural customer messages

---

## Usage

Add these test cases to:
`backend/scripts/test-messages/intent-classification-test-cases.json`

Run tests:
```bash
npm run test:intent-classification
```

Analyze results:
- Check accuracy by intent type
- Review failures and adjust prompts
- Measure "other" category reduction

