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

export interface CatalogImportSpend {
  vendorId: string;
  jobId: string;
  paiseCost: number;
}

export type VendorAiSpendSource = 'catalog_enhance' | 'catalog_enhance_transcribe';

export interface VendorAiSpendInput {
  vendorId: string;
  paiseCost: number;
  source: VendorAiSpendSource;
  sessionId: string;
  entityType: 'product' | 'faq';
  entityId: string;
  metadata?: Record<string, unknown>;
}

export type SandboxSpendSource = 'sandbox_chat' | 'sandbox_voice' | 'sandbox_transcribe';

export interface SandboxSpendInput {
  vendorId: string;
  paiseCost: number;
  source: SandboxSpendSource;
  conversationId?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
}

export interface TrialWalletBreakdownItem {
  source: string;
  label: string;
  paise: number;
  count?: number;
  jobs?: number;
}

export type CanProcessMessageOptions = {
  /**
   * Conversation assistant turn: require wallet balance for 1 outbound text plus
   * worst-case product media (3 images or 1 video per PM6), so enqueue does not
   * start a turn the wallet cannot finish.
   */
  assistantTurnWorstCaseMedia?: boolean;
};

/** PM6 worst case: 1 assistant text + 3 images OR 1 assistant text + 1 video. */
export function creditsForAssistantTurnWorstCase(): number {
  const text = creditsForKind('text');
  const threeImages = 3 * creditsForKind('image');
  const oneVideo = creditsForKind('video');
  return text + Math.max(threeImages, oneVideo);
}

export async function canProcessMessage(
  vendorId: string,
  kind: MessageKind,
  options?: CanProcessMessageOptions
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    logger.info({ vendorId, kind, options }, 'Checking credits for vendor');
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        walletBalance: true,
        trialExpiresAt: true,
        registrationStatus: true
      }
    });
    if (!vendor) {
      logger.warn({ vendorId }, 'Vendor not found during credit check');
      return { allowed: false, reason: 'vendor_not_found' };
    }
    if (vendor.trialExpiresAt && vendor.registrationStatus !== 'approved' && vendor.trialExpiresAt < new Date()) {
      return { allowed: false, reason: 'trial_expired' };
    }
    const minimumBalance = options?.assistantTurnWorstCaseMedia ? creditsForAssistantTurnWorstCase() : 1;
    if (vendor.walletBalance < minimumBalance) {
      logger.warn({ vendorId, walletBalance: vendor.walletBalance, minimumBalance }, 'Insufficient balance');
      return { allowed: false, reason: 'insufficient_balance' };
    }
    logger.info({ vendorId, walletBalance: vendor.walletBalance }, 'Credit check passed');
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

/**
 * Record a catalog-import AI spend. Deducts from wallet and writes a
 * WalletTransaction row; the per-call paise breakdown lives in
 * CatalogImportJob.tokenUsage so we don't need a CreditUsage-alike table.
 */
export async function assertVendorWalletForAi(
  vendorId: string
): Promise<{ allowed: boolean; reason?: string }> {
  return canProcessMessage(vendorId, 'text');
}

export async function recordVendorAiSpend(input: VendorAiSpendInput): Promise<void> {
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
        balanceAfter: after,
        metadata: {
          source: input.source,
          sessionId: input.sessionId,
          entityType: input.entityType,
          entityId: input.entityId,
          ...input.metadata
        }
      }
    });
  });
  logger.info(
    {
      vendorId: input.vendorId,
      sessionId: input.sessionId,
      source: input.source,
      paiseCost: input.paiseCost
    },
    'catalog_enhance_spend_recorded'
  );
}

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
        balanceAfter: after,
        metadata: { source: 'catalog_import', jobId: input.jobId }
      }
    });
  });
  logger.info(
    { vendorId: input.vendorId, jobId: input.jobId, paiseCost: input.paiseCost },
    'catalog_import_spend_recorded'
  );
}

export async function recordSandboxSpend(input: SandboxSpendInput): Promise<number> {
  if (input.paiseCost <= 0) return 0;

  return prisma.$transaction(async (tx) => {
    const vendor = await tx.vendor.findUnique({
      where: { id: input.vendorId },
      select: { walletBalance: true }
    });
    if (!vendor) throw new Error('Vendor not found');

    const before = vendor.walletBalance;
    const after = Math.max(0, before - input.paiseCost);
    const actualDeducted = before - after;

    await tx.vendor.update({
      where: { id: input.vendorId },
      data: { walletBalance: after }
    });

    await tx.walletTransaction.create({
      data: {
        vendorId: input.vendorId,
        transactionType: 'deduction',
        amount: actualDeducted,
        balanceBefore: before,
        balanceAfter: after,
        metadata: {
          source: input.source,
          conversationId: input.conversationId,
          externalId: input.externalId,
          ...input.metadata
        }
      }
    });

    return actualDeducted;
  });
}

function metadataSource(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const source = (meta as { source?: unknown }).source;
  return typeof source === 'string' ? source : null;
}

export async function getTrialWalletSummary(vendorId: string): Promise<{
  balancePaise: number;
  grantedPaise: number;
  expiresAt: string | null;
  breakdown: TrialWalletBreakdownItem[];
}> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      walletBalance: true,
      trialGrantedPaise: true,
      trialExpiresAt: true
    }
  });
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  const txs = await prisma.walletTransaction.findMany({
    where: { vendorId, transactionType: 'deduction' },
    select: { amount: true, metadata: true },
    orderBy: { transactionDate: 'desc' },
    take: 500
  });

  const buckets = new Map<string, TrialWalletBreakdownItem>();
  for (const tx of txs) {
    const source = metadataSource(tx.metadata) ?? 'other';
    const existing = buckets.get(source) ?? {
      source,
      label: labelForSource(source),
      paise: 0,
      count: 0
    };
    existing.paise += tx.amount;
    existing.count = (existing.count ?? 0) + 1;
    buckets.set(source, existing);
  }

  if (!buckets.has('catalog_import')) {
    const jobs = await prisma.catalogImportJob.findMany({
      where: { vendorId },
      select: { tokenUsage: true }
    });
    let catalogPaise = 0;
    for (const job of jobs) {
      const tu = job.tokenUsage as { totalPaise?: number } | null;
      if (tu?.totalPaise) catalogPaise += tu.totalPaise;
    }
    if (catalogPaise > 0) {
      buckets.set('catalog_import', {
        source: 'catalog_import',
        label: 'Catalog import',
        paise: catalogPaise,
        jobs: jobs.length
      });
    }
  }

  return {
    balancePaise: vendor.walletBalance,
    grantedPaise: vendor.trialGrantedPaise ?? numericEnv.trialGrantPaise,
    expiresAt: vendor.trialExpiresAt?.toISOString() ?? null,
    breakdown: Array.from(buckets.values()).filter((b) => b.paise > 0)
  };
}

function labelForSource(source: string): string {
  switch (source) {
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

const CATALOG_ENHANCE_SOURCES: VendorAiSpendSource[] = [
  'catalog_enhance',
  'catalog_enhance_transcribe'
];

export async function getTodaysCatalogEnhancePaiseSpent(vendorId: string): Promise<number> {
  const since = startOfTodayIST();
  const txs = await prisma.walletTransaction.findMany({
    where: {
      vendorId,
      transactionType: 'deduction',
      transactionDate: { gte: since }
    },
    select: { amount: true, metadata: true }
  });
  let total = 0;
  for (const tx of txs) {
    const source = metadataSource(tx.metadata);
    if (source && CATALOG_ENHANCE_SOURCES.includes(source as VendorAiSpendSource)) {
      total += tx.amount;
    }
  }
  return total;
}

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
