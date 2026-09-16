-- Variant-scoped catalog images (one image per variant SKU).
-- Manual apply, same convention as add_product_media_table.sql.

ALTER TABLE "ProductMedia"
  ADD COLUMN IF NOT EXISTS "variantSku" VARCHAR(80);

CREATE INDEX IF NOT EXISTS "ProductMedia_productId_variantSku_isActive_idx"
  ON "ProductMedia"("productId", "variantSku", "isActive");
