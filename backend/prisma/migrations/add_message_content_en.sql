-- Migration: Add Message.contentEn
-- Date: 2026-09-04
-- Description: Nullable English/Latin display copy for the vendor portal.
-- Original WhatsApp / Whisper / bot text stays in content.
-- Do not reuse normalizedContent (legacy unused cleanup field).
-- Apply directly against PostgreSQL (this repo does not use `prisma migrate dev`).

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "contentEn" TEXT;

COMMENT ON COLUMN "Message"."contentEn" IS 'Vendor-portal English/Latin display text. Original customer or bot language stays in content.';
