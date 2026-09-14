-- Customer Query quoted WhatsApp replies v1.1 — quote anchor per row
ALTER TABLE "CustomerQuery"
  ADD COLUMN IF NOT EXISTS "quoteMessageId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerQuery_quoteMessageId_fkey'
  ) THEN
    ALTER TABLE "CustomerQuery"
      ADD CONSTRAINT "CustomerQuery_quoteMessageId_fkey"
      FOREIGN KEY ("quoteMessageId") REFERENCES "Message"("id") ON DELETE SET NULL;
  END IF;
END $$;

UPDATE "CustomerQuery"
SET "quoteMessageId" = "sourceMessageId"
WHERE "quoteMessageId" IS NULL AND "sourceMessageId" IS NOT NULL;
