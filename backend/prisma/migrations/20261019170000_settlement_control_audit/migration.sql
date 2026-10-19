CREATE TABLE "VendorSettlementControlAudit" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorSettlementControlAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorSettlementControlAudit_vendorId_idx" ON "VendorSettlementControlAudit"("vendorId");
CREATE INDEX "VendorSettlementControlAudit_vendorId_createdAt_idx" ON "VendorSettlementControlAudit"("vendorId", "createdAt" DESC);

ALTER TABLE "VendorSettlementControlAudit" ADD CONSTRAINT "VendorSettlementControlAudit_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
