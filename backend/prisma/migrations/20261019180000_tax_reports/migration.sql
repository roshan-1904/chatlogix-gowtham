-- Phase 10: tax report month close + CA refund adjustment flag (D2)

ALTER TABLE "PlatformSettings" ADD COLUMN "refundReturnsWithheldTaxToShop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformSettings" ADD COLUMN "gstTcsBaseExcludesShopGst" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TaxReportMonthClose" (
    "id" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT,
    "adjustmentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxReportMonthClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TaxReportMonthClose_yearMonth_key" ON "TaxReportMonthClose"("yearMonth");
