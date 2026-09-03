-- Migration: FAQ table with pgvector embeddings (per-vendor scoped)
-- Run this SQL directly against your PostgreSQL database (see
-- documentation/modules/features/multi-stage-ai/DATABASE_MIGRATION_MULTI_STAGE.md
-- for why this repo applies migrations manually rather than via `prisma migrate dev`).
--
-- No ivfflat/hnsw index: expected scale is tens-to-low-hundreds of active
-- FAQs per vendor, where a plain scan behind the (vendorId, isActive) btree
-- index below is already sub-millisecond. An ANN index is also a poor fit
-- here specifically because every query filters by vendorId first — pgvector's
-- ivfflat/hnsw indexes are global across the table, so a per-vendor top-K
-- would need per-vendor partial indexes to actually help. Revisit only if a
-- single vendor's active-FAQ count reaches the thousands.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "Faq" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "vendorId" TEXT NOT NULL,
    "question" VARCHAR(300) NOT NULL,
    "answer" VARCHAR(1500) NOT NULL,
    "embedding" vector(1536),
    "embeddingModel" VARCHAR(64),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Faq_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_faq_vendor ON "Faq"("vendorId");
CREATE INDEX IF NOT EXISTS idx_faq_vendor_active ON "Faq"("vendorId", "isActive");
