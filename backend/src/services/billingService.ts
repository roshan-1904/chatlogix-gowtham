import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { numericEnv } from '../config/env.js';

export type MessageKind =
  | 'text'
  | 'audio'
  | 'image'
  | 'document'
  | 'video'
  | 'location'
  | 'sticker'
  | 'contact'
  | 'interactive'
  | 'reaction';

export async function canProcessMessage(vendorId: string, kind: MessageKind): Promise<{ allowed: boolean; reason?: string }> {
  // Simplified: vendors with wallet balance > 0 allowed; else blocked
  try {
    logger.info({ vendorId, kind }, '🔎 Checking credits for vendor');
    const vendor = await prisma.vendor.findUnique({ 
      where: { id: vendorId },
      select: {
        id: true,
        walletBalance: true
      }
    });
    if (!vendor) {
      logger.warn({ vendorId }, '⚠️ Vendor not found during credit check');
      return { allowed: false, reason: 'vendor_not_found' };
    }
    if (vendor.walletBalance <= 0) {
      logger.warn({ vendorId, walletBalance: vendor.walletBalance }, '⚠️ Insufficient balance');
      return { allowed: false, reason: 'insufficient_balance' };
    }
    logger.info({ vendorId, walletBalance: vendor.walletBalance }, '✅ Credit check passed');
    return { allowed: true };
  } catch (err: any) {
    // Surface DB connectivity hints without leaking secrets
    const url = process.env.DATABASE_URL || '';
    let host: string | undefined;
    try { const u = new URL(url); host = `${u.hostname}:${u.port || '5432'}`; } catch {}
    logger.error({ name: err?.name, message: err?.message, host, vendorId }, '[billing.canProcessMessage] Prisma error');
    throw err;
  }
}

export function creditsForKind(kind: MessageKind): number {
  switch (kind) {
    case 'text':
      return numericEnv.textCreditsPerMessage;
    case 'audio':
      return numericEnv.audioCreditsPerMessage;
    case 'image':
      return numericEnv.imageCreditsPerMessage;
    case 'document':
      return numericEnv.documentCreditsPerMessage;
    case 'video':
      return numericEnv.videoCreditsPerMessage;
    case 'location':
      return numericEnv.locationCreditsPerMessage;
    case 'sticker':
      return numericEnv.stickerCreditsPerMessage;
    case 'contact':
      return numericEnv.contactCreditsPerMessage;
    case 'interactive':
      return numericEnv.interactiveCreditsPerMessage;
    case 'reaction':
      return numericEnv.reactionCreditsPerMessage;
  }
}

export interface CatalogImportSpend {
  vendorId: string;
  jobId: string;
  paiseCost: number;
}

/**
 * Record a catalog-import AI spend. Deducts from wallet and writes a
 * WalletTransaction row; the per-call paise breakdown lives in
 * CatalogImportJob.tokenUsage so we don't need a CreditUsage-alike table.
 */
export async function recordCatalogImportSpend(input: CatalogImportSpend): Promise<void> {
  if (input.paiseCost <= 0) return;
  await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.findUnique({
      where: { id: input.vendorId },
      select: { walletBalance: true }
    });
    if (!vendor) throw new Error('Vendor not found');
    const before = vendor.walletBalance;
    const after = before - input.paiseCost;
    await tx.vendor.update({
      where: { id: input.vendorId },
      data: { walletBalance: after }
    });
    await tx.walletTransaction.create({
      data: {
        vendorId: input.vendorId,
        transactionType: 'deduction',
        amount: input.paiseCost,
        balanceBefore: before,
        balanceAfter: after
      }
    });
  });
  logger.info(
    { vendorId: input.vendorId, jobId: input.jobId, paiseCost: input.paiseCost },
    'catalog_import_spend_recorded'
  );
}

function startOfTodayIST(): Date {
  // IST = UTC+5:30. Start-of-day IST in UTC terms is yesterday 18:30 UTC.
  const now = new Date();
  const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - (5 * 60 + 30) * 60 * 1000);
}

/**
 * Sum the totalPaise spent on catalog-import jobs today (IST). Used by the
 * per-vendor daily cap (CATALOG_IMPORT_DAILY_PAISE_CAP) before /analyze runs.
 */
export async function getTodaysCatalogImportPaiseSpent(vendorId: string): Promise<number> {
  const since = startOfTodayIST();
  const jobs = await prisma.catalogImportJob.findMany({
    where: { vendorId, createdAt: { gte: since } },
    select: { tokenUsage: true }
  });
  let total = 0;
  for (const job of jobs) {
    const tu = job.tokenUsage as { totalPaise?: number } | null;
    if (tu?.totalPaise && Number.isFinite(tu.totalPaise)) total += tu.totalPaise;
  }
  return total;
}

export async function deductCredits(vendorId: string, conversationId: string, kind: MessageKind): Promise<void> {
  const credits = creditsForKind(kind);
  await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { walletBalance: true } });
    if (!vendor) throw new Error('Vendor not found');
    // Treat 1 credit = ₹1 for now, using integer fields
    const amount = credits;
    const before = vendor.walletBalance;
    const after = before - amount;
    await tx.vendor.update({ 
      where: { id: vendorId }, 
      data: { walletBalance: after },
      select: { id: true, walletBalance: true }
    });
    await tx.walletTransaction.create({
      data: {
        vendorId,
        transactionType: 'deduction',
        amount,
        balanceBefore: before,
        balanceAfter: after
      }
    });
    await tx.creditUsage.create({
      data: {
        vendorId,
        conversationId,
        creditsConsumed: credits,
        conversationType: kind as any
      }
    });
  });
}


