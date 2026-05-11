# Order Flow with Delivery Date Settings

## Overview

This document describes the order flow when delivery date settings are enabled for a vendor.

## Flow Diagram

```
Customer Message: "I want 2 boxes of brownies"
    ↓
Intent Classification: order_new
    ↓
Context Fetching: Fetch vendor order settings
    ↓
Check: category === "food" && askForPreferredDeliveryDate === true
    ↓
Check: deliveryDate in memory/conversation state?
    ↓
    ├─ NO → AI asks: "What's your preferred delivery date?"
    │         ↓
    │   Customer: "Tomorrow evening"
    │         ↓
    │   Extract delivery date → Store in memory
    │         ↓
    └─ YES → Continue with order
              ↓
    Collect: Products, Quantities, Customer Name, Delivery Address
              ↓
    Validate: All required fields present?
              ↓
    ├─ NO → Ask for missing information
    │         ↓
    └─ YES → Confirm order with delivery date
              ↓
    Create Order: Include estimatedDelivery date
              ↓
    AI Response: "Perfect! Your order is confirmed. 
                  We'll start preparing your order right away!
                  Delivery: Tomorrow evening"
```

## Detailed Flow

### Stage 1: Order Intent Detection

**Customer Message**: "I want 2 boxes of brownies"

**Process**:
1. Intent classification identifies `order_new`
2. Context fetcher fetches vendor order settings
3. System checks if delivery date is required

**Vendor Settings Check**:
```typescript
if (vendor.category === "food" && vendor.askForPreferredDeliveryDate === true) {
  // Delivery date is required
}
```

---

### Stage 2: Delivery Date Collection

**Scenario A: Delivery Date Not Provided**

**AI Prompt**: Includes instruction to ask for delivery date:
```
⚠️ DELIVERY DATE REQUIRED:
- Preferred Delivery Date: NOT PROVIDED
ACTION REQUIRED: You MUST ask for the customer's preferred delivery date.
Ask naturally: "What's your preferred delivery date?" or "When would you like your order delivered?"
Accept formats: "tomorrow", "tomorrow evening", "31st October", "next Monday", etc.
```

**AI Response**: "Great! What's your preferred delivery date?"

**Customer Response**: "Tomorrow evening"

**Process**:
1. Extract delivery date from message
2. Parse relative date ("tomorrow") to absolute date
3. Store in conversation memory
4. Store in conversation state

---

**Scenario B: Delivery Date Already Provided**

**If delivery date exists in**:
- Conversation memory (`customerPreferences.deliveryDate`)
- Conversation state (`order.deliveryDate`)
- Customer message (extracted)

**Process**: Skip asking, use existing delivery date

---

### Stage 3: Order Information Collection

**Required Information**:
1. ✅ Products and quantities
2. ✅ Customer name
3. ✅ Delivery address
4. ✅ Delivery date (if required)

**AI Process**:
- Checks each field in memory/conversation state
- Asks only for missing critical information
- Uses existing information when available

---

### Stage 4: Order Validation

**Validation Checks**:
```typescript
// Check delivery date requirement
if (vendor.category === "food" && vendor.askForPreferredDeliveryDate === true) {
  if (!order.deliveryDate && !order.estimatedDelivery) {
    // Validation error: delivery date required
    errors.push({
      field: 'deliveryDate',
      error: 'Preferred delivery date is required. Please provide your preferred delivery date.',
      severity: 'error'
    });
  }
}
```

**If Validation Fails**:
- AI asks for missing information
- Order cannot be confirmed until all required fields are present

---

### Stage 5: Order Confirmation

**Customer**: "Yes, confirm my order"

**AI Response Includes**:
1. Order summary (items, quantities, total)
2. Delivery address
3. **Delivery date** (if provided)
4. **Preparation time message** (from `orderPreparationConfig`)

**Example Response**:
```
Perfect! Your order is confirmed! 🎉

Order Summary:
- 2 boxes of brownies
- Total: ₹500

Delivery Details:
- Address: [Customer Address]
- Date: Tomorrow evening
- We'll start preparing your order right away!

Thank you for your order! ❤️
```

---

### Stage 6: Order Creation

**Order Data**:
```typescript
{
  vendorId: "...",
  customerId: "...",
  conversationId: "...",
  orderNumber: "ORD-123",
  items: [...],
  totalAmount: 50000, // in paise
  deliveryAddress: "...",
  estimatedDelivery: new Date("2025-01-29T18:00:00Z"), // Parsed from "tomorrow evening"
  status: "pending"
}
```

**Process**:
1. Parse delivery date string to DateTime
2. Create order with `estimatedDelivery` field
3. Store order in database

---

## Preparation Time Messages

Based on `orderPreparationConfig.type`:

### after_order
**Message**: "We'll start preparing your order right away!"

### fixed_minutes
**Message**: "Your order will be ready in approximately {fixedMinutes} minutes."

### variable
**Message**: Uses custom `message` or default: "We'll prepare your order and let you know when it's ready."

### ready_to_ship
**Message**: "Your order is ready to ship immediately!"

---

## Memory Storage

**Conversation Memory**:
```json
{
  "customerPreferences": {
    "deliveryDate": "tomorrow evening",
    "deliveryTime": "evening"
  },
  "keyFacts": [
    "Delivery date preference: tomorrow evening"
  ]
}
```

**Conversation State**:
```json
{
  "order": {
    "deliveryDate": "2025-01-29",
    "deliveryTime": "18:00",
    "deliveryAddress": "..."
  }
}
```

---

## Edge Cases

### Case 1: Customer Provides Date in First Message

**Customer**: "I want 2 boxes for tomorrow evening"

**Process**:
- Extract delivery date from message
- Store in memory
- Don't ask again

---

### Case 2: Customer Changes Delivery Date

**Customer**: "Actually, can you deliver on Monday instead?"

**Process**:
- Detect order update intent
- Extract new delivery date
- Update order with new date
- Confirm change

---

### Case 3: Delivery Date Not Required

**Vendor Settings**:
- `category !== "food"` OR
- `askForPreferredDeliveryDate === false`

**Process**:
- Skip delivery date collection
- Proceed with normal order flow
- Don't validate delivery date

---

## Integration Points

### 1. Intent Classification
- Detects `order_new` intent
- Extracts delivery date if mentioned

### 2. Context Fetching
- Fetches vendor order settings
- Includes in context for prompt building

### 3. Prompt Building
- Adds delivery date requirement instructions
- Includes preparation time config

### 4. Data Extraction
- Extracts delivery date from messages
- Parses relative dates to absolute dates

### 5. Order Validation
- Validates delivery date requirement
- Ensures order can be confirmed

### 6. Order Creation
- Stores delivery date in `estimatedDelivery`
- Creates order with all required fields

---

## Testing Scenarios

### Scenario 1: Food Vendor with Delivery Date Required

1. Set vendor: `category: "food"`, `askForPreferredDeliveryDate: true`
2. Customer: "I want 2 boxes"
3. Expected: AI asks for delivery date
4. Customer: "Tomorrow evening"
5. Expected: Order created with delivery date

### Scenario 2: Food Vendor with Date Already Provided

1. Set vendor: `category: "food"`, `askForPreferredDeliveryDate: true`
2. Customer: "I want 2 boxes for tomorrow evening"
3. Expected: AI doesn't ask again, uses provided date
4. Expected: Order created with delivery date

### Scenario 3: Retail Vendor (No Date Required)

1. Set vendor: `category: "retail"`, `askForPreferredDeliveryDate: false`
2. Customer: "I want 2 boxes"
3. Expected: AI doesn't ask for delivery date
4. Expected: Order created without delivery date requirement

---

## Related Documentation

- [Implementation Guide](./IMPLEMENTATION_GUIDE.md) - Implementation details
- [API Documentation](./API_DOCUMENTATION.md) - API endpoints
- [Configuration Guide](./CONFIGURATION_GUIDE.md) - Configuration options

