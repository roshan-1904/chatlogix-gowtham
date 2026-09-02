# Memory Update and Clarification Rules Enhancement Plan

> **Note:** Dated point-in-time snapshot from development of the multi-stage AI pipeline (`multiStageOrchestrator.ts`), which is no longer on the production hot path — it was replaced by `backend/src/conversation/*` (see `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for the current system). Kept for historical record; not reflective of current production behavior.

**Date:** December 2024  
**Status:** Planning  
**Priority:** High  
**Related Issues:** 
- Memory not available early enough for Stages 3-4
- AI asking unnecessary questions
- Need to ensure memory updates on every messageProcessor

---

## Executive Summary

This document outlines the implementation plan for:
1. **Early Memory Updates**: Updating customer memory and insights earlier in the pipeline (Stage 2 and Stage 4) instead of only in Stage 8
2. **Clarification Rules Enhancement**: Ensuring AI only asks questions when critical information is missing, focusing on customer responses instead

### Problem Statement

**Current State:**
- Memory is only updated in Stage 8 (too late)
- Memory not available for Stages 3-7
- AI asks unnecessary questions even when information exists in memory
- Memory updates don't happen if pipeline exits early

**Desired State:**
- Memory updated incrementally: Stage 2 (intent + insights), Stage 4 (AI-extracted data), Stage 8 (final)
- Memory available for all stages that need it
- AI uses memory instead of asking questions
- Memory updates happen even on early exits

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Proposed Solution](#2-proposed-solution)
3. [Two-Phase Memory Update Strategy](#3-two-phase-memory-update-strategy)
4. [Clarification Rules Enhancement](#4-clarification-rules-enhancement)
5. [Gap Analysis and Fixes](#5-gap-analysis-and-fixes)
6. [Implementation Details](#6-implementation-details)
7. [Testing Checklist](#7-testing-checklist)
8. [Rollout Plan](#8-rollout-plan)

---

## 1. Current State Analysis

### 1.1 Memory Update Flow (Current)

**Stage 0.5:** Retrieve memory (read-only)  
**Stage 8:** Update memory (write)  
**Gap:** Memory not updated until Stage 8, so Stages 3-7 don't have latest memory

### 1.2 Clarification Behavior (Current)

**Stage 4:** AI generates response with `needsClarification` flag  
**Issue:** AI asks questions even when information exists in memory  
**Issue:** No explicit rules about when to ask vs. when to use memory

### 1.3 Data Available at Each Stage

| Stage | Available Data | Can Update Memory? |
|-------|---------------|-------------------|
| Stage 0.5 | Memory (read) | ❌ No |
| Stage 1 | Intent, extracted info | ✅ Yes |
| Stage 2 | Intent, extracted info, customer insights, products | ✅ Yes |
| Stage 3 | Prompt built | ❌ No |
| Stage 4 | AI response, extracted data | ✅ Yes |
| Stage 5-7 | Refined response | ❌ No |
| Stage 8 | Validated data | ✅ Yes (final) |

---

## 2. Proposed Solution

### 2.1 Two-Phase Memory Update Strategy

**Phase 1: Stage 2** - Update with intent and customer insights
- Intent classification results
- Extracted info from Stage 1
- Customer insights fetched in Stage 2
- Auto-extract key facts from conversation history

**Phase 2: Stage 4** - Update with AI-extracted structured data
- AI-extracted order items
- AI-extracted delivery address
- AI-extracted customer preferences
- Ongoing topics from AI response

**Phase 3: Stage 8** - Final update with complete data
- Full conversation history
- Turn increment
- Order summary
- Complete key facts extraction

### 2.2 Clarification Rules Enhancement

**Add explicit rules to Stage 4 prompt:**
- Only ask questions when critical information is missing
- Use memory instead of asking
- Focus on customer response, not follow-up questions
- Validate `needsClarification` against memory

---

## 3. Two-Phase Memory Update Strategy

### 3.1 Stage 2: Intent and Insights Update

**When:** After fetching relevant data  
**What to Update:**
- Intent classification results
- Extracted info (products, quantities, etc.)
- Customer insights (name, address, preferences)
- Ongoing topics from intent
- Key facts (auto-extracted from conversation history)

**Implementation:**
```typescript
// In executeStage2 method
const data = await fetchRelevantData(...);

// Update memory with intent and insights
await updateConversationMemory(context.conversationId, context.vendorId, {
  conversationHistory: conversationHistory.reverse(),
  currentMessage: context.rawMessage, // Triggers auto-extraction
  ongoingTopics: extractOngoingTopicsFromIntent(...),
  customerPreferences: extractPreferencesFromInsights(data.insights),
  incrementTurn: false // Don't increment until Stage 8
});

// Invalidate cache and refresh memory
await invalidateConversationCache(context.conversationId);
context.memory = await retrieveConversationMemory(...);
```

**Benefits:**
- Memory available for Stage 3 (prompt building)
- Memory available for Stage 4 (AI response generation)
- Intent and insights captured early

### 3.2 Stage 4: AI-Extracted Data Update

**When:** After AI response generation  
**What to Update:**
- AI-extracted order items
- AI-extracted delivery address
- AI-extracted customer preferences
- Ongoing topics from AI response
- Conversation flow stage

**Implementation:**
```typescript
// In executeStage4 method
const aiResponse = await generatePrimaryAIResponse(...);

// Update memory with AI-extracted data
await updateConversationMemory(context.conversationId, context.vendorId, {
  currentMessage: context.rawMessage,
  ongoingTopics: extractOngoingTopicsFromResponse(aiResponse),
  customerPreferences: extractPreferencesFromExtractedData(aiResponse.extractedData),
  incrementTurn: false // Don't increment until Stage 8
});

// Invalidate cache and refresh memory
await invalidateConversationCache(context.conversationId);
context.memory = await retrieveConversationMemory(...);
```

**Benefits:**
- Memory available for Stages 5-7
- AI-extracted structured data captured
- Better context for clarification and refinement

### 3.3 Stage 8: Final Update

**When:** After data validation  
**What to Update:**
- Full conversation history (30 messages)
- Turn increment
- Order summary
- Complete key facts extraction (AI-powered)
- Final ongoing topics

**Implementation:**
```typescript
// In extractAndSave function (Stage 8)
await updateConversationMemory(conversationId, vendorId, {
  conversationHistory: conversationHistory.reverse(),
  currentMessage: latestCustomerMessage,
  ongoingTopics: extractOngoingTopics(response),
  lastOrderSummary: extractOrderSummary(normalizedData),
  incrementTurn: true // Final turn increment
});
```

**Benefits:**
- Complete memory state
- Turn counter incremented
- Order summary stored
- Full key facts extraction

---

## 4. Clarification Rules Enhancement

### 4.1 Problem Statement

**Current Issues:**
- AI asks questions even when information exists in memory
- AI asks multiple questions instead of focusing on customer response
- No validation of `needsClarification` against memory

**Examples of Unnecessary Questions:**
- "What's your name?" (when name exists in memory)
- "What's your address?" (when address exists in memory)
- "What would you like to order?" (when customer already mentioned products)

### 4.2 Solution: Enhanced Prompt Instructions

**Add to Stage 4 prompt:**

```typescript
const clarificationRules = `
CRITICAL CLARIFICATION RULES - STRICTLY ENFORCE:

1. ONLY ASK QUESTIONS WHEN ABSOLUTELY CRITICAL:
   - Missing information that PREVENTS order completion (name, address for order confirmation)
   - Missing information that PREVENTS accurate product matching (unclear product name)
   - Missing information that PREVENTS order creation (no products specified)
   - DO NOT ask for optional information (special requests, delivery time preferences)
   - DO NOT ask questions that can be inferred from conversation history
   - DO NOT ask questions that can be retrieved from customer memory

2. USE MEMORY INSTEAD OF ASKING:
   - If customer name exists in memory → USE IT, don't ask
   - If delivery address exists in memory → USE IT, don't ask
   - If preferences exist in memory → USE THEM, don't ask again
   - If product was mentioned before → REFERENCE IT, don't ask to confirm

3. FOCUS ON CUSTOMER RESPONSE:
   - Respond to what customer said, don't ask follow-up questions
   - If customer provided information → ACKNOWLEDGE and USE IT
   - If customer asked a question → ANSWER IT directly
   - If customer made a statement → RESPOND to it naturally
   - Only ask ONE question at a time, and only if CRITICAL

4. EXAMPLES OF WHAT NOT TO ASK:
   ❌ "What would you like to order?" (if customer already mentioned products)
   ❌ "What's your name?" (if name exists in memory)
   ❌ "What's your address?" (if address exists in memory)
   ❌ "Any special requests?" (optional, don't ask)
   ❌ "When do you need it?" (can infer from context or use defaults)
   
5. EXAMPLES OF WHEN TO ASK:
   ✅ "I need your delivery address to confirm the order" (critical for order confirmation)
   ✅ "Which product did you mean? I have X, Y, Z" (unclear product name)
   ✅ "How many would you like?" (quantity missing for order)

6. SET needsClarification ONLY WHEN:
   - Critical information is missing AND
   - Cannot proceed without it AND
   - Cannot infer from memory or context
`;
```

### 4.3 Memory Usage in Prompt

**Enhance prompt builder to include memory explicitly:**

```typescript
// In promptBuilderService.ts
if (memory) {
  const customerName = memory.customerPreferences?.information?.name || 
                      memory.customerPreferences?.customerName || null;
  const deliveryAddress = memory.customerPreferences?.deliveryAddress || 
                         memory.customerPreferences?.primaryDeliveryAddress || null;
  
  contextSections.push(`Conversation Memory:
- Customer Name: ${customerName || 'Not provided'} ${customerName ? '(USE THIS, don\'t ask)' : ''}
- Delivery Address: ${deliveryAddress || 'Not provided'} ${deliveryAddress ? '(USE THIS, don\'t ask)' : ''}
- Key Facts: ${keyFactsSummary || 'None'}
- Topics: ${topicsSummary || 'None'}

CRITICAL: Use information from memory above. DO NOT ask for information that already exists in memory.`);
}
```

### 4.4 Validation Logic

**Add post-processing validation:**

```typescript
// In primaryAIResponseService.ts - after parsing AI response
function validateClarificationNeeds(
  parsed: any,
  memory: ConversationMemory,
  extractedData: any
): boolean {
  if (!parsed.needsClarification) {
    return false;
  }
  
  const missingFields = parsed.clarificationStrategy?.missingFields || [];
  
  // Check each missing field against memory
  for (const field of missingFields) {
    if (field === 'customerName' && memory.customerPreferences?.information?.name) {
      return false; // Name exists in memory
    }
    
    if (field === 'deliveryAddress' && 
        (memory.customerPreferences?.deliveryAddress || 
         memory.customerPreferences?.primaryDeliveryAddress)) {
      return false; // Address exists in memory
    }
    
    // If extractedData already has the field, don't need clarification
    if (extractedData[field]) {
      return false;
    }
  }
  
  // Only need clarification if critical fields are truly missing
  return missingFields.length > 0 && 
         missingFields.some(f => ['customerName', 'deliveryAddress', 'orderItems'].includes(f));
}
```

---

## 5. Gap Analysis and Fixes

### 5.1 Identified Gaps

| Gap | Severity | Description | Fix |
|-----|----------|-------------|-----|
| Cache invalidation | High | Cache not invalidated after memory updates | Explicitly invalidate cache after updates |
| Auto-extraction not used | Medium | Manually extracting key facts instead of using auto-extraction | Let `updateConversationMemory` auto-extract |
| Missing helper functions | Medium | Helper functions for Stage 2/4 don't exist | Create new helper functions |
| Early exit scenarios | Medium | Memory not updated on early exits | Update memory before early exits |
| Multiple history fetches | Low | Conversation history fetched multiple times | Cache history in context |
| Memory refresh strategy | Low | Need to verify cache behavior | Explicitly invalidate and refresh |

### 5.2 Fixes Applied

#### Fix 1: Cache Invalidation
```typescript
// After updating memory in Stage 2 and Stage 4:
await updateConversationMemory(...);
await invalidateConversationCache(conversationId); // Explicitly invalidate
context.memory = await retrieveConversationMemory(...); // Fresh from DB
```

#### Fix 2: Leverage Auto-Extraction
```typescript
// In Stage 2, let updateConversationMemory auto-extract key facts:
await updateConversationMemory(context.conversationId, context.vendorId, {
  conversationHistory: conversationHistory.reverse(),
  currentMessage: context.rawMessage, // This triggers auto-extraction
  ongoingTopics: ongoingTopics,
  customerPreferences: customerPreferences,
  incrementTurn: false
});
// Don't manually extract keyFacts - let the function do it
```

#### Fix 3: Helper Functions
```typescript
// Create new helper functions:
function extractOngoingTopicsFromIntent(intent, extractedInfo, secondaryIntents): string[]
function extractOngoingTopicsFromResponse(aiResponse): string[]
function extractPreferencesFromInsights(insights): Record<string, any>
function extractPreferencesFromExtractedData(extractedData): Record<string, any>
function validateClarificationNeeds(parsed, memory, extractedData): boolean
```

#### Fix 4: Early Exit Handling
```typescript
// In execute() method, before early exits:
if (intentResult.primaryIntent === 'support') {
  // Update memory before exiting
  await updateConversationMemory(context.conversationId, context.vendorId, {
    currentMessage: context.rawMessage,
    ongoingTopics: ['Support request'],
    incrementTurn: false
  });
  // ... rest of support handling
}
```

#### Fix 5: Conversation History Caching
```typescript
// In Stage 2:
const conversationHistory = await prisma.message.findMany(...);
context.conversationHistory = conversationHistory; // Store in context

// In Stage 4 and Stage 8, reuse:
const conversationHistory = context.conversationHistory || await fetchIfNeeded(...);
```

---

## 6. Implementation Details

### 6.1 Files to Modify

1. **`backend/src/services/multiStageOrchestrator.ts`**
   - Add memory update in `executeStage2()`
   - Add memory update in `executeStage4()`
   - Add memory update before early exits
   - Store conversation history in context

2. **`backend/src/services/primaryAIResponseService.ts`**
   - Add clarification rules to prompt
   - Add validation logic for `needsClarification`
   - Enhance memory usage instructions

3. **`backend/src/services/promptBuilderService.ts`**
   - Add explicit memory usage instructions
   - Include customer name and address from memory

4. **`backend/src/services/dataExtractionService.ts`** (or new utility file)
   - Create helper functions:
     - `extractOngoingTopicsFromIntent()`
     - `extractOngoingTopicsFromResponse()`
     - `extractPreferencesFromInsights()`
     - `extractPreferencesFromExtractedData()`
     - `validateClarificationNeeds()`

### 6.2 Helper Functions Implementation

```typescript
/**
 * Extract ongoing topics from intent and extracted info (Stage 2)
 */
function extractOngoingTopicsFromIntent(
  intent: string,
  extractedInfo: any,
  secondaryIntents?: string[]
): string[] {
  const topics: string[] = [];
  
  // Add primary intent topic
  const intentTopics: Record<string, string> = {
    'order_new': 'Placing new order',
    'order_update': 'Updating order',
    'order_status': 'Checking order status',
    'product_inquiry': 'Product inquiry',
    'confirm_order': 'Order confirmation',
    'cancel_order': 'Order cancellation',
    'repeat_order': 'Repeating previous order',
    'delivery_inquiry': 'Delivery inquiry',
    'payment_inquiry': 'Payment inquiry',
    'complaint': 'Customer complaint',
    'support': 'Support request'
  };
  
  if (intentTopics[intent]) {
    topics.push(intentTopics[intent]);
  }
  
  // Add secondary intents as topics
  if (secondaryIntents && secondaryIntents.length > 0) {
    secondaryIntents.forEach(secIntent => {
      if (intentTopics[secIntent] && !topics.includes(intentTopics[secIntent])) {
        topics.push(intentTopics[secIntent]);
      }
    });
  }
  
  // Add product-related topics
  if (extractedInfo?.products?.length > 0) {
    topics.push(`Products: ${extractedInfo.products.slice(0, 3).join(', ')}`);
  }
  
  // Add delivery-related topics
  if (extractedInfo?.hasDeliveryInfo) {
    topics.push('Delivery information provided');
  }
  
  return topics;
}

/**
 * Extract ongoing topics from AI response (Stage 4)
 */
function extractOngoingTopicsFromResponse(aiResponse: PrimaryAIResponse): string[] {
  const topics: string[] = [];
  
  // Add topics based on extracted data
  if (aiResponse.extractedData?.orderItems?.length > 0) {
    const productNames = aiResponse.extractedData.orderItems
      .map((item: any) => item.product)
      .filter(Boolean)
      .slice(0, 3);
    if (productNames.length > 0) {
      topics.push(`Order items: ${productNames.join(', ')}`);
    }
  }
  
  if (aiResponse.needsClarification) {
    const missingFields = aiResponse.clarificationStrategy?.missingFields || [];
    if (missingFields.length > 0) {
      topics.push(`Awaiting: ${missingFields.join(', ')}`);
    }
  }
  
  // Add conversation flow stage
  if (aiResponse.conversationFlow?.nextStage) {
    topics.push(`Stage: ${aiResponse.conversationFlow.nextStage}`);
  }
  
  return topics;
}

/**
 * Extract customer preferences from customer insights (Stage 2)
 */
function extractPreferencesFromInsights(insights: any): Record<string, any> {
  const preferences: Record<string, any> = {};
  
  if (!insights) return preferences;
  
  if (insights.customerName) {
    preferences.customerName = insights.customerName;
  }
  
  if (insights.primaryDeliveryAddress || insights.deliveryAddress) {
    preferences.deliveryAddress = 
      insights.primaryDeliveryAddress || insights.deliveryAddress;
  }
  
  if (insights.preferences) {
    preferences.preferences = insights.preferences;
  }
  
  if (insights.communicationStyle) {
    preferences.communicationStyle = insights.communicationStyle;
  }
  
  return preferences;
}

/**
 * Extract customer preferences from AI-extracted data (Stage 4)
 */
function extractPreferencesFromExtractedData(extractedData: any): Record<string, any> {
  const preferences: Record<string, any> = {};
  
  if (!extractedData) return preferences;
  
  if (extractedData.deliveryAddress) {
    preferences.deliveryAddress = extractedData.deliveryAddress;
  }
  
  if (extractedData.specialRequests) {
    preferences.specialRequests = extractedData.specialRequests;
  }
  
  if (extractedData.deliveryTime) {
    preferences.deliveryTime = extractedData.deliveryTime;
  }
  
  if (extractedData.paymentMethod) {
    preferences.paymentMethod = extractedData.paymentMethod;
  }
  
  if (extractedData.customerName) {
    preferences.customerName = extractedData.customerName;
  }
  
  return preferences;
}

/**
 * Validate if clarification is actually needed
 */
function validateClarificationNeeds(
  parsed: any,
  memory: ConversationMemory,
  extractedData: any
): boolean {
  if (!parsed.needsClarification) {
    return false;
  }
  
  const missingFields = parsed.clarificationStrategy?.missingFields || [];
  
  // Check each missing field against memory
  for (const field of missingFields) {
    if (field === 'customerName' && 
        (memory.customerPreferences?.information?.name || 
         memory.customerPreferences?.customerName)) {
      return false; // Name exists in memory
    }
    
    if (field === 'deliveryAddress' && 
        (memory.customerPreferences?.deliveryAddress || 
         memory.customerPreferences?.primaryDeliveryAddress)) {
      return false; // Address exists in memory
    }
    
    // If extractedData already has the field, don't need clarification
    if (extractedData[field]) {
      return false;
    }
  }
  
  // Only need clarification if critical fields are truly missing
  return missingFields.length > 0 && 
         missingFields.some(f => ['customerName', 'deliveryAddress', 'orderItems'].includes(f));
}
```

### 6.3 Stage 2 Implementation

```typescript
private async executeStage2(context: StageContext): Promise<any> {
  // ... existing code ...
  
  const data = await fetchRelevantData(...);
  
  // NEW: Update memory with intent and insights
  try {
    // Fetch conversation history once (will be reused in later stages)
    const conversationHistory = await prisma.message.findMany({
      where: { conversationId: context.conversationId },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: {
        content: true,
        senderType: true,
        timestamp: true
      }
    });
    
    // Store in context for reuse
    context.conversationHistory = conversationHistory;
    
    // Extract ongoing topics from intent
    const ongoingTopics = extractOngoingTopicsFromIntent(
      context.intentResult!.primaryIntent,
      context.intentResult!.extractedInfo,
      context.intentResult!.secondaryIntents
    );
    
    // Extract preferences from customer insights
    const customerPreferences = extractPreferencesFromInsights(data.insights);
    
    // Update memory - let it auto-extract key facts
    await updateConversationMemory(context.conversationId, context.vendorId, {
      conversationHistory: conversationHistory.reverse(),
      currentMessage: context.rawMessage, // Triggers auto-extraction
      ongoingTopics: ongoingTopics,
      customerPreferences: Object.keys(customerPreferences).length > 0 
        ? customerPreferences 
        : undefined,
      incrementTurn: false
    });
    
    // Invalidate cache and refresh memory
    await invalidateConversationCache(context.conversationId);
    context.memory = await retrieveConversationMemory({
      conversationId: context.conversationId,
      vendorId: context.vendorId,
      normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage
    });
    
    logger.debug({ 
      conversationId: context.conversationId,
      intent: context.intentResult!.primaryIntent,
      topicsExtracted: ongoingTopics.length
    }, 'Memory updated in Stage 2 (Phase 1)');
  } catch (error) {
    logger.warn({ 
      err: error, 
      conversationId: context.conversationId 
    }, 'Failed to update memory in Stage 2, will update in Stage 4');
  }
  
  // ... rest of existing code ...
}
```

### 6.4 Stage 4 Implementation

```typescript
private async executeStage4(context: StageContext, prompt: string): Promise<any> {
  // ... existing code until aiResponse ...
  
  const aiResponse = await generatePrimaryAIResponse(...);
  
  // NEW: Validate clarification needs against memory
  if (aiResponse.needsClarification) {
    const actuallyNeedsClarification = validateClarificationNeeds(
      aiResponse,
      context.memory!,
      aiResponse.extractedData
    );
    
    if (!actuallyNeedsClarification) {
      // Override needsClarification if memory has the info
      aiResponse.needsClarification = false;
      logger.debug({ 
        conversationId: context.conversationId 
      }, 'Clarification not needed - information exists in memory');
    }
  }
  
  // NEW: Update memory with AI-extracted data
  try {
    // Reuse conversation history from context (if available)
    const conversationHistory = context.conversationHistory || await prisma.message.findMany({
      where: { conversationId: context.conversationId },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: {
        content: true,
        senderType: true,
        timestamp: true
      }
    });
    
    // Extract ongoing topics from AI response
    const ongoingTopics = extractOngoingTopicsFromResponse(aiResponse);
    
    // Extract preferences from AI-extracted data
    const customerPreferences = extractPreferencesFromExtractedData(aiResponse.extractedData);
    
    // Update memory with AI-extracted data
    await updateConversationMemory(context.conversationId, context.vendorId, {
      currentMessage: context.rawMessage,
      ongoingTopics: ongoingTopics,
      customerPreferences: Object.keys(customerPreferences).length > 0 
        ? customerPreferences 
        : undefined,
      incrementTurn: false
    });
    
    // Invalidate cache and refresh memory
    await invalidateConversationCache(context.conversationId);
    context.memory = await retrieveConversationMemory({
      conversationId: context.conversationId,
      vendorId: context.vendorId,
      normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage
    });
    
    logger.debug({ 
      conversationId: context.conversationId,
      aiExtractedData: Object.keys(aiResponse.extractedData || {})
    }, 'Memory updated in Stage 4 (Phase 2)');
  } catch (error) {
    logger.warn({ 
      err: error, 
      conversationId: context.conversationId 
    }, 'Failed to update memory in Stage 4, will update in Stage 8');
  }
  
  // ... rest of existing code ...
  return aiResponse;
}
```

### 6.5 Early Exit Handling

```typescript
// In execute() method, before early exits:
if (intentResult.primaryIntent === 'support') {
  // Update memory before exiting
  try {
    await updateConversationMemory(context.conversationId, context.vendorId, {
      currentMessage: context.rawMessage,
      ongoingTopics: ['Support request'],
      incrementTurn: false
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update memory on support exit');
  }
  
  await setHandoffConfirmationStatus(context.conversationId, true);
  // ... rest of support handling
}
```

---

## 7. Testing Checklist

### 7.1 Memory Update Tests

- [ ] **Stage 2 Update:**
  - [ ] Memory updated after Stage 2 completes
  - [ ] Intent and extracted info captured in memory
  - [ ] Customer insights captured in memory
  - [ ] Key facts auto-extracted from conversation history
  - [ ] Memory available in Stage 3 (prompt building)
  - [ ] Memory available in Stage 4 (AI response)

- [ ] **Stage 4 Update:**
  - [ ] Memory updated after Stage 4 completes
  - [ ] AI-extracted data captured in memory
  - [ ] Ongoing topics updated from AI response
  - [ ] Customer preferences updated from extracted data
  - [ ] Memory available in Stages 5-7

- [ ] **Stage 8 Update:**
  - [ ] Final memory update happens
  - [ ] Turn counter incremented
  - [ ] Order summary stored
  - [ ] Complete key facts extraction

### 7.2 Clarification Rules Tests

- [ ] **Memory Usage:**
  - [ ] AI uses customer name from memory (doesn't ask)
  - [ ] AI uses delivery address from memory (doesn't ask)
  - [ ] AI uses preferences from memory (doesn't ask again)

- [ ] **Question Validation:**
  - [ ] AI only asks when critical info is missing
  - [ ] AI doesn't ask for optional information
  - [ ] AI focuses on customer response, not follow-ups
  - [ ] `needsClarification` validated against memory

- [ ] **Response Quality:**
  - [ ] Responses acknowledge customer input
  - [ ] Responses reference previous conversation
  - [ ] Responses don't ask unnecessary questions

### 7.3 Edge Cases

- [ ] **Early Exits:**
  - [ ] Memory updated on support handoff
  - [ ] Memory updated on error exits
  - [ ] Memory updated on cancellation

- [ ] **Cache Behavior:**
  - [ ] Cache invalidated after updates
  - [ ] Memory refreshed correctly after updates
  - [ ] No stale memory data

- [ ] **Performance:**
  - [ ] Conversation history cached in context
  - [ ] No duplicate history fetches
  - [ ] Memory updates don't slow down pipeline

### 7.4 Integration Tests

- [ ] **Full Pipeline:**
  - [ ] Memory updated at all three stages
  - [ ] Memory available for all stages that need it
  - [ ] No data loss between stages
  - [ ] Final memory state is complete

- [ ] **Customer Experience:**
  - [ ] Customer doesn't get asked for info they already provided
  - [ ] Responses reference previous conversation
  - [ ] Order flow is smooth without unnecessary questions

---

## 8. Rollout Plan

### 8.1 Implementation Phases

**Phase 1: Helper Functions (Day 1)**
- Create helper functions
- Add unit tests
- Verify functions work correctly

**Phase 2: Stage 2 Update (Day 2)**
- Implement Stage 2 memory update
- Add error handling
- Test with various intents

**Phase 3: Stage 4 Update (Day 3)**
- Implement Stage 4 memory update
- Add clarification validation
- Test with various scenarios

**Phase 4: Clarification Rules (Day 4)**
- Add clarification rules to prompt
- Add memory usage instructions
- Test question behavior

**Phase 5: Early Exit Handling (Day 5)**
- Add memory updates before early exits
- Test all exit scenarios

**Phase 6: Testing & Validation (Day 6-7)**
- Run full test suite
- Validate customer experience
- Performance testing

### 8.2 Rollout Strategy

1. **Feature Flag:** Add feature flag for early memory updates
2. **Gradual Rollout:** Enable for 10% → 50% → 100% of conversations
3. **Monitoring:** Monitor memory update success rate, cache behavior, performance
4. **Rollback Plan:** Disable feature flag if issues detected

### 8.3 Success Metrics

- **Memory Update Success Rate:** > 99%
- **Cache Hit Rate:** > 80%
- **Question Reduction:** 50% reduction in unnecessary questions
- **Customer Satisfaction:** Improved naturalness scores
- **Performance:** No increase in pipeline latency

---

## 9. Related Documents

- [Multi-Stage AI System Analysis](./MULTI_STAGE_SYSTEM_ANALYSIS.md)
- [Validation Improvements Plan](./VALIDATION_IMPROVEMENTS_IMPLEMENTATION_PLAN.md)
- [AI Memory Extraction (Gap 4)](../intent-classification/IMPROVEMENT_GAP4_AI_MEMORY_EXTRACTION.md)

---

## 10. Changelog

**2024-12-XX:** Initial plan created
- Two-phase memory update strategy
- Clarification rules enhancement
- Gap analysis and fixes
- Implementation details

---

## Appendix: Code Locations

### Files to Modify

1. `backend/src/services/multiStageOrchestrator.ts`
   - `executeStage2()` - Add memory update
   - `executeStage4()` - Add memory update
   - `execute()` - Add early exit memory updates

2. `backend/src/services/primaryAIResponseService.ts`
   - `generatePrimaryAIResponse()` - Add clarification rules, validation

3. `backend/src/services/promptBuilderService.ts`
   - `buildFocusedPrompt()` - Add memory usage instructions

4. `backend/src/services/dataExtractionService.ts` (or new utility)
   - Add helper functions for extraction

### Helper Functions Location

Create new file: `backend/src/services/memoryUpdateHelpers.ts`
- `extractOngoingTopicsFromIntent()`
- `extractOngoingTopicsFromResponse()`
- `extractPreferencesFromInsights()`
- `extractPreferencesFromExtractedData()`
- `validateClarificationNeeds()`

---

**End of Document**

