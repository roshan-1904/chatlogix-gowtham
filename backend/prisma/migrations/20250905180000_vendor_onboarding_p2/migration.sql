-- Vendor onboarding P2: trial wallet, onboarding progress, unique phone

ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "trialGrantedPaise" INTEGER;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "trialExpiresAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "onboardingStep" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "onboardingData" JSONB;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

ALTER TABLE "Vendor" ALTER COLUMN "registrationStatus" SET DEFAULT 'onboarding';

UPDATE "Vendor"
SET "registrationStatus" = 'approved'
WHERE "registrationStatus" IS NULL OR "registrationStatus" = '';

ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "Vendor_phone_key" ON "Vendor"("phone");
