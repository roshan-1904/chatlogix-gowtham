-- ============================================
-- Multi-Stage AI Processing - Database Migration
-- ============================================
-- 
-- This migration creates tables required for multi-stage AI processing:
-- 1. ConversationMemory - Stores conversation context and memory
-- 2. CorrectionHistory - Tracks customer corrections
-- 3. QualityMetrics - Stores quality assessment scores
-- 4. StageExecutionLog - Logs stage execution for monitoring
--
-- Also updates Message table to support normalization metadata
--
-- Reference: Phase 1 of Multi-Stage AI Implementation Plan
-- ============================================

-- ============================================
-- 1. CONVERSATION MEMORY TABLE
-- ============================================
-- Stores conversation context, key facts, and memory for Stage 0.5
CREATE TABLE IF NOT EXISTS "ConversationMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL UNIQUE,
    "vendorId" TEXT NOT NULL,
    
    -- Memory Content
    "keyFacts" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "ongoingTopics" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "customerPreferences" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "lastOrderSummary" TEXT,
    "conversationSummary" TEXT NOT NULL DEFAULT '',
    "importantContext" JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Conversation State
    "turnNumber" INTEGER NOT NULL DEFAULT 0,
    "conversationStage" TEXT NOT NULL DEFAULT 'greeting',
    
    -- Metadata
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Keys
    CONSTRAINT "ConversationMemory_conversationId_fkey" 
        FOREIGN KEY ("conversationId") 
        REFERENCES "Conversation"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT "ConversationMemory_vendorId_fkey" 
        FOREIGN KEY ("vendorId") 
        REFERENCES "Vendor"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

-- Indexes for ConversationMemory
CREATE INDEX IF NOT EXISTS "ConversationMemory_vendorId_idx" ON "ConversationMemory"("vendorId");
CREATE INDEX IF NOT EXISTS "ConversationMemory_conversationId_idx" ON "ConversationMemory"("conversationId");
CREATE INDEX IF NOT EXISTS "ConversationMemory_lastUpdated_idx" ON "ConversationMemory"("lastUpdated");

-- ============================================
-- 2. CORRECTION HISTORY TABLE
-- ============================================
-- Tracks customer corrections for Stage 1.7 (Correction Detection)
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
    
    -- Foreign Keys
    CONSTRAINT "CorrectionHistory_conversationId_fkey" 
        FOREIGN KEY ("conversationId") 
        REFERENCES "Conversation"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT "CorrectionHistory_vendorId_fkey" 
        FOREIGN KEY ("vendorId") 
        REFERENCES "Vendor"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

-- Indexes for CorrectionHistory
CREATE INDEX IF NOT EXISTS "CorrectionHistory_conversationId_idx" ON "CorrectionHistory"("conversationId");
CREATE INDEX IF NOT EXISTS "CorrectionHistory_vendorId_idx" ON "CorrectionHistory"("vendorId");
CREATE INDEX IF NOT EXISTS "CorrectionHistory_createdAt_idx" ON "CorrectionHistory"("createdAt");

-- ============================================
-- 3. QUALITY METRICS TABLE
-- ============================================
-- Stores quality assessment scores for Stage 8.5
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
    
    -- Foreign Keys
    CONSTRAINT "QualityMetrics_conversationId_fkey" 
        FOREIGN KEY ("conversationId") 
        REFERENCES "Conversation"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT "QualityMetrics_vendorId_fkey" 
        FOREIGN KEY ("vendorId") 
        REFERENCES "Vendor"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

-- Indexes for QualityMetrics
CREATE INDEX IF NOT EXISTS "QualityMetrics_conversationId_idx" ON "QualityMetrics"("conversationId");
CREATE INDEX IF NOT EXISTS "QualityMetrics_vendorId_idx" ON "QualityMetrics"("vendorId");
CREATE INDEX IF NOT EXISTS "QualityMetrics_createdAt_idx" ON "QualityMetrics"("createdAt");
CREATE INDEX IF NOT EXISTS "QualityMetrics_overallScore_idx" ON "QualityMetrics"("overallScore");

-- ============================================
-- 4. STAGE EXECUTION LOG TABLE
-- ============================================
-- Logs stage execution for monitoring and debugging
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
    
    -- Foreign Keys
    CONSTRAINT "StageExecutionLog_conversationId_fkey" 
        FOREIGN KEY ("conversationId") 
        REFERENCES "Conversation"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE,
    CONSTRAINT "StageExecutionLog_vendorId_fkey" 
        FOREIGN KEY ("vendorId") 
        REFERENCES "Vendor"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE
);

-- Indexes for StageExecutionLog
CREATE INDEX IF NOT EXISTS "StageExecutionLog_conversationId_idx" ON "StageExecutionLog"("conversationId");
CREATE INDEX IF NOT EXISTS "StageExecutionLog_vendorId_idx" ON "StageExecutionLog"("vendorId");
CREATE INDEX IF NOT EXISTS "StageExecutionLog_stageName_idx" ON "StageExecutionLog"("stageName");
CREATE INDEX IF NOT EXISTS "StageExecutionLog_createdAt_idx" ON "StageExecutionLog"("createdAt");
CREATE INDEX IF NOT EXISTS "StageExecutionLog_success_idx" ON "StageExecutionLog"("success");

-- ============================================
-- 5. UPDATE MESSAGE TABLE
-- ============================================
-- Add fields for message normalization (Stage 0)
ALTER TABLE "Message" 
ADD COLUMN IF NOT EXISTS "normalizedContent" TEXT,
ADD COLUMN IF NOT EXISTS "normalizationMetadata" JSONB;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify tables were created:

-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('ConversationMemory', 'CorrectionHistory', 'QualityMetrics', 'StageExecutionLog');

-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'ConversationMemory';

-- ============================================
-- ROLLBACK QUERIES (if needed)
-- ============================================
-- DROP TABLE IF EXISTS "StageExecutionLog";
-- DROP TABLE IF EXISTS "QualityMetrics";
-- DROP TABLE IF EXISTS "CorrectionHistory";
-- DROP TABLE IF EXISTS "ConversationMemory";
-- ALTER TABLE "Message" DROP COLUMN IF EXISTS "normalizedContent";
-- ALTER TABLE "Message" DROP COLUMN IF EXISTS "normalizationMetadata";

