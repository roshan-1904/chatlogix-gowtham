-- Migration: Add system prompt sections
-- Split aiSystemPrompt into multiple sections for better organization

ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "aiProductInformation" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "aiDeliveryInstructions" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "aiPickupDeliveryAddress" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "aiToneExample" TEXT;

