# Multi-Stage AI Processing - Complete Implementation Plan

**Document Version:** 1.0  
**Status:** CRITICAL - Core Implementation Guide  
**Last Updated:** December 2024

> **⚠️ Superseded (as of 2026-09):** This plan describes `backend/src/services/multiStageOrchestrator.ts` and the 14/15-stage pipeline (with `unifiedAIProcessorService.ts`), which was built largely as specified here but has since been **retired from the live WhatsApp message hot path**. It is now only invoked by `catalogImportSandboxService.ts`, unrelated to live customer messages. Production message processing today uses a different architecture (LLM-1 + deterministic CartEngine + optional LLM-2 verifier, running on AWS Lambda) — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. The content below is kept for historical reference.

---

## **EXECUTIVE SUMMARY**

This document provides a **complete, step-by-step implementation plan** for the Multi-Stage AI Processing Optimization system. This is the **CORE of the entire project** - failure to implement correctly will collapse the entire goal.

**Critical Success Factors:**
- ✅ Zero information loss
- ✅ Natural conversation quality maintained
- ✅ 75%+ cost reduction achieved
- ✅ Robust error handling at every stage
- ✅ Comprehensive testing before production
- ✅ Gradual migration with rollback capability

---

## **TABLE OF CONTENTS**

1. [Phase 1: Database Schema Foundation](#phase-1-database-schema-foundation)
2. [Phase 2: Conversation Memory Service](#phase-2-conversation-memory-service)
3. [Phase 3: Caching Strategy](#phase-3-caching-strategy)
4. [Phase 4: Stage Execution Orchestrator](#phase-4-stage-execution-orchestrator)
5. [Phase 5: Individual Stage Implementations](#phase-5-individual-stage-implementations)
6. [Phase 6: Error Handling & Fallbacks](#phase-6-error-handling--fallbacks)
7. [Phase 7: Testing Strategy](#phase-7-testing-strategy)
8. [Phase 8: Migration Plan](#phase-8-migration-plan)
9. [Phase 9: Monitoring & Observability](#phase-9-monitoring--observability)
10. [Phase 10: Cost Verification & Optimization](#phase-10-cost-verification--optimization)
11. [Phase 11: Performance Optimization](#phase-11-performance-optimization)

---

## **PHASE 1: DATABASE SCHEMA FOUNDATION**

**Priority:** 🔴 CRITICAL  
**Timeline:** Week 1, Days 1-2  
**Risk:** HIGH - Foundation for entire system

### **1.1 Prisma Schema Updates**

**File:** `backend/prisma/schema.prisma`

Add these models after existing models:

```prisma
// ============================================
// CONVERSATION MEMORY - Core for Stage 0.5
// ============================================
model ConversationMemory {
  id                String   @id @default(uuid())
  conversationId    String   @unique
  vendorId          String   // Denormalized for faster queries
  
  // Memory Content
  keyFacts          Json     // Array of strings
  ongoingTopics     Json     // Array of strings
  customerPreferences Json   // Object
  lastOrderSummary  String?  @db.Text
  conversationSummary String @db.Text
  importantContext  Json     // Array of strings
  
  // Conversation State
  turnNumber        Int      @default(0)
  conversationStage String   @default("greeting")
  
  // Metadata
  lastUpdated       DateTime @updatedAt
  createdAt         DateTime @default(now())
  
  // Relations
  conversation      Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  vendor            Vendor       @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  
  @@index([vendorId])
  @@index([conversationId])
  @@index([lastUpdated])
  @@map("ConversationMemory")
}

// ============================================
// CORRECTION HISTORY - For Stage 1.7
// ============================================
model CorrectionHistory {
  id                String   @id @default(uuid())
  conversationId    String
  messageId         String
  vendorId          String
  
  correctedField    String
  originalValue     String   @db.Text
  correctedValue    String   @db.Text
  confidence        Float
  
  previousMessages  Json?
  correctionPattern String?
  
  createdAt         DateTime @default(now())
  
  conversation      Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  vendor            Vendor       @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  
  @@index([conversationId])
  @@index([vendorId])
  @@index([createdAt])
  @@map("CorrectionHistory")
}

// ============================================
// QUALITY METRICS - For Stage 8.5
// ============================================
model QualityMetrics {
  id                String   @id @default(uuid())
  conversationId     String
  messageId         String
  vendorId          String
  
  naturalnessScore   Float
  completenessScore  Float
  continuityScore    Float
  overallScore       Float
  
  stagesExecuted     Json
  totalTokensUsed    Int      @default(0)
  totalCost          Float    @default(0)
  totalDuration      Int
  
  issues             Json?
  
  createdAt          DateTime @default(now())
  
  conversation       Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  vendor             Vendor       @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  
  @@index([conversationId])
  @@index([vendorId])
  @@index([createdAt])
  @@index([overallScore])
  @@map("QualityMetrics")
}

// ============================================
// STAGE EXECUTION LOG - For Monitoring
// ============================================
model StageExecutionLog {
  id                String   @id @default(uuid())
  conversationId    String
  messageId         String
  vendorId          String
  
  stageName         String
  stageType         String
  
  success           Boolean
  duration          Int
  tokensUsed        Int?     @default(0)
  cost              Float?    @default(0)
  
  errorType         String?
  errorMessage      String?  @db.Text
  fallbackUsed      Boolean  @default(false)
  
  inputSize         Int?
  outputSize        Int?
  
  createdAt         DateTime @default(now())
  
  conversation      Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  vendor            Vendor       @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  
  @@index([conversationId])
  @@index([vendorId])
  @@index([stageName])
  @@index([createdAt])
  @@index([success])
  @@map("StageExecutionLog")
}
```

**Update existing models:**

```prisma
model Conversation {
  // ... existing fields ...
  conversationMemory ConversationMemory?
  correctionHistory  CorrectionHistory[]
  qualityMetrics     QualityMetrics[]
  stageExecutionLogs StageExecutionLog[]
  // ... rest of model ...
}

model Vendor {
  // ... existing fields ...
  conversationMemories ConversationMemory[]
  correctionHistory    CorrectionHistory[]
  qualityMetrics       QualityMetrics[]
  stageExecutionLogs   StageExecutionLog[]
  // ... rest of model ...
}

model Message {
  // ... existing fields ...
  normalizedContent    String?  @db.Text
  normalizationMetadata Json?
  // ... rest of model ...
}
```

### **1.2 Migration Steps**

1. **Create migration file:**
   ```bash
   cd backend
   npx prisma migrate dev --name add_multi_stage_tables --create-only
   ```

2. **Review generated migration** in `backend/prisma/migrations/[timestamp]_add_multi_stage_tables/migration.sql`

3. **Apply migration:**
   ```bash
   npx prisma migrate dev
   npx prisma generate
   ```

4. **Verify:**
   ```bash
   # Check tables created
   psql $DATABASE_URL -c "\dt" | grep -E "(ConversationMemory|CorrectionHistory|QualityMetrics|StageExecutionLog)"
   ```

### **1.3 Data Backfill (Optional)**

For existing conversations, create initial memory records:

**File:** `backend/scripts/backfill-conversation-memory.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import { logger } from '../src/logger.js';

const prisma = new PrismaClient();

async function backfillConversationMemory() {
  const conversations = await prisma.conversation.findMany({
    where: {
      conversationMemory: null
    },
    take: 1000
  });

  logger.info({ count: conversations.length }, 'Backfilling conversation memory');

  for (const conv of conversations) {
    try {
      await prisma.conversationMemory.create({
        data: {
          id: crypto.randomUUID(),
          conversationId: conv.id,
          vendorId: conv.vendorId,
          keyFacts: [],
          ongoingTopics: [],
          customerPreferences: {},
          conversationSummary: 'Initialized from backfill',
          importantContext: [],
          turnNumber: 0,
          conversationStage: 'greeting'
        }
      });
    } catch (error) {
      logger.error(error as Error, { conversationId: conv.id }, 'Failed to backfill');
    }
  }

  logger.info('Backfill completed');
}

backfillConversationMemory()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## **PHASE 2: CONVERSATION MEMORY SERVICE**

**Priority:** 🔴 CRITICAL  
**Timeline:** Week 1, Days 3-4  
**Risk:** HIGH - Core functionality for natural conversations

### **2.1 Service Implementation**

**File:** `backend/src/services/conversationMemoryService.ts`

```typescript
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { getCached, setCached, deleteCached } from '../utils/redis.js';
import { AIService } from './aiService.js';

const aiService = new AIService();

export interface ConversationMemory {
  keyFacts: string[];
  ongoingTopics: string[];
  customerPreferences: Record<string, any>;
  lastOrderSummary?: string;
  conversationSummary: string;
  importantContext: string[];
  turnNumber: number;
  conversationStage: 'greeting' | 'information_gathering' | 'order_confirmation' | 'closing';
}

export interface ConversationMemoryInput {
  conversationId: string;
  vendorId: string;
  normalizedMessage: string;
  currentMessage?: string;
}

/**
 * Retrieve conversation memory with caching
 * CRITICAL: Must be fast (< 100ms)
 */
export async function retrieveConversationMemory(
  input: ConversationMemoryInput
): Promise<ConversationMemory> {
  const { conversationId, vendorId } = input;
  const cacheKey = `conversation_memory:${conversationId}`;
  
  // Try cache first (5 minute TTL)
  const cached = await getCached<ConversationMemory>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const dbMemory = await prisma.conversationMemory.findUnique({
      where: { conversationId }
    });
    
    if (dbMemory) {
      const memory: ConversationMemory = {
        keyFacts: dbMemory.keyFacts as string[],
        ongoingTopics: dbMemory.ongoingTopics as string[],
        customerPreferences: dbMemory.customerPreferences as Record<string, any>,
        lastOrderSummary: dbMemory.lastOrderSummary || undefined,
        conversationSummary: dbMemory.conversationSummary,
        importantContext: dbMemory.importantContext as string[],
        turnNumber: dbMemory.turnNumber,
        conversationStage: dbMemory.conversationStage as ConversationMemory['conversationStage']
      };
      
      await setCached(cacheKey, memory, 300); // 5 minutes
      return memory;
    }
    
    return await createInitialMemory(conversationId, vendorId);
  } catch (error) {
    logger.error(error as Error, { conversationId, vendorId }, 'Failed to retrieve memory');
    return getFallbackMemory();
  }
}

async function createInitialMemory(
  conversationId: string,
  vendorId: string
): Promise<ConversationMemory> {
  const initialMemory: ConversationMemory = {
    keyFacts: [],
    ongoingTopics: [],
    customerPreferences: {},
    conversationSummary: 'New conversation started',
    importantContext: [],
    turnNumber: 0,
    conversationStage: 'greeting'
  };
  
  try {
    await prisma.conversationMemory.create({
      data: {
        id: crypto.randomUUID(),
        conversationId,
        vendorId,
        keyFacts: [],
        ongoingTopics: [],
        customerPreferences: {},
        conversationSummary: initialMemory.conversationSummary,
        importantContext: [],
        turnNumber: 0,
        conversationStage: 'greeting'
      }
    });
    
    return initialMemory;
  } catch (error) {
    logger.error(error as Error, { conversationId, vendorId }, 'Failed to create memory');
    return initialMemory;
  }
}

/**
 * Update conversation memory after processing
 */
export async function updateConversationMemory(
  conversationId: string,
  vendorId: string,
  updates: {
    keyFacts?: string[];
    ongoingTopics?: string[];
    customerPreferences?: Record<string, any>;
    lastOrderSummary?: string;
    importantContext?: string[];
    conversationStage?: ConversationMemory['conversationStage'];
    incrementTurn?: boolean;
  }
): Promise<void> {
  const cacheKey = `conversation_memory:${conversationId}`;
  
  try {
    const current = await prisma.conversationMemory.findUnique({
      where: { conversationId }
    });
    
    if (!current) {
      await createInitialMemory(conversationId, vendorId);
      return;
    }
    
    const updatedData: any = {
      keyFacts: updates.keyFacts || current.keyFacts,
      ongoingTopics: updates.ongoingTopics || current.ongoingTopics,
      customerPreferences: updates.customerPreferences || current.customerPreferences,
      importantContext: updates.importantContext || current.importantContext,
      turnNumber: updates.incrementTurn ? current.turnNumber + 1 : current.turnNumber
    };
    
    if (updates.lastOrderSummary !== undefined) {
      updatedData.lastOrderSummary = updates.lastOrderSummary;
    }
    
    if (updates.conversationStage) {
      updatedData.conversationStage = updates.conversationStage;
    }
    
    // Generate summary every 12 messages
    if (updatedData.turnNumber % 12 === 0) {
      updatedData.conversationSummary = await generateConversationSummary(conversationId);
    }
    
    await prisma.conversationMemory.update({
      where: { conversationId },
      data: updatedData
    });
    
    await deleteCached(cacheKey);
  } catch (error) {
    logger.error(error as Error, { conversationId, vendorId }, 'Failed to update memory');
  }
}

async function generateConversationSummary(conversationId: string): Promise<string> {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'desc' },
      take: 15,
      select: {
        senderType: true,
        content: true,
        timestamp: true
      }
    });
    
    if (messages.length === 0) {
      return 'No messages yet';
    }
    
    const conversationText = messages
      .reverse()
      .map(msg => `${msg.senderType === 'customer' ? 'Customer' : 'Assistant'}: ${msg.content}`)
      .join('\n');
    
    const summaryPrompt = `Summarize this WhatsApp conversation in 2-3 sentences. Focus on:
1. What the customer wants (products, quantities, delivery)
2. Key preferences mentioned (delivery time, special requests)
3. Current status (ordering, confirming, etc.)

Conversation:
${conversationText}

Summary:`;
    
    const summary = await aiService.generateResponse(summaryPrompt, 'summary', undefined, conversationId);
    return summary.substring(0, 500);
  } catch (error) {
    logger.error(error as Error, { conversationId }, 'Failed to generate summary');
    return 'Summary generation failed';
  }
}

export async function extractKeyFacts(
  conversationId: string,
  normalizedMessage: string
): Promise<string[]> {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { timestamp: 'desc' },
      take: 20,
      select: { content: true, senderType: true }
    });
    
    const keyFacts: string[] = [];
    const messageText = messages.map(m => m.content).join(' ').toLowerCase();
    
    // Extract delivery preferences
    if (messageText.includes('morning') || messageText.includes('am')) {
      keyFacts.push('Customer prefers morning delivery');
    }
    if (messageText.includes('evening') || messageText.includes('pm')) {
      keyFacts.push('Customer prefers evening delivery');
    }
    
    // Extract dietary restrictions
    const dietaryKeywords = ['allergic', 'allergy', 'vegetarian', 'vegan', 'no nuts', 'gluten free'];
    for (const keyword of dietaryKeywords) {
      if (messageText.includes(keyword)) {
        keyFacts.push(`Customer mentioned: ${keyword}`);
      }
    }
    
    return keyFacts;
  } catch (error) {
    logger.error(error as Error, { conversationId }, 'Failed to extract key facts');
    return [];
  }
}

function getFallbackMemory(): ConversationMemory {
  return {
    keyFacts: [],
    ongoingTopics: [],
    customerPreferences: {},
    conversationSummary: 'Memory unavailable',
    importantContext: [],
    turnNumber: 0,
    conversationStage: 'greeting'
  };
}
```

### **2.2 Testing**

**File:** `backend/src/services/__tests__/conversationMemoryService.test.ts`

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { retrieveConversationMemory, updateConversationMemory } from '../conversationMemoryService.js';

describe('ConversationMemoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should retrieve memory from cache', async () => {
    // Test cache hit
  });

  it('should create initial memory if not exists', async () => {
    // Test memory creation
  });

  it('should update memory correctly', async () => {
    // Test memory update
  });

  it('should handle database errors gracefully', async () => {
    // Test error handling
  });
});
```

---

## **PHASE 3: CACHING STRATEGY**

**Priority:** 🟡 HIGH  
**Timeline:** Week 1, Day 5  
**Risk:** MEDIUM - Performance optimization

### **3.1 Cache Strategy Implementation**

**File:** `backend/src/utils/cacheStrategy.ts`

```typescript
import { getCached, setCached, deleteCached, deleteCachedByPattern } from './redis.js';
import { logger } from '../logger.js';

export const CACHE_TTL = {
  CONVERSATION_MEMORY: 300,      // 5 minutes
  VENDOR_CONFIG: 1800,          // 30 minutes
  PRODUCT_CATALOG: 3600,         // 1 hour
  CUSTOMER_INSIGHTS: 600,        // 10 minutes
  PENDING_ORDER: 120,            // 2 minutes
  INTENT_CLASSIFICATION: 3600,   // 1 hour
  NORMALIZATION: 3600             // 1 hour
} as const;

export async function cacheConversationMemory(
  conversationId: string,
  memory: any
): Promise<void> {
  const key = `conversation_memory:${conversationId}`;
  await setCached(key, memory, CACHE_TTL.CONVERSATION_MEMORY);
}

export async function cacheVendorConfig(
  vendorId: string,
  config: any
): Promise<void> {
  const key = `vendor_config:${vendorId}`;
  await setCached(key, config, CACHE_TTL.VENDOR_CONFIG);
}

export async function getCachedVendorConfig(vendorId: string): Promise<any | null> {
  const key = `vendor_config:${vendorId}`;
  return await getCached(key);
}

export async function cacheProductCatalog(
  vendorId: string,
  products: any[]
): Promise<void> {
  const key = `product_catalog:${vendorId}`;
  await setCached(key, products, CACHE_TTL.PRODUCT_CATALOG);
}

export async function getCachedProductCatalog(vendorId: string): Promise<any[] | null> {
  const key = `product_catalog:${vendorId}`;
  return await getCached<any[]>(key);
}

export async function cacheCustomerInsights(
  customerId: string,
  vendorId: string,
  insights: any
): Promise<void> {
  const key = `customer_insights:${customerId}:${vendorId}`;
  await setCached(key, insights, CACHE_TTL.CUSTOMER_INSIGHTS);
}

export async function getCachedCustomerInsights(
  customerId: string,
  vendorId: string
): Promise<any | null> {
  const key = `customer_insights:${customerId}:${vendorId}`;
  return await getCached(key);
}

export async function cachePendingOrder(
  conversationId: string,
  order: any
): Promise<void> {
  const key = `pending_order:${conversationId}`;
  await setCached(key, order, CACHE_TTL.PENDING_ORDER);
}

export async function getCachedPendingOrder(conversationId: string): Promise<any | null> {
  const key = `pending_order:${conversationId}`;
  return await getCached(key);
}

export async function invalidateConversationCache(conversationId: string): Promise<void> {
  const patterns = [
    `conversation_memory:${conversationId}`,
    `pending_order:${conversationId}`
  ];
  
  for (const pattern of patterns) {
    await deleteCached(pattern);
  }
  
  logger.info({ conversationId }, '🗑️ Invalidated conversation cache');
}

export async function invalidateVendorCache(vendorId: string): Promise<void> {
  const patterns = [
    `vendor_config:${vendorId}`,
    `product_catalog:${vendorId}`
  ];
  
  for (const pattern of patterns) {
    await deleteCached(pattern);
  }
  
  // Invalidate customer insights cache (pattern match)
  await deleteCachedByPattern(`customer_insights:*:${vendorId}`);
  
  logger.info({ vendorId }, '🗑️ Invalidated vendor cache');
}

export function getIntentCacheKey(message: string): string {
  const hash = Buffer.from(message.toLowerCase().trim()).toString('base64').substring(0, 16);
  return `intent_classification:${hash}`;
}
```

### **3.2 Cache Invalidation Hooks**

Add cache invalidation to existing services:

**File:** `backend/src/services/orderService.ts` (update existing)

```typescript
// Add after order creation/update
import { invalidateConversationCache } from '../utils/cacheStrategy.js';

// After order update:
await invalidateConversationCache(conversationId);
```

**File:** `backend/src/services/customerInsightsService.ts` (update existing)

```typescript
// Add after insights update
import { invalidateVendorCache } from '../utils/cacheStrategy.js';

// After insights update:
await invalidateVendorCache(vendorId);
```

---

## **PHASE 4: STAGE EXECUTION ORCHESTRATOR**

**Priority:** 🔴 CRITICAL  
**Timeline:** Week 2, Days 1-3  
**Risk:** HIGH - Core orchestration logic

### **4.1 Type Definitions**

**File:** `backend/src/types/multiStage.ts`

```typescript
export interface StageExecutionResult {
  stage: string;
  success: boolean;
  output: any;
  tokensUsed?: number;
  cost?: number;
  duration: number;
  error?: string;
}

export interface MultiStageResponse {
  finalMessage: string;
  intent: string;
  extractedData: {
    orderItems?: any[];
    deliveryAddress?: string;
    deliveryInstructions?: string;
    specialRequests?: string;
    customerInfo?: any;
  };
  stagesExecuted: string[];
  stagesSkipped: string[];
  totalTokensUsed: number;
  totalCost: number;
  qualityScore?: number;
}

export interface StageContext {
  conversationId: string;
  vendorId: string;
  customerId: string;
  messageId: string;
  rawMessage: string;
  normalizedMessage?: any;
  memory?: any;
  intentResult?: any;
  fetchedData?: any;
}
```

### **4.2 Orchestrator Implementation**

**File:** `backend/src/services/multiStageOrchestrator.ts`

```typescript
import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { MultiStageResponse, StageContext } from '../types/multiStage.js';
import { retrieveConversationMemory, updateConversationMemory } from './conversationMemoryService.js';

export class MultiStageOrchestrator {
  private stagesExecuted: string[] = [];
  private stagesSkipped: string[] = [];
  private totalTokensUsed = 0;
  private totalCost = 0;
  private totalDuration = 0;
  private errors: Array<{ stage: string; error: string }> = [];
  
  async execute(context: StageContext): Promise<MultiStageResponse> {
    const startTime = Date.now();
    
    try {
      // Stage 0: Message Normalization
      const normalized = await this.executeStage0(context);
      context.normalizedMessage = normalized;
      
      // Stage 0.5: Conversation Memory Retrieval
      const memory = await this.executeStage0_5(context);
      context.memory = memory;
      
      // Stage 1: Intent Understanding
      const intentResult = await this.executeStage1(context);
      context.intentResult = intentResult;
      
      // Stage 1.5: Intent Prioritization (conditional)
      if (intentResult.secondaryIntents?.length > 0) {
        await this.executeStage1_5(context);
      } else {
        this.stagesSkipped.push('stage_1.5');
      }
      
      // Stage 1.7: Correction Detection
      await this.executeStage1_7(context);
      
      // Stage 2: Context-Aware Data Fetching
      const fetchedData = await this.executeStage2(context);
      context.fetchedData = fetchedData;
      
      // Stage 3: Simplified Prompt Construction
      const prompt = await this.executeStage3(context);
      
      // Stage 4: Primary AI Response Generation
      const aiResponse = await this.executeStage4(context, prompt);
      
      // Stage 4.5: Order Update Validation (conditional)
      if (intentResult.primaryIntent === 'order_update') {
        await this.executeStage4_5(context, aiResponse);
      } else {
        this.stagesSkipped.push('stage_4.5');
      }
      
      // Stage 4.7: Proactive Assistance (conditional, async)
      await this.executeStage4_7(context);
      
      // Stage 5: Conditional Data Enrichment (conditional)
      let enrichment = null;
      if (aiResponse.needsClarification) {
        enrichment = await this.executeStage5(context, aiResponse);
      } else {
        this.stagesSkipped.push('stage_5');
      }
      
      // Stage 6: Response Refinement (conditional)
      let refinedResponse = aiResponse;
      if (enrichment) {
        refinedResponse = await this.executeStage6(context, aiResponse, enrichment);
      } else {
        this.stagesSkipped.push('stage_6');
      }
      
      // Stage 7: Message Composition
      const finalMessage = await this.executeStage7(context, refinedResponse);
      
      // Stage 7.5: Data Validation
      const validationResult = await this.executeStage7_5(context, refinedResponse);
      
      // Stage 8: Database Update
      await this.executeStage8(context, refinedResponse, validationResult);
      
      // Stage 8.5: Quality Assessment
      const quality = await this.executeStage8_5(context, finalMessage, refinedResponse);
      
      // Stage 9: Response Queuing
      await this.executeStage9(context, finalMessage);
      
      this.totalDuration = Date.now() - startTime;
      
      await this.logExecutionSummary(context);
      
      return {
        finalMessage,
        intent: intentResult.primaryIntent,
        extractedData: refinedResponse.extractedData || {},
        stagesExecuted: this.stagesExecuted,
        stagesSkipped: this.stagesSkipped,
        totalTokensUsed: this.totalTokensUsed,
        totalCost: this.totalCost,
        qualityScore: quality?.overallScore
      };
    } catch (error) {
      logger.error(error as Error, context, 'Multi-stage execution failed');
      return await this.executeFallback(context);
    }
  }
  
  private async executeStage0(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_0';
    
    try {
      const { normalizeMessage } = await import('./messageNormalizationService.js');
      const result = await normalizeMessage(context.rawMessage, context.vendorId);
      
      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: result.tokensUsed || 0,
        cost: result.cost || 0
      });
      
      this.stagesExecuted.push(stageName);
      this.totalTokensUsed += result.tokensUsed || 0;
      this.totalCost += result.cost || 0;
      
      return result;
    } catch (error) {
      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });
      
      this.errors.push({ stage: stageName, error: (error as Error).message });
      
      // Fallback: Return original message
      return {
        original: context.rawMessage,
        cleaned: context.rawMessage,
        language: 'en',
        emojisInterpreted: [],
        typosCorrected: false,
        abbreviationsExpanded: false
      };
    }
  }
  
  private async executeStage0_5(context: StageContext): Promise<any> {
    const stageStart = Date.now();
    const stageName = 'stage_0.5';
    
    try {
      const memory = await retrieveConversationMemory({
        conversationId: context.conversationId,
        vendorId: context.vendorId,
        normalizedMessage: context.normalizedMessage?.cleaned || context.rawMessage
      });
      
      await this.logStageExecution(stageName, context, {
        success: true,
        duration: Date.now() - stageStart,
        tokensUsed: 0,
        cost: 0
      });
      
      this.stagesExecuted.push(stageName);
      return memory;
    } catch (error) {
      await this.logStageExecution(stageName, context, {
        success: false,
        duration: Date.now() - stageStart,
        errorType: (error as Error).constructor.name,
        errorMessage: (error as Error).message,
        fallbackUsed: true
      });
      
      this.errors.push({ stage: stageName, error: (error as Error).message });
      
      // Fallback: Return minimal memory
      return {
        keyFacts: [],
        ongoingTopics: [],
        customerPreferences: {},
        conversationSummary: 'Memory unavailable',
        importantContext: [],
        turnNumber: 0,
        conversationStage: 'greeting'
      };
    }
  }
  
  // Continue with other stages following same pattern...
  // (See full implementation in separate file)
  
  private async logStageExecution(
    stageName: string,
    context: StageContext,
    details: {
      success: boolean;
      duration: number;
      tokensUsed?: number;
      cost?: number;
      errorType?: string;
      errorMessage?: string;
      fallbackUsed?: boolean;
    }
  ): Promise<void> {
    try {
      await prisma.stageExecutionLog.create({
        data: {
          id: crypto.randomUUID(),
          conversationId: context.conversationId,
          vendorId: context.vendorId,
          messageId: context.messageId,
          stageName,
          stageType: this.getStageType(stageName),
          success: details.success,
          duration: details.duration,
          tokensUsed: details.tokensUsed || 0,
          cost: details.cost || 0,
          errorType: details.errorType || null,
          errorMessage: details.errorMessage || null,
          fallbackUsed: details.fallbackUsed || false
        }
      });
    } catch (error) {
      logger.warn({ error, stageName }, 'Failed to log stage execution');
    }
  }
  
  private getStageType(stageName: string): string {
    if (stageName.includes('normalization')) return 'normalization';
    if (stageName.includes('intent')) return 'intent';
    if (stageName.includes('ai') || stageName.includes('composition')) return 'ai';
    if (stageName.includes('validation')) return 'validation';
    return 'processing';
  }
  
  private async logExecutionSummary(context: StageContext): Promise<void> {
    logger.info({
      conversationId: context.conversationId,
      vendorId: context.vendorId,
      messageId: context.messageId,
      stagesExecuted: this.stagesExecuted.length,
      stagesSkipped: this.stagesSkipped.length,
      totalTokensUsed: this.totalTokensUsed,
      totalCost: this.totalCost,
      totalDuration: this.totalDuration,
      errors: this.errors.length
    }, '✅ Multi-stage execution completed');
  }
  
  private async executeFallback(context: StageContext): Promise<MultiStageResponse> {
    logger.warn({ conversationId: context.conversationId }, '⚠️ Using fallback execution');
    
    const { AIService } = await import('./aiService.js');
    const aiService = new AIService();
    
    const response = await aiService.generateStructuredResponse(
      `Customer message: ${context.rawMessage}`,
      context.vendorId,
      context.conversationId
    );
    
    return {
      finalMessage: response.customerMessage,
      intent: 'other',
      extractedData: {},
      stagesExecuted: ['fallback'],
      stagesSkipped: [],
      totalTokensUsed: 0,
      totalCost: 0,
      qualityScore: 0
    };
  }
}
```

---

## **PHASE 5: INDIVIDUAL STAGE IMPLEMENTATIONS**

**Priority:** 🔴 CRITICAL  
**Timeline:** Week 2, Days 4-5 & Week 3  
**Risk:** HIGH - Each stage must work correctly

### **5.1 Stage 0: Message Normalization Service**

**File:** `backend/src/services/messageNormalizationService.ts`

```typescript
import { logger } from '../logger.js';
import { AIService } from './aiService.js';
import { getCached, setCached } from '../utils/redis.js';
import { getIntentCacheKey, CACHE_TTL } from '../utils/cacheStrategy.js';

const aiService = new AIService();

export interface NormalizedMessage {
  original: string;
  cleaned: string;
  language: string;
  emojisInterpreted: string[];
  typosCorrected: boolean;
  abbreviationsExpanded: boolean;
  hasEmojis: boolean;
  informalPatterns: string[];
  tokensUsed?: number;
  cost?: number;
}

export async function normalizeMessage(
  rawMessage: string,
  vendorId: string
): Promise<NormalizedMessage> {
  // Check cache first
  const cacheKey = getIntentCacheKey(rawMessage);
  const cached = await getCached<NormalizedMessage>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    // Basic text cleaning
    const cleaned = rawMessage
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\p{Emoji}]/gu, '');
    
    // Detect language (simple heuristic, can use library)
    const language = detectLanguage(rawMessage);
    
    // AI call for emoji interpretation and typo correction
    const aiResult = await normalizeWithAI(rawMessage, cleaned, vendorId);
    
    const normalized: NormalizedMessage = {
      original: rawMessage,
      cleaned: aiResult.cleaned || cleaned,
      language: aiResult.language || language,
      emojisInterpreted: aiResult.emojisInterpreted || [],
      typosCorrected: aiResult.typosCorrected || false,
      abbreviationsExpanded: aiResult.abbreviationsExpanded || false,
      hasEmojis: /\p{Emoji}/u.test(rawMessage),
      informalPatterns: aiResult.informalPatterns || [],
      tokensUsed: aiResult.tokensUsed,
      cost: aiResult.cost
    };
    
    // Cache result
    await setCached(cacheKey, normalized, CACHE_TTL.NORMALIZATION);
    
    return normalized;
  } catch (error) {
    logger.error(error as Error, { rawMessage }, 'Normalization failed');
    
    // Fallback: Return basic cleaned version
    return {
      original: rawMessage,
      cleaned: rawMessage.trim(),
      language: 'en',
      emojisInterpreted: [],
      typosCorrected: false,
      abbreviationsExpanded: false,
      hasEmojis: false,
      informalPatterns: []
    };
  }
}

async function normalizeWithAI(
  rawMessage: string,
  cleaned: string,
  vendorId: string
): Promise<any> {
  const prompt = `You are a text normalizer for a WhatsApp business assistant.

Task: Normalize the customer message for better processing.

Customer Message: "${rawMessage}"

Tasks:
1. Interpret emojis in context (e.g., 🍕 = pizza, 😊 = happy/positive)
2. Correct obvious typos (e.g., "piza" -> "pizza", "browni" -> "brownie")
3. Expand common abbreviations (e.g., "pls" -> "please", "thx" -> "thanks")
4. Detect language

Return JSON:
{
  "cleaned": "normalized text",
  "language": "en|hi|ta|te|...",
  "emojisInterpreted": ["pizza", "happy"],
  "typosCorrected": true|false,
  "abbreviationsExpanded": true|false,
  "informalPatterns": ["pls", "thx"]
}`;

  try {
    const response = await aiService.generateResponse(prompt, 'normalization', vendorId);
    const parsed = JSON.parse(response);
    
    return {
      ...parsed,
      tokensUsed: 100, // Estimate
      cost: 0.00001 // Estimate
    };
  } catch (error) {
    logger.error(error as Error, 'AI normalization failed');
    return {
      cleaned,
      language: 'en',
      emojisInterpreted: [],
      typosCorrected: false,
      abbreviationsExpanded: false,
      informalPatterns: []
    };
  }
}

function detectLanguage(text: string): string {
  // Simple heuristic - can use library like 'franc' or 'langdetect'
  const hindiPattern = /[\u0900-\u097F]/;
  const tamilPattern = /[\u0B80-\u0BFF]/;
  const teluguPattern = /[\u0C00-\u0C7F]/;
  
  if (hindiPattern.test(text)) return 'hi';
  if (tamilPattern.test(text)) return 'ta';
  if (teluguPattern.test(text)) return 'te';
  return 'en';
}
```

### **5.2 Stage 1: Intent Classification Service**

**File:** `backend/src/services/intentClassificationService.ts`

```typescript
import { logger } from '../logger.js';
import { AIService } from './aiService.js';
import { getCached, setCached } from '../utils/redis.js';
import { getIntentCacheKey, CACHE_TTL } from '../utils/cacheStrategy.js';

const aiService = new AIService();

export interface IntentClassification {
  primaryIntent: 'order_new' | 'order_update' | 'order_status' | 
                 'product_inquiry' | 'greeting' | 'support' | 
                 'cancel_order' | 'confirm_order' | 'other';
  secondaryIntents?: string[];
  confidence: number;
  extractedInfo: {
    products?: string[];
    quantities?: string[];
    orderUpdateType?: 'add_items' | 'remove_items' | 'change_quantity' | 
                      'modify_delivery' | 'replace_order' | 'partial_update' | null;
    itemsToAdd?: any[];
    itemsToRemove?: string[];
    quantityChanges?: Array<{product: string, newQuantity: number}>;
    hasDeliveryInfo: boolean;
    hasSpecialRequests: boolean;
    mentionsOrder: boolean;
    orderNumber?: string | null;
    urgency: 'low' | 'medium' | 'high';
  };
  needsMoreContext: boolean;
  reasoning: string;
  tokensUsed?: number;
  cost?: number;
}

export async function classifyIntent(
  normalizedMessage: any,
  memory: any,
  lastMessages: any[],
  vendorId: string
): Promise<IntentClassification> {
  // Check cache
  const cacheKey = getIntentCacheKey(normalizedMessage.cleaned);
  const cached = await getCached<IntentClassification>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const prompt = buildIntentPrompt(normalizedMessage, memory, lastMessages);
    const response = await aiService.generateResponse(prompt, 'intent', vendorId);
    const parsed = JSON.parse(response);
    
    const result: IntentClassification = {
      ...parsed,
      tokensUsed: 300, // Estimate
      cost: 0.00005 // Estimate
    };
    
    // Cache result
    await setCached(cacheKey, result, CACHE_TTL.INTENT_CLASSIFICATION);
    
    return result;
  } catch (error) {
    logger.error(error as Error, 'Intent classification failed');
    
    // Fallback: Keyword-based intent detection
    return keywordBasedIntentDetection(normalizedMessage.cleaned);
  }
}

function buildIntentPrompt(
  normalized: any,
  memory: any,
  lastMessages: any[]
): string {
  return `You are an intent classifier for a WhatsApp business assistant.

Task: Analyze the customer message and classify intent(s), then extract key information.

Customer Message: "${normalized.cleaned}"

Conversation Memory:
Key Facts: ${JSON.stringify(memory.keyFacts || [])}
Ongoing Topics: ${JSON.stringify(memory.ongoingTopics || [])}
Previous Context: ${lastMessages.map(m => `${m.senderType}: ${m.content}`).join('\n')}

Return JSON:
{
  "primaryIntent": "order_new|order_update|order_status|product_inquiry|greeting|support|cancel_order|confirm_order|other",
  "secondaryIntents": ["intent1", "intent2"],
  "confidence": 0.0-1.0,
  "extractedInfo": {
    "products": ["product1", "product2"],
    "quantities": ["2kg", "3 pieces"],
    "orderUpdateType": "add_items|remove_items|change_quantity|modify_delivery|replace_order|partial_update" | null,
    "itemsToAdd": [...],
    "itemsToRemove": [...],
    "quantityChanges": [{product: "brownie", newQuantity: 3}],
    "hasDeliveryInfo": true|false,
    "hasSpecialRequests": true|false,
    "mentionsOrder": true|false,
    "orderNumber": "ORD-123" | null,
    "urgency": "low|medium|high"
  },
  "needsMoreContext": true|false,
  "reasoning": "brief explanation"
}`;
}

function keywordBasedIntentDetection(message: string): IntentClassification {
  const lower = message.toLowerCase();
  
  let primaryIntent: IntentClassification['primaryIntent'] = 'other';
  let confidence = 0.5;
  
  if (lower.includes('order') || lower.includes('buy') || lower.includes('want')) {
    primaryIntent = 'order_new';
    confidence = 0.7;
  } else if (lower.includes('status') || lower.includes('where') || lower.includes('when')) {
    primaryIntent = 'order_status';
    confidence = 0.7;
  } else if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
    primaryIntent = 'greeting';
    confidence = 0.8;
  }
  
  return {
    primaryIntent,
    confidence,
    extractedInfo: {
      hasDeliveryInfo: false,
      hasSpecialRequests: false,
      mentionsOrder: false,
      urgency: 'low'
    },
    needsMoreContext: true,
    reasoning: 'Keyword-based fallback detection'
  };
}
```

### **5.3 Stage 2: Context-Aware Data Fetching**

**File:** `backend/src/services/contextFetcherService.ts`

```typescript
import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import {
  getCachedVendorConfig,
  getCachedProductCatalog,
  getCachedCustomerInsights,
  getCachedPendingOrder,
  cacheVendorConfig,
  cacheProductCatalog,
  cacheCustomerInsights,
  cachePendingOrder
} from '../utils/cacheStrategy.js';
import { IntentClassification } from './intentClassificationService.js';

export async function fetchRelevantData(
  intent: string,
  extractedInfo: any,
  conversationId: string,
  vendorId: string,
  customerId: string
): Promise<any> {
  const dataToFetch = {
    customerInsights: false,
    pendingOrder: false,
    productCatalog: false,
    orderHistory: false,
    vendorConfig: false
  };
  
  // Determine what to fetch based on intent
  switch(intent) {
    case 'order_new':
      dataToFetch.pendingOrder = true;
      dataToFetch.productCatalog = true;
      dataToFetch.customerInsights = true;
      break;
    
    case 'order_update':
      dataToFetch.pendingOrder = true;
      dataToFetch.productCatalog = true;
      dataToFetch.customerInsights = true;
      break;
    
    case 'order_status':
      dataToFetch.pendingOrder = true;
      dataToFetch.orderHistory = true;
      break;
    
    case 'product_inquiry':
      dataToFetch.productCatalog = true;
      dataToFetch.orderHistory = true;
      break;
    
    case 'greeting':
      dataToFetch.customerInsights = true;
      dataToFetch.productCatalog = true;
      dataToFetch.orderHistory = true;
      break;
    
    case 'confirm_order':
    case 'cancel_order':
      dataToFetch.pendingOrder = true;
      break;
  }
  
  // Fetch data with caching
  const data: any = {};
  
  if (dataToFetch.vendorConfig) {
    data.vendorConfig = await getCachedVendorConfig(vendorId);
    if (!data.vendorConfig) {
      const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
      if (vendor) {
        data.vendorConfig = vendor;
        await cacheVendorConfig(vendorId, vendor);
      }
    }
  }
  
  if (dataToFetch.productCatalog) {
    data.products = await getCachedProductCatalog(vendorId);
    if (!data.products) {
      const products = await prisma.product.findMany({
        where: { vendorId, isActive: true }
      });
      data.products = products;
      await cacheProductCatalog(vendorId, products);
    }
    
    // Filter to relevant products if mentioned
    if (extractedInfo.products && extractedInfo.products.length > 0) {
      data.products = data.products.filter((p: any) =>
        extractedInfo.products.some((mentioned: string) =>
          p.name.toLowerCase().includes(mentioned.toLowerCase()) ||
          p.keywords.some((k: string) => k.toLowerCase().includes(mentioned.toLowerCase()))
        )
      );
    }
  }
  
  if (dataToFetch.customerInsights) {
    data.insights = await getCachedCustomerInsights(customerId, vendorId);
    if (!data.insights) {
      const insights = await prisma.customerInsights.findUnique({
        where: {
          customerId_vendorId: {
            customerId,
            vendorId
          }
        }
      });
      if (insights) {
        data.insights = insights;
        await cacheCustomerInsights(customerId, vendorId, insights);
      }
    }
  }
  
  if (dataToFetch.pendingOrder) {
    data.pendingOrder = await getCachedPendingOrder(conversationId);
    if (!data.pendingOrder) {
      const order = await prisma.order.findFirst({
        where: {
          conversationId,
          vendorId,
          status: { in: ['pending', 'confirmed'] }
        },
        orderBy: { createdAt: 'desc' }
      });
      if (order) {
        data.pendingOrder = order;
        await cachePendingOrder(conversationId, order);
      }
    }
  }
  
  if (dataToFetch.orderHistory) {
    data.orderHistory = await prisma.order.findMany({
      where: {
        customerId,
        vendorId
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
  }
  
  return data;
}
```

### **5.4 Stage 3: Prompt Builder Service**

**File:** `backend/src/services/promptBuilderService.ts`

```typescript
import { logger } from '../logger.js';
import { IntentClassification } from './intentClassificationService.js';

export function buildFocusedPrompt(
  intent: string,
  extractedInfo: any,
  fetchedData: any,
  vendorConfig: any,
  memory: any
): string {
  const basePrompt = getBasePromptForIntent(intent, vendorConfig);
  const contextSections: string[] = [];
  
  // Add conversation memory context
  if (memory && memory.conversationSummary) {
    contextSections.push(`Conversation Summary: ${memory.conversationSummary}`);
  }
  
  if (memory && memory.keyFacts.length > 0) {
    contextSections.push(`Key Facts: ${memory.keyFacts.join(', ')}`);
  }
  
  // Add order context if relevant
  if (intent.includes('order')) {
    if (fetchedData.pendingOrder) {
      contextSections.push(`Current Order: ${formatOrder(fetchedData.pendingOrder)}`);
    }
  }
  
  // Add delivery info if mentioned
  if (extractedInfo.hasDeliveryInfo) {
    contextSections.push(`Delivery Info: ${extractDeliveryInfo(extractedInfo)}`);
  }
  
  // Add product context for inquiries
  if (intent === 'product_inquiry' && fetchedData.products) {
    contextSections.push(`Products: ${formatRelevantProducts(fetchedData.products)}`);
  }
  
  // Minimal customer insights (only what's needed)
  if (fetchedData.insights && needsCustomerContext(intent)) {
    contextSections.push(`Customer: ${formatMinimalInsights(fetchedData.insights)}`);
  }
  
  return `${basePrompt}\n\nContext:\n${contextSections.join('\n\n')}`;
}

function getBasePromptForIntent(intent: string, vendorConfig: any): string {
  const basePrompt = vendorConfig?.aiSystemPrompt || 'You are a helpful assistant.';
  const personality = vendorConfig?.aiPersonality || 'Be friendly and helpful.';
  
  return `${basePrompt}\n\n${personality}`;
}

function formatOrder(order: any): string {
  return `Order ${order.orderNumber}: ${JSON.stringify(order.items)} - ₹${order.totalAmount} (Status: ${order.status})`;
}

function formatRelevantProducts(products: any[]): string {
  return products.map(p => `${p.name} - ₹${p.basePrice}/${p.baseUnit}`).join(', ');
}

function formatMinimalInsights(insights: any): string {
  const parts: string[] = [];
  if (insights.customerName) parts.push(`Name: ${insights.customerName}`);
  if (insights.preferredLanguage) parts.push(`Language: ${insights.preferredLanguage}`);
  if (insights.primaryDeliveryAddress) parts.push(`Address: ${insights.primaryDeliveryAddress}`);
  return parts.join(', ');
}

function extractDeliveryInfo(extractedInfo: any): string {
  // Extract delivery-related info from extractedInfo
  return JSON.stringify(extractedInfo);
}

function needsCustomerContext(intent: string): boolean {
  return ['order_new', 'order_update', 'greeting'].includes(intent);
}
```

### **5.5 Stage 4: Primary AI Response Service**

**File:** `backend/src/services/primaryAIResponseService.ts`

```typescript
import { logger } from '../logger.js';
import { AIService } from './aiService.js';
import { executeWithCircuitBreaker } from '../utils/circuitBreaker.js';
import { fallbackAIResponse } from './stageFallbacks.js';

const aiService = new AIService();

export interface PrimaryAIResponse {
  response: string;
  extractedData: {
    orderItems?: any[];
    deliveryAddress?: string;
    specialRequests?: string;
    customerInfo?: any;
  };
  needsClarification: boolean;
  clarificationStrategy?: {
    missingFields: string[];
    clarificationQuestions: Array<{
      field: string;
      question: string;
      priority: 'high' | 'medium' | 'low';
      naturalPhrasing: string;
    }>;
    canProceedWithDefaults: boolean;
  };
  conversationFlow?: {
    nextStage: string;
    naturalTransition: string;
  };
  tokensUsed?: number;
  cost?: number;
}

export async function generatePrimaryAIResponse(
  prompt: string,
  normalizedMessage: any,
  memory: any,
  conversationId: string,
  vendorId: string
): Promise<PrimaryAIResponse> {
  return await executeWithCircuitBreaker(
    'primary_ai_response',
    async () => {
      const fullPrompt = `${prompt}\n\nConversation Flow Context:
- Turn Number: ${memory.turnNumber}
- Conversation Stage: ${memory.conversationStage}
- Previous Topic: ${memory.ongoingTopics[memory.ongoingTopics.length - 1] || 'None'}

User: ${normalizedMessage.cleaned}`;

      const response = await aiService.generateResponse(fullPrompt, 'response', vendorId, conversationId);
      const parsed = JSON.parse(response);
      
      return {
        ...parsed,
        tokensUsed: 800, // Estimate
        cost: 0.00012 // Estimate
      };
    },
    async () => {
      // Fallback
      return {
        response: fallbackAIResponse('other', vendorId),
        extractedData: {},
        needsClarification: true,
        tokensUsed: 0,
        cost: 0
      };
    }
  );
}
```

### **5.6 Stage 4.5: Order Update Validation Service**

**File:** `backend/src/services/orderUpdateValidationService.ts`

```typescript
import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';

export interface OrderUpdateValidation {
  isValid: boolean;
  conflicts: Array<{
    type: 'product_unavailable' | 'price_mismatch' | 'quantity_invalid' | 'delivery_conflict';
    message: string;
    severity: 'error' | 'warning';
  }>;
  priceChanges: {
    oldTotal: number;
    newTotal: number;
    difference: number;
  };
  requiresConfirmation: boolean;
  validatedUpdate: any;
}

export async function validateOrderUpdate(
  update: any,
  currentOrder: any,
  products: any[]
): Promise<OrderUpdateValidation> {
  const conflicts: OrderUpdateValidation['conflicts'] = [];
  
  // Validate products exist and are available
  if (update.orderItems) {
    for (const item of update.orderItems) {
      const product = products.find(p => 
        p.name.toLowerCase().includes(item.product.toLowerCase()) ||
        p.keywords.some((k: string) => k.toLowerCase().includes(item.product.toLowerCase()))
      );
      
      if (!product) {
        conflicts.push({
          type: 'product_unavailable',
          message: `Product "${item.product}" not found`,
          severity: 'error'
        });
      } else if (!product.inStock) {
        conflicts.push({
          type: 'product_unavailable',
          message: `Product "${item.product}" is out of stock`,
          severity: 'error'
        });
      }
      
      // Validate quantity
      if (item.quantity <= 0) {
        conflicts.push({
          type: 'quantity_invalid',
          message: `Invalid quantity for "${item.product}"`,
          severity: 'error'
        });
      }
    }
  }
  
  // Calculate price changes
  const oldTotal = currentOrder?.totalAmount || 0;
  const newTotal = calculateNewTotal(update.orderItems, products);
  const difference = newTotal - oldTotal;
  
  // Determine if confirmation needed (>20% price change)
  const requiresConfirmation = Math.abs(difference) > (oldTotal * 0.2);
  
  return {
    isValid: conflicts.filter(c => c.severity === 'error').length === 0,
    conflicts,
    priceChanges: {
      oldTotal,
      newTotal,
      difference
    },
    requiresConfirmation,
    validatedUpdate: update
  };
}

function calculateNewTotal(orderItems: any[], products: any[]): number {
  let total = 0;
  for (const item of orderItems) {
    const product = products.find(p => 
      p.name.toLowerCase().includes(item.product.toLowerCase())
    );
    if (product) {
      total += product.basePrice * item.quantity;
    }
  }
  return total;
}
```

### **5.7 Stage 4.7: Proactive Assistance Service**

**File:** `backend/src/services/proactiveAssistanceService.ts`

```typescript
import { logger } from '../logger.js';
import { AIService } from './aiService.js';

const aiService = new AIService();

export interface ProactiveSuggestion {
  type: 'reorder_favorite' | 'related_product' | 'complementary_item' | 'special_offer';
  product: string;
  reason: string;
  naturalPhrasing: string;
}

export interface ProactiveAssistanceResult {
  suggestions: ProactiveSuggestion[];
  shouldInclude: boolean;
  tokensUsed?: number;
  cost?: number;
}

export async function generateProactiveAssistance(
  insights: any,
  orderHistory: any[],
  currentContext: any,
  vendorId: string
): Promise<ProactiveAssistanceResult> {
  // Only suggest if appropriate
  if (!shouldSuggest(insights, orderHistory, currentContext)) {
    return {
      suggestions: [],
      shouldInclude: false,
      tokensUsed: 0,
      cost: 0
    };
  }
  
  try {
    const prompt = `Generate proactive suggestions based on customer context.

Customer Insights: ${JSON.stringify(insights)}
Order History: ${JSON.stringify(orderHistory.slice(0, 5))}
Current Conversation: ${JSON.stringify(currentContext)}

Suggest:
1. Related products (based on order history)
2. Reorder favorites
3. Complementary items
4. Special offers

Return suggestions if relevant, otherwise return empty array.

Return JSON:
{
  "suggestions": [
    {
      "type": "reorder_favorite|related_product|complementary_item|special_offer",
      "product": "brownie",
      "reason": "You ordered this last time",
      "naturalPhrasing": "Would you like to order brownie again? You seemed to enjoy it last time!"
    }
  ],
  "shouldInclude": true|false
}`;

    const response = await aiService.generateResponse(prompt, 'suggestion', vendorId);
    const parsed = JSON.parse(response);
    
    return {
      ...parsed,
      tokensUsed: 150,
      cost: 0.00002
    };
  } catch (error) {
    logger.error(error as Error, 'Proactive assistance failed');
    return {
      suggestions: [],
      shouldInclude: false,
      tokensUsed: 0,
      cost: 0
    };
  }
}

function shouldSuggest(insights: any, orderHistory: any[], context: any): boolean {
  // Don't suggest during order confirmation
  if (context.conversationStage === 'order_confirmation') {
    return false;
  }
  
  // Suggest if customer has order history
  if (orderHistory.length > 0) {
    return true;
  }
  
  return false;
}
```

### **5.8 Stage 6: Response Refinement Service**

**File:** `backend/src/services/responseRefinementService.ts`

```typescript
import { logger } from '../logger.js';
import { AIService } from './aiService.js';
import { PrimaryAIResponse } from './primaryAIResponseService.js';

const aiService = new AIService();

export async function refineResponse(
  initialResponse: PrimaryAIResponse,
  additionalData: any,
  currentMessage: string,
  vendorId: string
): Promise<PrimaryAIResponse> {
  try {
    const prompt = `Refine the response with additional context.

Previous Response: ${JSON.stringify(initialResponse)}

Additional Context:
${JSON.stringify(additionalData)}

Customer Message: ${currentMessage}

Return refined response with same structure.`;

    const response = await aiService.generateResponse(prompt, 'refinement', vendorId);
    const parsed = JSON.parse(response);
    
    return {
      ...parsed,
      tokensUsed: 500,
      cost: 0.00008
    };
  } catch (error) {
    logger.error(error as Error, 'Response refinement failed');
    return initialResponse; // Return original if refinement fails
  }
}
```

### **5.9 Stage 7: Message Composition Service**

**File:** `backend/src/services/messageCompositionService.ts`

```typescript
import { logger } from '../logger.js';
import { AIService } from './aiService.js';
import { PrimaryAIResponse } from './primaryAIResponseService.js';
import { ConversationMemory } from './conversationMemoryService.js';

const aiService = new AIService();

export async function composeMessage(
  responseData: PrimaryAIResponse,
  memory: ConversationMemory,
  vendorConfig: any,
  lastMessages: any[],
  conversationId: string,
  vendorId: string
): Promise<string> {
  try {
    const prompt = `You are a friendly WhatsApp assistant. Compose a natural, conversational response.

Intent: ${responseData.conversationFlow?.nextStage || 'response'}
Response Data: ${JSON.stringify(responseData.extractedData)}
Customer Name: ${memory.customerPreferences?.name || 'Customer'}
Conversation Memory: ${JSON.stringify(memory)}
Previous Messages: ${lastMessages.map(m => `${m.senderType}: ${m.content}`).join('\n')}
Vendor Personality: ${vendorConfig?.aiPersonality || 'Friendly and helpful'}

Requirements:
- Keep it conversational and warm
- Use customer's name naturally (not forced)
- Reference previous conversation naturally using conversation memory
- Maintain conversation flow and stage
- Use natural transitions
- Include emojis appropriately (match customer's style)
- Match vendor's personality and tone
- Keep under 150 words
- If correction detected, acknowledge gracefully
- If proactive suggestions, include naturally

Conversation Context:
- Turn: ${memory.turnNumber}
- Stage: ${memory.conversationStage}

Return only the message text, no JSON.`;

    const message = await aiService.generateResponse(prompt, 'composition', vendorId, conversationId);
    return message.trim();
  } catch (error) {
    logger.error(error as Error, 'Message composition failed');
    return responseData.response || 'I\'m here to help. How can I assist you?';
  }
}
```

### **5.10 Stage 7.5: Data Validation Service**

**File:** `backend/src/services/dataValidationService.ts`

```typescript
import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    error: string;
    severity: 'error' | 'warning';
  }>;
  validatedData: any;
}

export async function validateExtractedData(
  extractedData: any,
  vendorId: string,
  conversationId: string
): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = [];
  
  // Validate order items against product catalog
  if (extractedData.orderItems) {
    const products = await prisma.product.findMany({
      where: { vendorId, isActive: true }
    });
    
    for (const item of extractedData.orderItems) {
      const product = products.find(p => 
        p.name.toLowerCase().includes(item.product.toLowerCase())
      );
      
      if (!product) {
        errors.push({
          field: 'orderItems',
          error: `Product "${item.product}" not found in catalog`,
          severity: 'error'
        });
      }
      
      if (item.quantity <= 0) {
        errors.push({
          field: 'orderItems',
          error: `Invalid quantity for "${item.product}"`,
          severity: 'error'
        });
      }
    }
  }
  
  // Validate delivery address format
  if (extractedData.deliveryAddress) {
    if (!isValidAddressFormat(extractedData.deliveryAddress)) {
      errors.push({
        field: 'deliveryAddress',
        error: 'Invalid address format',
        severity: 'warning'
      });
    }
  }
  
  // Validate prices
  if (extractedData.orderItems && extractedData.totalAmount) {
    // Price validation logic
    const calculatedTotal = calculateTotal(extractedData.orderItems);
    if (Math.abs(calculatedTotal - extractedData.totalAmount) > 10) {
      errors.push({
        field: 'totalAmount',
        error: 'Price mismatch detected',
        severity: 'error'
      });
    }
  }
  
  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    validatedData: extractedData
  };
}

function isValidAddressFormat(address: string): boolean {
  // Basic validation - at least 10 characters
  return address.trim().length >= 10;
}

function calculateTotal(orderItems: any[]): number {
  // Calculate total from order items
  return orderItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0);
}
```

### **5.11 Stage 8: Data Extraction & Database Update Service**

**File:** `backend/src/services/dataExtractionService.ts`

```typescript
import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { updateConversationMemory } from './conversationMemoryService.js';
import { invalidateConversationCache } from '../utils/cacheStrategy.js';
import { ValidationResult } from './dataValidationService.js';

export async function extractAndSave(
  response: any,
  validationResult: ValidationResult,
  conversationId: string,
  vendorId: string,
  customerId: string
): Promise<void> {
  // Only proceed if validation passed
  if (!validationResult.isValid) {
    await handleValidationErrors(validationResult.errors, conversationId);
    return;
  }
  
  const extractedData = validationResult.validatedData;
  
  // Extract order information
  if (extractedData.orderItems) {
    const currentOrder = await prisma.order.findFirst({
      where: {
        conversationId,
        vendorId,
        status: { in: ['pending', 'confirmed'] }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    if (extractedData.orderUpdateType === 'add_items') {
      // Add items to existing order
      await addItemsToOrder(currentOrder!.id, extractedData.orderItems);
    } else if (extractedData.orderUpdateType === 'remove_items') {
      // Remove items from order
      await removeItemsFromOrder(currentOrder!.id, extractedData.itemsToRemove);
    } else if (extractedData.orderUpdateType === 'change_quantity') {
      // Update quantities
      await updateOrderQuantities(currentOrder!.id, extractedData.quantityChanges);
    } else {
      // Default: update or create order
      await updateOrCreateOrder(conversationId, vendorId, customerId, extractedData);
    }
  }
  
  // Extract customer information
  if (extractedData.customerInfo) {
    await updateCustomerInsights(conversationId, vendorId, customerId, extractedData.customerInfo);
  }
  
  // Extract delivery information
  if (extractedData.deliveryAddress) {
    await saveDeliveryInfo(conversationId, extractedData.deliveryAddress);
  }
  
  // Update conversation memory
  await updateConversationMemory(conversationId, vendorId, {
    keyFacts: extractKeyFacts(extractedData),
    ongoingTopics: extractOngoingTopics(response),
    lastOrderSummary: extractOrderSummary(extractedData),
    incrementTurn: true
  });
  
  // Invalidate caches
  await invalidateConversationCache(conversationId);
}

async function addItemsToOrder(orderId: string, items: any[]): Promise<void> {
  // Implementation
}

async function removeItemsFromOrder(orderId: string, itemsToRemove: string[]): Promise<void> {
  // Implementation
}

async function updateOrderQuantities(orderId: string, quantityChanges: any[]): Promise<void> {
  // Implementation
}

async function updateOrCreateOrder(
  conversationId: string,
  vendorId: string,
  customerId: string,
  extractedData: any
): Promise<void> {
  // Implementation
}

async function updateCustomerInsights(
  conversationId: string,
  vendorId: string,
  customerId: string,
  customerInfo: any
): Promise<void> {
  // Implementation
}

async function saveDeliveryInfo(conversationId: string, address: string): Promise<void> {
  // Implementation
}

function extractKeyFacts(extractedData: any): string[] {
  const facts: string[] = [];
  if (extractedData.deliveryAddress) {
    facts.push(`Delivery address: ${extractedData.deliveryAddress}`);
  }
  return facts;
}

function extractOngoingTopics(response: any): string[] {
  return response.conversationFlow?.nextStage ? [response.conversationFlow.nextStage] : [];
}

function extractOrderSummary(extractedData: any): string {
  if (extractedData.orderItems) {
    return `Ordered ${extractedData.orderItems.length} item(s)`;
  }
  return '';
}

async function handleValidationErrors(errors: any[], conversationId: string): Promise<void> {
  logger.warn({ errors, conversationId }, 'Validation errors detected');
  // Log errors for monitoring
}
```

### **5.12 Stage 8.5: Quality Assessment Service**

**File:** `backend/src/services/qualityAssessmentService.ts`

```typescript
import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { AIService } from './aiService.js';
import { ConversationMemory } from './conversationMemoryService.js';

const aiService = new AIService();

export interface QualityAssessment {
  naturalnessScore: number; // 0-5
  informationCompleteness: number; // 0-1
  conversationContinuity: number; // 0-1
  overallScore: number; // 0-5
  issues: string[];
}

export async function assessQuality(
  finalMessage: string,
  intent: string,
  extractedData: any,
  memory: ConversationMemory,
  conversationId: string,
  vendorId: string,
  messageId: string
): Promise<QualityAssessment> {
  try {
    // Naturalness scoring (using AI)
    const naturalnessScore = await scoreNaturalness(finalMessage, conversationId, vendorId);
    
    // Information completeness check
    const completeness = checkInformationCompleteness(intent, extractedData);
    
    // Conversation continuity check
    const continuity = checkConversationContinuity(finalMessage, memory);
    
    // Overall score calculation
    const overallScore = (
      naturalnessScore * 0.4 +
      completeness * 0.3 +
      continuity * 0.3
    ) * 5;
    
    const issues = identifyIssues(finalMessage, extractedData, naturalnessScore, completeness, continuity);
    
    const assessment: QualityAssessment = {
      naturalnessScore,
      informationCompleteness: completeness,
      conversationContinuity: continuity,
      overallScore,
      issues
    };
    
    // Save to database
    await prisma.qualityMetrics.create({
      data: {
        id: crypto.randomUUID(),
        conversationId,
        vendorId,
        messageId,
        naturalnessScore,
        completenessScore: completeness,
        continuityScore: continuity,
        overallScore,
        stagesExecuted: [],
        totalTokensUsed: 0,
        totalCost: 0,
        totalDuration: 0,
        issues: issues.length > 0 ? issues : null
      }
    });
    
    return assessment;
  } catch (error) {
    logger.error(error as Error, 'Quality assessment failed');
    return {
      naturalnessScore: 0,
      informationCompleteness: 0,
      conversationContinuity: 0,
      overallScore: 0,
      issues: ['Quality assessment failed']
    };
  }
}

async function scoreNaturalness(message: string, conversationId: string, vendorId: string): Promise<number> {
  try {
    const prompt = `Score the naturalness of this WhatsApp message on scale 0-5.

Message: ${message}

Rate naturalness considering:
1. Conversational tone
2. Natural flow
3. Appropriate use of language
4. Personalization
5. Emoji usage

Return only a number between 0 and 5.`;

    const response = await aiService.generateResponse(prompt, 'quality', vendorId, conversationId);
    const score = parseFloat(response.trim());
    return Math.max(0, Math.min(5, score || 0));
  } catch (error) {
    logger.error(error as Error, 'Naturalness scoring failed');
    return 3.5; // Default score
  }
}

function checkInformationCompleteness(intent: string, extractedData: any): number {
  // Check if all required fields for intent are present
  let requiredFields = 0;
  let presentFields = 0;
  
  if (intent === 'order_new') {
    requiredFields = 2; // products, quantities
    if (extractedData.orderItems) presentFields++;
    if (extractedData.orderItems?.length > 0) presentFields++;
  }
  
  return requiredFields > 0 ? presentFields / requiredFields : 1;
}

function checkConversationContinuity(message: string, memory: ConversationMemory): number {
  // Check if message references previous conversation
  let continuityScore = 0.5; // Base score
  
  if (memory.keyFacts.length > 0) {
    // Check if message references key facts
    const messageLower = message.toLowerCase();
    for (const fact of memory.keyFacts) {
      if (messageLower.includes(fact.toLowerCase().substring(0, 10))) {
        continuityScore += 0.2;
      }
    }
  }
  
  return Math.min(1, continuityScore);
}

function identifyIssues(
  message: string,
  extractedData: any,
  naturalness: number,
  completeness: number,
  continuity: number
): string[] {
  const issues: string[] = [];
  
  if (naturalness < 4.0) {
    issues.push('Low naturalness score');
  }
  
  if (completeness < 0.8) {
    issues.push('Incomplete information extraction');
  }
  
  if (continuity < 0.7) {
    issues.push('Poor conversation continuity');
  }
  
  return issues;
}
```

### **5.13 Stage 9: Response Queuing Service**

**File:** `backend/src/services/responseQueuingService.ts`

```typescript
import { logger } from '../logger.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { env } from '../config/env.js';

export async function queueResponse(
  finalMessage: string,
  conversationId: string,
  vendorId: string,
  customerId: string,
  metadata: {
    intent: string;
    tokensUsed: number;
    stagesExecuted: string[];
  }
): Promise<void> {
  try {
    // Get customer phone from conversation
    const { prisma } = await import('../db/prisma.js');
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true }
    });
    
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    
    await publishToQueue(env.RESPONSE_QUEUE_URL, {
      to: conversation.customer.phone,
      text: finalMessage,
      conversationId,
      vendorId,
      customerId,
      metadata: {
        intent: metadata.intent,
        tokensUsed: metadata.tokensUsed,
        stagesExecuted: metadata.stagesExecuted
      }
    });
    
    logger.info({ conversationId, messageLength: finalMessage.length }, '✅ Response queued');
  } catch (error) {
    logger.error(error as Error, { conversationId }, 'Failed to queue response');
    throw error;
  }
}
```

---

## **PHASE 6: ERROR HANDLING & FALLBACKS**

**Priority:** 🔴 CRITICAL  
**Timeline:** Week 3, Days 1-2  
**Risk:** HIGH - System resilience

### **6.1 Circuit Breaker Pattern**

**File:** `backend/src/utils/circuitBreaker.ts`

```typescript
import { logger } from '../logger.js';

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3,
  resetTimeout: 5 * 60 * 1000, // 5 minutes
  halfOpenMaxAttempts: 1
};

export function getCircuitBreakerState(service: string): CircuitBreakerState {
  if (!circuitBreakers.has(service)) {
    circuitBreakers.set(service, {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed'
    });
  }
  return circuitBreakers.get(service)!;
}

export function recordSuccess(service: string): void {
  const state = getCircuitBreakerState(service);
  state.failures = 0;
  state.state = 'closed';
}

export function recordFailure(service: string): void {
  const state = getCircuitBreakerState(service);
  state.failures++;
  state.lastFailureTime = Date.now();
  
  if (state.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    state.state = 'open';
    logger.warn({ service, failures: state.failures }, '🔴 Circuit breaker opened');
  }
}

export function isCircuitOpen(service: string): boolean {
  const state = getCircuitBreakerState(service);
  
  if (state.state === 'closed') {
    return false;
  }
  
  if (state.state === 'open') {
    const timeSinceLastFailure = Date.now() - state.lastFailureTime;
    if (timeSinceLastFailure >= CIRCUIT_BREAKER_CONFIG.resetTimeout) {
      state.state = 'half-open';
      logger.info({ service }, '🟡 Circuit breaker half-open');
      return false;
    }
    return true;
  }
  
  // half-open
  return false;
}

export async function executeWithCircuitBreaker<T>(
  service: string,
  operation: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  if (isCircuitOpen(service)) {
    logger.warn({ service }, 'Circuit breaker open, using fallback');
    return await fallback();
  }
  
  try {
    const result = await operation();
    recordSuccess(service);
    return result;
  } catch (error) {
    recordFailure(service);
    logger.error(error as Error, { service }, 'Operation failed, using fallback');
    return await fallback();
  }
}
```

### **6.2 Stage-Specific Fallbacks**

**File:** `backend/src/services/stageFallbacks.ts`

```typescript
import { logger } from '../logger.js';

/**
 * Fallback for Stage 0 (Normalization)
 */
export function fallbackNormalization(rawMessage: string): any {
  return {
    original: rawMessage,
    cleaned: rawMessage.trim(),
    language: 'en',
    emojisInterpreted: [],
    typosCorrected: false,
    abbreviationsExpanded: false,
    hasEmojis: false,
    informalPatterns: []
  };
}

/**
 * Fallback for Stage 1 (Intent Classification)
 */
export function fallbackIntentClassification(message: string): any {
  const lower = message.toLowerCase();
  
  let primaryIntent = 'other';
  if (lower.includes('order') || lower.includes('buy')) primaryIntent = 'order_new';
  else if (lower.includes('status')) primaryIntent = 'order_status';
  else if (lower.includes('hi') || lower.includes('hello')) primaryIntent = 'greeting';
  
  return {
    primaryIntent,
    confidence: 0.5,
    extractedInfo: {
      hasDeliveryInfo: false,
      hasSpecialRequests: false,
      mentionsOrder: false,
      urgency: 'low'
    },
    needsMoreContext: true,
    reasoning: 'Keyword-based fallback'
  };
}

/**
 * Fallback for Stage 4 (Primary AI Response)
 */
export function fallbackAIResponse(intent: string, vendorId: string): string {
  const templates: Record<string, string> = {
    'greeting': 'Hi! How can I help you today?',
    'order_new': 'I\'d be happy to help you place an order. What would you like?',
    'order_status': 'Let me check your order status for you.',
    'product_inquiry': 'I can help you with product information. What are you looking for?',
    'other': 'I\'m here to help. Could you tell me more about what you need?'
  };
  
  return templates[intent] || templates['other'];
}

/**
 * Fallback for Stage 7 (Message Composition)
 */
export function fallbackMessageComposition(aiResponse: any, intent: string): string {
  if (aiResponse?.response) {
    return aiResponse.response;
  }
  
  return fallbackAIResponse(intent, '');
}
```

---

## **PHASE 7: TESTING STRATEGY**

**Priority:** 🔴 CRITICAL  
**Timeline:** Week 3, Days 3-5  
**Risk:** HIGH - Quality assurance

### **7.1 Unit Tests**

**File:** `backend/src/services/__tests__/multiStageOrchestrator.test.ts`

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MultiStageOrchestrator } from '../multiStageOrchestrator.js';

describe('MultiStageOrchestrator', () => {
  let orchestrator: MultiStageOrchestrator;
  
  beforeEach(() => {
    orchestrator = new MultiStageOrchestrator();
    jest.clearAllMocks();
  });
  
  it('should execute all stages successfully', async () => {
    const context = {
      conversationId: 'test-conv-1',
      vendorId: 'test-vendor-1',
      customerId: 'test-customer-1',
      messageId: 'test-msg-1',
      rawMessage: 'I want to order 2kg brownie'
    };
    
    const result = await orchestrator.execute(context);
    
    expect(result).toBeDefined();
    expect(result.finalMessage).toBeTruthy();
    expect(result.stagesExecuted.length).toBeGreaterThan(0);
    expect(result.totalCost).toBeGreaterThanOrEqual(0);
  });
  
  it('should handle stage failures gracefully', async () => {
    // Test error handling
  });
  
  it('should skip conditional stages when not needed', async () => {
    // Test conditional stage skipping
  });
  
  it('should use fallback when all stages fail', async () => {
    // Test fallback execution
  });
});
```

### **7.2 Integration Tests**

**File:** `backend/src/__tests__/integration/multiStageFlow.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Multi-Stage Flow Integration', () => {
  it('should process simple order message end-to-end', async () => {
    // Full flow test
  });
  
  it('should handle multi-intent message', async () => {
    // Multi-intent test
  });
  
  it('should handle correction detection', async () => {
    // Correction test
  });
  
  it('should maintain conversation memory', async () => {
    // Memory continuity test
  });
});
```

### **7.3 Performance Tests**

**File:** `backend/src/__tests__/performance/multiStagePerformance.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Multi-Stage Performance', () => {
  it('should complete within 5 seconds', async () => {
    const start = Date.now();
    // Execute orchestrator
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(5000);
  });
  
  it('should handle 100 concurrent messages', async () => {
    // Load test
  });
});
```

---

## **PHASE 8: MIGRATION PLAN**

**Priority:** 🔴 CRITICAL  
**Timeline:** Week 4  
**Risk:** HIGH - Production deployment

### **8.1 Migration Steps**

1. **Week 4, Day 1: Database Migration**
   - Apply schema changes
   - Run backfill script
   - Verify data integrity

2. **Week 4, Day 2-3: Feature Flag Setup**
   ```typescript
   // Add to env.ts
   ENABLE_MULTI_STAGE_AI: z.string().optional()
   
   // Add to messageProcessor.ts
   if (process.env.ENABLE_MULTI_STAGE_AI === 'true') {
     // Use new orchestrator
   } else {
     // Use old method
   }
   ```

3. **Week 4, Day 4: 10% Traffic**
   - Enable for 10% of conversations
   - Monitor metrics
   - Compare quality

4. **Week 4, Day 5: 50% Traffic**
   - Increase to 50%
   - Monitor closely
   - Fix issues

5. **Week 5: 100% Traffic**
   - Full rollout
   - Keep old system as fallback
   - Monitor for 1 week

### **8.2 Rollback Plan**

```typescript
// Immediate rollback
process.env.ENABLE_MULTI_STAGE_AI = 'false';

// Data rollback (if needed)
// - Conversation memory can stay (non-breaking)
// - Quality metrics can stay (non-breaking)
// - Stage execution logs can stay (non-breaking)
```

---

## **PHASE 9: MONITORING & OBSERVABILITY**

**Priority:** 🟡 HIGH  
**Timeline:** Week 4, Ongoing  
**Risk:** MEDIUM - Operational visibility

### **9.1 Key Metrics**

```typescript
// Metrics to track:
// 1. Cost per message (by stage)
// 2. Quality scores (naturalness, completeness, continuity)
// 3. Stage execution times
// 4. Error rates per stage
// 5. Fallback usage frequency
// 6. Cache hit rates
// 7. Circuit breaker state
```

### **9.2 Alerts**

```typescript
// Alert conditions:
// - Cost per message > 2x average
// - Quality score < 4.5
// - Stage failure rate > 5%
// - End-to-end latency > 5 seconds
// - Circuit breaker opened
```

---

## **PHASE 10: COST VERIFICATION**

**Priority:** 🟡 HIGH  
**Timeline:** Week 4, Ongoing  
**Risk:** MEDIUM - Budget compliance

### **10.1 Cost Tracking**

```typescript
// Track costs per:
// - Stage
// - Intent type
// - Vendor
// - Time period
```

### **10.2 Cost Optimization**

- Use caching aggressively
- Skip unnecessary stages
- Use cheaper models where possible
- Batch similar requests

---

## **PHASE 11: PERFORMANCE OPTIMIZATION**

**Priority:** 🟡 HIGH  
**Timeline:** Week 5, Ongoing  
**Risk:** MEDIUM - User experience

### **11.1 Optimization Strategies**

1. **Parallel Stage Execution**
   - Stage 4.7 (Proactive) can be async
   - Stage 8.5 (Quality) can be async

2. **Database Query Optimization**
   - Use indexes
   - Batch queries
   - Use connection pooling

3. **Cache Optimization**
   - Increase TTLs where appropriate
   - Pre-warm caches
   - Use CDN for static data

---

## **SUCCESS CRITERIA CHECKLIST**

- [ ] Database schema deployed successfully
- [ ] All stages implemented and tested
- [ ] Error handling works for all stages
- [ ] Caching reduces database load by 60%+
- [ ] Cost reduction achieved (75%+)
- [ ] Quality scores maintained (≥4.7/5.0)
- [ ] Performance targets met (<5s end-to-end)
- [ ] Migration completed successfully
- [ ] Monitoring and alerts configured
- [ ] Documentation complete

---

## **RISK MITIGATION**

1. **Quality Degradation**
   - Extensive testing before rollout
   - Gradual migration with rollback
   - Quality monitoring

2. **Performance Issues**
   - Performance testing
   - Caching strategy
   - Database optimization

3. **Cost Overruns**
   - Cost tracking
   - Alerts
   - Optimization

4. **Data Loss**
   - Transaction safety
   - Validation at every stage
   - Backup strategy

---

**END OF IMPLEMENTATION PLAN**

This document provides the complete roadmap for implementing the multi-stage AI processing system. Follow each phase sequentially and verify success before proceeding to the next phase.

