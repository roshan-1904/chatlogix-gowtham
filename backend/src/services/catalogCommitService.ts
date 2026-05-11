import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { classifyRow, inBatchDedup } from './catalogNormalizationService.js';
import type {
  AIConfigSections,
  CommitRequest,
  NormalizedProductDraft
} from '../routes/schemas/catalogImport.js';
import { applyAIPrompts } from './vendorAIConfigService.js';

export interface CommitSummary {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failed: Array<{ rowId: string; reason: string }>;
  deferredCount: number;
  dryRun: boolean;
  wave: 1 | 2;
  aiConfigApplied: boolean;
}

// Hash a string into an int32 for pg_advisory_xact_lock. Prisma expects a
// bigint-compatible number; fnv1a is deterministic across processes.
function hashToInt32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h | 0;
}

async function acquireAdvisoryLock(tx: Prisma.TransactionClient, key: string): Promise<void> {
  const lockId = hashToInt32(key);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lockId}::bigint)`;
}

function toProductUpsert(
  vendorId: string,
  draft: NormalizedProductDraft,
  forceInactive: boolean
): { create: Prisma.ProductCreateInput; update: Prisma.ProductUpdateInput } {
  const isActive = forceInactive ? false : draft.isActive;
  const basePrice = draft.basePrice ?? 0;
  const create: Prisma.ProductCreateInput = {
    vendor: { connect: { id: vendorId } },
    name: draft.name,
    sku: draft.sku ?? null,
    description: draft.description ?? null,
    keywords: draft.keywords ?? [],
    baseUnit: draft.baseUnit,
    baseQuantity: new Prisma.Decimal(draft.baseQuantity),
    basePrice,
    imageUrl: draft.imageUrl ?? null,
    isActive
  };
  const update: Prisma.ProductUpdateInput = {
    sku: draft.sku ?? null,
    description: draft.description ?? undefined,
    keywords: draft.keywords ?? undefined,
    baseUnit: draft.baseUnit,
    baseQuantity: new Prisma.Decimal(draft.baseQuantity),
    basePrice,
    imageUrl: draft.imageUrl ?? undefined,
    isActive
  };
  return { create, update };
}

/**
 * Look up the most recent catalog-import job that *committed* rows to this
 * vendor, so we know when the "last import" ran. Used for re-import
 * protection: a Product whose updatedAt is newer than the prior import's
 * createdAt was edited manually — skip overwrite unless the caller explicitly
 * opts in via `overrideProtected`.
 */
async function lastPriorImportDate(
  tx: Prisma.TransactionClient,
  vendorId: string,
  currentJobId: string
): Promise<Date | null> {
  const prior = await tx.catalogImportJob.findFirst({
    where: { vendorId, id: { not: currentJobId }, status: 'ready' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true }
  });
  return prior?.createdAt ?? null;
}

export async function commit(
  vendorId: string,
  req: CommitRequest,
  applyAIConfig?: AIConfigSections
): Promise<CommitSummary> {
  const deduped = inBatchDedup(req.approvedProducts);
  const classified = deduped.map(classifyRow);

  const committable = classified.filter((c) => c.bucket !== 'blocked');
  const blocked = classified.filter((c) => c.bucket === 'blocked');

  const summary: CommitSummary = {
    createdCount: 0,
    updatedCount: 0,
    skippedCount: blocked.length,
    failed: [],
    deferredCount: 0,
    dryRun: req.dryRun,
    wave: req.wave,
    aiConfigApplied: false
  };

  try {
    await prisma.$transaction(async (tx) => {
      await acquireAdvisoryLock(tx, req.idempotencyKey);
      const priorImportDate = await lastPriorImportDate(tx, vendorId, req.jobId);

      for (const { row, bucket } of committable) {
        const forceInactive = bucket === 'needs_pricing';
        const { create, update } = toProductUpsert(vendorId, row, forceInactive);
        try {
          const existing = await tx.product.findUnique({
            where: { vendorId_name: { vendorId, name: row.name } },
            select: { id: true, updatedAt: true }
          });

          if (existing) {
            const isProtected =
              priorImportDate != null && existing.updatedAt > priorImportDate;
            if (isProtected && !row.overrideProtected) {
              summary.skippedCount += 1;
              logger.info(
                { vendorId, jobId: req.jobId, rowId: row.rowId, productId: existing.id },
                'commit_row_skipped_protected'
              );
              continue;
            }
            if (!req.dryRun) {
              await tx.product.update({ where: { id: existing.id }, data: update });
            }
            summary.updatedCount += 1;
          } else {
            if (!req.dryRun) {
              await tx.product.create({ data: create });
            }
            summary.createdCount += 1;
          }
        } catch (err) {
          logger.warn({ err, rowId: row.rowId, vendorId }, 'commit_row_failed');
          summary.failed.push({ rowId: row.rowId, reason: (err as Error).message });
        }
      }

      if (applyAIConfig && !req.dryRun) {
        await applyAIPrompts(vendorId, applyAIConfig as any, tx);
        summary.aiConfigApplied = true;
      }

      if (req.dryRun) {
        // Force rollback of everything we just did.
        throw new DryRunRollback(summary);
      }
    });
  } catch (err) {
    if (!(err instanceof DryRunRollback)) throw err;
  }

  // The catalogImportService.commit() orchestrator owns the audit-shape
  // (it wraps this summary with idempotencyKey + computes deferred[]). We
  // intentionally do NOT mergeJobResult here to avoid a double-write race.
  return summary;
}

class DryRunRollback extends Error {
  constructor(public summary: CommitSummary) {
    super('dry_run_rollback');
  }
}
