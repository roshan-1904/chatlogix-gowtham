# Order Delivery Settings - Configuration Guide

## Overview

This guide explains how to configure order delivery and preparation settings for vendors.

> **2026-09 note:** the settings below (`category`, `askForPreferredDeliveryDate`, `orderPreparationConfig`) still exist in the schema and are still readable/writable via the API in this guide. But the AI-behavior claims throughout this guide ("AI asks...", the delivery-date question flow) describe the old, pre-Lambda pipeline (`promptBuilderService.ts`), which is no longer on the hot path for live WhatsApp traffic. In the current live pipeline (`backend/src/conversation/*`), the AI never asks for or promises a delivery date — `delivery_date` is advisory prep-timing copy only, and `Order.estimatedDelivery` is vendor-set only. See `docs/CONVERSATION_PROCESSOR_LAMBDA.md` §13/§16 and [Order Flow Documentation](./ORDER_FLOW.md).

## Configuration Options

### 1. Vendor Category

Set the vendor's business category to enable category-specific features.

**Values**:
- `"food"` - Food vendors (e.g., restaurants, bakeries)
- `"retail"` - Retail vendors (e.g., clothing, electronics)
- `"service"` - Service vendors (e.g., cleaning, repairs)
- `null` - No specific category

**Usage**: Category is used to determine if delivery date should be asked (only for "food" category).

---

### 2. Ask for Preferred Delivery Date

Enable or disable asking customers for their preferred delivery date during order placement.

**Values**:
- `true` - Ask customers for preferred delivery date
- `false` - Don't ask (default)

**Requirements**:
- Only effective when vendor category is "food"
- AI will ask for delivery date if:
  - `category === "food"`
  - `askForPreferredDeliveryDate === true`
  - Delivery date is not already provided

---

### 3. Order Preparation Config

Configure how order preparation time is communicated to customers.

#### Type: `after_order`

Start preparing after order is placed.

**Configuration**:
```json
{
  "type": "after_order"
}
```

**When to Use**:
- Orders are prepared fresh after placement
- No fixed preparation time
- Common for food vendors

**AI Message**: "We'll start preparing your order right away!"

---

#### Type: `fixed_minutes`

Fixed preparation time in minutes.

**Configuration**:
```json
{
  "type": "fixed_minutes",
  "fixedMinutes": 30
}
```

**When to Use**:
- Orders have a consistent preparation time
- You know exactly how long orders take
- Common for food vendors with standard preparation times

**AI Message**: "Your order will be ready in approximately 30 minutes."

**Required Fields**:
- `fixedMinutes` (number): Preparation time in minutes

---

#### Type: `variable`

Variable preparation time with custom message.

**Configuration**:
```json
{
  "type": "variable",
  "message": "Usually ready in 30-45 minutes"
}
```

**When to Use**:
- Preparation time varies based on items
- You want to provide a range or custom message
- Common for food vendors with variable preparation times

**AI Message**: Uses the custom `message` field, or default: "We'll prepare your order and let you know when it's ready."

**Optional Fields**:
- `message` (string): Custom message to display

---

#### Type: `ready_to_ship`

Ready to ship immediately.

**Configuration**:
```json
{
  "type": "ready_to_ship"
}
```

**When to Use**:
- Products are pre-made and ready
- No preparation needed
- Common for retail vendors

**AI Message**: "Your order is ready to ship immediately!"

---

## Configuration Examples

### Example 1: Food Vendor (Brownie Bakery)

**Scenario**: Fresh brownies prepared after order, usually ready in 30 minutes, need preferred delivery date.

**Configuration**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "fixed_minutes",
    "fixedMinutes": 30
  }
}
```

**Result**:
- AI asks: "What's your preferred delivery date?"
- AI confirms: "Your order will be ready in approximately 30 minutes."

---

### Example 2: Food Vendor (Custom Cakes)

**Scenario**: Custom cakes take variable time (30-60 minutes), need preferred delivery date.

**Configuration**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "message": "We usually prepare orders within 30-60 minutes depending on the items"
  }
}
```

**Result**:
- AI asks: "What's your preferred delivery date?"
- AI confirms: "We usually prepare orders within 30-60 minutes depending on the items"

---

### Example 3: Retail Vendor (Ready-to-Ship)

**Scenario**: Pre-made products, no preparation needed, no delivery date required.

**Configuration**:
```json
{
  "category": "retail",
  "askForPreferredDeliveryDate": false,
  "orderPreparationConfig": {
    "type": "ready_to_ship"
  }
}
```

**Result**:
- AI doesn't ask for delivery date
- AI confirms: "Your order is ready to ship immediately!"

---

### Example 4: Food Vendor (Start After Order)

**Scenario**: Start preparing after order, no fixed time, need preferred delivery date.

**Configuration**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "after_order"
  }
}
```

**Result**:
- AI asks: "What's your preferred delivery date?"
- AI confirms: "We'll start preparing your order right away!"

---

## Migration from aiPreparationTimeMinutes

If you have existing `aiPreparationTimeMinutes` values, they are automatically mapped:

- `aiPreparationTimeMinutes === 0` or `null` → `type: "after_order"`
- `aiPreparationTimeMinutes > 0` → `type: "fixed_minutes"` with `fixedMinutes: aiPreparationTimeMinutes`

**Example Migration**:
```typescript
// Before
{
  "aiPreparationTimeMinutes": 30
}

// After (automatically migrated)
{
  "aiPreparationTimeMinutes": 30,  // Kept for backward compatibility
  "orderPreparationConfig": {
    "type": "fixed_minutes",
    "fixedMinutes": 30
  }
}
```

---

## Best Practices

1. **Set Category First**: Set vendor category before enabling `askForPreferredDeliveryDate`
2. **Match Business Model**: Choose preparation type that matches your actual process
3. **Be Realistic**: Set realistic preparation times to manage customer expectations
4. **Use Custom Messages**: For variable times, provide helpful custom messages
5. **Test Configuration**: Test with sample orders to ensure messages are appropriate

---

## Troubleshooting

### Delivery Date Not Being Asked

**Check**:
1. Vendor category is set to "food"
2. `askForPreferredDeliveryDate` is `true`
3. Delivery date is not already in conversation memory

**Solution**: Ensure all conditions are met.

---

### Wrong Preparation Message

**Check**:
1. `orderPreparationConfig.type` matches your business model
2. For `fixed_minutes`, `fixedMinutes` is set correctly
3. For `variable`, custom `message` is appropriate

**Solution**: Update configuration to match your business model.

---

### Order Cannot Be Confirmed

**Check**:
1. Delivery date is required but not provided
2. Validation is checking for delivery date

**Solution**: Ensure delivery date is collected before order confirmation.

