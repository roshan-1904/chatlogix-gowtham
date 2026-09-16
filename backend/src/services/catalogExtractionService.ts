import { logger } from '../logger.js';
import type { NormalizedProductDraft } from '../routes/schemas/catalogImport.js';
import {
  callVisionExtraction,
  coerceLanguageHint,
  coerceVendorProfileCategory,
  type ExtractedVendorProfile,
  type MergedVendorProfile
} from '../lib/visionClient.js';
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
import { enrichKeywordsBatch, shopContextFromVendorProfile } from './catalogEnrichmentService.js';
import { catalogImportEventBus } from './catalogImportEventBus.js';
import { milliToPaise, usdToMilliFloat } from '../utils/money.js';
import type { CostResult } from '../utils/costCalculator.js';

const VISION_CONCURRENCY = 5;

export interface ExtractInput {
  jobId: string;
  vendorId: string;
  imageKeys: string[];
  tabularFileKey?: string;
  category?: string;
  languageHint?: 'ta' | 'hi' | 'en';
  maxProducts?: number;
}

/**
 * The `*Paise` keys are deliberately kept: this object is persisted verbatim
 * as `CatalogImportJob.tokenUsage` JSON and read back by billingService, so
 * renaming them would silently orphan every pre-cutover row.
 *
 * The `*Milli` keys are additive and unrounded — they are what billing reads
 * now (via `pricing/catalogTokenUsage.ts#tokenUsageTotalMilli`, which falls
 * back to `totalPaise` for older rows). Promoting `totalPaise` instead would
 * inherit its per-call rounding to whole paise.
 */
export interface TokenUsageSummary {
  vision?: { promptTokens: number; completionTokens: number; totalTokens: number; costPaise: number; costMilli: number };
  enrichment?: { promptTokens: number; completionTokens: number; totalTokens: number; costPaise: number; costMilli: number };
  totalPaise: number;
  totalMilli: number;
}

export interface ExtractionResult {
  normalizedProducts: NormalizedProductDraft[];
  vendorProfile: MergedVendorProfile;
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

const PROFILE_FIELDS = [
  'businessName',
  'category',
  'address',
  'city',
  'hours',
  'deliveryNotes',
  'languageHint'
] as const;

export function emptyVendorProfile(): MergedVendorProfile {
  return {
    businessName: { value: null, confidence: 0 },
    category: { value: null, confidence: 0 },
    address: { value: null, confidence: 0 },
    city: { value: null, confidence: 0 },
    hours: { value: null, confidence: 0 },
    deliveryNotes: { value: null, confidence: 0 },
    languageHint: { value: null, confidence: 0 }
  };
}

type LooseProfileField = { value: string | null; confidence: number };
type LooseVendorProfile = Partial<Record<(typeof PROFILE_FIELDS)[number], LooseProfileField>>;

/** Pick highest-confidence non-null value per profile field across vision pages. */
export function mergeVendorProfiles(profiles: Array<LooseVendorProfile | undefined>): MergedVendorProfile {
  const merged = emptyVendorProfile();
  for (const field of PROFILE_FIELDS) {
    let best: { value: string; confidence: number } | null = null;
    for (const profile of profiles) {
      const cell = profile?.[field];
      if (!cell || cell.value == null) continue;
      const trimmed = cell.value.trim();
      if (!trimmed) continue;
      const mapped =
        field === 'category'
          ? coerceVendorProfileCategory(trimmed)
          : field === 'languageHint'
            ? coerceLanguageHint(trimmed)
            : trimmed;
      if (mapped == null) continue;
      if (!best || cell.confidence > best.confidence) {
        best = { value: mapped, confidence: cell.confidence };
      }
    }
    if (best) {
      (merged as Record<(typeof PROFILE_FIELDS)[number], { value: string | null; confidence: number }>)[field] = {
        value: best.value,
        confidence: best.confidence
      };
    }
  }
  return merged;
}

const FOOD_NAME_HINT =
  /\b(cookie|cookies|cake|cakes|bread|sweet|sweets|laddu|halwa|dosa|idli|biryani|curry|snack|snacks|tea|coffee|juice|bakery|chocolate|biscuit|muffin|brownie|samosa|pongal|meal|meals|thali|pizza|burger|pastry|cupcake|rice|dal|atta|flour|sugar|ghee|masala|oil)\b/i;
const RETAIL_NAME_HINT =
  /\b(saree|sarees|shirt|shirts|kurta|dress|fabric|phone|charger|watch|jewellery|jewelry|shoe|shoes|sandal|sandals)\b/i;

/** Last comma segment that looks like a city, not a road or PIN. */
export function inferCityFromAddress(address?: string | null): string | undefined {
  if (!address?.trim()) return undefined;
  const parts = address
    .split(/[,|/]/)
    .map((part) => part.replace(/\b\d{5,6}\b/g, '').trim())
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (part.length < 3 || part.length > 40) continue;
    if (/\d/.test(part)) continue;
    if (/\b(road|rd|street|st|nagar|layout|avenue|cross|lane|block|floor|shop)\b/i.test(part)) continue;
    return part;
  }
  return undefined;
}

/** Fill city from address and category from product names when vision left them empty. */
export function completeVendorProfile(
  profile: MergedVendorProfile,
  productNames: string[]
): MergedVendorProfile {
  const next: MergedVendorProfile = {
    ...profile,
    businessName: { ...profile.businessName },
    category: { ...profile.category },
    address: { ...profile.address },
    city: { ...profile.city },
    hours: { ...profile.hours },
    deliveryNotes: { ...profile.deliveryNotes },
    languageHint: { ...profile.languageHint }
  };

  if (!next.city.value && next.address.value) {
    const city = inferCityFromAddress(next.address.value);
    if (city) {
      next.city = { value: city, confidence: Math.min(next.address.confidence || 0.7, 0.7) };
    }
  }

  if (!next.category.value && productNames.length > 0) {
    const foodHits = productNames.filter((name) => FOOD_NAME_HINT.test(name)).length;
    const retailHits = productNames.filter((name) => RETAIL_NAME_HINT.test(name)).length;
    if (foodHits >= 2 && foodHits > retailHits) {
      next.category = { value: 'Food', confidence: 0.65 };
    } else if (retailHits >= 2 && retailHits > foodHits) {
      next.category = { value: 'Retail', confidence: 0.65 };
    }
  }

  return next;
}

const toPaise = (costUsd: number): number => milliToPaise(usdToMilliFloat(costUsd));

function sumCosts(costs: CostResult[]) {
  const agg = { promptTokens: 0, completionTokens: 0, totalTokens: 0, costPaise: 0, costMilli: 0 };
  for (const c of costs) {
    agg.promptTokens += c.promptTokens;
    agg.completionTokens += c.completionTokens;
    agg.totalTokens += c.totalTokens;
    agg.costPaise += toPaise(c.costUsd);
    agg.costMilli += usdToMilliFloat(c.costUsd);
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
  const pageProfiles: Array<ExtractedVendorProfile | undefined> = Array.from({
    length: input.imageKeys.length
  });
  const sem = new Semaphore(VISION_CONCURRENCY);
  await Promise.allSettled(
    input.imageKeys.map((key, pageIndex) =>
      sem.run(async () => {
        pageProgress[pageIndex].status = 'running';
        catalogImportEventBus.emit(input.jobId, 'page.started', { pageIndex, key });
        try {
          const { buffer, contentType } = await fetchAndValidate(key);
          const { products, vendorProfile, cost } = await callVisionExtraction({
            imageBuffer: buffer,
            contentType,
            category: input.category,
            languageHint: input.languageHint,
            pageIndex,
            maxProducts: input.maxProducts
          });
          visionCosts.push(cost);
          pageProfiles[pageIndex] = vendorProfile;
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
  const capped =
    input.maxProducts && deduped.length > input.maxProducts
      ? [...deduped]
          .sort((a, b) => (b.sourceMeta.confidence ?? 0) - (a.sourceMeta.confidence ?? 0))
          .slice(0, input.maxProducts)
      : deduped;

  const vendorProfile = completeVendorProfile(
    input.imageKeys.length > 0 ? mergeVendorProfiles(pageProfiles) : emptyVendorProfile(),
    capped.map((row) => row.name)
  );

  // -- Enrichment: keywords + customer-facing descriptions ----------------
  const shopContext = shopContextFromVendorProfile(vendorProfile, {
    category: input.category
  });
  const { updated, costs: enrichmentCosts } = await enrichKeywordsBatch(capped, shopContext);
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
    totalPaise: visionAgg.costPaise + enrichmentAgg.costPaise,
    totalMilli: visionAgg.costMilli + enrichmentAgg.costMilli
  };

  return {
    normalizedProducts: updated,
    vendorProfile,
    warnings,
    tokenUsage,
    pageProgress
  };
}
