-- Migration: Add matchingConfig field to Vendor table
-- Date: December 2024
-- Description: Adds vendor-specific product matching configuration as JSON field

-- Add matchingConfig JSON field to Vendor table
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "matchingConfig" JSONB;

-- Add comment for documentation
COMMENT ON COLUMN "Vendor"."matchingConfig" IS 'Vendor-specific product matching configuration. Example: {"threshold": 0.7, "enableFuzzy": true, "enableAIMatching": true, "productNameField": "name", "productKeywordsField": "keywords", "productPriceField": "basePrice", "supportedLanguages": ["en", "hi", "ta", "te"]}';

-- Note: No default value needed - NULL means use global environment variables
