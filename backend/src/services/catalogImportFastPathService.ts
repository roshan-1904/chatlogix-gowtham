import { randomUUID } from 'node:crypto';
import { logger } from '../logger.js';
import type { NormalizedProductDraft } from '../routes/schemas/catalogImport.js';
import { callVisionExtraction } from '../lib/visionClient.js';
import { fetchAndValidate } from './fileIntakeService.js';
import { visionRowToDraft, classifyRow } from './catalogNormalizationService.js';
import { enrichKeywordsBatch, shopContextFromVendorProfile } from './catalogEnrichmentService.js';
import { assertVendorWalletForAi } from './billingService.js';
import {
  aiCostMilliFromUsd,
  chargeVendor,
  InsufficientBalanceError
} from './pricing/pricingService.js';

export interface FastPhotoResult {
  draft: NormalizedProductDraft;
  bucket: 'auto_accept' | 'review' | 'needs_pricing' | 'blocked';
  warnings: string[];
  alternates: NormalizedProductDraft[];
  costMilli: number;
}

/**
 * Single-image synchronous extraction. Doesn't create a CatalogImportJob —
 * the caller commits the returned draft via the regular /commit path with a
 * freshly-created job or folds it into a pending job. Budget: 5s P95.
 */
export async function fastPhoto(vendorId: string, imageKey: string): Promise<FastPhotoResult> {
  const startedAt = Date.now();

  const wallet = await assertVendorWalletForAi(vendorId);
  if (!wallet.allowed) {
    logger.info({ vendorId, reason: wallet.reason }, 'fast_photo_wallet_denied');
    throw new InsufficientBalanceError();
  }

  const { buffer, contentType } = await fetchAndValidate(imageKey);
  const { products, vendorProfile, cost } = await callVisionExtraction({
    imageBuffer: buffer,
    contentType
  });

  const drafts = products.map(visionRowToDraft);
  if (drafts.length === 0) {
    throw Object.assign(new Error('no_products_extracted'), { code: 'NO_PRODUCTS' });
  }

  // Best = highest row-confidence; remainder returned as alternates so the UI
  // can offer "not this one? pick another".
  drafts.sort((a, b) => (b.sourceMeta.confidence ?? 0) - (a.sourceMeta.confidence ?? 0));
  const [best, ...alternates] = drafts;

  // Cheap one-row enrichment — 1 batch of size 1. Worth the extra ~300 tokens
  // because the fast-path skips the review-grid enrichment pass entirely.
  const { updated, costs: enrichmentCosts } = await enrichKeywordsBatch(
    [best],
    shopContextFromVendorProfile(vendorProfile)
  );
  const enriched = updated[0] ?? best;

  const classified = classifyRow(enriched);
  // Enrichment used to be omitted here, so the fast path silently ate the
  // cost of its own keyword pass.
  const aiCostMilli =
    aiCostMilliFromUsd(cost.costUsd) +
    enrichmentCosts.reduce((sum, c) => sum + aiCostMilliFromUsd(c.costUsd), 0);

  // Best-effort billing — log but don't fail the user-facing call on hiccup.
  let costMilli = 0;
  try {
    const charge = await chargeVendor({
      vendorId,
      source: 'catalog_import',
      cost: { aiCostMilli },
      entityType: 'catalog_import_fast',
      entityId: randomUUID(),
      metadata: { phase: 'fast_photo' }
    });
    costMilli = charge.deductedMilli;
  } catch (err) {
    logger.warn({ err, vendorId }, 'fast_photo_billing_failed');
  }

  logger.info(
    {
      vendorId,
      phase: 'fast_photo',
      durationMs: Date.now() - startedAt,
      tokensUsed: cost.totalTokens,
      costMilli,
      bucket: classified.bucket
    },
    'catalog_import_fast_photo_completed'
  );

  return {
    draft: enriched,
    bucket: classified.bucket,
    warnings: classified.warnings,
    alternates: alternates.slice(0, 4),
    costMilli
  };
}
