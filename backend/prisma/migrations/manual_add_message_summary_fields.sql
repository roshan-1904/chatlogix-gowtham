-- Manual Migration: Add Message Summary Fields
-- Run this SQL manually if Prisma migrate fails due to shadow database permissions
-- Date: December 2025

-- Step 1: Add new columns to Message table
ALTER TABLE "Message"
ADD COLUMN IF NOT EXISTS "messageSummary" TEXT,
ADD COLUMN IF NOT EXISTS "expectedNextAction" TEXT,
ADD COLUMN IF NOT EXISTS "summaryMetadata" JSONB;

-- Step 2: Create composite index for efficient summary retrieval
CREATE INDEX IF NOT EXISTS "Message_conversationId_timestamp_idx" 
ON "Message"("conversationId", "timestamp");

-- Step 3: Verify the changes
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'Message' 
-- AND column_name IN ('messageSummary', 'expectedNextAction', 'summaryMetadata');

-- Step 4: Verify the index
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'Message' 
-- AND indexname = 'Message_conversationId_timestamp_idx';

