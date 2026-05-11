# Message Summary System - Quick Reference

## 🚀 Quick Start

**For Implementers:**
1. Read [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Overview and timeline
2. Follow [Implementation Guide](./IMPLEMENTATION_GUIDE.md) - Step-by-step code
3. Reference this document - Quick function reference

**For Reviewers:**
1. Read [Problem, Solution & Enhancements](./PROBLEM_SOLUTION_ENHANCEMENTS.md) - Complete analysis
2. Review [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Timeline and phases

---

## 📁 File Structure

```
backend/src/services/
├── messageSummaryService.ts          # NEW: Main summary service
├── multiStageOrchestrator.ts         # MODIFIED: Add Stage 9.5
└── intentClassificationService.ts    # MODIFIED: Use summaries

backend/prisma/
└── schema.prisma                     # MODIFIED: Add summary fields
```

---

## 🔧 Key Functions

### 1. Generate Message Summary

**File:** `backend/src/services/messageSummaryService.ts`

```typescript
generateMessageSummary(
  messageId: string,
  conversationId: string,
  customerId: string,
  vendorId: string,
  currentMessage: { content: string; senderType: string },
  lastAssistantMessage: string | null,
  conversationContext: {
    pendingOrder?: any;
    conversationStage: string;
    memory?: ConversationMemory;
  }
): Promise<MessageSummaryResult>
```

**Returns:**
```typescript
{
  summary: string;        // Self-contained summary
  expectedNext: string;   // Expected next action
  metadata?: {            // Optional metadata
    tokensUsed: number;
    model: string;
  }
}
```

**Usage:**
```typescript
const summary = await generateMessageSummary(
  messageId,
  conversationId,
  customerId,
  vendorId,
  { content: "Murali", senderType: "customer" },
  "I need your name to confirm the order...",
  {
    conversationStage: "order_confirmation",
    pendingOrder: { totalAmount: 339800 }
  }
);
```

---

### 2. Store Summary

**File:** `backend/src/services/multiStageOrchestrator.ts`

```typescript
// In Stage 9.5 (async, non-blocking)
await prisma.message.update({
  where: { id: context.messageId },
  data: {
    messageSummary: summary.summary,
    expectedNextAction: summary.expectedNext,
    summaryMetadata: summary.metadata
  }
});
```

---

### 3. Retrieve Last Summary

**File:** `backend/src/services/intentClassificationService.ts`

```typescript
const lastMessageWithSummary = await prisma.message.findFirst({
  where: {
    conversationId,
    senderType: 'customer',
    messageSummary: { not: null }
  },
  orderBy: { timestamp: 'desc' },
  select: {
    messageSummary: true,
    expectedNextAction: true
  }
});
```

---

### 4. Use Summary in Intent Classification

**File:** `backend/src/services/intentClassificationService.ts`

```typescript
function buildIntentPrompt(
  normalized: any,
  memory: ConversationMemory,
  lastMessages: any[],
  existingOrder?: any,
  lastSummary?: { summary: string; expectedNext: string }  // NEW
): string {
  const summaryContext = lastSummary
    ? `\n\nLAST MESSAGE SUMMARY (for context):
${lastSummary.summary}

CRITICAL INSTRUCTIONS:
1. If summary says "Assistant asked for name" and current message is just a name, classify as "confirm_order"
2. DO NOT ask for information listed in "Known Info" section`
    : '';
  
  return `...${existingPrompt}${summaryContext}`;
}
```

---

## 📊 Database Schema

### Message Model Changes

```prisma
model Message {
  // ... existing fields ...
  
  // NEW: Message Summary Fields
  messageSummary      String?  @db.Text
  expectedNextAction  String?  @db.Text
  summaryMetadata     Json?
  
  @@index([conversationId, timestamp])
}
```

### Migration Command

```bash
cd backend
npx prisma migrate dev --name add_message_summary_fields
npx prisma generate
```

---

## 🎯 Summary Format

### Example Summary Output

```
What Happened: Customer provided name "Murali"
What Was Asked: Assistant asked for customer name to confirm order
Known Info: 
- Customer Name: Murali (just provided)
- Pending Order exists: ₹3398
Missing Info: 
- Delivery Address
Key Info Extracted: 
- Customer name: Murali
- Order confirmation in progress
Expected Next: Customer will provide delivery address or confirm order
```

---

## 🔍 Common Patterns

### Pattern 1: Order Confirmation with Name

**Scenario:** Customer sends name after being asked

**Detection:**
```typescript
if (lastSummary?.summary.includes('Assistant asked for name') && 
    isNameOnly(currentMessage)) {
  // Classify as confirm_order
}
```

### Pattern 2: Prevent Redundant Questions

**Scenario:** Customer info already known

**Detection:**
```typescript
if (lastSummary?.summary.includes('Known Info: Customer Name')) {
  // Don't ask for name again
}
```

### Pattern 3: Expected Next Action

**Scenario:** Predict customer intent

**Usage:**
```typescript
if (lastSummary?.expectedNext.includes('provide address') && 
    containsAddress(currentMessage)) {
  // Classify as confirm_order or order_update
}
```

---

## ⚡ Performance

### Cost per Summary
- **Tokens:** ~150-200 tokens
- **Cost:** ~$0.00002 per message
- **Model:** gpt-4o-mini

### Latency
- **Generation:** Async (non-blocking)
- **Retrieval:** <10ms (indexed query)
- **Impact:** Zero on message delivery

---

## 🐛 Troubleshooting

### Issue: Summary Not Generated

**Check:**
1. OpenAI API key configured?
2. Message is customer message?
3. Database connection working?
4. Check logs for errors

**Solution:**
```typescript
// Check OpenAI configuration
if (!openai) {
  logger.warn('OpenAI not configured');
  return { summary: '', expectedNext: '' };
}
```

### Issue: Summary Quality Poor

**Check:**
1. Prompt template correct?
2. Customer insights fetched?
3. Conversation context complete?

**Solution:**
- Review prompt template
- Verify customer insights service
- Check conversation context

### Issue: High Costs

**Check:**
1. Using gpt-4o-mini? (not gpt-4)
2. Token usage per summary?
3. Prompt size optimized?

**Solution:**
- Verify model selection
- Monitor token usage
- Optimize prompt

---

## 📈 Metrics

### Key Metrics to Track

```typescript
// Summary Generation Rate
const generationRate = (successfulSummaries / totalMessages) * 100;

// Cost per Message
const costPerMessage = totalCost / totalMessages;

// Intent Classification Accuracy
const accuracy = (correctClassifications / totalClassifications) * 100;

// Order Confirmation Success Rate
const successRate = (successfulConfirmations / totalAttempts) * 100;
```

---

## 🔗 Integration Points

### Stage 9.5: Generate Summary

**Location:** `multiStageOrchestrator.ts`

**When:** After Stage 9 (Response Queued)

**How:** Async, non-blocking

```typescript
// After executeStage9()
this.executeStage9_5(context, finalMessage);
```

### Intent Classification Enhancement

**Location:** `intentClassificationService.ts`

**When:** Before AI classification

**How:** Retrieve last summary, include in prompt

```typescript
const lastSummary = await getLastSummary(conversationId);
const prompt = buildIntentPrompt(..., lastSummary);
```

---

## ✅ Checklist

### Implementation Checklist
- [ ] Database schema updated
- [ ] Migration run
- [ ] Service created
- [ ] Stage 9.5 integrated
- [ ] Intent classification enhanced
- [ ] Tests written
- [ ] Monitoring added

### Testing Checklist
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Order confirmation flow tested
- [ ] Redundant question prevention tested

### Deployment Checklist
- [ ] Staging deployment
- [ ] Metrics monitoring
- [ ] Alerts configured
- [ ] Rollback plan ready
- [ ] Team notified

---

## 📚 Related Documentation

- [Implementation Plan](./IMPLEMENTATION_PLAN.md) - Complete plan
- [Implementation Guide](./IMPLEMENTATION_GUIDE.md) - Step-by-step guide
- [Problem, Solution & Enhancements](./PROBLEM_SOLUTION_ENHANCEMENTS.md) - Full analysis

---

**Last Updated:** December 2025  
**Version:** 1.0

