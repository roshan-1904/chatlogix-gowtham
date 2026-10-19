-- Order settlement (Route ledger). Settlement amounts are BIGINT millirupees.

ALTER TABLE "Vendor" ADD COLUMN "paymentsManagedByChatlogix" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vendor" ADD COLUMN "paymentFeeBps" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "Vendor" ADD COLUMN "settlementBalanceMilli" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Vendor" ADD COLUMN "razorpayLinkedAccountId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "linkedAccountStatus" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "collectionStartedAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ADD COLUMN "paymentLinkAutoSend" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Vendor" ADD COLUMN "releasesFrozenAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ADD COLUMN "releasesFrozenReason" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "rollingReserveBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Vendor" ADD COLUMN "settlementBankChangedAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ADD COLUMN "legalName" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "panEncrypted" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "gstin" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "gstExempt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vendor" ADD COLUMN "autoRechargeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Vendor" ADD COLUMN "autoRechargeAmountMilli" INTEGER;
ALTER TABLE "Vendor" ADD COLUMN "autoRechargeMandateId" TEXT;

CREATE UNIQUE INDEX "Vendor_razorpayLinkedAccountId_key" ON "Vendor"("razorpayLinkedAccountId");

ALTER TABLE "PlatformSettings" ADD COLUMN "gstTcsBps" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "PlatformSettings" ADD COLUMN "tds194oBps" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "PlatformSettings" ADD COLUMN "tds194oNoPanBps" INTEGER NOT NULL DEFAULT 500;

CREATE TABLE "CustomerPayment" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "gatewayFeePaise" INTEGER NOT NULL,
    "gatewayTaxPaise" INTEGER NOT NULL,
    "platformFeePaise" INTEGER NOT NULL,
    "platformFeeGstPaise" INTEGER NOT NULL DEFAULT 0,
    "gstTcsPaise" INTEGER NOT NULL DEFAULT 0,
    "tdsPaise" INTEGER NOT NULL DEFAULT 0,
    "netMilli" BIGINT NOT NULL,
    "refundedPaise" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "razorpayPaymentId" TEXT NOT NULL,
    "razorpayPaymentLinkId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "settlementAlert" TEXT,
    "refundRequired" BOOLEAN NOT NULL DEFAULT false,
    "disputeStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerPayment_razorpayPaymentId_key" ON "CustomerPayment"("razorpayPaymentId");
CREATE INDEX "idx_customer_payment_vendor" ON "CustomerPayment"("vendorId", "createdAt" DESC);
CREATE INDEX "idx_customer_payment_order" ON "CustomerPayment"("orderId");

CREATE TABLE "PaymentLink" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "razorpayLinkId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentLink_razorpayLinkId_key" ON "PaymentLink"("razorpayLinkId");
CREATE INDEX "idx_payment_link_order" ON "PaymentLink"("orderId");

CREATE TABLE "SettlementTransfer" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "customerPaymentId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reversedPaise" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "eligibleAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "razorpayTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SettlementTransfer_razorpayTransferId_key" ON "SettlementTransfer"("razorpayTransferId");
CREATE INDEX "idx_settlement_transfer_release" ON "SettlementTransfer"("vendorId", "status", "eligibleAt");
CREATE INDEX "idx_settlement_transfer_payment" ON "SettlementTransfer"("customerPaymentId");

CREATE TABLE "CustomerRefund" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "customerPaymentId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "shortfallMilli" BIGINT NOT NULL DEFAULT 0,
    "fundingRazorpayOrderId" TEXT,
    "fundingExpiresAt" TIMESTAMP(3),
    "reversalPlan" JSONB NOT NULL,
    "razorpayRefundId" TEXT,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerRefund_razorpayRefundId_key" ON "CustomerRefund"("razorpayRefundId");
CREATE INDEX "idx_customer_refund_vendor_status" ON "CustomerRefund"("vendorId", "status");
CREATE INDEX "idx_customer_refund_payment" ON "CustomerRefund"("customerPaymentId");

CREATE TABLE "SettlementEntry" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "amountMilli" BIGINT NOT NULL,
    "direction" TEXT NOT NULL,
    "balanceAfterMilli" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "customerPaymentId" TEXT,
    "settlementTransferId" TEXT,
    "customerRefundId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettlementEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SettlementEntry_idempotencyKey_key" ON "SettlementEntry"("idempotencyKey");
CREATE INDEX "idx_settlement_entry_vendor" ON "SettlementEntry"("vendorId", "createdAt" DESC);
CREATE INDEX "idx_settlement_entry_payment" ON "SettlementEntry"("customerPaymentId");
CREATE INDEX "idx_settlement_entry_kind" ON "SettlementEntry"("kind");

CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "razorpayRefundId" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentWebhookEvent_providerEventId_key" ON "PaymentWebhookEvent"("providerEventId");

ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentLink" ADD CONSTRAINT "PaymentLink_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementTransfer" ADD CONSTRAINT "SettlementTransfer_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementTransfer" ADD CONSTRAINT "SettlementTransfer_customerPaymentId_fkey" FOREIGN KEY ("customerPaymentId") REFERENCES "CustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerRefund" ADD CONSTRAINT "CustomerRefund_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerRefund" ADD CONSTRAINT "CustomerRefund_customerPaymentId_fkey" FOREIGN KEY ("customerPaymentId") REFERENCES "CustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_customerPaymentId_fkey" FOREIGN KEY ("customerPaymentId") REFERENCES "CustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_settlementTransferId_fkey" FOREIGN KEY ("settlementTransferId") REFERENCES "SettlementTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SettlementEntry" ADD CONSTRAINT "SettlementEntry_customerRefundId_fkey" FOREIGN KEY ("customerRefundId") REFERENCES "CustomerRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
