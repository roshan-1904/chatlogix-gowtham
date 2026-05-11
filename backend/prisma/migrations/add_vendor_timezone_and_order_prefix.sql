-- Migration: Add timezone and orderPrefix fields to Vendor table
-- Date: December 2024
-- Description: Adds timezone (default India) and customizable order prefix for order ID generation

-- Add timezone field with default value for India
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(191) NOT NULL DEFAULT 'Asia/Kolkata';

-- Add orderPrefix field (nullable, 5-letter customizable prefix)
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "orderPrefix" VARCHAR(191);

-- Add comments for documentation
COMMENT ON COLUMN "Vendor"."timezone" IS 'Vendor timezone for time-based greetings. Default: Asia/Kolkata (India)';
COMMENT ON COLUMN "Vendor"."orderPrefix" IS '5-letter customizable prefix for order IDs. Example: "VENDI", "BAKER". If NULL, default "ORDER" will be used in code.';

-- Update existing vendors to have India timezone (if any don't have it set)
UPDATE "Vendor" SET "timezone" = 'Asia/Kolkata' WHERE "timezone" IS NULL OR "timezone" = '';
