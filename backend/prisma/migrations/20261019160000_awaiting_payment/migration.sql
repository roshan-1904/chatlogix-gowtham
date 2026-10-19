-- Phase 5: customer-placed orders awaiting online payment
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'awaiting_payment';

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;

ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "settlementBankAccountMasked" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "settlementBankIfsc" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "settlementAccountHolderName" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "businessType" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "settlementContactEmail" TEXT;
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "settlementContactPhone" TEXT;
