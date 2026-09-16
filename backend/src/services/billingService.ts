import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { computeTurnEstimate, type ChargeSource } from './pricing/pricingService.js';
import { tokenUsageTotalMilli } from './pricing/catalogTokenUsage.js';
import { ensurePlatformSettings, getPlatformSettings } from './platformSettingsService.js';
import { paiseToMilli } from '../utils/money.js';

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

export interface TrialWalletBreakdownItem {
  source: string;
  label: string;
  milli: number;
  count?: number;
  jobs?: number;
}

export type CanProcessMessageOptions = {
  /**
   * Conversation assistant turn: also reserve worst-case product media (3
   * images or 1 video per PM6), so enqueue does not start a turn the wallet
   * cannot finish.
   */
  assistantTurnWorstCaseMedia?: boolean;
};

/**
 * Wallet gate. The vendor must be able to afford a worst-case turn at their
 * own markup — not merely hold a non-zero balance, which is what the old flat
 * per-message credit model checked.
 *
 * A live balance can still end up slightly negative when the actual turn
 * exceeds the estimate; the next turn's gate is what stops the bleeding.
 */
export async function canProcessMessage(
  vendorId: string,
  kind: MessageKind,
  options?: CanProcessMessageOptions
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    logger.info({ vendorId, kind, options }, 'Checking wallet balance for vendor');
    await ensurePlatformSettings();
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        walletBalanceMilli: true,
        markupPercent: true,
        aiModel: true,
        trialExpiresAt: true,
        registrationStatus: true
      }
    });
    if (!vendor) {
      logger.warn({ vendorId }, 'Vendor not found during wallet check');
      return { allowed: false, reason: 'vendor_not_found' };
    }
    if (vendor.trialExpiresAt && vendor.registrationStatus !== 'approved' && vendor.trialExpiresAt < new Date()) {
      return { allowed: false, reason: 'trial_expired' };
    }
    const requiredMilli = computeTurnEstimate({
      markupPercent: vendor.markupPercent,
      aiModel: vendor.aiModel,
      includeWorstCaseMedia: options?.assistantTurnWorstCaseMedia
    }).chargeMilli;
    if (vendor.walletBalanceMilli < requiredMilli) {
      logger.warn(
        { vendorId, walletBalanceMilli: vendor.walletBalanceMilli, requiredMilli },
        'Insufficient balance'
      );
      return { allowed: false, reason: 'insufficient_balance' };
    }
    logger.info({ vendorId, walletBalanceMilli: vendor.walletBalanceMilli, requiredMilli }, 'Wallet check passed');
    return { allowed: true };
  } catch (err: any) {
    const url = process.env.DATABASE_URL || '';
    let host: string | undefined;
    try {
      const u = new URL(url);
      host = `${u.hostname}:${u.port || '5432'}`;
    } catch {}
    logger.error({ name: err?.name, message: err?.message, host, vendorId }, '[billing.canProcessMessage] Prisma error');
    throw err;
  }
}

export async function assertVendorWalletForAi(
  vendorId: string
): Promise<{ allowed: boolean; reason?: string }> {
  return canProcessMessage(vendorId, 'text');
}

function metadataSource(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const source = (meta as { source?: unknown }).source;
  return typeof source === 'string' ? source : null;
}

export async function getTrialWalletSummary(vendorId: string): Promise<{
  balanceMilli: number;
  grantedMilli: number;
  expiresAt: string | null;
  breakdown: TrialWalletBreakdownItem[];
}> {
  await ensurePlatformSettings();
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      walletBalanceMilli: true,
      trialGrantedMilli: true,
      trialExpiresAt: true
    }
  });
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  const txs = await prisma.walletTransaction.findMany({
    where: { vendorId, transactionType: 'deduction' },
    select: { amountMilli: true, metadata: true },
    orderBy: { transactionDate: 'desc' },
    take: 500
  });

  const buckets = new Map<string, TrialWalletBreakdownItem>();
  for (const tx of txs) {
    const source = metadataSource(tx.metadata) ?? 'other';
    const existing = buckets.get(source) ?? {
      source,
      label: labelForSource(source),
      milli: 0,
      count: 0
    };
    existing.milli += tx.amountMilli;
    existing.count = (existing.count ?? 0) + 1;
    buckets.set(source, existing);
  }

  if (!buckets.has('catalog_import')) {
    const jobs = await prisma.catalogImportJob.findMany({
      where: { vendorId },
      select: { tokenUsage: true }
    });
    let catalogMilli = 0;
    for (const job of jobs) {
      catalogMilli += tokenUsageTotalMilli(job.tokenUsage);
    }
    if (catalogMilli > 0) {
      buckets.set('catalog_import', {
        source: 'catalog_import',
        label: 'Catalog import',
        milli: catalogMilli,
        jobs: jobs.length
      });
    }
  }

  return {
    balanceMilli: vendor.walletBalanceMilli,
    grantedMilli:
      vendor.trialGrantedMilli ?? paiseToMilli(getPlatformSettings().trialGrantPaise),
    expiresAt: vendor.trialExpiresAt?.toISOString() ?? null,
    breakdown: Array.from(buckets.values()).filter((b) => b.milli > 0)
  };
}

function labelForSource(source: string): string {
  switch (source) {
    case 'conversation_turn':
    case 'legacy_conversation_turn':
      return 'Customer replies';
    case 'outbound_media':
      return 'Product media sends';
    case 'sandbox_chat':
      return 'Sandbox replies';
    case 'sandbox_voice':
      return 'Sandbox voice';
    case 'sandbox_transcribe':
      return 'Voice transcription';
    case 'catalog_import':
      return 'Catalog import';
    case 'catalog_enhance':
      return 'Catalog enhancer';
    case 'catalog_enhance_transcribe':
      return 'Catalog enhancer voice';
    default:
      return 'Other usage';
  }
}

function startOfTodayIST(): Date {
  const now = new Date();
  const istMs = now.getTime() + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - (5 * 60 + 30) * 60 * 1000);
}

const CATALOG_ENHANCE_SOURCES: ChargeSource[] = [
  'catalog_enhance',
  'catalog_enhance_transcribe'
];

export async function getTodaysCatalogEnhanceMilliSpent(vendorId: string): Promise<number> {
  const since = startOfTodayIST();
  const txs = await prisma.walletTransaction.findMany({
    where: {
      vendorId,
      transactionType: 'deduction',
      transactionDate: { gte: since }
    },
    select: { amountMilli: true, metadata: true }
  });
  let total = 0;
  for (const tx of txs) {
    const source = metadataSource(tx.metadata);
    if (source && CATALOG_ENHANCE_SOURCES.includes(source as ChargeSource)) {
      total += tx.amountMilli;
    }
  }
  return total;
}

/**
 * Raw OpenAI spend for today's import jobs, from the per-job `tokenUsage`
 * JSON rather than the wallet ledger — the cap is on API cost, not on the
 * marked-up amount the vendor pays. `tokenUsageTotalMilli` handles both the
 * post-cutover `totalMilli` key and pre-cutover `totalPaise` rows.
 */
export async function getTodaysCatalogImportMilliSpent(vendorId: string): Promise<number> {
  const since = startOfTodayIST();
  const jobs = await prisma.catalogImportJob.findMany({
    where: { vendorId, createdAt: { gte: since } },
    select: { tokenUsage: true }
  });
  let total = 0;
  for (const job of jobs) {
    total += tokenUsageTotalMilli(job.tokenUsage);
  }
  return total;
}
