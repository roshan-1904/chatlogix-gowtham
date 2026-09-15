-- Migration: ProductMedia catalog assets (docs/PRODUCT_MEDIA.md PM4 / §8–§9)
-- Run this SQL directly against PostgreSQL (same manual-apply convention as
-- add_customer_query_table.sql). Graph cache columns are stored now for v1.1
-- even though outbound send still uses S3 link (PM11).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductMediaKind') THEN
        CREATE TYPE "ProductMediaKind" AS ENUM ('image', 'video');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ProductMedia" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "ProductMediaKind" NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mimeType" VARCHAR(127) NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "label" VARCHAR(120),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "whatsappMediaId" VARCHAR(255),
    "whatsappMediaIdExpiresAt" TIMESTAMP(3),
    "uploadedForPhoneNumberId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductMedia_s3Key_key" UNIQUE ("s3Key"),
    CONSTRAINT "ProductMedia_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE,
    CONSTRAINT "ProductMedia_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProductMedia_productId_isActive_sortOrder_idx"
  ON "ProductMedia"("productId", "isActive", "sortOrder");
CREATE INDEX IF NOT EXISTS "ProductMedia_vendorId_idx"
  ON "ProductMedia"("vendorId");

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "productMediaId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Message_productMediaId_fkey'
  ) THEN
    ALTER TABLE "Message"
      ADD CONSTRAINT "Message_productMediaId_fkey"
      FOREIGN KEY ("productMediaId") REFERENCES "ProductMedia"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Message_productMediaId_idx"
  ON "Message"("productMediaId");
