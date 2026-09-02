# Multi-Stage AI - Database Queries Quick Reference

> **Note:** This is a historical manual-migration reference from when the `ConversationMemory`/`CorrectionHistory`/`QualityMetrics`/`StageExecutionLog` tables were first added for the old multi-stage AI pipeline. Those tables still exist in `backend/prisma/schema.prisma` today (the old pipeline itself is retired from the hot path — see `docs/CONVERSATION_WORKER_GAPS.md`), but the current, normal way to change schema is a Prisma migration (`npm run prisma:migrate` from `backend/`), not hand-run SQL like below. Keep this only as a reference for what these tables' raw SQL looks like.

## 🚀 Quick Start

### PostgreSQL (Copy & Paste)

```sql
-- 1. ConversationMemory Table
CREATE TABLE IF NOT EXISTS "ConversationMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL UNIQUE,
    "vendorId" TEXT NOT NULL,
    "keyFacts" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "ongoingTopics" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "customerPreferences" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "lastOrderSummary" TEXT,
    "conversationSummary" TEXT NOT NULL DEFAULT '',
    "importantContext" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "turnNumber" INTEGER NOT NULL DEFAULT 0,
    "conversationStage" TEXT NOT NULL DEFAULT 'greeting',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationMemory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    CONSTRAINT "ConversationMemory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ConversationMemory_vendorId_idx" ON "ConversationMemory"("vendorId");
CREATE INDEX IF NOT EXISTS "ConversationMemory_conversationId_idx" ON "ConversationMemory"("conversationId");
CREATE INDEX IF NOT EXISTS "ConversationMemory_lastUpdated_idx" ON "ConversationMemory"("lastUpdated");

-- 2. CorrectionHistory Table
CREATE TABLE IF NOT EXISTS "CorrectionHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "correctedField" TEXT NOT NULL,
    "originalValue" TEXT NOT NULL,
    "correctedValue" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "previousMessages" JSONB,
    "correctionPattern" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CorrectionHistory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    CONSTRAINT "CorrectionHistory_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "CorrectionHistory_conversationId_idx" ON "CorrectionHistory"("conversationId");
CREATE INDEX IF NOT EXISTS "CorrectionHistory_vendorId_idx" ON "CorrectionHistory"("vendorId");
CREATE INDEX IF NOT EXISTS "CorrectionHistory_createdAt_idx" ON "CorrectionHistory"("createdAt");

-- 3. QualityMetrics Table
CREATE TABLE IF NOT EXISTS "QualityMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "naturalnessScore" DOUBLE PRECISION NOT NULL,
    "completenessScore" DOUBLE PRECISION NOT NULL,
    "continuityScore" DOUBLE PRECISION NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "stagesExecuted" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "totalTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDuration" INTEGER NOT NULL,
    "issues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QualityMetrics_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    CONSTRAINT "QualityMetrics_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "QualityMetrics_conversationId_idx" ON "QualityMetrics"("conversationId");
CREATE INDEX IF NOT EXISTS "QualityMetrics_vendorId_idx" ON "QualityMetrics"("vendorId");
CREATE INDEX IF NOT EXISTS "QualityMetrics_createdAt_idx" ON "QualityMetrics"("createdAt");
CREATE INDEX IF NOT EXISTS "QualityMetrics_overallScore_idx" ON "QualityMetrics"("overallScore");

-- 4. StageExecutionLog Table
CREATE TABLE IF NOT EXISTS "StageExecutionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "stageType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "duration" INTEGER NOT NULL,
    "tokensUsed" INTEGER DEFAULT 0,
    "cost" DOUBLE PRECISION DEFAULT 0,
    "errorType" TEXT,
    "errorMessage" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "inputSize" INTEGER,
    "outputSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageExecutionLog_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    CONSTRAINT "StageExecutionLog_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "StageExecutionLog_conversationId_idx" ON "StageExecutionLog"("conversationId");
CREATE INDEX IF NOT EXISTS "StageExecutionLog_vendorId_idx" ON "StageExecutionLog"("vendorId");
CREATE INDEX IF NOT EXISTS "StageExecutionLog_stageName_idx" ON "StageExecutionLog"("stageName");
CREATE INDEX IF NOT EXISTS "StageExecutionLog_createdAt_idx" ON "StageExecutionLog"("createdAt");
CREATE INDEX IF NOT EXISTS "StageExecutionLog_success_idx" ON "StageExecutionLog"("success");

-- 5. Update Message Table
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "normalizedContent" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "normalizationMetadata" JSONB;
```

### MySQL/MariaDB (Copy & Paste)

```sql
-- 1. ConversationMemory Table
CREATE TABLE IF NOT EXISTS `ConversationMemory` (
    `id` VARCHAR(191) NOT NULL PRIMARY KEY,
    `conversationId` VARCHAR(191) NOT NULL UNIQUE,
    `vendorId` VARCHAR(191) NOT NULL,
    `keyFacts` JSON NOT NULL,
    `ongoingTopics` JSON NOT NULL,
    `customerPreferences` JSON NOT NULL,
    `lastOrderSummary` TEXT,
    `conversationSummary` TEXT NOT NULL DEFAULT '',
    `importantContext` JSON NOT NULL,
    `turnNumber` INT NOT NULL DEFAULT 0,
    `conversationStage` VARCHAR(191) NOT NULL DEFAULT 'greeting',
    `lastUpdated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT `ConversationMemory_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE,
    CONSTRAINT `ConversationMemory_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE INDEX `ConversationMemory_vendorId_idx` ON `ConversationMemory`(`vendorId`);
CREATE INDEX `ConversationMemory_conversationId_idx` ON `ConversationMemory`(`conversationId`);
CREATE INDEX `ConversationMemory_lastUpdated_idx` ON `ConversationMemory`(`lastUpdated`);

-- 2. CorrectionHistory Table
CREATE TABLE IF NOT EXISTS `CorrectionHistory` (
    `id` VARCHAR(191) NOT NULL PRIMARY KEY,
    `conversationId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `correctedField` VARCHAR(191) NOT NULL,
    `originalValue` TEXT NOT NULL,
    `correctedValue` TEXT NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `previousMessages` JSON,
    `correctionPattern` VARCHAR(191),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT `CorrectionHistory_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE,
    CONSTRAINT `CorrectionHistory_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE INDEX `CorrectionHistory_conversationId_idx` ON `CorrectionHistory`(`conversationId`);
CREATE INDEX `CorrectionHistory_vendorId_idx` ON `CorrectionHistory`(`vendorId`);
CREATE INDEX `CorrectionHistory_createdAt_idx` ON `CorrectionHistory`(`createdAt`);

-- 3. QualityMetrics Table
CREATE TABLE IF NOT EXISTS `QualityMetrics` (
    `id` VARCHAR(191) NOT NULL PRIMARY KEY,
    `conversationId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `naturalnessScore` DOUBLE NOT NULL,
    `completenessScore` DOUBLE NOT NULL,
    `continuityScore` DOUBLE NOT NULL,
    `overallScore` DOUBLE NOT NULL,
    `stagesExecuted` JSON NOT NULL,
    `totalTokensUsed` INT NOT NULL DEFAULT 0,
    `totalCost` DOUBLE NOT NULL DEFAULT 0,
    `totalDuration` INT NOT NULL,
    `issues` JSON,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT `QualityMetrics_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE,
    CONSTRAINT `QualityMetrics_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE INDEX `QualityMetrics_conversationId_idx` ON `QualityMetrics`(`conversationId`);
CREATE INDEX `QualityMetrics_vendorId_idx` ON `QualityMetrics`(`vendorId`);
CREATE INDEX `QualityMetrics_createdAt_idx` ON `QualityMetrics`(`createdAt`);
CREATE INDEX `QualityMetrics_overallScore_idx` ON `QualityMetrics`(`overallScore`);

-- 4. StageExecutionLog Table
CREATE TABLE IF NOT EXISTS `StageExecutionLog` (
    `id` VARCHAR(191) NOT NULL PRIMARY KEY,
    `conversationId` VARCHAR(191) NOT NULL,
    `messageId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `stageName` VARCHAR(191) NOT NULL,
    `stageType` VARCHAR(191) NOT NULL,
    `success` BOOLEAN NOT NULL,
    `duration` INT NOT NULL,
    `tokensUsed` INT DEFAULT 0,
    `cost` DOUBLE DEFAULT 0,
    `errorType` VARCHAR(191),
    `errorMessage` TEXT,
    `fallbackUsed` BOOLEAN NOT NULL DEFAULT false,
    `inputSize` INT,
    `outputSize` INT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT `StageExecutionLog_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE,
    CONSTRAINT `StageExecutionLog_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE INDEX `StageExecutionLog_conversationId_idx` ON `StageExecutionLog`(`conversationId`);
CREATE INDEX `StageExecutionLog_vendorId_idx` ON `StageExecutionLog`(`vendorId`);
CREATE INDEX `StageExecutionLog_stageName_idx` ON `StageExecutionLog`(`stageName`);
CREATE INDEX `StageExecutionLog_createdAt_idx` ON `StageExecutionLog`(`createdAt`);
CREATE INDEX `StageExecutionLog_success_idx` ON `StageExecutionLog`(`success`);

-- 5. Update Message Table
ALTER TABLE `Message` ADD COLUMN IF NOT EXISTS `normalizedContent` TEXT;
ALTER TABLE `Message` ADD COLUMN IF NOT EXISTS `normalizationMetadata` JSON;
```

## 📋 Verification

```sql
-- Check all tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('ConversationMemory', 'CorrectionHistory', 'QualityMetrics', 'StageExecutionLog');

-- Count records (should be 0 initially)
SELECT 'ConversationMemory' as table_name, COUNT(*) as count FROM "ConversationMemory"
UNION ALL
SELECT 'CorrectionHistory', COUNT(*) FROM "CorrectionHistory"
UNION ALL
SELECT 'QualityMetrics', COUNT(*) FROM "QualityMetrics"
UNION ALL
SELECT 'StageExecutionLog', COUNT(*) FROM "StageExecutionLog";
```

## 🔄 Rollback

```sql
-- PostgreSQL
DROP TABLE IF EXISTS "StageExecutionLog" CASCADE;
DROP TABLE IF EXISTS "QualityMetrics" CASCADE;
DROP TABLE IF EXISTS "CorrectionHistory" CASCADE;
DROP TABLE IF EXISTS "ConversationMemory" CASCADE;
ALTER TABLE "Message" DROP COLUMN IF EXISTS "normalizedContent";
ALTER TABLE "Message" DROP COLUMN IF EXISTS "normalizationMetadata";

-- MySQL
DROP TABLE IF EXISTS `StageExecutionLog`;
DROP TABLE IF EXISTS `QualityMetrics`;
DROP TABLE IF EXISTS `CorrectionHistory`;
DROP TABLE IF EXISTS `ConversationMemory`;
ALTER TABLE `Message` DROP COLUMN `normalizedContent`;
ALTER TABLE `Message` DROP COLUMN `normalizationMetadata`;
```

## 📝 Notes

- All tables use `CASCADE` delete - deleting a conversation/vendor will delete related records
- Indexes are created for performance on frequently queried columns
- JSON/JSONB fields store flexible data structures
- UUIDs are used for primary keys (generated by application)

