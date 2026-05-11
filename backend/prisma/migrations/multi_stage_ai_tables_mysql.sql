-- ============================================
-- Multi-Stage AI Processing - Database Migration (MySQL)
-- ============================================
-- 
-- This migration creates tables required for multi-stage AI processing for MySQL/MariaDB
-- ============================================

-- ============================================
-- 1. CONVERSATION MEMORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS `ConversationMemory` (
    `id` VARCHAR(191) NOT NULL PRIMARY KEY,
    `conversationId` VARCHAR(191) NOT NULL UNIQUE,
    `vendorId` VARCHAR(191) NOT NULL,
    
    -- Memory Content
    `keyFacts` JSON NOT NULL,
    `ongoingTopics` JSON NOT NULL,
    `customerPreferences` JSON NOT NULL,
    `lastOrderSummary` TEXT,
    `conversationSummary` TEXT NOT NULL DEFAULT '',
    `importantContext` JSON NOT NULL,
    
    -- Conversation State
    `turnNumber` INT NOT NULL DEFAULT 0,
    `conversationStage` VARCHAR(191) NOT NULL DEFAULT 'greeting',
    
    -- Metadata
    `lastUpdated` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    
    -- Foreign Keys
    CONSTRAINT `ConversationMemory_conversationId_fkey` 
        FOREIGN KEY (`conversationId`) 
        REFERENCES `Conversation`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT `ConversationMemory_vendorId_fkey` 
        FOREIGN KEY (`vendorId`) 
        REFERENCES `Vendor`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Indexes for ConversationMemory
CREATE INDEX `ConversationMemory_vendorId_idx` ON `ConversationMemory`(`vendorId`);
CREATE INDEX `ConversationMemory_conversationId_idx` ON `ConversationMemory`(`conversationId`);
CREATE INDEX `ConversationMemory_lastUpdated_idx` ON `ConversationMemory`(`lastUpdated`);

-- ============================================
-- 2. CORRECTION HISTORY TABLE
-- ============================================
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
    
    -- Foreign Keys
    CONSTRAINT `CorrectionHistory_conversationId_fkey` 
        FOREIGN KEY (`conversationId`) 
        REFERENCES `Conversation`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT `CorrectionHistory_vendorId_fkey` 
        FOREIGN KEY (`vendorId`) 
        REFERENCES `Vendor`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Indexes for CorrectionHistory
CREATE INDEX `CorrectionHistory_conversationId_idx` ON `CorrectionHistory`(`conversationId`);
CREATE INDEX `CorrectionHistory_vendorId_idx` ON `CorrectionHistory`(`vendorId`);
CREATE INDEX `CorrectionHistory_createdAt_idx` ON `CorrectionHistory`(`createdAt`);

-- ============================================
-- 3. QUALITY METRICS TABLE
-- ============================================
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
    
    -- Foreign Keys
    CONSTRAINT `QualityMetrics_conversationId_fkey` 
        FOREIGN KEY (`conversationId`) 
        REFERENCES `Conversation`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT `QualityMetrics_vendorId_fkey` 
        FOREIGN KEY (`vendorId`) 
        REFERENCES `Vendor`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Indexes for QualityMetrics
CREATE INDEX `QualityMetrics_conversationId_idx` ON `QualityMetrics`(`conversationId`);
CREATE INDEX `QualityMetrics_vendorId_idx` ON `QualityMetrics`(`vendorId`);
CREATE INDEX `QualityMetrics_createdAt_idx` ON `QualityMetrics`(`createdAt`);
CREATE INDEX `QualityMetrics_overallScore_idx` ON `QualityMetrics`(`overallScore`);

-- ============================================
-- 4. STAGE EXECUTION LOG TABLE
-- ============================================
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
    
    -- Foreign Keys
    CONSTRAINT `StageExecutionLog_conversationId_fkey` 
        FOREIGN KEY (`conversationId`) 
        REFERENCES `Conversation`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT `StageExecutionLog_vendorId_fkey` 
        FOREIGN KEY (`vendorId`) 
        REFERENCES `Vendor`(`id`) 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Indexes for StageExecutionLog
CREATE INDEX `StageExecutionLog_conversationId_idx` ON `StageExecutionLog`(`conversationId`);
CREATE INDEX `StageExecutionLog_vendorId_idx` ON `StageExecutionLog`(`vendorId`);
CREATE INDEX `StageExecutionLog_stageName_idx` ON `StageExecutionLog`(`stageName`);
CREATE INDEX `StageExecutionLog_createdAt_idx` ON `StageExecutionLog`(`createdAt`);
CREATE INDEX `StageExecutionLog_success_idx` ON `StageExecutionLog`(`success`);

-- ============================================
-- 5. UPDATE MESSAGE TABLE
-- ============================================
ALTER TABLE `Message` 
ADD COLUMN IF NOT EXISTS `normalizedContent` TEXT,
ADD COLUMN IF NOT EXISTS `normalizationMetadata` JSON;

