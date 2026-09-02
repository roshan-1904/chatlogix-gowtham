# Multi-Stage AI Processing - Database Migration Guide

> **⚠️ Superseded pipeline, but tables may still be live.** This guide's tables (`ConversationMemory`, `CorrectionHistory`, `QualityMetrics`, `StageExecutionLog`) were built for the 14-stage `multiStageOrchestrator.ts` pipeline, which is no longer on the production hot path — it was replaced by `backend/src/conversation/*` (see **`docs/CONVERSATION_PROCESSOR_LAMBDA.md`** for the current design). `ConversationMemory`, `QualityMetrics`, and `StageExecutionLog` remain current Prisma models per the project's schema, so these tables may still exist in the database even though the write path described here (the old orchestrator) is not live for real customer traffic — `multiStageOrchestrator.ts`'s only remaining live caller is `catalogImportSandboxService.ts` (catalog import tooling). The migration/mechanics content below is preserved as historical/reference material.

## Overview

This guide provides SQL queries to create the database tables required for multi-stage AI processing.

## Tables to Create

1. **ConversationMemory** - Stores conversation context and memory (Stage 0.5)
2. **CorrectionHistory** - Tracks customer corrections (Stage 1.7)
3. **QualityMetrics** - Stores quality assessment scores (Stage 8.5)
4. **StageExecutionLog** - Logs stage execution for monitoring

## Migration Files

- **PostgreSQL:** `backend/prisma/migrations/multi_stage_ai_tables.sql`
- **MySQL:** `backend/prisma/migrations/multi_stage_ai_tables_mysql.sql`

---

## Option 1: Using Prisma Migrate (Recommended)

### Step 1: Update Prisma Schema

Add the models to `backend/prisma/schema.prisma`:

```prisma
// ============================================
// CONVERSATION MEMORY - Core for Stage 0.5
// ============================================
model ConversationMemory {
  id                String   @id @default(uuid())
  conversationId    String   @unique
  vendorId          String
  
  // Memory Content
  keyFacts          Json     @default("[]")
  ongoingTopics     Json     @default("[]")
  customerPreferences Json   @default("{}")
  lastOrderSummary  String?  @db.Text
  conversationSummary String @db.Text @default("")
  importantContext  Json     @default("[]")
  
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
  conversationId    String
  messageId         String
  vendorId          String
  
  naturalnessScore   Float
  completenessScore  Float
  continuityScore    Float
  overallScore       Float
  
  stagesExecuted     Json     @default("[]")
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

### Step 2: Update Existing Models

Add relations to existing models:

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

### Step 3: Generate Migration

```bash
cd backend
npx prisma migrate dev --name add_multi_stage_tables --create-only
```

### Step 4: Review and Apply

```bash
# Review the generated migration file
# Then apply it:
npx prisma migrate dev

# Generate Prisma client
npx prisma generate
```

---

## Option 2: Manual SQL Execution

### For PostgreSQL

```bash
# Connect to database
psql $DATABASE_URL

# Execute migration
\i backend/prisma/migrations/multi_stage_ai_tables.sql
```

Or directly:
```bash
psql $DATABASE_URL -f backend/prisma/migrations/multi_stage_ai_tables.sql
```

### For MySQL/MariaDB

```bash
# Connect to database
mysql -u user -p database_name

# Execute migration
source backend/prisma/migrations/multi_stage_ai_tables_mysql.sql
```

Or directly:
```bash
mysql -u user -p database_name < backend/prisma/migrations/multi_stage_ai_tables_mysql.sql
```

---

## Verification Queries

### Check Tables Exist

**PostgreSQL:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('ConversationMemory', 'CorrectionHistory', 'QualityMetrics', 'StageExecutionLog');
```

**MySQL:**
```sql
SHOW TABLES LIKE 'ConversationMemory';
SHOW TABLES LIKE 'CorrectionHistory';
SHOW TABLES LIKE 'QualityMetrics';
SHOW TABLES LIKE 'StageExecutionLog';
```

### Check Table Structure

**PostgreSQL:**
```sql
\d "ConversationMemory"
\d "CorrectionHistory"
\d "QualityMetrics"
\d "StageExecutionLog"
```

**MySQL:**
```sql
DESCRIBE ConversationMemory;
DESCRIBE CorrectionHistory;
DESCRIBE QualityMetrics;
DESCRIBE StageExecutionLog;
```

### Check Indexes

**PostgreSQL:**
```sql
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename IN ('ConversationMemory', 'CorrectionHistory', 'QualityMetrics', 'StageExecutionLog');
```

**MySQL:**
```sql
SHOW INDEXES FROM ConversationMemory;
SHOW INDEXES FROM CorrectionHistory;
SHOW INDEXES FROM QualityMetrics;
SHOW INDEXES FROM StageExecutionLog;
```

---

## Rollback (if needed)

### PostgreSQL

```sql
DROP TABLE IF EXISTS "StageExecutionLog" CASCADE;
DROP TABLE IF EXISTS "QualityMetrics" CASCADE;
DROP TABLE IF EXISTS "CorrectionHistory" CASCADE;
DROP TABLE IF EXISTS "ConversationMemory" CASCADE;
ALTER TABLE "Message" DROP COLUMN IF EXISTS "normalizedContent";
ALTER TABLE "Message" DROP COLUMN IF EXISTS "normalizationMetadata";
```

### MySQL

```sql
DROP TABLE IF EXISTS `StageExecutionLog`;
DROP TABLE IF EXISTS `QualityMetrics`;
DROP TABLE IF EXISTS `CorrectionHistory`;
DROP TABLE IF EXISTS `ConversationMemory`;
ALTER TABLE `Message` DROP COLUMN `normalizedContent`;
ALTER TABLE `Message` DROP COLUMN `normalizationMetadata`;
```

---

## Data Backfill (Optional)

For existing conversations, you may want to create initial memory records:

```sql
-- PostgreSQL
INSERT INTO "ConversationMemory" (
    "id", 
    "conversationId", 
    "vendorId", 
    "keyFacts", 
    "ongoingTopics", 
    "customerPreferences", 
    "conversationSummary", 
    "importantContext", 
    "turnNumber", 
    "conversationStage"
)
SELECT 
    gen_random_uuid(),
    c."id",
    c."vendorId",
    '[]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb,
    'Initialized from existing conversation',
    '[]'::jsonb,
    0,
    'greeting'
FROM "Conversation" c
WHERE NOT EXISTS (
    SELECT 1 FROM "ConversationMemory" cm 
    WHERE cm."conversationId" = c."id"
);
```

---

## Table Descriptions

### ConversationMemory
- **Purpose:** Stores conversation context, key facts, and memory
- **Used by:** Stage 0.5 (Conversation Memory Retrieval)
- **Key Fields:**
  - `keyFacts` - Important facts about customer
  - `ongoingTopics` - Current conversation topics
  - `customerPreferences` - Customer preferences
  - `conversationStage` - Current stage of conversation

### CorrectionHistory
- **Purpose:** Tracks when customers correct AI understanding
- **Used by:** Stage 1.7 (Correction Detection)
- **Key Fields:**
  - `correctedField` - What was corrected
  - `originalValue` - What AI understood
  - `correctedValue` - What customer actually meant

### QualityMetrics
- **Purpose:** Stores quality assessment scores
- **Used by:** Stage 8.5 (Quality Assessment)
- **Key Fields:**
  - `naturalnessScore` - How natural the response was (0-5)
  - `completenessScore` - Information completeness (0-1)
  - `continuityScore` - Conversation continuity (0-1)
  - `overallScore` - Overall quality score (0-5)

### StageExecutionLog
- **Purpose:** Logs every stage execution for monitoring
- **Used by:** All stages (for observability)
- **Key Fields:**
  - `stageName` - Which stage (e.g., "stage_0", "stage_1")
  - `success` - Did stage succeed?
  - `duration` - How long it took (ms)
  - `tokensUsed` - Tokens consumed
  - `cost` - Cost in USD

---

## Next Steps

After running migrations:

1. ✅ Verify tables exist
2. ✅ Test Prisma client generation
3. ✅ Run worker and check logs
4. ✅ Monitor StageExecutionLog table for entries
5. ✅ Check ConversationMemory is being created

---

## Troubleshooting

### Error: "relation already exists"
- Tables may already exist
- Check if migration was already run
- Use `IF NOT EXISTS` in SQL (already included)

### Error: "foreign key constraint fails"
- Ensure `Conversation` and `Vendor` tables exist
- Check foreign key references are correct

### Error: "column already exists" (Message table)
- Columns may already be added
- Check existing schema first

---

**Migration Status:** Ready to execute  
**Database Support:** PostgreSQL and MySQL  
**Rollback:** Supported (see rollback queries above)

