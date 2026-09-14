-- Migration: CustomerQuery knowledge-gap inbox (docs/CUSTOMER_QUERIES.md)
-- Run this SQL directly against PostgreSQL (same manual-apply convention as
-- add_faq_table.sql). Embedding I/O is $queryRaw / $executeRaw only.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "CustomerQuery" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "relatedMessageIds" JSONB NOT NULL DEFAULT '[]',
    "productId" TEXT,
    "questionOriginal" VARCHAR(1000) NOT NULL,
    "questionEn" VARCHAR(1000) NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "vendorAnswerOriginal" VARCHAR(2000),
    "vendorAnswerEn" VARCHAR(2000),
    "faqId" TEXT,
    "dismissReason" TEXT,
    "embedding" vector(1536),
    "embeddingModel" VARCHAR(64),
    "answeredAt" TIMESTAMP(3),
    "answeredByVendorId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerQuery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CustomerQuery_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE,
    CONSTRAINT "CustomerQuery_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE,
    CONSTRAINT "CustomerQuery_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE,
    CONSTRAINT "CustomerQuery_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message"("id") ON DELETE SET NULL,
    CONSTRAINT "CustomerQuery_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "Faq"("id") ON DELETE SET NULL,
    CONSTRAINT "CustomerQuery_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "CustomerQuery_vendorId_status_lastSeenAt_idx"
  ON "CustomerQuery"("vendorId", "status", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "CustomerQuery_conversationId_status_idx"
  ON "CustomerQuery"("conversationId", "status");
CREATE INDEX IF NOT EXISTS "CustomerQuery_vendorId_status_idx"
  ON "CustomerQuery"("vendorId", "status");
