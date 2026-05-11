# Vendor Settings - API Documentation

> **📚 Related Documentation**: [Documentation Index](./INDEX.md) | [Architecture Overview](./ARCHITECTURE.md) | [Tab Documentation](./TAB_*.md)

## Overview

This document provides comprehensive API documentation for all endpoints required by the Vendor Settings page. It includes existing endpoints, missing endpoints that need to be created, and endpoints that need updates.

## API Status Summary

### ✅ Existing and Working APIs

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/vendors/:id/config` | GET | ✅ Working | Returns basic config |
| `/api/vendors/:id/ai-config` | GET | ✅ Working | Returns AI configuration |
| `/api/vendors/:id/ai-prompts` | PUT | ⚠️ Needs Update | Requires admin role, missing fields |
| `/api/vendors/:id/order-settings` | GET | ⚠️ Needs Update | Missing orderPrefix, minimumOrderValue |
| `/api/vendors/:id/order-settings` | PUT | ⚠️ Needs Update | Missing orderPrefix, minimumOrderValue |

### ❌ Missing APIs (Need to be Created)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/vendors/:id/business-info` | PUT | Update business information |
| `/api/vendors/:id/notification-settings` | GET | Get notification settings |
| `/api/vendors/:id/notification-settings` | PUT | Update notification settings |
| `/api/vendors/:id/matching-config` | GET | Get product matching configuration |
| `/api/vendors/:id/matching-config` | PUT | Update product matching configuration |
| `/api/vendors/:id/timezone` | PUT | Update timezone |
| `/api/vendors/:id/ai-content` | PUT | Update AI content sections (optional) |

## Detailed API Specifications

### 1. Business Information APIs

#### GET `/api/vendors/:id/config`
**Status**: ✅ Working  
**Authorization**: `requireVendorAccess(req => req.params.id)`

**Response**:
```json
{
  "id": "vendor-uuid",
  "businessName": "Brownie Bakery",
  "plan": "Pro",
  "status": "active",
  "walletBalance": 500000,
  "ai": {
    "botName": "BrownieBakerBot",
    "personality": "Friendly and helpful",
    "systemPrompt": "...",
    "greeting": "...",
    "closing": "...",
    "preparationTimeMinutes": 60
  }
}
```

**Notes**: Currently returns basic config. May need to include `category`, `phone`, `email` for complete business info.

#### PUT `/api/vendors/:id/business-info` ⚠️ **NEW - NEEDS TO BE CREATED**

**Purpose**: Update business information (name, phone, email, category)

**Authorization**: `requireVendorAccess(req => req.params.id)`

**Request Body**:
```json
{
  "businessName": "Brownie Bakery",
  "phone": "+919876543210",
  "email": "contact@browniebakery.com",
  "category": "food"
}
```

**Validation Schema**:
```typescript
const businessInfoSchema = z.object({
  businessName: z
    .string()
    .min(1, 'Business name is required')
    .max(100, 'Business name must be 100 characters or less')
    .optional(),
  
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
    .optional(),
  
  email: z
    .string()
    .email('Invalid email format')
    .optional(),
  
  category: z
    .enum(['food', 'retail', 'service', 'other'])
    .optional()
    .nullable(),
});
```

**Response**:
```json
{
  "id": "vendor-uuid",
  "businessName": "Brownie Bakery",
  "phone": "+919876543210",
  "email": "contact@browniebakery.com",
  "category": "food",
  "updatedAt": "2024-12-28T10:00:00Z"
}
```

**Error Responses**:
- `400`: Validation error (invalid format, duplicate email/phone)
- `403`: Unauthorized (vendor trying to edit another vendor's info)
- `404`: Vendor not found

**Business Logic**:
- Phone number changes may require verification (future enhancement)
- Email changes should be validated for uniqueness
- Category changes affect AI behavior

---

### 2. AI Configuration APIs

#### GET `/api/vendors/:id/ai-config`
**Status**: ✅ Working  
**Authorization**: `requireVendorAccess(req => req.params.id)`

**Response**:
```json
{
  "vendorId": "vendor-uuid",
  "businessName": "Brownie Bakery",
  "ai": {
    "botName": "BrownieBakerBot",
    "personality": "Friendly and helpful",
    "systemPrompt": "You are a helpful assistant...",
    "products": "## Cakes\n- Chocolate Cake: ₹500...",
    "greeting": "Hello! Welcome to Brownie Bakery!",
    "closing": "Thank you for your order!"
  }
}
```

**Notes**: Currently missing `aiModel`, `aiContentResponsibilities`, `aiContentConversationRules`, `aiContentImportantInstructions`.

#### PUT `/api/vendors/:id/ai-prompts`
**Status**: ⚠️ **NEEDS UPDATE**  
**Current Authorization**: `requireRole('admin')`  
**Required Authorization**: `requireVendorAccess(req => req.params.id)`

**Current Request Body**:
```json
{
  "botName": "BrownieBakerBot",
  "personality": "Friendly and helpful",
  "systemPrompt": "...",
  "greeting": "...",
  "closing": "...",
  "preparationTimeMinutes": 60
}
```

**Required Request Body** (add missing fields):
```json
{
  "botName": "BrownieBakerBot",
  "personality": "Friendly and helpful",
  "systemPrompt": "You are a helpful assistant...",
  "aiProducts": "## Cakes\n- Chocolate Cake: ₹500...",
  "aiModel": "gpt-4o-mini",
  "greeting": "Hello! Welcome to Brownie Bakery!",
  "closing": "Thank you for your order!",
  "aiContentResponsibilities": "The AI bot is responsible for...",
  "aiContentConversationRules": "Conversation Rules:\n1. Always greet...",
  "aiContentImportantInstructions": "IMPORTANT:\n- Always confirm...",
  "preparationTimeMinutes": 60
}
```

**Validation Schema**:
```typescript
const aiPromptsSchema = z.object({
  aiBotName: z.string().max(50).optional().nullable(),
  aiPersonality: z.string().max(500).optional().nullable(),
  aiSystemPrompt: z.string().max(5000).optional().nullable(),
  aiProducts: z.string().max(10000).optional().nullable(),
  aiModel: z.enum(['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4-turbo']).optional(),
  aiGreeting: z.string().max(500).optional().nullable(),
  aiClosing: z.string().max(500).optional().nullable(),
  aiContentResponsibilities: z.string().max(2000).optional().nullable(),
  aiContentConversationRules: z.string().max(2000).optional().nullable(),
  aiContentImportantInstructions: z.string().max(2000).optional().nullable(),
  aiPreparationTimeMinutes: z.number().int().min(0).max(1440).optional().nullable(),
});
```

**Response**:
```json
{
  "ok": true,
  "id": "vendor-uuid"
}
```

**Changes Required**:
1. Change authorization from `requireRole('admin')` to `requireVendorAccess(req => req.params.id)`
2. Add missing fields to request body handling
3. Add validation for new fields

#### PUT `/api/vendors/:id/ai-content` ⚠️ **NEW - OPTIONAL**

**Purpose**: Update AI content sections separately (optional endpoint, can be merged into ai-prompts)

**Authorization**: `requireVendorAccess(req => req.params.id)`

**Request Body**:
```json
{
  "aiContentResponsibilities": "The AI bot is responsible for...",
  "aiContentConversationRules": "Conversation Rules:\n1. Always greet...",
  "aiContentImportantInstructions": "IMPORTANT:\n- Always confirm..."
}
```

**Response**:
```json
{
  "ok": true,
  "id": "vendor-uuid"
}
```

**Note**: This endpoint is optional. These fields can be updated via the `ai-prompts` endpoint instead.

---

### 3. Order Settings APIs

#### GET `/api/vendors/:id/order-settings`
**Status**: ⚠️ **NEEDS UPDATE**  
**Authorization**: `requireVendorAccess(req => req.params.id)`

**Current Response**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "baseMinutes": 30,
    "minutesPerItem": 5,
    "maxMinutes": 120
  },
  "aiPreparationTimeMinutes": 60
}
```

**Required Response** (add missing fields):
```json
{
  "orderPrefix": "VENDI",
  "minimumOrderValue": 50000,
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "baseMinutes": 30,
    "minutesPerItem": 5,
    "maxMinutes": 120
  },
  "aiPreparationTimeMinutes": 60
}
```

**Changes Required**:
1. Add `orderPrefix` to select statement
2. Add `minimumOrderValue` to select statement
3. Include both fields in response

#### PUT `/api/vendors/:id/order-settings`
**Status**: ⚠️ **NEEDS UPDATE**  
**Authorization**: `requireVendorAccess(req => req.params.id)`

**Current Request Body**:
```json
{
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "baseMinutes": 30,
    "minutesPerItem": 5,
    "maxMinutes": 120
  }
}
```

**Required Request Body** (add missing fields):
```json
{
  "orderPrefix": "VENDI",
  "minimumOrderValue": 50000,
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "baseMinutes": 30,
    "minutesPerItem": 5,
    "maxMinutes": 120
  }
}
```

**Validation Schema**:
```typescript
const orderSettingsSchema = z.object({
  orderPrefix: z
    .string()
    .regex(/^[A-Z]{5}$/, 'Order prefix must be exactly 5 uppercase letters')
    .optional()
    .nullable(),
  
  minimumOrderValue: z
    .number()
    .int('Minimum order value must be a whole number')
    .min(0, 'Minimum order value cannot be negative')
    .optional()
    .nullable(),
  
  category: z.enum(['food', 'retail', 'service', 'other']).optional().nullable(),
  
  askForPreferredDeliveryDate: z.boolean().optional(),
  
  orderPreparationConfig: z.discriminatedUnion('type', [
    z.object({ type: z.literal('after_order') }),
    z.object({
      type: z.literal('fixed_minutes'),
      fixedMinutes: z.number().int().min(0).max(1440),
    }),
    z.object({
      type: z.literal('variable'),
      baseMinutes: z.number().int().min(0),
      minutesPerItem: z.number().min(0).optional().nullable(),
      maxMinutes: z.number().int().min(0).optional().nullable(),
    }),
    z.object({ type: z.literal('ready_to_ship') }),
  ]).optional().nullable(),
  
  aiPreparationTimeMinutes: z.number().int().min(0).max(1440).optional().nullable(),
});
```

**Response**:
```json
{
  "id": "vendor-uuid",
  "orderPrefix": "VENDI",
  "minimumOrderValue": 50000,
  "category": "food",
  "askForPreferredDeliveryDate": true,
  "orderPreparationConfig": {
    "type": "variable",
    "baseMinutes": 30,
    "minutesPerItem": 5,
    "maxMinutes": 120
  }
}
```

**Changes Required**:
1. Add `orderPrefix` validation and update logic
2. Add `minimumOrderValue` validation and update logic
3. Include both fields in response

**Business Logic**:
- `orderPrefix`: Must be exactly 5 uppercase letters (A-Z)
- `minimumOrderValue`: Stored in paise, displayed in rupees
- Changing `orderPrefix` affects future orders only

---

### 4. Notification Settings APIs

#### GET `/api/vendors/:id/notification-settings` ⚠️ **NEW - NEEDS TO BE CREATED**

**Purpose**: Fetch notification settings

**Authorization**: `requireVendorAccess(req => req.params.id)`

**Response**:
```json
{
  "orderUpdates": true,
  "paymentLinks": true,
  "shippingUpdates": true,
  "enabledStatuses": [
    "confirmed",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered"
  ],
  "quietHours": {
    "enabled": false,
    "start": "22:00",
    "end": "09:00"
  }
}
```

**Database Field**: `notificationSettings` (JSON field in Vendor table)

**Default Values**:
```json
{
  "orderUpdates": true,
  "paymentLinks": true,
  "shippingUpdates": true,
  "enabledStatuses": ["confirmed", "preparing", "ready", "out_for_delivery", "delivered"],
  "quietHours": {
    "enabled": false,
    "start": "22:00",
    "end": "09:00"
  }
}
```

#### PUT `/api/vendors/:id/notification-settings` ⚠️ **NEW - NEEDS TO BE CREATED**

**Purpose**: Update notification settings

**Authorization**: `requireVendorAccess(req => req.params.id)`

**Request Body**:
```json
{
  "orderUpdates": true,
  "paymentLinks": true,
  "shippingUpdates": true,
  "enabledStatuses": [
    "confirmed",
    "delivered"
  ],
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "09:00"
  }
}
```

**Validation Schema**:
```typescript
const orderStatusSchema = z.enum([
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
]);

const timeSchema = z
  .string()
  .regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)');

const notificationSettingsSchema = z.object({
  orderUpdates: z.boolean().default(true),
  paymentLinks: z.boolean().default(true),
  shippingUpdates: z.boolean().default(true),
  enabledStatuses: z
    .array(orderStatusSchema)
    .min(1, 'At least one order status must be enabled')
    .default(['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered']),
  quietHours: z
    .object({
      enabled: z.boolean().default(false),
      start: timeSchema.optional(),
      end: timeSchema.optional(),
    })
    .refine(
      (data) => {
        if (data.enabled) {
          return data.start !== undefined && data.end !== undefined;
        }
        return true;
      },
      { message: 'Start and end times are required when quiet hours are enabled' }
    )
    .refine(
      (data) => {
        if (data.enabled && data.start && data.end) {
          return data.start !== data.end;
        }
        return true;
      },
      { message: 'Start and end times must be different' }
    )
    .default({ enabled: false }),
});
```

**Response**:
```json
{
  "orderUpdates": true,
  "paymentLinks": true,
  "shippingUpdates": true,
  "enabledStatuses": [
    "confirmed",
    "delivered"
  ],
  "quietHours": {
    "enabled": true,
    "start": "22:00",
    "end": "09:00"
  }
}
```

**Error Responses**:
- `400`: Validation error (invalid time format, no statuses selected, start/end times same)
- `403`: Unauthorized
- `404`: Vendor not found

**Business Logic**:
- If `quietHours.enabled` is true, `start` and `end` are required
- `start` and `end` must be different
- At least one order status must be enabled
- Quiet hours can span midnight (e.g., 22:00 - 09:00)

---

### 5. Product Matching Configuration APIs

#### GET `/api/vendors/:id/matching-config` ⚠️ **NEW - NEEDS TO BE CREATED**

**Purpose**: Fetch product matching configuration

**Authorization**: `requireVendorAccess(req => req.params.id)`

**Response**:
```json
{
  "threshold": 0.7,
  "enableFuzzy": true,
  "enableAIMatching": true,
  "productNameField": "name",
  "productKeywordsField": "keywords",
  "productPriceField": "basePrice",
  "supportedLanguages": ["en", "hi"],
  "aiMatchingModel": "gpt-4o-mini"
}
```

**Database Field**: `matchingConfig` (JSON field in Vendor table)

**Default Values**:
```json
{
  "threshold": 0.7,
  "enableFuzzy": true,
  "enableAIMatching": true,
  "productNameField": "name",
  "productKeywordsField": "keywords",
  "productPriceField": "basePrice",
  "supportedLanguages": ["en"],
  "aiMatchingModel": "gpt-4o-mini"
}
```

#### PUT `/api/vendors/:id/matching-config` ⚠️ **NEW - NEEDS TO BE CREATED**

**Purpose**: Update product matching configuration

**Authorization**: `requireVendorAccess(req => req.params.id)`

**Request Body**:
```json
{
  "threshold": 0.7,
  "enableFuzzy": true,
  "enableAIMatching": true,
  "productNameField": "name",
  "productKeywordsField": "keywords",
  "productPriceField": "basePrice",
  "supportedLanguages": ["en", "hi", "ta"],
  "aiMatchingModel": "gpt-4o-mini"
}
```

**Validation Schema**:
```typescript
const matchingConfigSchema = z.object({
  threshold: z
    .number()
    .min(0, 'Threshold must be between 0 and 1')
    .max(1, 'Threshold must be between 0 and 1')
    .default(0.7),
  
  enableFuzzy: z.boolean().default(true),
  
  enableAIMatching: z.boolean().default(true),
  
  productNameField: z
    .enum(['name', 'keywords', 'description'])
    .default('name'),
  
  productKeywordsField: z
    .enum(['keywords', 'tags', 'name'])
    .default('keywords'),
  
  productPriceField: z
    .enum(['basePrice', 'price'])
    .default('basePrice'),
  
  supportedLanguages: z
    .array(z.string())
    .min(1, 'At least one language must be selected')
    .default(['en']),
  
  aiMatchingModel: z
    .enum(['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4o'])
    .default('gpt-4o-mini'),
});
```

**Response**:
```json
{
  "threshold": 0.7,
  "enableFuzzy": true,
  "enableAIMatching": true,
  "productNameField": "name",
  "productKeywordsField": "keywords",
  "productPriceField": "basePrice",
  "supportedLanguages": ["en", "hi", "ta"],
  "aiMatchingModel": "gpt-4o-mini"
}
```

**Error Responses**:
- `400`: Validation error (threshold out of range, no languages selected)
- `403`: Unauthorized
- `404`: Vendor not found

**Business Logic**:
- Threshold must be between 0.0 and 1.0
- At least one language must be selected
- Default values applied if fields are missing

---

### 6. Timezone API

#### PUT `/api/vendors/:id/timezone` ⚠️ **NEW - NEEDS TO BE CREATED**

**Purpose**: Update business timezone

**Authorization**: `requireVendorAccess(req => req.params.id)`

**Request Body**:
```json
{
  "timezone": "Asia/Kolkata"
}
```

**Validation Schema**:
```typescript
const timezoneSchema = z.object({
  timezone: z.string().default('Asia/Kolkata'),
});
```

**Response**:
```json
{
  "id": "vendor-uuid",
  "timezone": "Asia/Kolkata",
  "updatedAt": "2024-12-28T10:00:00Z"
}
```

**Error Responses**:
- `400`: Validation error (invalid timezone)
- `403`: Unauthorized
- `404`: Vendor not found

**Business Logic**:
- Validates timezone against known timezone list
- Changes affect order timestamps, delivery estimates, and quiet hours
- Existing orders keep original timestamps

**Common Timezones**:
- Asia/Kolkata (IST) - India Standard Time
- Asia/Dubai (GST) - Gulf Standard Time
- Asia/Singapore (SGT) - Singapore Time
- Europe/London (GMT) - Greenwich Mean Time
- America/New_York (EST) - Eastern Standard Time

---

## Implementation Checklist

### New Endpoints to Create

- [ ] `PUT /api/vendors/:id/business-info`
  - [ ] Add route handler
  - [ ] Add validation schema
  - [ ] Add authorization check
  - [ ] Handle phone/email uniqueness validation
  - [ ] Return updated vendor data

- [ ] `GET /api/vendors/:id/notification-settings`
  - [ ] Add route handler
  - [ ] Fetch notificationSettings JSON field
  - [ ] Return default values if null
  - [ ] Parse JSON if stored as string

- [ ] `PUT /api/vendors/:id/notification-settings`
  - [ ] Add route handler
  - [ ] Add validation schema
  - [ ] Validate quiet hours logic
  - [ ] Update notificationSettings JSON field
  - [ ] Return updated settings

- [ ] `GET /api/vendors/:id/matching-config`
  - [ ] Add route handler
  - [ ] Fetch matchingConfig JSON field
  - [ ] Return default values if null
  - [ ] Parse JSON if stored as string

- [ ] `PUT /api/vendors/:id/matching-config`
  - [ ] Add route handler
  - [ ] Add validation schema
  - [ ] Validate threshold range
  - [ ] Validate language array
  - [ ] Update matchingConfig JSON field
  - [ ] Return updated config

- [ ] `PUT /api/vendors/:id/timezone`
  - [ ] Add route handler
  - [ ] Add validation schema
  - [ ] Validate timezone string
  - [ ] Update timezone field
  - [ ] Return updated vendor data

### Endpoints to Update

- [ ] `PUT /api/vendors/:id/ai-prompts`
  - [ ] Change authorization from `requireRole('admin')` to `requireVendorAccess(req => req.params.id)`
  - [ ] Add `aiProducts` field handling
  - [ ] Add `aiModel` field handling
  - [ ] Add `aiContentResponsibilities` field handling
  - [ ] Add `aiContentConversationRules` field handling
  - [ ] Add `aiContentImportantInstructions` field handling
  - [ ] Update validation schema

- [ ] `GET /api/vendors/:id/order-settings`
  - [ ] Add `orderPrefix` to select statement
  - [ ] Add `minimumOrderValue` to select statement
  - [ ] Include both fields in response

- [ ] `PUT /api/vendors/:id/order-settings`
  - [ ] Add `orderPrefix` validation (5 uppercase letters)
  - [ ] Add `minimumOrderValue` validation (positive integer)
  - [ ] Add both fields to update logic
  - [ ] Include both fields in response
  - [ ] Update validation schema

## Authorization Summary

All endpoints should use:
- **Authorization**: `requireVendorAccess(req => req.params.id)`
- **Purpose**: Allow vendors to update their own settings
- **Exception**: Some fields may remain admin-only (e.g., subscription plan changes)

## Error Handling

All endpoints should:
1. Return `400` for validation errors with detailed error messages
2. Return `403` for unauthorized access
3. Return `404` for vendor not found
4. Return `500` for server errors with generic error message
5. Use consistent error response format:
```json
{
  "error": "Error message",
  "details": "Optional detailed error information"
}
```

## Testing Requirements

Each endpoint should be tested for:
- [ ] Successful request/response
- [ ] Validation errors
- [ ] Authorization failures
- [ ] Not found scenarios
- [ ] Edge cases (null values, empty arrays, etc.)
- [ ] JSON parsing (for JSON fields)
- [ ] Default value application

## Database Fields Reference

### Vendor Table Fields Used:
- `businessName` - String
- `phone` - String
- `email` - String
- `category` - String (enum: 'food', 'retail', 'service', 'other')
- `orderPrefix` - String (5 uppercase letters)
- `minimumOrderValue` - Int (in paise)
- `askForPreferredDeliveryDate` - Boolean
- `orderPreparationConfig` - Json
- `aiBotName` - String
- `aiPersonality` - String
- `aiSystemPrompt` - Text
- `aiProducts` - Text
- `aiModel` - String
- `aiGreeting` - Text
- `aiClosing` - Text
- `aiContentResponsibilities` - Text
- `aiContentConversationRules` - Text
- `aiContentImportantInstructions` - Text
- `aiPreparationTimeMinutes` - Int
- `notificationSettings` - Json
- `matchingConfig` - Json
- `timezone` - String

## Related Documentation

- **[Documentation Index](./INDEX.md)** - Complete navigation guide
- **[Account & Business Tab](./TAB_ACCOUNT_BUSINESS.md)** - Business info fields and specifications
- **[AI Configuration Tab](./TAB_AI_CONFIGURATION.md)** - AI config fields and specifications
- **[Order Settings Tab](./TAB_ORDER_SETTINGS.md)** - Order settings fields and specifications
- **[Notifications Tab](./TAB_NOTIFICATIONS.md)** - Notification settings fields and specifications
- **[Advanced Tab](./TAB_ADVANCED.md)** - Matching config and timezone fields and specifications
- **[Quick Reference](./QUICK_REFERENCE.md)** - Quick access to validation rules and defaults

