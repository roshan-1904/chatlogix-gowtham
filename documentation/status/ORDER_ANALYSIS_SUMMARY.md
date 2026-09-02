# Order Analysis Summary: ORD-VENDORI-1765093649173

> **Note:** Historical incident summary from 2025-12-07, against the old `multiStageOrchestrator.ts` pipeline. That pipeline is no longer on the production hot path — it was replaced by `backend/src/conversation/*` (see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`). This does not describe current production behavior; for current known gaps see `docs/CONVERSATION_WORKER_GAPS.md`.

**Date Analyzed:** 2025-12-07  
**Log Files:** `backend/logs/multi-stage/2025-12-07/`

## Key Findings

### ❌ Critical Issues Identified

1. **Intent Misclassification**
   - **Expected:** `order_update` (customer providing delivery address and special request for existing order)
   - **Actual:** `product_inquiry` (system treated it as a new product inquiry)
   - **Impact:** System didn't recognize customer was updating existing order

2. **Data Not Saved to Order**
   - Delivery Address: ❌ NOT saved (customer provided: "Tower 10 304, TVH Vista heights, Trichy road, CBE 641005")
   - Special Requests: ❌ NOT saved (customer requested: "make sure it has the medium sweet")
   - Only ConversationMemory was updated, not the actual Order record

3. **Field Mapping Issues**
   - Extracted `address` instead of `deliveryAddress`
   - Extracted `sweetness` instead of `specialRequests`
   - No mapping layer to normalize extracted fields to database schema

4. **Missing Order Context**
   - System didn't check for existing pending order before processing
   - Conversation memory shows empty order summary: "Ordered 0 item(s): "
   - Should have recognized existing order ORD-VENDORI-1765093649173

5. **Incorrect AI Response**
   - System asked customer what product they want
   - Didn't acknowledge existing order
   - Didn't confirm address/request update

## Root Causes

### 1. Intent Classification Service
**File:** `backend/src/services/intentClassificationService.ts`

**Problems:**
- Doesn't check for existing pending orders
- Doesn't consider conversation flow (AI asked → customer responded)
- Relies on keyword matching instead of context
- Used fallback detection instead of AI classification

**Evidence from logs:**
```json
{
  "primaryIntent": "product_inquiry",
  "confidence": 0.6,
  "extractedInfo": {
    "hasDeliveryInfo": false,  // Should be true
    "hasSpecialRequests": false,  // Should be true
    "mentionsOrder": false  // Should be true
  },
  "reasoning": "Keyword-based fallback detection"
}
```

### 2. Data Extraction Service
**File:** `backend/src/services/dataExtractionService.ts`

**Problems:**
- `extractAndSave()` only updates order if `orderItems` exist
- Doesn't update order with delivery address/special requests alone
- Field names don't match schema (`address` vs `deliveryAddress`)
- No normalization layer

**Code Issue:**
```typescript
// Current logic in extractAndSave()
if (extractedData.orderItems && Array.isArray(extractedData.orderItems) && extractedData.orderItems.length > 0) {
  // Only updates if orderItems exist
  await updateOrCreateOrder(...);
}

// Missing: Update order with address/requests even without orderItems
```

### 3. Conversation Memory
**File:** `backend/src/services/conversationMemoryService.ts`

**Problems:**
- `lastOrderSummary` is empty: "Ordered 0 item(s): "
- Should contain: "Ordered 2 boxes Iluppaipoo Choco Chip Cookies, 2 boxes Karuppu Kavuni Rice Brownie"
- Not being updated when orders are created

## What Should Have Happened

1. **Intent Classification:**
   - Check for existing pending order
   - Recognize customer is responding to AI's request for address
   - Classify as `order_update`

2. **Data Extraction:**
   - Extract `deliveryAddress` (not `address`)
   - Extract `specialRequests` (not `sweetness`)
   - Map fields correctly

3. **Order Update:**
   - Find existing pending order ORD-VENDORI-1765093649173
   - Update `deliveryAddress` field
   - Update `specialRequests` field
   - Save to database

4. **Response:**
   - Acknowledge address received
   - Confirm special request noted
   - Ask for confirmation or next steps

## Next Steps - Priority Order

### 🔴 HIGH PRIORITY (Fix Immediately)

1. **Fix Intent Classification**
   - Add function to check for existing pending orders
   - Include order context in intent classification prompt
   - Consider conversation flow (AI asked → customer provided)

2. **Fix Data Extraction Field Mapping**
   - Add normalization layer:
     - `address` → `deliveryAddress`
     - `sweetness` → `specialRequests`
   - Map all extracted fields to correct schema

3. **Fix Order Update Logic**
   - Update `extractAndSave()` to handle order updates without items
   - Check for existing pending order
   - Update order with ANY new information (address, requests, instructions)

### 🟡 MEDIUM PRIORITY (Fix Soon)

4. **Update Conversation Memory**
   - Update `lastOrderSummary` when orders are created/updated
   - Include order details in memory

5. **Improve Response Generation**
   - Check for existing orders before generating response
   - Acknowledge order updates properly
   - Don't ask for products if order already exists

### 🟢 LOW PRIORITY (Enhancement)

6. **Add Validation**
   - Validate extracted data matches schema
   - Warn if fields don't match expected format

7. **Add Logging**
   - Log when order updates are skipped
   - Log field mapping issues

## Files to Modify

1. `backend/src/services/intentClassificationService.ts`
   - Add order context checking
   - Improve prompt with order awareness

2. `backend/src/services/dataExtractionService.ts`
   - Add field mapping/normalization
   - Fix `extractAndSave()` to update orders without items
   - Add function to update order with address/requests

3. `backend/src/services/messageCompositionService.ts`
   - Check for existing orders
   - Generate appropriate acknowledgment messages

4. `backend/src/services/conversationMemoryService.ts`
   - Update `lastOrderSummary` with order details
   - Include order information in memory

## Testing Checklist

- [ ] Test order update with delivery address only
- [ ] Test order update with special requests only
- [ ] Test order update with both address and requests
- [ ] Test intent classification with existing order context
- [ ] Test conversation memory updates
- [ ] Test field mapping/normalization
- [ ] Test response generation with existing orders

## Impact Assessment

**Customer Impact:** 🔴 HIGH
- Customer provided critical information that wasn't saved
- May need to repeat information
- Poor user experience

**Business Impact:** 🟡 MEDIUM
- Order incomplete (missing address)
- Customer preferences not honored
- Potential delivery issues

**Technical Impact:** 🔴 HIGH
- Core functionality broken
- Multiple services need fixes
- Data integrity issues
