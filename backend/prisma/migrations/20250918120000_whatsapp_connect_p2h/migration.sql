-- P2h-a: WhatsApp connect state on WhatsAppNumber (nullable for legacy rows)
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "accessTokenEncrypted" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "tokenExpiresAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "connectStatus" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "connectPath" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "displayPhone" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "primaryFundingId" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "lastErrorCode" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "lastErrorMessage" TEXT;
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "liveAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppNumber" ADD COLUMN IF NOT EXISTS "metaBusinessId" TEXT;

CREATE INDEX IF NOT EXISTS "WhatsAppNumber_vendorId_connectStatus_idx" ON "WhatsAppNumber"("vendorId", "connectStatus");
