import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import type {
  AnalyzeRequest,
  CommitRequest,
  NormalizedProductDraft
} from '../routes/schemas/catalogImport.js';
import {
  createJob,
  mergeJobResult,
  recordTokenUsage,
  setJobStatus
} from './catalogImportAuditService.js';
import { extract } from './catalogExtractionService.js';
import { commit as commitProducts, type CommitSummary } from './catalogCommitService.js';
import type { MergedVendorProfile } from '../lib/visionClient.js';
import { assertKeyBelongsToVendor } from './fileIntakeService.js';
import { assertVendorWalletForAi } from './billingService.js';
import { chargeVendor, InsufficientBalanceError } from './pricing/pricingService.js';
import { catalogImportEventBus } from './catalogImportEventBus.js';
import { classifyRow } from './catalogNormalizationService.js';
import {
  applyExtractedCatalogProfile,
  onboardingAiConfigFromProfile,
  hasOnboardingProfileFacts
} from './vendorAIConfigService.js';

export interface AnalyzeStart {
  jobId: string;
  status: 'queued' | 'processing' | 'ready' | 'failed';
}

export async function startAnalyze(vendorId: string, req: AnalyzeRequest): Promise<AnalyzeStart> {
  for (const key of req.brochureImageKeys) assertKeyBelongsToVendor(key, vendorId);
  if (req.tabularFileKey) assertKeyBelongsToVendor(req.tabularFileKey, vendorId);

  // Catalog import had no wallet gate at all before the rewrite — it ran
  // vision on every page and debited whatever it cost, even from an empty
  // wallet. The route's rate-limit middleware checks this too; this is the
  // backstop for any non-HTTP caller.
  const wallet = await assertVendorWalletForAi(vendorId);
  if (!wallet.allowed) {
    logger.info({ vendorId, reason: wallet.reason }, 'catalog_import_wallet_denied');
    throw new InsufficientBalanceError();
  }

  const job = await createJob({
    vendorId,
    inputManifest: {
      brochureImageKeys: req.brochureImageKeys,
      tabularFileKey: req.tabularFileKey ?? null,
      importOptions: req.importOptions
    }
  });

  // Phase 1 runs extraction inline and synchronously. Phase 2 moves to
  // `Promise.allSettled` with a semaphore and SSE emitter; API will 202 early.
  runExtractionInBackground(vendorId, job.id, req).catch((err) => {
    logger.error({ err, jobId: job.id }, 'catalog_import_analyze_failed');
  });

  return { jobId: job.id, status: 'queued' };
}

async function runExtractionInBackground(
  vendorId: string,
  jobId: string,
  req: AnalyzeRequest
): Promise<void> {
  await setJobStatus(jobId, 'processing');
  const startedAt = Date.now();
  logger.info(
    {
      jobId,
      vendorId,
      phase: 'analyze',
      imageCount: req.brochureImageKeys.length,
      hasTabular: !!req.tabularFileKey
    },
    'catalog_import_analyze_started'
  );
  try {
    const result = await extract({
      jobId,
      vendorId,
      imageKeys: req.brochureImageKeys,
      tabularFileKey: req.tabularFileKey,
      category: req.importOptions.category,
      languageHint: req.importOptions.languageHint,
      maxProducts: req.importOptions.maxProducts
    });

    await recordTokenUsage(jobId, result.tokenUsage as unknown as Prisma.InputJsonValue);
    await chargeVendor({
      vendorId,
      source: 'catalog_import',
      cost: { aiCostMilli: result.tokenUsage.totalMilli },
      entityType: 'catalog_import_job',
      entityId: jobId,
      metadata: { jobId, phase: 'analyze' }
    });

    await mergeJobResult(jobId, {
      normalizedProducts: result.normalizedProducts,
      vendorProfile: result.vendorProfile,
      warnings: result.warnings,
      pageProgress: result.pageProgress
    });
    try {
      await applyExtractedCatalogProfile(vendorId, result.vendorProfile);
    } catch (err) {
      logger.warn({ err, vendorId, jobId }, 'extracted_catalog_profile_apply_failed');
    }
    await setJobStatus(jobId, 'ready');
    const durationMs = Date.now() - startedAt;
    logger.info(
      {
        jobId,
        vendorId,
        phase: 'analyze',
        durationMs,
        productCount: result.normalizedProducts.length,
        warnings: result.warnings.length,
        tokensUsed:
          (result.tokenUsage.vision?.totalTokens ?? 0) +
          (result.tokenUsage.enrichment?.totalTokens ?? 0),
        costMilli: result.tokenUsage.totalMilli
      },
      'catalog_import_analyze_completed'
    );
    catalogImportEventBus.emit(jobId, 'job.complete', {
      productCount: result.normalizedProducts.length,
      // totalPaise stays on the wire until the vendor UI moves to millirupees (Phase D).
      totalPaise: result.tokenUsage.totalPaise,
      totalMilli: result.tokenUsage.totalMilli,
      warnings: result.warnings.length
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    logger.error(
      { err, jobId, vendorId, phase: 'analyze', durationMs },
      'catalog_import_extraction_error'
    );
    await setJobStatus(jobId, 'failed', (err as Error).message);
    catalogImportEventBus.emit(jobId, 'job.failed', { reason: (err as Error).message });
  }
}

interface CachedSummary {
  idempotencyKey: string;
  summary: CommitSummary;
}

interface JobResultShape {
  commitSummary?: CachedSummary;
  commitSummaryWave2?: CachedSummary;
  normalizedProducts?: NormalizedProductDraft[];
  vendorProfile?: MergedVendorProfile;
  deferred?: Array<{ row: NormalizedProductDraft; warnings: string[]; rowStatus: string }>;
}

export async function commit(vendorId: string, req: CommitRequest): Promise<{
  summary: CommitSummary;
  replayed: boolean;
}> {
  const job = await prisma.catalogImportJob.findUnique({ where: { id: req.jobId } });
  if (!job || job.vendorId !== vendorId) {
    throw Object.assign(new Error('job_not_found'), { code: 'JOB_NOT_FOUND' });
  }
  const result = (job.result as JobResultShape | null) ?? {};

  // Replay check: stored idempotency key must match incoming one exactly.
  const cacheKey = req.wave === 2 ? 'commitSummaryWave2' : 'commitSummary';
  const cached = result[cacheKey];
  if (cached?.idempotencyKey === req.idempotencyKey && cached.summary) {
    logger.info(
      {
        jobId: req.jobId,
        vendorId,
        phase: 'commit',
        wave: req.wave,
        replayed: true
      },
      'catalog_import_commit_replayed'
    );
    return { summary: cached.summary, replayed: true };
  }

  const startedAt = Date.now();
  logger.info(
    {
      jobId: req.jobId,
      vendorId,
      phase: 'commit',
      wave: req.wave,
      dryRun: req.dryRun,
      rowCount: req.approvedProducts.length
    },
    'catalog_import_commit_started'
  );
  const summary = await commitProducts(vendorId, req, req.applyAIConfig);
  const durationMs = Date.now() - startedAt;
  logger.info(
    {
      jobId: req.jobId,
      vendorId,
      phase: 'commit',
      wave: req.wave,
      dryRun: req.dryRun,
      durationMs,
      createdCount: summary.createdCount,
      updatedCount: summary.updatedCount,
      skippedCount: summary.skippedCount,
      failedCount: summary.failed.length,
      aiConfigApplied: summary.aiConfigApplied
    },
    'catalog_import_commit_completed'
  );

  if (!req.dryRun) {
    // Compute deferred[] after Wave 1: rows the extraction surfaced that the
    // vendor did NOT include in approvedProducts. Wave 2 will commit these.
    if (req.wave === 1) {
      const approvedIds = new Set(req.approvedProducts.map((p) => p.rowId));
      const allDrafts = result.normalizedProducts ?? [];
      const deferred = allDrafts
        .filter((d) => !approvedIds.has(d.rowId))
        .map((d) => {
          const { warnings } = classifyRow(d);
          return { row: d, warnings, rowStatus: 'needs_review' };
        });
      summary.deferredCount = deferred.length;
      await mergeJobResult(req.jobId, {
        [cacheKey]: { idempotencyKey: req.idempotencyKey, summary },
        deferred,
        committedAt: new Date().toISOString()
      });
    } else {
      await mergeJobResult(req.jobId, {
        [cacheKey]: { idempotencyKey: req.idempotencyKey, summary },
        committedAt: new Date().toISOString()
      });
    }

    const manifest = (job.inputManifest ?? {}) as {
      importOptions?: { autoGenerateAIConfig?: boolean };
    };
    if (
      req.wave === 1 &&
      manifest.importOptions?.autoGenerateAIConfig !== false &&
      result.vendorProfile
    ) {
      const generatedInput = onboardingAiConfigFromProfile(result.vendorProfile);
      if (hasOnboardingProfileFacts(generatedInput)) {
        try {
          await applyExtractedCatalogProfile(vendorId, result.vendorProfile);
        } catch (err) {
          logger.warn({ err, vendorId, jobId: req.jobId }, 'onboarding_ai_config_apply_failed');
        }
      }
    }
  }

  return { summary, replayed: false };
}
