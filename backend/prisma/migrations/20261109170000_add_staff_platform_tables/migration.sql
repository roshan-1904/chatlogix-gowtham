-- CreateEnum
CREATE TYPE "StaffCaseStatus" AS ENUM ('open', 'waiting', 'resolved');

-- CreateTable
CREATE TABLE "StaffCase" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "subject" VARCHAR(140) NOT NULL,
    "status" "StaffCaseStatus" NOT NULL DEFAULT 'open',
    "conversationId" TEXT,
    "openedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffCaseNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffCaseNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "vendorId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_staff_case_vendor_status" ON "StaffCase"("vendorId", "status");

-- CreateIndex
CREATE INDEX "idx_staff_case_status_updated" ON "StaffCase"("status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_staff_case_vendor_updated" ON "StaffCase"("vendorId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_staff_case_note_case_created" ON "StaffCaseNote"("caseId", "createdAt" ASC);

-- CreateIndex
CREATE INDEX "idx_staff_audit_action_created" ON "StaffAuditLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_staff_audit_vendor_created" ON "StaffAuditLog"("vendorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "idx_staff_audit_actor_created" ON "StaffAuditLog"("actorId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "StaffCase" ADD CONSTRAINT "StaffCase_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCase" ADD CONSTRAINT "StaffCase_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCaseNote" ADD CONSTRAINT "StaffCaseNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "StaffCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

