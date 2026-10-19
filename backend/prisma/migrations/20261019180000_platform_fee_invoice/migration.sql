-- Stage 10: monthly platform-fee GST invoices (sequential numbers, stored PDF).

CREATE TABLE "PlatformFeeInvoiceSequence" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PlatformFeeInvoiceSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VendorPlatformFeeInvoice" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "invoiceNumber" INTEGER NOT NULL,
    "invoiceDisplay" TEXT NOT NULL,
    "platformFeePaise" INTEGER NOT NULL,
    "platformFeeTaxablePaise" INTEGER NOT NULL,
    "platformFeeGstPaise" INTEGER NOT NULL,
    "gatewayFeePaise" INTEGER NOT NULL,
    "gatewayTaxPaise" INTEGER NOT NULL,
    "gatewayLineMode" TEXT NOT NULL,
    "paymentCount" INTEGER NOT NULL,
    "pdfS3Key" TEXT NOT NULL,
    "pdfSha256" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorPlatformFeeInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorPlatformFeeInvoice_invoiceNumber_key" ON "VendorPlatformFeeInvoice"("invoiceNumber");
CREATE UNIQUE INDEX "VendorPlatformFeeInvoice_vendorId_monthKey_key" ON "VendorPlatformFeeInvoice"("vendorId", "monthKey");
CREATE INDEX "VendorPlatformFeeInvoice_vendorId_issuedAt_idx" ON "VendorPlatformFeeInvoice"("vendorId", "issuedAt" DESC);

ALTER TABLE "VendorPlatformFeeInvoice" ADD CONSTRAINT "VendorPlatformFeeInvoice_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "VendorPlatformFeeCreditNote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "creditNoteNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VendorPlatformFeeCreditNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorPlatformFeeCreditNote_creditNoteNumber_key" ON "VendorPlatformFeeCreditNote"("creditNoteNumber");
CREATE UNIQUE INDEX "VendorPlatformFeeCreditNote_invoiceId_key" ON "VendorPlatformFeeCreditNote"("invoiceId");

ALTER TABLE "VendorPlatformFeeCreditNote" ADD CONSTRAINT "VendorPlatformFeeCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "VendorPlatformFeeInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
