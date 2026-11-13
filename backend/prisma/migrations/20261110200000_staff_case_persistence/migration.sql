-- Decision 3: StaffCase, StaffCaseNote, StaffAuditLog.
-- Retention (purge job deferred): audit 1 year from createdAt;
-- cases and notes 1 year after resolvedAt.

CREATE TABLE "StaffCase" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "vendorId" TEXT NOT NULL,
    "subject" VARCHAR(140) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "conversationId" TEXT,
    "openedBy" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffCase_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffCase_subject_len" CHECK (char_length("subject") BETWEEN 3 AND 140),
    CONSTRAINT "StaffCase_status_check" CHECK ("status" IN ('open', 'waiting', 'resolved')),
    CONSTRAINT "StaffCase_resolvedAt_check" CHECK (
        ("status" = 'resolved' AND "resolvedAt" IS NOT NULL)
        OR ("status" <> 'resolved' AND "resolvedAt" IS NULL)
    )
);

CREATE TABLE "StaffCaseNote" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffCaseNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffCaseNote_body_len" CHECK (char_length("body") BETWEEN 1 AND 2000)
);

CREATE TABLE "StaffAuditLog" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "vendorId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAuditLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffAuditLog_summary_len" CHECK (char_length("summary") BETWEEN 1 AND 500)
);

CREATE INDEX "StaffCase_status_updatedAt_idx" ON "StaffCase"("status", "updatedAt" DESC);
CREATE INDEX "StaffCase_vendorId_createdAt_idx" ON "StaffCase"("vendorId", "createdAt" DESC);
CREATE INDEX "StaffCase_conversationId_idx" ON "StaffCase"("conversationId");
CREATE INDEX "StaffCase_resolvedAt_idx" ON "StaffCase"("resolvedAt");

CREATE INDEX "StaffCaseNote_caseId_createdAt_idx" ON "StaffCaseNote"("caseId", "createdAt");

CREATE INDEX "StaffAuditLog_createdAt_idx" ON "StaffAuditLog"("createdAt" DESC);
CREATE INDEX "StaffAuditLog_vendorId_createdAt_idx" ON "StaffAuditLog"("vendorId", "createdAt" DESC);
CREATE INDEX "StaffAuditLog_action_createdAt_idx" ON "StaffAuditLog"("action", "createdAt" DESC);

ALTER TABLE "StaffCase"
    ADD CONSTRAINT "StaffCase_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StaffCase"
    ADD CONSTRAINT "StaffCase_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StaffCaseNote"
    ADD CONSTRAINT "StaffCaseNote_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "StaffCase"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StaffAuditLog"
    ADD CONSTRAINT "StaffAuditLog_vendorId_fkey"
    FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
