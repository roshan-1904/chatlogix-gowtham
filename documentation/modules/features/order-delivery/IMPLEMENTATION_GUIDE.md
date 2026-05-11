# Order Delivery Settings - Implementation Guide

## Overview

This guide provides step-by-step instructions for implementing the order delivery and preparation settings feature. The implementation reuses existing patterns and follows the established architecture.

## Implementation Phases

### Phase 1: Database Schema ✅

**Goal**: Add database fields to support the feature

#### Step 1.1: Update Prisma Schema

**File**: `backend/prisma/schema.prisma`

Add to Vendor model (after `minimumOrderValue` field, around line 38):

```prisma
// Business Configuration
timezone                String  @default("Asia/Kolkata")
orderPrefix              String?
minimumOrderValue        Int?

// Order & Delivery Configuration
category                    String?  // "food", "retail", "service", etc.
askForPreferredDeliveryDate Boolean  @default(false)
orderPreparationConfig      Json?    // Flexible preparation time configuration
```

#### Step 1.2: Create Database Migration

**File**: `backend/prisma/migrations/add_order_delivery_settings.sql`

```sql
-- Migration: Add order delivery and preparation settings
-- Date: 2025-01-XX
-- Description: Adds vendor category, preferred delivery date setting, and flexible preparation time config

-- Add category field
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "category" VARCHAR(50);

-- Add askForPreferredDeliveryDate field
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "askForPreferredDeliveryDate" BOOLEAN NOT NULL DEFAULT false;

-- Add orderPreparationConfig JSON field
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "orderPreparationConfig" JSONB;

-- Add comments for documentation
COMMENT ON COLUMN "Vendor"."category" IS 'Vendor business category: food, retail, service, etc.';
COMMENT ON COLUMN "Vendor"."askForPreferredDeliveryDate" IS 'If true, AI will ask customers for preferred delivery date during order placement';
COMMENT ON COLUMN "Vendor"."orderPreparationConfig" IS 'Order preparation time configuration. Example: {"type": "fixed_minutes", "fixedMinutes": 30, "message": "Usually ready in 30-45 mins"}';
```

#### Step 1.3: Create Data Migration Script

**File**: `backend/scripts/migrate-preparation-time-config.ts`

This script migrates existing `aiPreparationTimeMinutes` values to the new `orderPreparationConfig` format.

#### Step 1.4: Generate Prisma Client

```bash
cd backend
npm run prisma:generate
```

---

### Phase 2: Type Definitions ✅

**Goal**: Define TypeScript types and helper functions

#### Step 2.1: Create Order Settings Types

**File**: `backend/src/types/orderSettings.ts` (NEW FILE)

Defines types for order preparation configuration and helper functions.

---

### Phase 3: API Endpoints ✅

**Goal**: Allow vendors to manage their order settings

#### Step 3.1: Add Vendor Settings Endpoints

**File**: `backend/src/routes/vendors.ts`

Add GET and PUT endpoints for order settings management.

---

### Phase 4: Context Fetching ✅

**Goal**: Include vendor order settings in context fetching

#### Step 4.1: Update Context Fetcher Service

**File**: `backend/src/services/contextFetcherService.ts`

- Add vendor order settings to fetched data for `order_new` intent
- Include settings in vendor config caching

---

### Phase 5: AI Integration ✅

**Goal**: Update AI prompts to ask for delivery date when needed

#### Step 5.1: Update Prompt Builder Service

**File**: `backend/src/services/promptBuilderService.ts`

- Add delivery date requirement check for `order_new` intent
- Update intent instructions to include delivery date collection

---

### Phase 6: Data Validation ✅

**Goal**: Validate delivery date requirement

#### Step 6.1: Update Order Validation Service

**File**: `backend/src/services/dataValidationService.ts`

- Add delivery date validation when vendor requires it
- Ensure order cannot be confirmed without delivery date if required

---

### Phase 7: Order Creation ✅

**Goal**: Use delivery date when creating orders

#### Step 7.1: Update Order Service

**File**: `backend/src/services/orderService.ts`

- Ensure delivery date is extracted and used when creating orders
- Parse delivery date from customer messages

---

## Implementation Checklist

- [ ] Phase 1: Database Schema
  - [ ] Update Prisma schema
  - [ ] Create migration SQL
  - [ ] Create data migration script
  - [ ] Run migrations
  - [ ] Generate Prisma client

- [ ] Phase 2: Type Definitions
  - [ ] Create orderSettings.ts
  - [ ] Add helper functions

- [ ] Phase 3: API Endpoints
  - [ ] Add GET endpoint
  - [ ] Add PUT endpoint
  - [ ] Add validation

- [ ] Phase 4: Context Fetching
  - [ ] Update contextFetcherService
  - [ ] Add to vendor config caching

- [ ] Phase 5: AI Integration
  - [ ] Update promptBuilderService
  - [ ] Update intent instructions

- [ ] Phase 6: Data Validation
  - [ ] Update dataValidationService
  - [ ] Add delivery date validation

- [ ] Phase 7: Order Creation
  - [ ] Update orderService
  - [ ] Ensure delivery date extraction

- [ ] Testing
  - [ ] Test API endpoints
  - [ ] Test order flow
  - [ ] Test all preparation time types
  - [ ] Test backward compatibility

## Reusing Existing Patterns

This implementation reuses the following existing patterns:

1. **Context Fetching Pattern**: Uses `contextFetcherService.ts` pattern for fetching vendor settings
2. **Caching Pattern**: Uses `cacheStrategy.ts` pattern for caching vendor config
3. **Prompt Building Pattern**: Uses `promptBuilderService.ts` pattern for AI prompts
4. **Validation Pattern**: Uses `dataValidationService.ts` pattern for order validation
5. **API Route Pattern**: Uses existing vendor routes pattern for API endpoints

## Next Steps

After implementation:
1. Test with a food vendor (e.g., iBell)
2. Verify delivery date is asked and stored correctly
3. Verify preparation time messages are displayed correctly
4. Test backward compatibility with existing vendors

