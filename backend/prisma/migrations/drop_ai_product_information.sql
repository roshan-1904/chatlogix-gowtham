-- Drop deprecated aiProductInformation column.
-- Product information now comes exclusively from the product catalog
-- (Product.description + Product.variants), not from a free-form vendor blob.

ALTER TABLE "Vendor" DROP COLUMN IF EXISTS "aiProductInformation";
