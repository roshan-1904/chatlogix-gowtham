-- Auto-recharge mandate registration, debit attempts, and mandate audit trail.

ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "razorpayWalletCustomerId" TEXT;

CREATE TABLE "WalletAutoRechargeRegistration" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amountMilli" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "razorpayOrderId" TEXT,
    "replaceMandateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAutoRechargeRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletAutoRechargeAttempt" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amountMilli" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "scheduledDebitAt" TIMESTAMP(3) NOT NULL,
    "scheduleDay" DATE NOT NULL,
    "razorpayOrderId" TEXT,
    "preDebitNotifiedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletAutoRechargeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WalletAutoRechargeMandateAudit" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "mandateId" TEXT NOT NULL,
    "amountMilli" INTEGER NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletAutoRechargeMandateAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletAutoRechargeRegistration_vendorId_status_idx" ON "WalletAutoRechargeRegistration"("vendorId", "status");
CREATE UNIQUE INDEX "WalletAutoRechargeAttempt_vendorId_scheduleDay_key" ON "WalletAutoRechargeAttempt"("vendorId", "scheduleDay");
CREATE INDEX "WalletAutoRechargeAttempt_vendorId_status_idx" ON "WalletAutoRechargeAttempt"("vendorId", "status");
CREATE INDEX "WalletAutoRechargeAttempt_status_scheduledDebitAt_idx" ON "WalletAutoRechargeAttempt"("status", "scheduledDebitAt");
CREATE INDEX "WalletAutoRechargeMandateAudit_vendorId_idx" ON "WalletAutoRechargeMandateAudit"("vendorId");

ALTER TABLE "WalletAutoRechargeRegistration" ADD CONSTRAINT "WalletAutoRechargeRegistration_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletAutoRechargeAttempt" ADD CONSTRAINT "WalletAutoRechargeAttempt_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WalletAutoRechargeMandateAudit" ADD CONSTRAINT "WalletAutoRechargeMandateAudit_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
