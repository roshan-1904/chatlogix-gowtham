-- CreditUsage becomes the spend ledger for *every* wallet debit, not just the
-- ones that belong to a conversation.
--
-- Before this change `pricingService.chargeVendor` could only write a
-- CreditUsage row when it had a conversationId, because the FK was required.
-- That made catalog_import / catalog_enhance / catalog_enhance_transcribe /
-- sandbox_chat / sandbox_transcribe charges invisible to every vendor-facing
-- spend number (dashboard spend totals, breakdownBySource, dailySpend, and
-- /api/vendors/:id/usage-analytics all read this table) even though the wallet
-- was debited — a balance drop with no matching spend.
--
-- Two shape changes make that possible:
--   1. `source` records which action produced the charge (the grouping key
--      that replaces conversationType in the breakdown).
--   2. `conversationId` / `conversationType` become nullable, since a catalog
--      import has neither a conversation nor an inbound message type.
--
-- Nullable conversationId also extends the `externalId` unique index — the
-- idempotency guard — to non-conversation sources, which previously had to
-- rely on their caller's own dedup.

-- Added nullable first so existing rows survive, then backfilled, then pinned
-- to NOT NULL. Every pre-existing row came from the conversation pipeline,
-- which is the only caller that ever got a CreditUsage row written.
ALTER TABLE "CreditUsage" ADD COLUMN "source" TEXT;

UPDATE "CreditUsage"
SET "source" = 'conversation_turn'
WHERE "source" IS NULL;

ALTER TABLE "CreditUsage" ALTER COLUMN "source" SET NOT NULL;

ALTER TABLE "CreditUsage" ALTER COLUMN "conversationId" DROP NOT NULL;
ALTER TABLE "CreditUsage" ALTER COLUMN "conversationType" DROP NOT NULL;

CREATE INDEX "idx_creditusage_vendor_source" ON "CreditUsage"("vendorId", "source");
