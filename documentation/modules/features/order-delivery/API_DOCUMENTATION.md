# Order Delivery Settings - API Documentation

## Overview

API endpoints for managing vendor order delivery and preparation settings.

## Endpoints

### GET /api/vendors/:id/order-settings

Get order settings for a vendor.

**Authentication**: Required (vendor or admin)

**Path Parameters**:
- `id` (string): Vendor ID

**Response**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "fixed_minutes",
    "fixedMinutes": 30,
    "message": null
  },
  "aiPreparationTimeMinutes": 30
}
```

**Response Fields**:
- `category` (string | null): Vendor business category
- `askForPreferredDeliveryDate` (boolean): Whether to ask for preferred delivery date
- `orderPreparationConfig` (object | null): Preparation time configuration
  - `type` (string): One of: "after_order", "fixed_minutes", "variable", "ready_to_ship"
  - `fixedMinutes` (number | null): Fixed minutes (only for "fixed_minutes" type)
  - `message` (string | null): Custom message
- `aiPreparationTimeMinutes` (number | null): Legacy field for backward compatibility

**Example Request**:
```bash
curl -X GET \
  http://localhost:3000/api/vendors/{vendorId}/order-settings \
  -H "Authorization: Bearer {token}"
```

**Example Response**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "fixed_minutes",
    "fixedMinutes": 30
  },
  "aiPreparationTimeMinutes": 30
}
```

---

### PUT /api/vendors/:id/order-settings

Update order settings for a vendor.

**Authentication**: Required (vendor or admin)

**Path Parameters**:
- `id` (string): Vendor ID

**Request Body**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "fixed_minutes",
    "fixedMinutes": 30,
    "message": null
  }
}
```

**Request Fields**:
- `category` (string | null, optional): Vendor business category
- `askForPreferredDeliveryDate` (boolean, optional): Whether to ask for preferred delivery date
- `orderPreparationConfig` (object | null, optional): Preparation time configuration
  - `type` (string, required): One of: "after_order", "fixed_minutes", "variable", "ready_to_ship"
  - `fixedMinutes` (number | null, optional): Fixed minutes (required for "fixed_minutes" type)
  - `message` (string | null, optional): Custom message

**Validation Rules**:
- If `orderPreparationConfig.type` is "fixed_minutes", `fixedMinutes` must be provided
- `orderPreparationConfig.type` must be one of the valid types

**Response**:
```json
{
  "id": "vendor-id",
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "fixed_minutes",
    "fixedMinutes": 30,
    "message": null
  }
}
```

**Example Request**:
```bash
curl -X PUT \
  http://localhost:3000/api/vendors/{vendorId}/order-settings \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "food",
    "askForPreferredDeliveryDate": true,
    "orderPreparationConfig": {
      "type": "fixed_minutes",
      "fixedMinutes": 30
    }
  }'
```

**Error Responses**:

**400 Bad Request** - Invalid configuration:
```json
{
  "error": "orderPreparationConfig.fixedMinutes is required for fixed_minutes type"
}
```

**404 Not Found** - Vendor not found:
```json
{
  "error": "Vendor not found"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Failed to update order settings"
}
```

---

## Order Preparation Config Types

### after_order
Start preparing after order is placed.

**Config**:
```json
{
  "type": "after_order"
}
```

**AI Message**: "We'll start preparing your order right away!"

---

### fixed_minutes
Fixed preparation time in minutes.

**Config**:
```json
{
  "type": "fixed_minutes",
  "fixedMinutes": 30
}
```

**AI Message**: "Your order will be ready in approximately 30 minutes."

---

### variable
Variable preparation time with custom message.

**Config**:
```json
{
  "type": "variable",
  "message": "Usually ready in 30-45 minutes"
}
```

**AI Message**: Uses the custom message or default: "We'll prepare your order and let you know when it's ready."

---

### ready_to_ship
Ready to ship immediately.

**Config**:
```json
{
  "type": "ready_to_ship"
}
```

**AI Message**: "Your order is ready to ship immediately!"

---

## Usage Examples

### Example 1: Food Vendor Setup

```bash
# Set vendor as food category
curl -X PUT \
  http://localhost:3000/api/vendors/{vendorId}/order-settings \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "food",
    "askForPreferredDeliveryDate": true,
    "orderPreparationConfig": {
      "type": "fixed_minutes",
      "fixedMinutes": 45
    }
  }'
```

### Example 2: Retail Vendor Setup

```bash
# Set vendor as retail with ready-to-ship products
curl -X PUT \
  http://localhost:3000/api/vendors/{vendorId}/order-settings \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "retail",
    "askForPreferredDeliveryDate": false,
    "orderPreparationConfig": {
      "type": "ready_to_ship"
    }
  }'
```

### Example 3: Variable Preparation Time

```bash
# Set variable preparation time with custom message
curl -X PUT \
  http://localhost:3000/api/vendors/{vendorId}/order-settings \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "food",
    "askForPreferredDeliveryDate": true,
    "orderPreparationConfig": {
      "type": "variable",
      "message": "We usually prepare orders within 30-60 minutes depending on the items"
    }
  }'
```

---

## Integration with Order Flow

When `askForPreferredDeliveryDate` is enabled and vendor category is "food":

1. **Order New Intent**: AI will ask for preferred delivery date if not provided
2. **Order Validation**: Order cannot be confirmed without delivery date
3. **Order Creation**: Delivery date is stored in `estimatedDelivery` field
4. **Order Confirmation**: AI includes delivery date in confirmation message

See [Order Flow Documentation](./ORDER_FLOW.md) for detailed flow.

