-- Migration: Conversation Processor v1 schema additions
-- Run this SQL directly against your PostgreSQL database (see documentation/modules/features/multi-stage-ai/DATABASE_MIGRATION_MULTI_STAGE.md
-- for why this repo applies migrations manually rather than via `prisma migrate dev`).
-- Supports docs/CONVERSATION_PROCESSOR_LAMBDA.md v1.1 §24.

-- Step 1: Create FulfillmentType enum
-- If this fails with "already exists", that's okay - just continue
CREATE TYPE "FulfillmentType" AS ENUM ('stock', 'made_to_order');

-- Step 2: Create MessageProcessingStatus enum
-- If this fails with "already exists", that's okay - just continue
CREATE TYPE "MessageProcessingStatus" AS ENUM ('received', 'locked', 'llm1', 'applied', 'verified', 'queued', 'failed');

-- Step 3: Product.fulfillmentType (Q14 — stock vs made-to-order availability)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "fulfillmentType" "FulfillmentType" NOT NULL DEFAULT 'made_to_order';

-- Step 4: CreditUsage.externalId (Q8 — idempotent debit, keyed on whatsappMessageId)
ALTER TABLE "CreditUsage" ADD COLUMN IF NOT EXISTS "externalId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CreditUsage_externalId_key" ON "CreditUsage"("externalId");

-- Step 5: MessageProcessing table (per-attempt pipeline state; drives the §19.1 debit reconciliation sweep)
CREATE TABLE IF NOT EXISTS "MessageProcessing" (
    "id" TEXT NOT NULL,
    "whatsappMessageId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "status" "MessageProcessingStatus" NOT NULL DEFAULT 'received',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "errorClass" TEXT,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "queuedAt" TIMESTAMP(3),
    "debitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageProcessing_pkey" PRIMARY KEY ("id")
);

-- Step 6: Add foreign key constraints
-- Run these one at a time. If a constraint already exists, skip that statement.
ALTER TABLE "MessageProcessing"
ADD CONSTRAINT "MessageProcessing_vendorId_fkey"
FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageProcessing"
ADD CONSTRAINT "MessageProcessing_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 7: Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS "MessageProcessing_whatsappMessageId_key"
ON "MessageProcessing"("whatsappMessageId");

CREATE INDEX IF NOT EXISTS "idx_messageprocessing_status_queued"
ON "MessageProcessing"("status", "queuedAt");

CREATE INDEX IF NOT EXISTS "idx_messageprocessing_debit_sweep"
ON "MessageProcessing"("status", "debitedAt", "queuedAt");
