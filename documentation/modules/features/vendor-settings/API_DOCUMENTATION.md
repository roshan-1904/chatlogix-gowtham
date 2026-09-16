# Vendor Settings - API Documentation

> **📚 Related Documentation**: [Documentation Index](./INDEX.md) | [Architecture Overview](./ARCHITECTURE.md) | [Tab Documentation](./TAB_*.md)

## Overview

This document provides comprehensive API documentation for all endpoints required by the Vendor Settings page. It includes existing endpoints, missing endpoints that need to be created, and endpoints that need updates.

> **⚠️ Status update (verified against code, Sep 2026)**: This document was written in December 2024 as a pre-implementation gap analysis. Nearly everything it lists as "missing" or "needs update" has since been built — see the corrected summary below. The one still-accurate gap is that no route reads or writes the `aiModel` field. The detailed JSON examples and Zod schemas throughout this file below are the *original proposal* and, in several places (business category as an enum, order prefix as exactly-5-letters), no longer match what actually shipped — cross-check against `backend/src/routes/vendors.ts` and `backend/src/utils/validation/settingsSchemas.ts` rather than trusting the inline schemas verbatim.

## API Status Summary (corrected, Sep 2026)

### ✅ Existing and Working APIs

| Endpoint | Method | Status | Notes |
|----------|--------|--------|-------|
| `/api/vendors/:id/config` | GET | ✅ Working | Returns basic config |
| `/api/vendors/:id/ai-config` | GET | ✅ Working | Now also returns `aiContentResponsibilities`/`aiContentConversationRules`/`aiContentImportantInstructions`/`aiDeliveryInstructions`/`aiPickupDeliveryAddress`/`aiToneExample`. Still does not return `aiModel`. |
| `/api/vendors/:id/ai-prompts` | PUT | ✅ Working | Uses `requireVendorAccess` (not admin-only); accepts `aiProducts` and the content-section fields via `buildAIPromptsUpdate`. Does **not** accept `aiModel` — no route handles that field at all. |
| `/api/vendors/:id/order-settings` | GET | ✅ Working | Includes `orderPrefix` and `minimumOrderValue` |
| `/api/vendors/:id/order-settings` | PUT | ✅ Working | Includes `orderPrefix` and `minimumOrderValue`; prefix validation is "≤5 uppercase letters/digits," not "exactly 5 letters" |
| `/api/vendors/:id/business-info` | GET/PUT | ✅ Working | Category validated as free text (`z.string().max(100)`), not an enum |
| `/api/vendors/:id/notification-settings` | GET/PUT | ✅ Working | Backend supports `enabledStatuses` and `quietHours`; no vendor-facing UI exposes them yet (`NotificationsTab.tsx` only has the 3 toggles) |
| `/api/vendors/:id/matching-config` | GET/PUT | ✅ Working | Backend supports all fields incl. `aiMatchingModel` (which is live in the product-matching pipeline); UI only exposes `threshold`/`enableFuzzy`/`enableAIMatching` |
| `/api/vendors/:id/timezone` | PUT | ✅ Working | |
| `/api/vendors/:id/verify-phone/send`, `/verify-phone/confirm` | POST | ✅ Working | Built (not in original plan's endpoint list) |
| `/api/vendors/:id/verify-email/send`, `/verify-email/confirm` | POST | ✅ Working | Built (not in original plan's endpoint list) |

### ❌ Still Missing

| Endpoint | Method | Purpose | Notes |
|----------|--------|---------|-------|
| — | — | `aiModel` read/write | No route anywhere handles this field. The DB column and its `gpt-4.1-mini` default are live (read by the LLM-1 pipeline), but there's no API to set it per-vendor other than a direct DB write. |
| `/api/vendors/:id/ai-content` | PUT | Update AI content sections separately | Not built, and not needed — folded into `ai-prompts`/`ai-config` instead (see Section 2 below) |

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
  "walletBalanceMilli": 5000000,
  "markupPercent": 50,
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

#### PUT `/api/vendors/:id/business-info` ✅ **Built** (category is free text, not the enum shown below)

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
**Status**: ✅ **Built and updated** — now uses `requireVendorAccess(req => req.params.id)` and handles `aiProducts`/content-section fields (see `buildAIPromptsUpdate` in `backend/src/services/vendorAIConfigService.ts`). The one gap below that's still real: `aiModel` is not accepted by this or any other route.
**Current Authorization**: `requireVendorAccess(req => req.params.id)` ✅ (matches what was originally requested below)

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

**Actual current request body** (all of these except `aiModel` are handled — confirmed in `buildAIPromptsUpdate`, `backend/src/services/vendorAIConfigService.ts`):
```json
{
  "botName": "BrownieBakerBot",
  "personality": "Friendly and helpful",
  "systemPrompt": "You are a helpful assistant...",
  "products": "## Cakes\n- Chocolate Cake: ₹500...",
  "greeting": "Hello! Welcome to Brownie Bakery!",
  "closing": "Thank you for your order!",
  "contentResponsibilities": "The AI bot is responsible for...",
  "contentConversationRules": "Conversation Rules:\n1. Always greet...",
  "contentImportantInstructions": "IMPORTANT:\n- Always confirm...",
  "preparationTimeMinutes": 60
}
```
**Note**: field names in the real payload are un-prefixed (`botName`, `products`, `contentResponsibilities`, ...) — `buildAIPromptsUpdate` maps them onto the `ai*`-prefixed Prisma columns server-side. `aiModel` is still not accepted anywhere.

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

**Changes Required (original plan — all done except item 3)**:
1. ✅ Authorization changed to `requireVendorAccess(req => req.params.id)`
2. ✅ Missing fields (`products`/`aiProducts`, content sections) added to request body handling
3. ❌ `aiModel` still has no validation or route handling anywhere

#### PUT `/api/vendors/:id/ai-content` — **not built (and not needed)**

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
**Status**: ✅ **Built** — already includes `orderPrefix` and `minimumOrderValue` (the gap below is resolved)
**Authorization**: `requireVendorAccess(req => req.params.id)`

**Response as of Dec 2024 (superseded — kept for history only, do not use)**:
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

**Response actually returned today** (this is what shipped — `orderPrefix`/`minimumOrderValue` were added):
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

**Changes Required (Dec 2024 plan — done)**:
1. ✅ Added `orderPrefix` to select statement
2. ✅ Added `minimumOrderValue` to select statement
3. ✅ Both fields included in response

#### PUT `/api/vendors/:id/order-settings`
**Status**: ✅ **Built** — already accepts `orderPrefix` and `minimumOrderValue`
**Authorization**: `requireVendorAccess(req => req.params.id)`

**Request body as of Dec 2024 (superseded — kept for history only, do not use)**:
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

**Request body accepted today**:
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

**Validation Schema (as originally planned — see below for what actually shipped)**:
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

**Actual validation schema shipped** (`backend/src/utils/validation/settingsSchemas.ts` — differs from the plan above in two ways: `orderPrefix` allows digits too and isn't required to be exactly 5 chars, and `category` is a free string, not an enum):
```typescript
export const orderSettingsSchema = z.object({
  category: z.string().max(100).optional().nullable(),
  orderPrefix: z.string()
    .max(5, 'Order prefix must be 5 characters or less')
    .regex(/^[A-Z0-9]*$/, 'Order prefix must contain only uppercase letters and numbers')
    .optional(),
  minimumOrderValue: z.number().int().min(0).optional().nullable(),
  orderPreparationConfig: z.record(z.any()).optional().nullable(),
  askForPreferredDeliveryDate: z.boolean().optional(),
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

**Changes Required (Dec 2024 plan — done)**:
1. ✅ `orderPrefix` validation and update logic added
2. ✅ `minimumOrderValue` validation and update logic added
3. ✅ Both fields included in response

**Business Logic**:
- `orderPrefix`: Up to 5 characters, uppercase letters and digits (not "exactly 5 uppercase letters" as originally planned)
- `minimumOrderValue`: Stored in paise, displayed in rupees
- Changing `orderPrefix` affects future orders only

---

### 4. Notification Settings APIs

#### GET `/api/vendors/:id/notification-settings` ✅ **Built** (UI only exposes the 3 boolean toggles — see `TAB_NOTIFICATIONS.md` status note)

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

#### PUT `/api/vendors/:id/notification-settings` ✅ **Built** (same UI caveat as GET above)

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

#### GET `/api/vendors/:id/matching-config` ✅ **Built** (UI only exposes `threshold`/`enableFuzzy`/`enableAIMatching` — see `TAB_ADVANCED.md` status note; `aiMatchingModel` is live in the product-matching pipeline regardless)

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

#### PUT `/api/vendors/:id/matching-config` ✅ **Built** (schema below is close to what shipped, but fields are all optional/`.passthrough()` in practice, not `.default(...)`-backed — see `backend/src/utils/validation/settingsSchemas.ts`)

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

#### PUT `/api/vendors/:id/timezone` ✅ **Built**

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

> **Status (Sep 2026)**: every checklist item below was completed except the one now marked ❌. Left unchecked (`[ ]`) for historical fidelity to the original Dec 2024 plan — verify against `backend/src/routes/vendors.ts` and `backend/src/services/vendorAIConfigService.ts` rather than treating the boxes as current status.

### New Endpoints to Create (all built)

- [x] `PUT /api/vendors/:id/business-info` — built, with `category` as free text rather than the planned enum
  - [x] Add route handler
  - [x] Add validation schema
  - [x] Add authorization check
  - [x] Handle phone/email uniqueness validation (via the separate verify-phone/verify-email flow, not inline uniqueness checks)
  - [x] Return updated vendor data

- [x] `GET /api/vendors/:id/notification-settings` — built
  - [x] Add route handler
  - [x] Fetch notificationSettings JSON field
  - [x] Return default values if null
  - [x] Parse JSON if stored as string

- [x] `PUT /api/vendors/:id/notification-settings` — built
  - [x] Add route handler
  - [x] Add validation schema
  - [x] Validate quiet hours logic
  - [x] Update notificationSettings JSON field
  - [x] Return updated settings

- [x] `GET /api/vendors/:id/matching-config` — built
  - [x] Add route handler
  - [x] Fetch matchingConfig JSON field
  - [x] Return default values if null
  - [x] Parse JSON if stored as string

- [x] `PUT /api/vendors/:id/matching-config` — built
  - [x] Add route handler
  - [x] Add validation schema
  - [x] Validate threshold range
  - [x] Validate language array
  - [x] Update matchingConfig JSON field
  - [x] Return updated config

- [x] `PUT /api/vendors/:id/timezone` — built
  - [x] Add route handler
  - [x] Add validation schema
  - [x] Validate timezone string
  - [x] Update timezone field
  - [x] Return updated vendor data

### Endpoints to Update (all done except `aiModel`)

- [x] `PUT /api/vendors/:id/ai-prompts`
  - [x] Change authorization from `requireRole('admin')` to `requireVendorAccess(req => req.params.id)`
  - [x] Add `aiProducts` field handling
  - [ ] Add `aiModel` field handling — **still not done; no route anywhere handles `aiModel`**
  - [x] Add `aiContentResponsibilities` field handling
  - [x] Add `aiContentConversationRules` field handling
  - [x] Add `aiContentImportantInstructions` field handling
  - [x] Update validation schema

- [x] `GET /api/vendors/:id/order-settings`
  - [x] Add `orderPrefix` to select statement
  - [x] Add `minimumOrderValue` to select statement
  - [x] Include both fields in response

- [x] `PUT /api/vendors/:id/order-settings`
  - [x] Add `orderPrefix` validation (shipped as "up to 5 uppercase letters/digits," not "5 uppercase letters")
  - [x] Add `minimumOrderValue` validation (positive integer)
  - [x] Add both fields to update logic
  - [x] Include both fields in response
  - [x] Update validation schema

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
- `category` - String (free text in the shipped schema, not an enum — the `'food'/'retail'/'service'/'other'` enum shown elsewhere in this doc was never enforced)
- `orderPrefix` - String (up to 5 chars, uppercase letters and digits — not "5 uppercase letters")
- `minimumOrderValue` - Int (in paise)
- `askForPreferredDeliveryDate` - Boolean
- `orderPreparationConfig` - Json
- `aiBotName` - String
- `aiPersonality` - String
- `aiSystemPrompt` - Text
- `aiProducts` - Text
- `aiModel` - String (default `"gpt-4.1-mini"`; live in the LLM-1 pipeline but not read/written by any API route — see `TAB_AI_CONFIGURATION.md`)
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

