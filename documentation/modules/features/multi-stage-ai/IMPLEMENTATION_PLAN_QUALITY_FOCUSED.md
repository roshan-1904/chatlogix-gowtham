# Implementation Plan: Quality-Focused Multi-Model Strategy

**Date:** December 7, 2025  
**Budget:** $0.0005 per message  
**Goal:** Maximum naturalness and context retention

---

## Implementation Overview

This plan implements the quality-focused multi-model strategy to achieve:
- ✅ Maximum naturalness in AI responses
- ✅ Zero context loss
- ✅ Enhanced conversation continuity
- ✅ Within $0.0005 per message budget

---

## Phase 1: Context Enhancement (Week 1)

### Task 1.1: Enhance Stage 0.5 - Conversation Memory Retrieval

**File:** `backend/src/services/conversationMemoryService.ts`

**Current:** Retrieves memory from database only  
**Enhancement:** Include more conversation history

**Changes Needed:**

```typescript
// In retrieveConversationMemory function, add:
export async function retrieveConversationMemory(
  input: ConversationMemoryInput
): Promise<ConversationMemory> {
  // ... existing code ...
  
  // ENHANCEMENT: Fetch more conversation history
  const conversationHistory = await prisma.message.findMany({
    where: { conversationId: input.conversationId },
    orderBy: { timestamp: 'desc' },
    take: 20, // Increased from 10
    select: {
      content: true,
      senderType: true,
      timestamp: true
    }
  });
  
  // Add to memory object
  memory.conversationHistory = conversationHistory.reverse();
  
  return memory;
}
```

**Impact:** Better context retention, zero cost increase

---

### Task 1.2: Enhance Stage 1 - Intent Classification Context

**File:** `backend/src/services/multiStageOrchestrator.ts` (executeStage1)

**Current:** Retrieves last 5 messages  
**Enhancement:** Retrieve last 10 messages, include more context

**Changes Needed:**

```typescript
// Line ~551: Change from take: 5 to take: 10
const lastMessages = await prisma.message.findMany({
  where: { conversationId: context.conversationId },
  orderBy: { timestamp: 'desc' },
  take: 10, // Changed from 5
  select: {
    content: true,
    senderType: true,
    timestamp: true
  }
});
```

**File:** `backend/src/services/intentClassificationService.ts`

**Enhancement:** Include more context in prompt

```typescript
// In buildIntentPrompt function, enhance:
const previousContext = lastMessages.length > 0
  ? `Previous Messages:\n${lastMessages.slice(-10).map((m: any) => 
      `${m.senderType || 'customer'}: ${m.content || m}`
    ).join('\n')}\n\nConversation Summary: ${memory.conversationSummary}\nKey Facts: ${memory.keyFacts.join(', ')}\nOngoing Topics: ${memory.ongoingTopics.join(', ')}`
  : '';
```

**Impact:** Better intent classification, ~$0.000010 additional cost

---

### Task 1.3: Enhance Stage 4 - Primary AI Response Context

**File:** `backend/src/services/multiStageOrchestrator.ts` (executeStage4)

**Current:** Uses prompt from Stage 3 (limited context)  
**Enhancement:** Include full conversation history (20 messages)

**Changes Needed:**

```typescript
// In executeStage4, before calling generatePrimaryAIResponse:
const fullConversationHistory = await prisma.message.findMany({
  where: { conversationId: context.conversationId },
  orderBy: { timestamp: 'desc' },
  take: 20, // Full history
  select: {
    content: true,
    senderType: true,
    timestamp: true
  }
});

// Pass to prompt builder or directly to Stage 4
context.fullConversationHistory = fullConversationHistory.reverse();
```

**File:** `backend/src/services/promptBuilderService.ts`

**Enhancement:** Include full conversation history in prompt

```typescript
export function buildFocusedPrompt(
  intent: string,
  extractedInfo: any,
  fetchedData: any,
  vendorConfig: any,
  memory: ConversationMemory,
  lastMessages?: any[],
  fullConversationHistory?: any[] // NEW PARAMETER
): string {
  // ... existing code ...
  
  // ENHANCEMENT: Include full conversation history
  if (fullConversationHistory && fullConversationHistory.length > 0) {
    const historyText = fullConversationHistory
      .slice(-20) // Last 20 messages
      .map((m: any) => `${m.senderType === 'customer' ? 'Customer' : 'Assistant'}: ${m.content}`)
      .join('\n');
    
    contextSections.push(`Full Conversation History:\n${historyText}`);
  }
  
  // ENHANCEMENT: Include complete memory context
  if (memory) {
    contextSections.push(`Complete Conversation Memory:
- Key Facts: ${memory.keyFacts.join('; ')}
- Ongoing Topics: ${memory.ongoingTopics.join('; ')}
- Customer Preferences: ${JSON.stringify(memory.customerPreferences)}
- Last Order: ${memory.lastOrderSummary || 'None'}
- Conversation Stage: ${memory.conversationStage}
- Turn Number: ${memory.turnNumber}`);
  }
}
```

**File:** `backend/src/services/primaryAIResponseService.ts`

**Enhancement:** Add naturalness instructions to prompt

```typescript
// In generatePrimaryAIResponse, enhance the prompt:
const naturalnessInstructions = `
CRITICAL NATURALNESS REQUIREMENTS:
- Reference previous conversation naturally (e.g., "As you mentioned earlier...")
- Remember customer preferences (e.g., "I remember you prefer morning delivery")
- Acknowledge context (e.g., "Since you're ordering for your birthday...")
- Use natural transitions (e.g., "Great! Now, about your delivery address...")
- Never ask for information already provided
- Match customer's communication style
- Feel like continuing a conversation, not starting a new one
- Maintain all context - never lose any information
`;

// Add to fullPrompt
const fullPrompt = `${basePrompt}\n\n${naturalnessInstructions}\n\n...`;
```

**Impact:** Maximum context retention, ~$0.000050-0.000100 additional cost

---

### Task 1.4: Enhance Stage 7 - Message Composition Naturalness

**File:** `backend/src/services/messageCompositionService.ts`

**Current:** Uses last 3 messages  
**Enhancement:** Include communication style, more context

**Changes Needed:**

```typescript
// In composeMessage function, enhance:
export async function composeMessage(
  responseData: PrimaryAIResponse & { availableProducts?: any[] },
  memory: ConversationMemory,
  vendorConfig: any,
  lastMessages: any[],
  conversationId: string,
  vendorId: string
): Promise<string> {
  // ... existing code ...
  
  // ENHANCEMENT: Get customer insights for communication style
  const { CustomerInsightsService } = await import('./customerInsightsService.js');
  const insightsService = new CustomerInsightsService();
  const customerInsights = await insightsService.getOrCreateInsights(
    // Need customerId from context
  );
  
  const communicationStyle = customerInsights.communicationStyle || 'friendly';
  const customerName = customerInsights.customerName || memory.customerPreferences?.name;
  
  // ENHANCEMENT: Include more conversation history
  const previousContext = lastMessages.length > 0
    ? `Previous Messages:\n${lastMessages.slice(-5).map((m: any) => 
        `${m.senderType === 'customer' ? 'Customer' : 'Assistant'}: ${m.content}`
      ).join('\n')}`
    : '';
  
  // ENHANCEMENT: Add naturalness focus to prompt
  const naturalnessSection = `
NATURALNESS REQUIREMENTS:
- Match customer's communication style: ${communicationStyle}
- Use customer's name if provided: ${customerName || 'Customer'}
- Reference previous conversation naturally
- Use appropriate emojis matching customer's usage
- Maintain conversational flow
- Feel like a real person, not a bot
- Never repeat information already provided
`;
  
  const prompt = `...existing prompt...\n\n${naturalnessSection}\n\n${previousContext}`;
  
  // ... rest of function ...
}
```

**Impact:** More natural responses, ~$0.000010 additional cost

---

## Phase 2: Model Optimization (Week 2)

### Task 2.1: Migrate Stage 0 to GPT-5 Nano

**File:** `backend/src/services/messageNormalizationService.ts`

**Change:** Update model from `gpt-4o-mini` to `gpt-5-nano`

```typescript
// Line ~167: Change model
const completion = await openai.chat.completions.create({
  model: 'gpt-5-nano', // Changed from 'gpt-4o-mini'
  messages: [
    {
      role: 'system',
      content: prompt
    },
    {
      role: 'user',
      content: rawMessage
    }
  ],
  temperature: 0.3,
  max_tokens: 150,
  response_format: { type: 'json_object' }
});
```

**Impact:** Save ~$0.000010 per message

---

### Task 2.2: Migrate Stage 1.7 to GPT-5 Nano

**File:** `backend/src/services/correctionDetectionService.ts`

**Change:** Update model from `gpt-4o-mini` to `gpt-5-nano`

```typescript
// Find the model specification and change:
model: 'gpt-5-nano', // Changed from 'gpt-4o-mini'
```

**Impact:** Save ~$0.000010 per message (when triggered)

---

### Task 2.3: Migrate Stage 4.7 to GPT-5 Nano

**File:** `backend/src/services/proactiveAssistanceService.ts`

**Change:** Update model from `gpt-4o-mini` to `gpt-5-nano`

```typescript
// Find the model specification and change:
model: 'gpt-5-nano', // Changed from 'gpt-4o-mini'
```

**Impact:** Save ~$0.000020 per message (when triggered)

---

### Task 2.4: Migrate Stage 8.5 to GPT-5 Nano

**File:** `backend/src/services/qualityAssessmentService.ts`

**Change:** Update model from `gpt-4o-mini` to `gpt-5-nano`

```typescript
// Find the model specification and change:
model: 'gpt-5-nano', // Changed from 'gpt-4o-mini'
```

**Impact:** Save ~$0.000015 per message (when triggered)

---

### Task 2.5: Implement Conditional Model Selection for Stage 4

**File:** `backend/src/services/primaryAIResponseService.ts`

**Change:** Add conditional model selection based on complexity

```typescript
// Add function to determine model
function selectModelForStage4(
  intent: string,
  extractedInfo: any,
  orderItems: any[],
  needsClarification: boolean,
  turnNumber: number
): string {
  // Use gpt-4o for complex cases
  if (intent === 'order_update' || 
      (intent === 'order_new' && orderItems && orderItems.length > 2) ||
      needsClarification ||
      turnNumber > 5) {
    return 'gpt-4o'; // Better reasoning for complex cases
  }
  
  return 'gpt-4o-mini'; // Good enough for simple cases
}

// In generatePrimaryAIResponse function:
export async function generatePrimaryAIResponse(
  prompt: string,
  normalizedMessage: any,
  memory: ConversationMemory,
  vendorId: string,
  conversationId: string,
  intent?: string,
  extractedInfo?: any
): Promise<PrimaryAIResponse> {
  // ... existing code ...
  
  // Determine model based on complexity
  const selectedModel = selectModelForStage4(
    intent || 'other',
    extractedInfo || {},
    extractedInfo?.orderItems || [],
    false, // needsClarification - determine from context
    memory?.turnNumber || 0
  );
  
  const completion = await openai.chat.completions.create({
    model: selectedModel, // Use conditional model
    messages: [
      {
        role: 'system',
        content: fullPrompt
      },
      {
        role: 'user',
        content: normalizedMessage.cleaned || normalizedMessage.original
      }
    ],
    temperature: 0.5,
    max_tokens: 400,
    response_format: { type: 'json_object' }
  });
  
  // ... rest of function ...
}
```

**Impact:** Better quality for complex cases, cost varies by complexity

---

## Phase 3: Create Model Selection Service

### Task 3.1: Create Centralized Model Selection Service

**File:** `backend/src/services/modelSelectionService.ts` (NEW FILE)

```typescript
/**
 * Model Selection Service
 * 
 * Centralizes model selection logic for all stages
 */

export interface ModelSelectionContext {
  stage: string;
  intent?: string;
  complexity?: 'simple' | 'medium' | 'complex';
  turnNumber?: number;
  needsClarification?: boolean;
  orderItemsCount?: number;
}

export function getModelForStage(context: ModelSelectionContext): string {
  const { stage, intent, complexity, turnNumber, needsClarification, orderItemsCount } = context;
  
  // Stage-specific model assignments
  switch (stage) {
    case 'stage_0':
    case 'stage_1.7':
    case 'stage_4.7':
    case 'stage_8.5':
      return 'gpt-5-nano'; // Simple tasks
    
    case 'stage_1':
      // Use gpt-4o-mini for intent classification (critical for routing)
      return 'gpt-4o-mini';
    
    case 'stage_4':
      // Conditional model selection based on complexity
      if (intent === 'order_update' || 
          (intent === 'order_new' && orderItemsCount && orderItemsCount > 2) ||
          needsClarification ||
          (turnNumber && turnNumber > 5)) {
        return 'gpt-4o'; // Complex cases
      }
      return 'gpt-4o-mini'; // Simple cases
    
    case 'stage_6':
    case 'stage_7':
      return 'gpt-4o-mini'; // Keep for quality
    
    default:
      return 'gpt-4o-mini'; // Default fallback
  }
}

export function calculateCostEstimate(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-5-nano': { input: 0.05 / 1_000_000, output: 0.40 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 }
  };
  
  const rates = pricing[model] || pricing['gpt-4o-mini'];
  return (inputTokens * rates.input) + (outputTokens * rates.output);
}
```

---

## Implementation Checklist

### Week 1: Context Enhancement ✅

- [ ] **Task 1.1:** Enhance Stage 0.5 - Add conversation history retrieval (20 messages)
- [ ] **Task 1.2:** Enhance Stage 1 - Increase message history to 10 messages
- [ ] **Task 1.3:** Enhance Stage 4 - Add full conversation history (20 messages) and naturalness instructions
- [ ] **Task 1.4:** Enhance Stage 7 - Add communication style and more context
- [ ] **Testing:** Validate context retention, test with sample conversations
- [ ] **Monitoring:** Set up metrics to track context usage

**Expected Cost:** ~$0.00035 per message  
**Expected Impact:** Better context retention, more natural responses

---

### Week 2: Model Optimization ✅

- [ ] **Task 2.1:** Migrate Stage 0 to gpt-5-nano
- [ ] **Task 2.2:** Migrate Stage 1.7 to gpt-5-nano
- [ ] **Task 2.3:** Migrate Stage 4.7 to gpt-5-nano
- [ ] **Task 2.4:** Migrate Stage 8.5 to gpt-5-nano
- [ ] **Task 2.5:** Implement conditional model selection for Stage 4
- [ ] **Task 3.1:** Create centralized model selection service
- [ ] **Testing:** A/B test model changes, monitor quality metrics
- [ ] **Monitoring:** Track cost per stage, quality scores

**Expected Cost:** ~$0.00035-0.00045 per message  
**Expected Impact:** Better quality for complex cases, cost savings on simple tasks

---

### Week 3: Quality Monitoring & Optimization ✅

- [ ] Set up naturalness scoring dashboard
- [ ] Monitor context retention metrics
- [ ] Track conversation continuity scores
- [ ] Optimize prompts based on data
- [ ] Fine-tune model selection thresholds

**Expected Impact:** Continuous improvement, data-driven optimization

---

## Code Changes Summary

### Files to Modify

1. **`backend/src/services/conversationMemoryService.ts`**
   - Add conversation history retrieval (20 messages)

2. **`backend/src/services/multiStageOrchestrator.ts`**
   - Update Stage 1: Change `take: 5` to `take: 10`
   - Update Stage 4: Add full conversation history retrieval

3. **`backend/src/services/intentClassificationService.ts`**
   - Enhance prompt with more context (10 messages, full memory)

4. **`backend/src/services/promptBuilderService.ts`**
   - Add `fullConversationHistory` parameter
   - Include full conversation history in prompt
   - Include complete memory context

5. **`backend/src/services/primaryAIResponseService.ts`**
   - Add conditional model selection function
   - Use `gpt-4o` for complex cases
   - Add naturalness instructions to prompt

6. **`backend/src/services/messageCompositionService.ts`**
   - Include customer insights (communication style)
   - Include more conversation history (5 messages)
   - Add naturalness focus to prompt

7. **`backend/src/services/messageNormalizationService.ts`**
   - Change model from `gpt-4o-mini` to `gpt-5-nano`

8. **`backend/src/services/correctionDetectionService.ts`**
   - Change model from `gpt-4o-mini` to `gpt-5-nano`

9. **`backend/src/services/proactiveAssistanceService.ts`**
   - Change model from `gpt-4o-mini` to `gpt-5-nano`

10. **`backend/src/services/qualityAssessmentService.ts`**
    - Change model from `gpt-4o-mini` to `gpt-5-nano`

### Files to Create

1. **`backend/src/services/modelSelectionService.ts`** (NEW)
   - Centralized model selection logic
   - Cost calculation utilities

---

## Testing Strategy

### Unit Tests
- [ ] Test model selection logic for each stage
- [ ] Test context enhancement functions
- [ ] Test cost calculations

### Integration Tests
- [ ] Test full pipeline with enhanced context
- [ ] Test conditional model selection
- [ ] Test context retention across multiple turns

### A/B Testing
- [ ] Deploy Phase 1 changes to 10% traffic
- [ ] Monitor quality metrics for 3 days
- [ ] Deploy Phase 2 changes to 25% traffic
- [ ] Monitor cost and quality for 5 days
- [ ] Full rollout if metrics stable

---

## Rollback Plan

### If Quality Drops
1. Revert model changes (keep gpt-4o-mini)
2. Keep context enhancements (they improve quality)
3. Investigate and fix issues
4. Re-test before re-deployment

### If Cost Exceeds Budget
1. Reduce gpt-4o usage threshold (fewer complex cases)
2. Optimize prompt sizes
3. Review token usage per stage

---

## Success Metrics

### Quality Metrics
- ✅ Naturalness score: ≥ 4.8/5.0
- ✅ Context retention: 100% (zero loss)
- ✅ Conversation continuity: ≥ 95%
- ✅ Intent accuracy: ≥ 95%

### Cost Metrics
- ✅ Average cost: ≤ $0.0005 per message
- ✅ Simple messages: ≤ $0.0003 per message
- ✅ Complex messages: ≤ $0.00055 per message

### Performance Metrics
- ✅ Response time: ≤ 15 seconds (current: ~12-25s)
- ✅ Zero context loss incidents
- ✅ Improved customer satisfaction

---

## Next Steps

1. **Review this plan** with team
2. **Start Phase 1** (Context Enhancement)
3. **Set up monitoring** for quality metrics
4. **Implement incrementally** with testing
5. **Monitor and optimize** based on data

---

**Ready to implement?** This plan will significantly improve naturalness and context retention while staying within budget!
