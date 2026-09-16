-- Unified rupee credit system, Phase A: move every wallet column from paise
-- (and, on the conversation paths, from flat "credits") to millirupees.
--
-- 1 rupee = 1000 milli = 100 paise, so every stored paise value is multiplied
-- by 10. Renaming columns breaks running code, so this migration and the
-- matching deploy must land together for both the Lambdas and PM2 — see the
-- deployment note in the plan. A short maintenance window is expected.
--
-- CAVEAT ON HISTORICAL ROWS: WalletTransaction / CreditUsage rows written by
-- the conversation pipeline held *flat credits* (1 per text reply), not paise.
-- The x10 below makes them numerically consistent with the new unit but they
-- remain semantically imprecise — 1 credit was never 1 paise of real spend.
-- Pre-cutover rows are therefore stamped with {"unitMigration":"paise_to_milli"}
-- in WalletTransaction.metadata so reporting can exclude or annotate them
-- rather than pretend they are comparable to post-cutover charges.

-- Stamp pre-cutover rows BEFORE the rescale, so the marker covers exactly the
-- set of rows whose amounts this migration touches.
UPDATE "WalletTransaction"
SET "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"unitMigration":"paise_to_milli"}'::jsonb;

-- Vendor: wallet balance + trial grant -> milli, plus the per-vendor markup.
ALTER TABLE "Vendor" RENAME COLUMN "walletBalance" TO "walletBalanceMilli";
ALTER TABLE "Vendor" RENAME COLUMN "trialGrantedPaise" TO "trialGrantedMilli";
ALTER TABLE "Vendor" ADD COLUMN IF NOT EXISTS "markupPercent" INTEGER NOT NULL DEFAULT 50;

UPDATE "Vendor"
SET "walletBalanceMilli" = "walletBalanceMilli" * 10,
    "trialGrantedMilli" = "trialGrantedMilli" * 10;

-- WalletTransaction: amount + running balances -> milli.
ALTER TABLE "WalletTransaction" RENAME COLUMN "amount" TO "amountMilli";
ALTER TABLE "WalletTransaction" RENAME COLUMN "balanceBefore" TO "balanceBeforeMilli";
ALTER TABLE "WalletTransaction" RENAME COLUMN "balanceAfter" TO "balanceAfterMilli";

UPDATE "WalletTransaction"
SET "amountMilli" = "amountMilli" * 10,
    "balanceBeforeMilli" = "balanceBeforeMilli" * 10,
    "balanceAfterMilli" = "balanceAfterMilli" * 10;

-- WalletTopUpIntent: requested top-up amount -> milli. Pending intents are
-- rescaled too so a mid-flight confirm credits the same real rupee value.
ALTER TABLE "WalletTopUpIntent" RENAME COLUMN "amountPaise" TO "amountMilli";

UPDATE "WalletTopUpIntent"
SET "amountMilli" = "amountMilli" * 10;

-- CreditUsage: the per-turn charge is now a millirupee amount, not a credit
-- count. Table name is unchanged (Prisma keeps it via @@map).
ALTER TABLE "CreditUsage" RENAME COLUMN "creditsConsumed" TO "chargedMilli";

UPDATE "CreditUsage"
SET "chargedMilli" = "chargedMilli" * 10;
