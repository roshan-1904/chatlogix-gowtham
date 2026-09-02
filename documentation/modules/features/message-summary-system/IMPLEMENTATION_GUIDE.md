# Message Summary System - Implementation Guide

> **Architecture note (2026-09-02):** These steps were carried out (`messageSummaryService.ts`, Stage 9.5 in `multiStageOrchestrator.ts`, and the `classifyIntent()` changes in `intentClassificationService.ts` all match this guide as written). However, that whole pipeline is **no longer wired to live WhatsApp traffic** — production now runs `backend/src/conversation/*`, which does not have an equivalent summary stage. This code still runs only via the catalog-import sandbox test-message path. See `docs/CONVERSATION_PROCESSOR_LAMBDA.md` for the current architecture.

## Overview

This guide provides step-by-step instructions for implementing the Message Summary System to fix order confirmation flow issues and improve intent classification.

## Prerequisites

- Node.js 18+ with TypeScript
- PostgreSQL database with Prisma ORM
- OpenAI API key configured
- Multi-stage AI system already implemented

## Implementation Steps

### Step 1: Database Schema Update

**File:** `backend/prisma/schema.prisma`

Add summary fields to the Message model:

```prisma
model Message {
  id             String       @id @default(uuid())
  conversationId String
  senderType     String
  content        String       @db.Text
  type           MessageType
  timestamp      DateTime     @default(now())
  aiTokensUsed   Int          @default(0)
  
  // NEW: Message Summary Fields
  messageSummary      String?  @db.Text  // Self-contained AI summary
  expectedNextAction  String?  @db.Text  // What we expect customer to do next
  summaryMetadata     Json?              // Additional structured data
  
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  
  @@index([conversationId, timestamp]) // For efficient summary retrieval
  @@map("Message")
}
```

**Run Migration:**
```bash
cd backend
npx prisma migrate dev --name add_message_summary_fields
npx prisma generate
```

### Step 2: Create Message Summary Service

**File:** `backend/src/services/messageSummaryService.ts`

```typescript
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { OpenAI } from 'openai';
import { env } from '../config/env.js';
import { CustomerInsightsService } from './customerInsightsService.js';
import { ConversationMemory } from './conversationMemoryService.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface MessageSummaryResult {
  summary: string;
  expectedNext: string;
  metadata?: any;
}

/**
 * Generate a self-contained summary for a customer message
 * Includes: what happened, what was asked, known customer info, missing info, expected next
 */
export async function generateMessageSummary(
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
): Promise<MessageSummaryResult> {
  if (!openai) {
    logger.warn({ messageId }, 'OpenAI not configured, skipping summary generation');
    return { summary: '', expectedNext: '' };
  }

  try {
    // Fetch customer insights (what we already know)
    const insightsService = new CustomerInsightsService();
    const customerInsights = await insightsService.getOrCreateInsights(customerId, vendorId);
    
    // Build known information list
    const knownInfo: string[] = [];
    const missingInfo: string[] = [];
    
    if (customerInsights.customerName) {
      knownInfo.push(`Customer Name: ${customerInsights.customerName}`);
    } else {
      missingInfo.push('Customer Name');
    }
    
    if (customerInsights.deliveryAddress || customerInsights.primaryDeliveryAddress) {
      const address = customerInsights.deliveryAddress || customerInsights.primaryDeliveryAddress;
      knownInfo.push(`Delivery Address: ${address}`);
    } else {
      missingInfo.push('Delivery Address');
    }
    
    if (customerInsights.preferences) {
      knownInfo.push(`Preferences: ${customerInsights.preferences}`);
    }
    
    if (customerInsights.communicationStyle) {
      knownInfo.push(`Communication Style: ${customerInsights.communicationStyle}`);
    }
    
    // Extract key info from current message
    const extractedInfo = extractKeyInfoFromMessage(
      currentMessage.content,
      conversationContext.pendingOrder
    );
    
    // Build prompt
    const prompt = buildSummaryPrompt(
      currentMessage,
      lastAssistantMessage,
      conversationContext,
      knownInfo,
      missingInfo,
      extractedInfo
    );
    
    // Generate summary using AI
    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200
    });
    
    const summary = result.choices[0]?.message?.content || '';
    
    // Extract expected next action
    const expectedNextMatch = summary.match(/Expected Next: (.+)/);
    const expectedNext = expectedNextMatch ? expectedNextMatch[1] : '';
    
    return {
      summary: summary.trim(),
      expectedNext: expectedNext.trim(),
      metadata: {
        tokensUsed: result.usage?.total_tokens || 0,
        model: 'gpt-4o-mini'
      }
    };
  } catch (error) {
    logger.error({ err: error, messageId, conversationId }, 'Failed to generate message summary');
    return { summary: '', expectedNext: '' };
  }
}

function buildSummaryPrompt(
  currentMessage: { content: string; senderType: string },
  lastAssistantMessage: string | null,
  conversationContext: {
    pendingOrder?: any;
    conversationStage: string;
    memory?: ConversationMemory;
  },
  knownInfo: string[],
  missingInfo: string[],
  extractedInfo: string[]
): string {
  return `You are a conversation summarizer. Create a concise, self-contained summary.

Current Message: "${currentMessage.content}"
Sender: ${currentMessage.senderType}

Previous Assistant Message: ${lastAssistantMessage || 'None'}

Conversation Context:
- Stage: ${conversationContext.conversationStage}
- Pending Order: ${conversationContext.pendingOrder ? 'Yes' : 'No'}
${conversationContext.pendingOrder ? `- Order Total: ₹${conversationContext.pendingOrder.totalAmount / 100}` : ''}

CUSTOMER INFORMATION WE ALREADY HAVE (DO NOT ASK FOR THESE):
${knownInfo.length > 0 ? knownInfo.map(info => `- ${info}`).join('\n') : '- None'}

INFORMATION WE'RE MISSING (can ask for these):
${missingInfo.length > 0 ? missingInfo.map(info => `- ${info}`).join('\n') : '- None'}

KEY INFORMATION EXTRACTED FROM THIS MESSAGE:
${extractedInfo.map(info => `- ${info}`).join('\n')}

Create a summary that includes:
1. What happened in this message
2. What was asked previously (if assistant asked something)
3. What information we ALREADY HAVE about the customer (from knownInfo above)
4. What information we're MISSING (from missingInfo above)
5. Key information extracted from this message
6. What we expect the customer to do next

CRITICAL: The summary should clearly state what we already know so we DON'T ask for it again.

Format:
What Happened: [brief description]
What Was Asked: [what assistant asked, or "None"]
Known Info: [list what we already have]
Missing Info: [list what we're missing]
Key Info Extracted: [new information from this message]
Expected Next: [what customer will likely do next]

Keep it concise (80-120 words).`;
}

function extractKeyInfoFromMessage(message: string, pendingOrder?: any): string[] {
  const info: string[] = [];
  
  // Extract name if mentioned (simple pattern)
  const nameMatch = message.match(/\b([A-Z][a-z]{2,})\b/);
  if (nameMatch && nameMatch[1].length > 2 && nameMatch[1].length < 20) {
    info.push(`Name mentioned: ${nameMatch[1]}`);
  }
  
  // Extract address if mentioned (has numbers and location words)
  if (/\d+/.test(message) && 
      (message.toLowerCase().includes('street') || 
       message.toLowerCase().includes('road') || 
       message.toLowerCase().includes('address') ||
       message.toLowerCase().includes('tower') ||
       message.toLowerCase().includes('flat'))) {
    info.push('Address mentioned');
  }
  
  // Extract order confirmation
  const confirmationWords = ['yes', 'confirm', 'ok', 'sure', 'okay', 'fine'];
  if (confirmationWords.some(word => message.toLowerCase().includes(word))) {
    info.push('Order confirmation');
  }
  
  // Add pending order info if exists
  if (pendingOrder) {
    info.push(`Pending order: ₹${pendingOrder.totalAmount / 100}`);
    if (pendingOrder.items && Array.isArray(pendingOrder.items)) {
      const itemCount = pendingOrder.items.length;
      info.push(`Order items: ${itemCount} item(s)`);
    }
  }
  
  return info;
}
```

### Step 3: Integrate with Multi-Stage Orchestrator

**File:** `backend/src/services/multiStageOrchestrator.ts`

Add Stage 9.5 after Stage 9:

```typescript
// After executeStage9() method, add:

/**
 * Stage 9.5: Generate Message Summary (async, non-blocking)
 */
private async executeStage9_5(context: StageContext, finalMessage: string): Promise<void> {
  // This runs async - doesn't block response
  setImmediate(async () => {
    const stageStart = Date.now();
    const stageName = 'stage_9.5';
    
    try {
      // Get current customer message
      const customerMessage = await prisma.message.findUnique({
        where: { id: context.messageId },
        select: { content: true, senderType: true }
      });
      
      if (!customerMessage || customerMessage.senderType !== 'customer') {
        return; // Only summarize customer messages
      }
      
      // Generate summary with customer insights
      const { generateMessageSummary } = await import('./messageSummaryService.js');
      const summary = await generateMessageSummary(
        context.messageId,
        context.conversationId,
        context.customerId,
        context.vendorId,
        customerMessage,
        finalMessage,  // Last assistant message
        {
          conversationStage: context.memory?.conversationStage || 'greeting',
          pendingOrder: context.fetchedData?.pendingOrder,
          memory: context.memory
        }
      );
      
      // Store summary on the customer message
      if (summary.summary) {
        await prisma.message.update({
          where: { id: context.messageId },
          data: {
            messageSummary: summary.summary,
            expectedNextAction: summary.expectedNext,
            summaryMetadata: summary.metadata
          }
        });
        
        logger.debug({ 
          messageId: context.messageId,
          summaryLength: summary.summary.length,
          expectedNext: summary.expectedNext
        }, 'Message summary generated');
      }
      
      // Log stage execution
      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: summary.metadata?.tokensUsed || 0,
        cost: (summary.metadata?.tokensUsed || 0) * 0.00000015, // gpt-4o-mini cost
        model: 'gpt-4o-mini'
      });
      
    } catch (error) {
      logger.warn({ err: error, messageId: context.messageId }, 
        'Failed to generate message summary - non-critical');
      
      // Log failure but don't throw (non-critical)
      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: false
      });
    }
  });
}
```

**Update execute() method to call Stage 9.5:**

```typescript
// In execute() method, after Stage 9:
await this.executeStage9(context, finalMessage);

// Add Stage 9.5 (async, non-blocking)
this.executeStage9_5(context, finalMessage);

await this.logExecutionSummary(context);
```

### Step 4: Enhance Intent Classification

**File:** `backend/src/services/intentClassificationService.ts`

Update `classifyIntent()` to retrieve and use last summary:

```typescript
export async function classifyIntent(
  normalizedMessage: any,
  memory: ConversationMemory,
  lastMessages: any[],
  vendorId: string,
  conversationId?: string,
  disableFallback: boolean = false,
  disableCache: boolean = false
): Promise<IntentClassification> {
  // ... existing code ...
  
  // Get LAST summary (only one)
  let lastSummary: { summary: string; expectedNext: string } | null = null;
  if (conversationId) {
    try {
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
      
      if (lastMessageWithSummary?.messageSummary) {
        lastSummary = {
          summary: lastMessageWithSummary.messageSummary,
          expectedNext: lastMessageWithSummary.expectedNextAction || ''
        };
      }
    } catch (error) {
      logger.warn({ err: error, conversationId }, 'Failed to retrieve last summary');
    }
  }
  
  // ... existing code for existingOrder ...
  
  const prompt = buildIntentPrompt(
    normalizedMessage, 
    memory, 
    lastMessages, 
    existingOrder,
    lastSummary  // Pass last summary
  );
  
  // ... rest of existing code ...
}
```

Update `buildIntentPrompt()` to include summary context:

```typescript
function buildIntentPrompt(
  normalized: any,
  memory: ConversationMemory,
  lastMessages: any[],
  existingOrder?: any,
  lastSummary?: { summary: string; expectedNext: string }  // NEW parameter
): string {
  // ... existing code ...
  
  // Add LAST summary context (if available)
  const summaryContext = lastSummary
    ? `\n\nLAST MESSAGE SUMMARY (for context):
${lastSummary.summary}

CRITICAL INSTRUCTIONS:
1. Use this summary to understand conversation flow
2. If summary says "Known Info: Customer Name: [name]", DO NOT ask for name again
3. If summary says "Missing Info: Delivery Address", you CAN ask for address
4. If summary says "Assistant asked for name" and current message is just a name, classify as "confirm_order"
5. If summary says "Expected Next: customer will provide address" and current message contains address, classify as "confirm_order" or "order_update"
6. DO NOT ask for information listed in "Known Info" section`
    : '';
  
  return `...${existingPrompt}${summaryContext}`;
}
```

### Step 5: Testing

**Create Test File:** `backend/src/services/__tests__/messageSummaryService.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { generateMessageSummary } from '../messageSummaryService.js';

describe('Message Summary Service', () => {
  it('should generate summary for order confirmation scenario', async () => {
    const summary = await generateMessageSummary(
      'msg-123',
      'conv-123',
      'customer-123',
      'vendor-123',
      { content: 'Murali', senderType: 'customer' },
      'I need your name to confirm the order. Could you please provide your name?',
      {
        conversationStage: 'order_confirmation',
        pendingOrder: {
          totalAmount: 339800,
          items: [{ name: 'Karuppu Kavuni Brownie', quantity: 2 }]
        }
      }
    );
    
    expect(summary.summary).toContain('Murali');
    expect(summary.summary).toContain('name');
    expect(summary.expectedNext).toBeTruthy();
  });
  
  // Add more test cases...
});
```

### Step 6: Monitoring & Metrics

**Add Metrics Tracking:**

```typescript
// In messageSummaryService.ts, after successful generation:
logger.info({
  messageId,
  conversationId,
  summaryLength: summary.summary.length,
  tokensUsed: summary.metadata?.tokensUsed,
  cost: (summary.metadata?.tokensUsed || 0) * 0.00000015
}, 'Message summary generated successfully');
```

## Verification Checklist

- [ ] Database migration successful
- [ ] Message summary service created
- [ ] Stage 9.5 integrated into orchestrator
- [ ] Intent classification uses summaries
- [ ] Tests passing
- [ ] Monitoring in place
- [ ] Cost tracking enabled

## Rollout Plan

1. **Phase 1:** Deploy to staging environment
2. **Phase 2:** Test with sample conversations
3. **Phase 3:** Enable for 10% of conversations (feature flag)
4. **Phase 4:** Monitor metrics and adjust
5. **Phase 5:** Rollout to 100% if metrics are positive

## Troubleshooting

### Summary Not Generated

**Check:**
- OpenAI API key configured
- Message is customer message (not assistant)
- Database connection working
- Check logs for errors

### Summary Quality Issues

**Solutions:**
- Adjust prompt template
- Increase max_tokens if needed
- Review sample summaries
- Iterate on prompt engineering

### High Costs

**Solutions:**
- Verify using gpt-4o-mini (not gpt-4)
- Check token usage per summary
- Optimize prompt size
- Add rate limiting if needed

## Next Steps

After implementation:
1. Monitor order confirmation success rate
2. Track intent classification accuracy
3. Measure customer satisfaction
4. Iterate based on results
5. Plan Phase 2 enhancements

---

**Last Updated:** December 2025  
**Status:** Ready for Implementation

