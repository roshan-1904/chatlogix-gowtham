---
name: Order Management System Implementation (Updated)
overview: Implement a comprehensive order management system that correctly handles order updates (add/remove/change/replace) instead of replacing orders. This updated plan enhances existing handlers, adds intent detection, and implements safety features based on codebase analysis.
todos:
  - id: phase0-types
    content: "Phase 0: Create orderManagement.ts type definitions file with OrderIntent, OrderUpdateResult, and consolidated OrderItem types."
    status: completed
  - id: phase1-intent-detection
    content: "Phase 1.1: Create intentDetectionService.ts with pattern matching, AI detection, and fallback logic for order intents."
    status: completed
    dependencies:
      - phase0-types
  - id: phase1-integration
    content: "Phase 1.2: CRITICAL - Fix intentClassificationService.ts to integrate intent detection and populate orderUpdateType correctly in 95%+ cases."
    status: completed
    dependencies:
      - phase1-intent-detection
  - id: phase2-duplicate-fix
    content: "Phase 2.1: Fix addItemsToOrder() in dataExtractionService.ts to detect and merge duplicates instead of adding them."
    status: completed
    dependencies:
      - phase1-integration
  - id: phase2-transactions
    content: "Phase 2.2: Add transaction safety to all handler functions (addItemsToOrder, removeItemsFromOrder, updateOrderQuantities, replaceOrder, updateOrCreateOrder)."
    status: completed
    dependencies:
      - phase2-duplicate-fix
  - id: phase2-validation
    content: "Phase 2.3: Add validation checks to all handlers (empty arrays, minimum items, valid quantities, product existence)."
    status: completed
    dependencies:
      - phase2-transactions
  - id: phase3-extraction
    content: "Phase 3: Enhance data extraction to include order context, conversation memory, and vendor products. Update Stage 3 in orchestrator."
    status: completed
    dependencies:
      - phase1-integration
  - id: phase4-validation
    content: "Phase 4.1: Enhance orderUpdateValidationService.ts with intent-specific validation (duplicates, minimum items, price consistency)."
    status: completed
    dependencies:
      - phase2-validation
  - id: phase4-audit
    content: "Phase 4.2: Create orderTrackingService.ts and database migration for OrderAuditLog table. Integrate audit logging into handlers."
    status: completed
    dependencies:
      - phase4-validation
  - id: phase4-alerts
    content: "Phase 4.3: Create orderAlertService.ts and database migration for OrderAlert table. Detect suspicious changes and alert vendors."
    status: completed
    dependencies:
      - phase4-audit
  - id: phase5-recovery
    content: "Phase 5: Create orderRecoveryService.ts and orderRecoveryWorker.ts to detect and fix order discrepancies automatically."
    status: completed
    dependencies:
      - phase4-alerts
  - id: phase6-communication
    content: "Phase 6: Create orderSummaryService.ts and update messageCompositionService.ts for better customer communication."
    status: completed
    dependencies:
      - phase2-validation
  - id: phase7-schema
    content: "Phase 7: Update Prisma schema with OrderAuditLog and OrderAlert models, run migrations."
    status: completed
  - id: phase8-integration
    content: "Phase 8: Enhance extractAndSave() function, add concurrency handling, create comprehensive unit and integration tests."
    status: completed
    dependencies:
      - phase2-validation
      - phase3-extraction
      - phase4-audit
  - id: phase9-monitoring
    content: "Phase 9: Create orderConfig.ts and orderMetricsService.ts for configuration and monitoring order management performance."
    status: completed
    dependencies:
      - phase8-integration
---

# Order Management System - Updated Implementation Plan

## Overview

This plan implements a robust order management system that fixes the critical issue where `updateOrCreateOrder()` in [`backend/src/services/dataExtractionService.ts`](backend/src/services/dataExtractionService.ts) replaces entire orders instead of merging them. **Key finding**: Handler functions already exist but need enhancement. The plan focuses on fixing intent detection, enhancing existing handlers, and adding safety features.

## Current State Analysis

### Critical Issues Found

1. **Root Cause**: `orderUpdateType` is not being detected correctly by intent classification, causing fallback to `updateOrCreateOrder()` which replaces orders (line 789-798 in `dataExtractionService.ts`)
2. **Existing Infrastructure** (Good News):

- Handler functions already exist: `addItemsToOrder()`, `removeItemsFromOrder()`, `updateOrderQuantities()`, `replaceOrder()` in [`backend/src/services/dataExtractionService.ts`](backend/src/services/dataExtractionService.ts)
- Routing logic exists in `extractAndSave()` (lines 328-343) but falls back to `updateOrCreateOrder()` when `orderUpdateType` is missing
- Stage 4.5 validation exists in [`backend/src/services/orderUpdateValidationService.ts`](backend/src/services/orderUpdateValidationService.ts)
- Multi-stage orchestrator in [`backend/src/services/multiStageOrchestrator.ts`](backend/src/services/multiStageOrchestrator.ts) calls Stage 4.5

3. **Critical Code Issues**:

- `addItemsToOrder()` (line 413): No duplicate detection - just concatenates arrays
- No transaction safety: All handlers update orders without transactions
- No validation: Missing checks for empty orders, invalid quantities, etc.
- No audit logging: Changes not tracked

## Implementation Phases

### Phase 0: Type Definitions & Foundation (Day 1)

#### 0.1 Create Type Definitions File

**File**: `backend/src/types/orderManagement.ts` (NEW)**Purpose**: Centralize all order management type definitions**Key Types**:

````typescript
export interface OrderIntent {
  type: 'add' | 'remove' | 'change' | 'replace' | 'confirm' | 'cancel' | 'new';
  confidence: number;
  extractedItems?: OrderItem[];
  itemsToRemove?: string[];
  quantityChanges?: Array<{product: string, newQuantity: number}>;
  reasoning?: string;
}

export interface OrderUpdateResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  previousTotal: number;
  newTotal: number;
  itemsAdded?: number;
  itemsRemoved?: number;
  itemsChanged?: number;
  errors?: string[];
  warnings?: string[];
}

export interface OrderItem {
  product: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  unit?: string;
  matchedProductId?: string;
}

// Consolidate with existing OrderItem definitions in orderService.ts and aiResponse.ts
```

**Integration**: Update imports in existing files to use centralized types.

### Phase 1: Intent Detection Engine (Week 1, Days 1-3)

#### 1.1 Create Intent Detection Service

**File**: `backend/src/services/intentDetectionService.ts` (NEW)**Implementation**:

- Pattern-based detection using regex for fast path (80%+ cases)
- AI-based detection for ambiguous cases (using GPT-4o-mini)
- Context-aware fallback logic
- Multi-language support (English, Tamil, Hindi)

**Key Functions**:

```typescript
export function detectIntentFromPatterns(
  message: string,
  hasExistingOrder: boolean
): OrderIntent | null

export async function detectIntentWithAI(
  message: string,
  conversationState: ConversationState,
  memory: ConversationMemory,
  existingOrder: Order | null
): Promise<OrderIntent>

export function fallbackIntentDetection(
  message: string,
  hasExistingOrder: boolean,
  extractedItems: OrderItem[]
): OrderIntent
```

**Pattern Library**: Include patterns for all intent types in English, Tamil, and Hindi (reference `documentation/ORDER_MANAGEMENT_PLAN.md` lines 281-303).**Critical**: Pattern matching should handle:

- "add X to my order" → `add`
- "remove X from order" → `remove`
- "change X to Y" → `change`
- "replace order with X" → `replace`
- "I want X" (with existing order) → `add` (safe default)
- "I want X" (no existing order) → `new`

#### 1.2 Fix Intent Classification Integration (CRITICAL PRIORITY)

**File**: [`backend/src/services/intentClassificationService.ts`](backend/src/services/intentClassificationService.ts)**Critical Changes**:

1. Import `intentDetectionService` 
2. In `classifyIntent()` function, when `primaryIntent === 'order_update'`:

- Call `detectIntentFromPatterns()` first (fast path)
- If no pattern match, call `detectIntentWithAI()` 
- If still ambiguous, use `fallbackIntentDetection()`
- Map result to `orderUpdateType` field in `IntentClassification.extractedInfo`

3. Ensure `orderUpdateType` is populated correctly:

- `'add_items'` for add intent
- `'remove_items'` for remove intent
- `'change_quantity'` for change intent
- `'replace_order'` for replace intent (only when explicit)

**Key Update Location**: Modify `classifyIntent()` function around line 139-369 to integrate intent detection service.**Success Criteria**: `orderUpdateType` is populated correctly in 95%+ of order_update intents.

### Phase 2: Enhance Existing Handlers (Week 1, Days 4-5)

#### 2.1 Fix addItemsToOrder() - Add Duplicate Detection

**File**: [`backend/src/services/dataExtractionService.ts`](backend/src/services/dataExtractionService.ts)**Current Issue** (line 413): `const updatedItems = [...currentItems, ...items];` - No duplicate check**Fix Implementation**:

```typescript
// Before adding items, check for duplicates
const updatedItems = [...currentItems];

for (const newItem of items) {
  const productName = (newItem.product || newItem.name || '').toLowerCase();
  
  // Find existing item with same product (fuzzy match)
  const existingIndex = updatedItems.findIndex(item => {
    const itemName = (item.product || item.name || '').toLowerCase();
    return itemName === productName || 
           itemName.includes(productName) || 
           productName.includes(itemName);
  });
  
  if (existingIndex >= 0) {
    // Merge quantities instead of adding duplicate
    updatedItems[existingIndex].quantity = 
      (updatedItems[existingIndex].quantity || 0) + (newItem.quantity || 0);
  } else {
    // Add new item
    updatedItems.push(newItem);
  }
}
```

**Location**: Update `addItemsToOrder()` function starting at line 399.

#### 2.2 Add Transaction Safety to All Handlers

**File**: [`backend/src/services/dataExtractionService.ts`](backend/src/services/dataExtractionService.ts)**Implementation**: Wrap all handler functions in Prisma transactions:

```typescript
async function addItemsToOrder(orderId: string, items: any[], vendorId: string): Promise<void> {
  return await prisma.$transaction(async (tx) => {
    // Existing logic here
    // Use tx.order instead of prisma.order
  });
}
```

**Apply to**:

- `addItemsToOrder()` (line 399)
- `removeItemsFromOrder()` (line 476)
- `updateOrderQuantities()` (line 570)
- `replaceOrder()` (line 665)
- `updateOrCreateOrder()` (line 729) - Keep as fallback but add transaction

**Critical**: Ensure atomicity - if any step fails, entire operation rolls back.

#### 2.3 Add Validation to All Handlers

**File**: [`backend/src/services/dataExtractionService.ts`](backend/src/services/dataExtractionService.ts)**Add Validation Checks**:

1. **addItemsToOrder()**:

- Validate items array is not empty
- Validate each item has product name and quantity > 0
- Validate products exist in catalog

2. **removeItemsFromOrder()**:

- Validate at least one item remains after removal
- Validate items to remove exist in order
- Prevent removing all items

3. **updateOrderQuantities()**:

- Validate quantities > 0
- Validate products exist in order
- Validate minimum order quantities

4. **replaceOrder()**:

- Validate new items array is not empty
- Validate all products exist in catalog

**Implementation**: Add validation functions and call before database updates.

#### 2.4 Create Order Update Router (Optional Refactor)

**File**: `backend/src/services/orderUpdateRouter.ts` (NEW)**Purpose**: Centralize routing logic currently in `extractAndSave()` for better testability and maintainability.**Implementation**:

```typescript
export class OrderUpdateRouter {
  async route(
    orderUpdateType: string | null | undefined,
    existingOrder: Order | null,
    extractedData: any,
    conversationId: string,
    vendorId: string,
    customerId: string
  ): Promise<OrderUpdateResult> {
    // Route to appropriate handler based on orderUpdateType
    // Wrap in transaction
    // Return standardized result
  }
}
```

**Note**: This is optional - current routing in `extractAndSave()` works but router improves code organization.

### Phase 3: Enhanced Context-Aware Extraction (Week 2, Days 1-2)

#### 3.1 Update Data Extraction Service

**File**: [`backend/src/services/dataExtractionService.ts`](backend/src/services/dataExtractionService.ts)**Enhancements**:

- Include existing order state in extraction prompts
- Pass conversation memory to extraction
- Include vendor products in context
- Multi-language item extraction support

**Key Update**: Modify extraction prompt builder (likely in `primaryAIResponseService.ts` or `dataExtractionService.ts`) to include:

- Current order items and total
- Recent conversation context
- Vendor product catalog
- Clear extraction rules based on intent

#### 3.2 Update Stage 3 (Data Extraction) in Orchestrator

**File**: [`backend/src/services/multiStageOrchestrator.ts`](backend/src/services/multiStageOrchestrator.ts)**Changes**:

- Pass existing order state to extraction stage
- Include conversation memory in extraction context
- Ensure extracted data includes intent information

**Location**: Find Stage 3 execution and update context passing.

### Phase 4: Enhanced Validation & Safety (Week 2, Days 3-5)

#### 4.1 Enhance Order Update Validation

**File**: [`backend/src/services/orderUpdateValidationService.ts`](backend/src/services/orderUpdateValidationService.ts)**Enhancements**:

- Add validation for intent-specific operations
- Validate merge operations (prevent duplicates)
- Validate removal operations (ensure at least one item remains)
- Add total validation against AI response

**New Validation Checks**:

- Duplicate item detection for add operations
- Minimum item count for remove operations (at least 1 item)
- Price consistency validation (calculated vs provided)
- Completeness check (all mentioned items captured)

**Integration**: Call validation before handlers execute in `extractAndSave()`.

#### 4.2 Create Order Audit Log System

**Database Migration**: Create `OrderAuditLog` table**File**: `backend/prisma/migrations/XXXXXX_add_order_audit_log/migration.sql` (NEW)**Schema**:

```sql
CREATE TABLE "OrderAuditLog" (
  id VARCHAR(191) PRIMARY KEY,
  orderId VARCHAR(191) NOT NULL,
  action VARCHAR(191) NOT NULL,
  changes JSON NOT NULL,
  intent VARCHAR(191),
  previousState JSON,
  newState JSON,
  timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (orderId) REFERENCES "Order"(id) ON DELETE CASCADE
);

CREATE INDEX "OrderAuditLog_orderId_idx" ON "OrderAuditLog"(orderId);
CREATE INDEX "OrderAuditLog_timestamp_idx" ON "OrderAuditLog"(timestamp);
```

**File**: `backend/src/services/orderTrackingService.ts` (NEW)**Implementation**:

- Track all order changes with before/after state
- Log intent and action type
- Calculate diffs for audit trail
- Store in `OrderAuditLog` table

**Integration**: Call from each handler after successful update.

#### 4.3 Create Order Alert System

**Database Migration**: Create `OrderAlert` table**File**: `backend/prisma/migrations/XXXXXX_add_order_alerts/migration.sql` (NEW)**File**: `backend/src/services/orderAlertService.ts` (NEW)**Implementation**:

- Detect suspicious changes:
- Large price drops (>20%)
- Items lost (mentioned but not in order)
- Total mismatch (AI response vs database)
- Generate alerts for vendor review
- Store alerts in database
- Integrate with notification system

**Thresholds**: Configurable via `orderConfig.ts`.

### Phase 5: Error Recovery System (Week 3, Days 1-3)

#### 5.1 Create Order Recovery Service

**File**: `backend/src/services/orderRecoveryService.ts` (NEW)**Implementation**:

- Detect order discrepancies by comparing:
- Database order vs AI response mentions
- Conversation history vs stored order
- Attempt automatic recovery:
- Re-extract items from conversation
- Compare with database order
- Add missing items if found
- Generate recovery reports

**Key Functions**:

```typescript
export async function detectAndRecoverOrderIssues(): Promise<void>

export async function attemptOrderRecovery(
  conversationId: string
): Promise<RecoveryResult>
```

**Recovery Strategy**:

1. Scan recent orders (last 24 hours)
2. Compare AI responses with database orders
3. Identify discrepancies
4. Attempt recovery (add missing items)
5. Notify vendor if recovery attempted

#### 5.2 Create Recovery Worker

**File**: `backend/src/workers/orderRecoveryWorker.ts` (NEW)**Implementation**:

- Background job to scan for suspicious orders
- Run recovery attempts
- Notify vendors of recovered orders
- Schedule: Every 5 minutes (configurable)

**Integration**: Add to worker startup in `backend/src/index.ts` or worker entry point.**Queue**: Use BullMQ queue for recovery jobs.

### Phase 6: Customer Communication (Week 3, Days 4-5)

#### 6.1 Create Order Summary Service

**File**: `backend/src/services/orderSummaryService.ts` (NEW)**Implementation**:

- Generate clear order summaries
- Format items with quantities and prices
- Add confirmation prompts
- Multi-language support

**Key Functions**:

```typescript
export function generateOrderSummary(
  order: Order,
  intent: OrderIntent
): string

export function generateAddItemsSummary(
  order: Order,
  itemsAdded: OrderItem[]
): string
```



#### 6.2 Update Response Generation

**File**: [`backend/src/services/messageCompositionService.ts`](backend/src/services/messageCompositionService.ts)**Changes**:

- Include order summary in responses for order-related intents
- Add clarification prompts when needed
- Format responses based on customer language

**Integration**: Call `orderSummaryService` in message composition.

### Phase 7: Database Schema Updates (Week 2, Day 5)

#### 7.1 Update Prisma Schema

**File**: [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)**Add Models**:

```prisma
model OrderAuditLog {
  id           String   @id @default(uuid())
  orderId      String
  action       String
  changes      Json
  intent       String?
  previousState Json?
  newState     Json?
  timestamp    DateTime @default(now())
  
  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  
  @@index([orderId])
  @@index([timestamp])
  @@map("OrderAuditLog")
}

model OrderAlert {
  id        String   @id @default(uuid())
  orderId   String
  type      String
  severity  String
  message   String   @db.Text
  resolved  Boolean  @default(false)
  createdAt DateTime @default(now())
  
  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  
  @@index([orderId])
  @@index([resolved])
  @@map("OrderAlert")
}
```

**Update Order Model**: Add relation to audit logs and alerts:

```prisma
model Order {
  // ... existing fields ...
  auditLogs OrderAuditLog[]
  alerts    OrderAlert[]
}
```



#### 7.2 Run Migrations

**Commands**:

```bash
cd backend
npx prisma migrate dev --name add_order_audit_and_alerts
npx prisma generate
```



### Phase 8: Integration & Testing (Week 4)

#### 8.1 Update extractAndSave() Function

**File**: [`backend/src/services/dataExtractionService.ts`](backend/src/services/dataExtractionService.ts)**Current State**: Routing logic exists (lines 328-343) but needs improvement.**Enhancements**:

1. Ensure `orderUpdateType` is checked correctly
2. Add transaction wrapping around entire order update flow
3. Add audit logging after successful updates
4. Add error handling with rollback
5. Add validation before routing to handlers

**Key Update**: Enhance existing routing logic, don't replace entirely.

#### 8.2 Add Concurrency Handling

**File**: [`backend/src/services/dataExtractionService.ts`](backend/src/services/dataExtractionService.ts)**Issue**: Simultaneous order updates could conflict.**Solution**:

- Use Prisma transactions with isolation level
- Add row-level locking for order updates
- Handle transaction conflicts gracefully

**Implementation**:

```typescript
// Use Prisma transaction with proper isolation
await prisma.$transaction(async (tx) => {
  // Lock order row
  const order = await tx.order.findUnique({
    where: { id: orderId },
    // Add locking hint if supported
  });
  
  // Perform update
}, {
  isolationLevel: 'ReadCommitted', // or 'Serializable' for stricter isolation
  maxWait: 5000, // 5 seconds max wait
  timeout: 10000, // 10 seconds timeout
});
```



#### 8.3 Create Unit Tests

**Directory**: `backend/src/services/__tests__/orderManagement/` (NEW)**Test Files**:

- `intentDetectionService.test.ts` - Test pattern matching, AI detection, fallback
- `addItemsHandler.test.ts` - Test duplicate detection, transaction safety
- `removeItemsHandler.test.ts` - Test validation, minimum items check
- `changeItemsHandler.test.ts` - Test quantity updates
- `replaceOrderHandler.test.ts` - Test full replacement
- `orderTrackingService.test.ts` - Test audit logging
- `orderRecoveryService.test.ts` - Test recovery logic

**Coverage Target**: 90%+ for all new and modified services.

#### 8.4 Create Integration Tests

**File**: `backend/src/services/__tests__/orderManagement.integration.test.ts` (NEW)**Test Scenarios**:

1. Complete order flow: new → add → confirm
2. Order modifications: add → remove → change
3. Multi-language orders (English, Tamil, Hindi)
4. Error recovery scenarios
5. Edge cases:

- Duplicate items in add
- Removing all items (should fail)
- Concurrent updates
- Transaction rollback on error
- Missing products
- Invalid quantities

**Critical Test Cases**:

- Customer says "add brownie" when order has brownie → should merge quantities
- Customer says "add cookies" when order has brownie → should add cookies, keep brownie
- Customer says "I want cookies" with existing order → should add cookies (not replace)

### Phase 9: Configuration & Monitoring (Week 4, Days 4-5)

#### 9.1 Create Order Configuration

**File**: `backend/src/config/orderConfig.ts` (NEW)**Implementation**: Reference `documentation/ORDER_MANAGEMENT_PLAN.md` lines 892-924 for configuration structure.**Key Configuration**:

```typescript
export const ORDER_CONFIG = {
  INTENT_DETECTION: {
    PATTERN_CONFIDENCE_THRESHOLD: 0.8,
    AI_CONFIDENCE_THRESHOLD: 0.7,
    FALLBACK_CONFIDENCE_THRESHOLD: 0.6,
  },
  VALIDATION: {
    TOTAL_MISMATCH_THRESHOLD: 1, // Rupees
    MAX_DUPLICATE_ITEMS: 0,
    MIN_ITEMS_AFTER_REMOVAL: 1,
    PRICE_CHANGE_ALERT_THRESHOLD: 0.2, // 20%
  },
  RECOVERY: {
    AUTO_RECOVERY_ENABLED: true,
    RECOVERY_CHECK_INTERVAL: 300000, // 5 minutes
    MAX_RECOVERY_ATTEMPTS: 3,
  },
  ALERTS: {
    SUSPICIOUS_CHANGE_THRESHOLD: -100, // Rupees
    ITEMS_LOST_THRESHOLD: -1,
    ENABLE_VENDOR_NOTIFICATIONS: true,
  },
};
```



#### 9.2 Add Monitoring

**File**: `backend/src/services/orderMetricsService.ts` (NEW)**Metrics to Track**:

- Intent detection accuracy (% correct)
- Handler performance (latency per type)
- Recovery success rate (% successful recoveries)
- Order accuracy (items in DB vs AI response)
- False replacement rate (% unnecessary replacements)
- Transaction failure rate
- Average order update time

**Integration**: Add metrics logging to handlers and router.**Dashboard**: Create monitoring dashboard or integrate with existing monitoring system.

## Implementation Order (Revised)

### Week 1: Foundation & Critical Fixes

- **Day 1**: Phase 0 (Type Definitions) + Phase 1.1 (Intent Detection Service)
- **Day 2**: Phase 1.2 (Fix Intent Classification Integration) - **CRITICAL**
- **Day 3**: Phase 2.1 (Fix addItemsToOrder duplicate detection)
- **Day 4**: Phase 2.2 (Add transaction safety to all handlers)
- **Day 5**: Phase 2.3 (Add validation to all handlers) + Testing

### Week 2: Enhancement & Safety

- **Day 1-2**: Phase 3 (Enhanced Extraction)
- **Day 3**: Phase 4.1 (Enhanced Validation)
- **Day 4**: Phase 4.2 (Audit Logging) + Phase 7 (Database Schema)
- **Day 5**: Phase 4.3 (Alert System)

### Week 3: Recovery & Communication

- **Day 1-3**: Phase 5 (Recovery System)
- **Day 4-5**: Phase 6 (Customer Communication)

### Week 4: Integration & Testing

- **Day 1-2**: Phase 8.1-8.2 (Integration & Concurrency)
- **Day 3**: Phase 8.3-8.4 (Testing)
- **Day 4-5**: Phase 9 (Configuration & Monitoring) + Final testing

## Critical Success Factors

1. **Fix Intent Detection Integration** (Priority #1): Must populate `orderUpdateType` correctly in 95%+ cases
2. **Fix addItemsToOrder()**: Add duplicate detection to prevent duplicate items
3. **Transaction Safety**: All order updates must be atomic
4. **Backward Compatibility**: Existing orders must continue to work
5. **Performance**: Maintain <2s response time for order updates

## Risk Mitigation

1. **Feature Flag**: Add feature flag `ENABLE_NEW_ORDER_MANAGEMENT` to gradually roll out
2. **Fallback**: Keep old `updateOrCreateOrder()` as fallback initially (with feature flag)
3. **Monitoring**: Track metrics from day 1 to catch issues early
4. **Testing**: Comprehensive test coverage before production deployment
5. **Gradual Rollout**: 

- Week 1: Internal testing
- Week 2: Beta vendors (10%)
- Week 3: Expanded rollout (50%)
- Week 4: Full rollout (100%)

## Error Handling Strategy

1. **Transaction Failures**: Retry with exponential backoff (max 3 retries)
2. **Validation Failures**: Return clear error messages, don't update order
3. **Product Matching Failures**: Ask for clarification, don't fail silently
4. **Concurrency Conflicts**: Retry transaction, inform user if persistent
5. **Recovery Failures**: Log error, alert vendor, don't auto-fix if uncertain

## Migration Strategy

1. **Database Migrations**: Run during low-traffic period
2. **Code Deployment**: Deploy with feature flag disabled
3. **Enable Feature Flag**: Gradually enable for vendors
4. **Monitor**: Watch metrics closely for first 48 hours
5. **Rollback Plan**: Keep old code path available via feature flag

## Files to Create/Modify

### New Files (12):

- `backend/src/types/orderManagement.ts` - **CRITICAL: Start here**
- `backend/src/services/intentDetectionService.ts` - **CRITICAL: Priority #1**
- `backend/src/services/orderUpdateRouter.ts` - Optional refactor
- `backend/src/services/orderTrackingService.ts`
- `backend/src/services/orderAlertService.ts`
- `backend/src/services/orderRecoveryService.ts`
- `backend/src/services/orderSummaryService.ts`
- `backend/src/workers/orderRecoveryWorker.ts`
- `backend/src/config/orderConfig.ts`
- `backend/src/services/orderMetricsService.ts`
- `backend/prisma/migrations/XXXXXX_add_order_audit_log/migration.sql`
- `backend/prisma/migrations/XXXXXX_add_order_alerts/migration.sql`

### Modified Files (5):

- `backend/src/services/intentClassificationService.ts` - **CRITICAL: Fix integration**
- `backend/src/services/dataExtractionService.ts` - **CRITICAL: Fix handlers**
- `backend/src/services/orderUpdateValidationService.ts` - Enhance validation
- `backend/src/services/multiStageOrchestrator.ts` - Update context passing
- `backend/prisma/schema.prisma` - Add audit/alert models

### Test Files (8):

- `backend/src/services/__tests__/orderManagement/intentDetectionService.test.ts`
- `backend/src/services/__tests__/orderManagement/addItemsHandler.test.ts`
- `backend/src/services/__tests__/orderManagement/removeItemsHandler.test.ts`
- `backend/src/services/__tests__/orderManagement/changeItemsHandler.test.ts`
- `backend/src/services/__tests__/orderManagement/replaceOrderHandler.test.ts`
- `backend/src/services/__tests__/orderManagement/orderTrackingService.test.ts`
- `backend/src/services/__tests__/orderManagement/orderRecoveryService.test.ts`
- `backend/src/services/__tests__/orderManagement.integration.test.ts`

## Key Differences from Original Plan

1. **Enhance Existing Handlers**: Don't create new handler classes, fix existing functions
2. **Type Definitions First**: Create types file before implementation
3. **Fix Intent Detection First**: This is the root cause, fix it immediately
4. **Transaction Safety Early**: Add transactions in Week 1, not Week 3
5. **Router Optional**: Router is nice-to-have, not critical
6. **More Specific Code Fixes**: Identified exact lines and fixes needed

## Success Metrics

- **Intent Detection Accuracy**: >95% correct `orderUpdateType` detection
- **Order Accuracy**: >99.5% items correctly captured

````