-- Fleet default conversation model → gpt-5.6-luna (Q10 / catalog slicing PR2).
-- Optional uniform backfill: existing mini rows match new default unless vendor pinned another model.
ALTER TABLE "Vendor" ALTER COLUMN "aiModel" SET DEFAULT 'gpt-5.6-luna';

UPDATE "Vendor"
SET "aiModel" = 'gpt-5.6-luna'
WHERE "aiModel" IS NULL OR "aiModel" = 'gpt-4.1-mini';
