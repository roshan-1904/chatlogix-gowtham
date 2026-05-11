import { logger } from '../logger.js';
import type { NormalizedProductDraft } from '../routes/schemas/catalogImport.js';
import { callVisionExtraction } from '../lib/visionClient.js';
import { Semaphore } from '../utils/concurrency.js';
import {
  fetchAndValidate,
  FileIntakeError
} from './fileIntakeService.js';
import { parseTabular } from './catalogTabularParser.js';
import {
  fuseRows,
  inBatchDedup,
  tabularRowToDraft,
  visionRowToDraft
} from './catalogNormalizationService.js';
import { enrichKeywordsBatch } from './catalogEnrichmentService.js';
import { catalogImportEventBus } from './catalogImportEventBus.js';
import type { CostResult } from '../utils/costCalculator.js';

const VISION_CONCURRENCY = 5;

export interface ExtractInput {
  jobId: string;
  vendorId: string;
  imageKeys: string[];
  tabularFileKey?: string;
  category?: string;
  languageHint?: 'ta' | 'hi' | 'en';
}

export interface TokenUsageSummary {
  vision?: { promptTokens: number; completionTokens: number; totalTokens: number; costPaise: number };
  enrichment?: { promptTokens: number; completionTokens: number; totalTokens: number; costPaise: number };
  totalPaise: number;
}

export interface ExtractionResult {
  normalizedProducts: NormalizedProductDraft[];
  warnings: string[];
  tokenUsage: TokenUsageSummary;
  pageProgress: PageProgress[];
}

export interface PageProgress {
  pageIndex: number;
  key: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  rowsExtracted?: number;
  error?: string;
}

// 1 USD ≈ 83 INR; our cost cap is denominated in paise, so we convert here.
// The cap table in costCalculator returns USD — promote to paise for billing.
const USD_TO_PAISE = 83 * 100;
const toPaise = (costUsd: number): number => Math.round(costUsd * USD_TO_PAISE);

function sumCosts(costs: CostResult[]) {
  const agg = { promptTokens: 0, completionTokens: 0, totalTokens: 0, costPaise: 0 };
  for (const c of costs) {
    agg.promptTokens += c.promptTokens;
    agg.completionTokens += c.completionTokens;
    agg.totalTokens += c.totalTokens;
    agg.costPaise += toPaise(c.costUsd);
  }
  return agg;
}

export async function extract(input: ExtractInput): Promise<ExtractionResult> {
  const warnings: string[] = [];
  const visionCosts: CostResult[] = [];
  const pageProgress: PageProgress[] = input.imageKeys.map((key, i) => ({
    pageIndex: i,
    key,
    status: 'queued'
  }));

  // -- Vision extraction: page-parallel with semaphore --------------------
  const visionDrafts: NormalizedProductDraft[] = [];
  const sem = new Semaphore(VISION_CONCURRENCY);
  await Promise.allSettled(
    input.imageKeys.map((key, pageIndex) =>
      sem.run(async () => {
        pageProgress[pageIndex].status = 'running';
        catalogImportEventBus.emit(input.jobId, 'page.started', { pageIndex, key });
        try {
          const { buffer, contentType } = await fetchAndValidate(key);
          const { products, cost } = await callVisionExtraction({
            imageBuffer: buffer,
            contentType,
            category: input.category,
            languageHint: input.languageHint,
            pageIndex
          });
          visionCosts.push(cost);
          const drafts = products.map((p) => visionRowToDraft(p));
          visionDrafts.push(...drafts);
          pageProgress[pageIndex].status = 'done';
          pageProgress[pageIndex].rowsExtracted = drafts.length;
          catalogImportEventBus.emit(input.jobId, 'page.completed', {
            pageIndex,
            key,
            rowsExtracted: drafts.length,
            tokensUsed: cost.totalTokens,
            costPaise: toPaise(cost.costUsd)
          });
        } catch (err) {
          const reason = err instanceof FileIntakeError ? err.code : (err as Error).message;
          logger.warn({ err, jobId: input.jobId, pageIndex, key }, 'vision_page_failed');
          pageProgress[pageIndex].status = 'failed';
          pageProgress[pageIndex].error = reason;
          warnings.push(`page_${pageIndex}_failed:${reason}`);
          catalogImportEventBus.emit(input.jobId, 'page.failed', { pageIndex, key, reason });
        }
      })
    )
  );

  // -- Tabular: single file, parsed then converted ------------------------
  const tabularDrafts: NormalizedProductDraft[] = [];
  if (input.tabularFileKey) {
    try {
      const { buffer, contentType } = await fetchAndValidate(input.tabularFileKey);
      const rows = await parseTabular(buffer, contentType);
      for (const row of rows) {
        const draft = tabularRowToDraft(row);
        if (draft) tabularDrafts.push(draft);
      }
      catalogImportEventBus.emit(input.jobId, 'tabular.parsed', {
        key: input.tabularFileKey,
        rowsExtracted: tabularDrafts.length
      });
    } catch (err) {
      const reason = err instanceof FileIntakeError ? err.code : (err as Error).message;
      logger.warn({ err, jobId: input.jobId, key: input.tabularFileKey }, 'tabular_parse_failed');
      warnings.push(`tabular_failed:${reason}`);
    }
  }

  // -- Fuse + dedup -------------------------------------------------------
  const fused = fuseRows(visionDrafts, tabularDrafts);
  const deduped = inBatchDedup(fused);

  // -- Enrichment: batched multilang keywords -----------------------------
  const { updated, costs: enrichmentCosts } = await enrichKeywordsBatch(deduped);
  catalogImportEventBus.emit(input.jobId, 'enrichment.done', {
    productCount: updated.length,
    batches: enrichmentCosts.length
  });

  // -- Token usage summary ------------------------------------------------
  const visionAgg = sumCosts(visionCosts);
  const enrichmentAgg = sumCosts(enrichmentCosts);
  const tokenUsage: TokenUsageSummary = {
    vision: visionAgg,
    enrichment: enrichmentAgg,
    totalPaise: visionAgg.costPaise + enrichmentAgg.costPaise
  };

  return {
    normalizedProducts: updated,
    warnings,
    tokenUsage,
    pageProgress
  };
}
