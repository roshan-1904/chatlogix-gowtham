-- Platform billing settings singleton + USD/INR fetch history.
-- Money columns are paise (1 rupee = 100 paise). Seed values are today's
-- millirupee env defaults ÷ 10 (see docs/BILLING_AND_PRICING.md).

CREATE TABLE IF NOT EXISTS "PlatformSettings" (
    "id" TEXT NOT NULL,
    "usdToInrRate" DECIMAL(10,4) NOT NULL,
    "usdToInrSource" TEXT NOT NULL,
    "usdToInrFetchedAt" TIMESTAMP(3),
    "usdToInrOverride" DECIMAL(10,4),
    "platformFeePerTurnPaise" INTEGER NOT NULL DEFAULT 0,
    "platformFeeOutboundMediaPaise" INTEGER NOT NULL DEFAULT 0,
    "trialGrantPaise" INTEGER NOT NULL,
    "trialExpiryDays" INTEGER NOT NULL,
    "catalogImportDailyPaiseCap" INTEGER NOT NULL,
    "catalogEnhanceDailyPaiseCap" INTEGER NOT NULL,
    "minWalletTopUpPaise" INTEGER NOT NULL,
    "maxWalletTopUpPaise" INTEGER NOT NULL,
    "walletTopUpPresetsPaise" JSONB NOT NULL,
    "mockWalletTopUpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FxRateHistory" (
    "id" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "source" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRateHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FxRateHistory_fetchedAt_idx" ON "FxRateHistory"("fetchedAt" DESC);

INSERT INTO "PlatformSettings" (
    "id",
    "usdToInrRate",
    "usdToInrSource",
    "usdToInrFetchedAt",
    "usdToInrOverride",
    "platformFeePerTurnPaise",
    "platformFeeOutboundMediaPaise",
    "trialGrantPaise",
    "trialExpiryDays",
    "catalogImportDailyPaiseCap",
    "catalogEnhanceDailyPaiseCap",
    "minWalletTopUpPaise",
    "maxWalletTopUpPaise",
    "walletTopUpPresetsPaise",
    "mockWalletTopUpEnabled",
    "updatedAt",
    "updatedBy"
) VALUES (
    'default',
    83.0000,
    'fallback',
    NULL,
    NULL,
    0,
    0,
    5000,
    30,
    5000,
    3000,
    10000,
    5000000,
    '[50000, 100000, 200000, 500000]'::jsonb,
    true,
    CURRENT_TIMESTAMP,
    NULL
)
ON CONFLICT ("id") DO NOTHING;
