import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

export type StaffCaseStatus = 'open' | 'waiting' | 'resolved';

export interface StaffCase {
  id: string;
  vendorId: string;
  subject: string;
  status: StaffCaseStatus;
  conversationId?: string | null;
  openedBy: string;
  createdAt: string;
  updatedAt: string;
  vendor?: {
    id: string;
    businessName: string;
  };
}

export interface StaffCaseNote {
  id: string;
  caseId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface StaffAuditLogEntry {
  id: string;
  actorId: string;
  action:
    | 'conversation_read'
    | 'case_opened'
    | 'case_status_changed'
    | 'wallet_credited'
    | 'markup_changed'
    | 'settings_changed'
    | 'feature_flag_changed'
    | 'whatsapp_mapped';
  vendorId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface ShopContext {
  vendor: {
    id: string;
    businessName: string;
    walletBalanceMilli: number;
    markupPercent: number;
  };
  whatsapp: {
    phoneNumber: string;
    connectStatus: string;
  } | null;
  lastFailure: {
    id: string;
    conversationId: string;
    timestamp: string;
    failureReason: string;
    preview: string;
  } | null;
  openQuestions: Array<{
    id: string;
    questionEn: string;
    category: string;
    hitCount: number;
    lastSeenAt: string;
    status: string;
  }>;
}

/**
 * Valid transitions:
 * - open -> waiting or resolved
 * - waiting -> open or resolved
 * - resolved -> open (reopen)
 */
export function isValidCaseStatusTransition(from: StaffCaseStatus, to: StaffCaseStatus): boolean {
  if (from === to) return false;
  if (from === 'open') return to === 'waiting' || to === 'resolved';
  if (from === 'waiting') return to === 'open' || to === 'resolved';
  if (from === 'resolved') return to === 'open';
  return false;
}

/**
 * Test hook for simulating audit writer behavior in unit tests.
 */
let customAuditWriter: ((entry: Omit<StaffAuditLogEntry, 'id' | 'createdAt'>) => Promise<boolean>) | null = null;

export function setCustomAuditWriterForTest(
  fn: ((entry: Omit<StaffAuditLogEntry, 'id' | 'createdAt'>) => Promise<boolean>) | null
): void {
  customAuditWriter = fn;
}

/**
 * Checks whether the StaffAuditLog table exists in postgres.
 */
export async function checkAuditTableExists(): Promise<boolean> {
  try {
    const rows = await (prisma as any).$queryRawUnsafe?.(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('StaffAuditLog', 'staff_audit_logs') LIMIT 1;"
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    logger.warn({ err }, 'Error checking if StaffAuditLog table exists');
    return false;
  }
}

/**
 * Checks whether the StaffCase table exists in postgres.
 */
export async function checkCaseTableExists(): Promise<boolean> {
  try {
    const rows = await (prisma as any).$queryRawUnsafe?.(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('StaffCase', 'staff_cases') LIMIT 1;"
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    logger.warn({ err }, 'Error checking if StaffCase table exists');
    return false;
  }
}

/**
 * Write a staff audit log entry.
 * Must fail closed: if audit table is missing or write throws, returns false.
 */
export async function recordStaffAuditLog(
  entry: Omit<StaffAuditLogEntry, 'id' | 'createdAt'>
): Promise<boolean> {
  if (customAuditWriter) {
    return customAuditWriter(entry);
  }

  const tableExists = await checkAuditTableExists();
  if (!tableExists) {
    logger.warn(
      { action: entry.action, vendorId: entry.vendorId },
      'StaffAuditLog table is missing or pending migration; audit write failed closed'
    );
    return false;
  }

  try {
    await (prisma as any).$executeRawUnsafe?.(
      `INSERT INTO "StaffAuditLog" ("id", "actorId", "action", "vendorId", "summary", "metadata", "createdAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, NOW())`,
      entry.actorId,
      entry.action,
      entry.vendorId ?? null,
      entry.summary,
      JSON.stringify(entry.metadata ?? {})
    );
    return true;
  } catch (err) {
    logger.error({ err, entry }, 'Failed to insert StaffAuditLog row');
    return false;
  }
}

/**
 * Fetch Shop Context for Support Context Card
 */
export async function getShopContext(vendorId: string): Promise<ShopContext | null> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      id: true,
      businessName: true,
      walletBalanceMilli: true,
      markupPercent: true,
    },
  });

  if (!vendor) return null;

  const [whatsapp, lastFailure, openQuestions] = await Promise.all([
    prisma.whatsAppNumber.findFirst({
      where: { vendorId },
      select: {
        displayPhone: true,
        phoneNumberId: true,
        connectStatus: true,
      },
    }),
    prisma.message.findFirst({
      where: {
        status: 'failed',
        senderType: 'assistant',
        conversation: { vendorId },
      },
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        conversationId: true,
        timestamp: true,
        failureReason: true,
        content: true,
      },
    }),
    prisma.customerQuery.findMany({
      where: {
        vendorId,
        status: 'open',
      },
      orderBy: { lastSeenAt: 'desc' },
      take: 5,
      select: {
        id: true,
        questionEn: true,
        category: true,
        hitCount: true,
        lastSeenAt: true,
        status: true,
      },
    }),
  ]);

  return {
    vendor: {
      id: vendor.id,
      businessName: vendor.businessName,
      walletBalanceMilli: vendor.walletBalanceMilli,
      markupPercent: vendor.markupPercent,
    },
    whatsapp: whatsapp
      ? {
          phoneNumber: whatsapp.displayPhone || whatsapp.phoneNumberId,
          connectStatus: whatsapp.connectStatus || 'disconnected',
        }
      : null,
    lastFailure: lastFailure
      ? {
          id: lastFailure.id,
          conversationId: lastFailure.conversationId,
          timestamp: lastFailure.timestamp.toISOString(),
          failureReason: lastFailure.failureReason || 'Failed reply recorded',
          preview: (lastFailure.content || '').slice(0, 100),
        }
      : null,
    openQuestions: openQuestions.map((q) => ({
      id: q.id,
      questionEn: q.questionEn,
      category: q.category,
      hitCount: q.hitCount,
      lastSeenAt: q.lastSeenAt.toISOString(),
      status: q.status,
    })),
  };
}
