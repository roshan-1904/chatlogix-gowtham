-- Phase 0.5 prerequisites for Smart Catalog Import feature.
-- Adds:
--   1. Product.sku nullable column + sparse unique on (vendorId, sku)
--   2. Vendor.catalogImportEnabled feature flag
--   3. CatalogImportJob table with indexes and FK cascade on Vendor.
--
-- NOTE: NOT included here — the Vendor.aiProductInformation drop that appears in
-- `prisma migrate diff` output. That column drift is pre-existing (schema removed
-- the field without a migration) and is unrelated to this feature. Handle it in
-- its own migration.

-- 1. Product.sku
ALTER TABLE "Product" ADD COLUMN "sku" VARCHAR(64);

-- Sparse unique — Postgres treats NULLs as distinct, so rows without a sku do not collide.
CREATE UNIQUE INDEX "Product_vendorId_sku_key" ON "Product" ("vendorId", "sku");

-- 2. Vendor feature flag
ALTER TABLE "Vendor" ADD COLUMN "catalogImportEnabled" BOOLEAN NOT NULL DEFAULT false;

-- 3. CatalogImportJob
CREATE TABLE "CatalogImportJob" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputManifest" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "tokenUsage" JSONB,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogImportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogImportJob_idempotencyKey_key" ON "CatalogImportJob" ("idempotencyKey");
CREATE INDEX "CatalogImportJob_vendorId_status_idx" ON "CatalogImportJob" ("vendorId", "status");
CREATE INDEX "CatalogImportJob_createdAt_idx" ON "CatalogImportJob" ("createdAt");

ALTER TABLE "CatalogImportJob"
    ADD CONSTRAINT "CatalogImportJob_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
