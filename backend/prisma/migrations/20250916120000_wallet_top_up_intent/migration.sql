-- P2g: vendor wallet top-up payment intents (mock / Razorpay)

CREATE TABLE IF NOT EXISTS "WalletTopUpIntent" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletTopUpIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WalletTopUpIntent_idempotencyKey_key" ON "WalletTopUpIntent"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "WalletTopUpIntent_vendorId_status_idx" ON "WalletTopUpIntent"("vendorId", "status");

ALTER TABLE "WalletTopUpIntent" DROP CONSTRAINT IF EXISTS "WalletTopUpIntent_vendorId_fkey";
ALTER TABLE "WalletTopUpIntent" ADD CONSTRAINT "WalletTopUpIntent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
