-- Add USD cost tracking fields to Message table
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiCostUsd" DOUBLE PRECISION DEFAULT 0;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiPromptTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiCompletionTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiPrimaryModel" TEXT;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiModelBreakdown" JSONB;
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "aiCostEstimated" BOOLEAN NOT NULL DEFAULT false;

-- Add model and token breakdown fields to StageExecutionLog table
ALTER TABLE "StageExecutionLog" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "StageExecutionLog" ADD COLUMN IF NOT EXISTS "promptTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StageExecutionLog" ADD COLUMN IF NOT EXISTS "completionTokens" INTEGER NOT NULL DEFAULT 0;
