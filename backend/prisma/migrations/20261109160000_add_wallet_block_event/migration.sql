-- CreateEnum
CREATE TYPE "WalletBlockStatus" AS ENUM ('pending_enqueue', 'queued', 'sending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "WalletBlockEvent" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "conversationId" TEXT,
    "whatsappMessageId" TEXT NOT NULL,
    "messageId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "WalletBlockStatus" NOT NULL DEFAULT 'pending_enqueue',
    "templateSent" BOOLEAN NOT NULL DEFAULT false,
    "customerPhone" TEXT,
    "claimToken" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "isRecoverable" BOOLEAN NOT NULL DEFAULT true,
    "outboundWhatsappMessageId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "queuedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "WalletBlockEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletBlockEvent_whatsappMessageId_key" ON "WalletBlockEvent"("whatsappMessageId");

-- CreateIndex
CREATE INDEX "idx_wallet_block_vendor_created" ON "WalletBlockEvent"("vendorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_wallet_block_created" ON "WalletBlockEvent"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_wallet_block_status_created" ON "WalletBlockEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "idx_wallet_block_status_claimed" ON "WalletBlockEvent"("status", "claimedAt");

-- CreateIndex
CREATE INDEX "idx_wallet_block_conversation" ON "WalletBlockEvent"("conversationId");

-- AddForeignKey
ALTER TABLE "WalletBlockEvent" ADD CONSTRAINT "WalletBlockEvent_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletBlockEvent" ADD CONSTRAINT "WalletBlockEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

