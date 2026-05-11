-- Migration: Add order delivery and preparation settings
-- Date: 2025-01-28
-- Description: Adds vendor category, preferred delivery date setting, and flexible preparation time config

-- Add category field
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "category" VARCHAR(50);

-- Add askForPreferredDeliveryDate field
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "askForPreferredDeliveryDate" BOOLEAN NOT NULL DEFAULT false;

-- Add orderPreparationConfig JSON field
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "orderPreparationConfig" JSONB;

-- Add comments for documentation
COMMENT ON COLUMN "Vendor"."category" IS 'Vendor business category: food, retail, service, etc.';
COMMENT ON COLUMN "Vendor"."askForPreferredDeliveryDate" IS 'If true, AI will ask customers for preferred delivery date during order placement';
COMMENT ON COLUMN "Vendor"."orderPreparationConfig" IS 'Order preparation time configuration. Example: {"type": "fixed_minutes", "fixedMinutes": 30, "message": "Usually ready in 30-45 mins"}';

