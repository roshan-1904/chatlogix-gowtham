import { searchCandidateProductsMany } from '../cart/candidateSearch.js';
import type { CompactCatalogEntry, HotSet } from '../types.js';
import { logCount } from '../metrics.js';
import { logger } from '../../logger.js';
import {
  CATALOG_SLICING_ENABLED,
  CATALOG_SLICING_SHADOW_LOG,
  SANDBOX_VENDOR_IDS
} from './catalogContextConfig.js';
import { buildPromptCatalogSlice } from './catalogSlice.js';
import { planTurnContext, type TurnContextPlan } from './turnContext.js';

export interface CatalogContextForLlm1 {
  plan: TurnContextPlan;
  /** Slice used for LLM-1 prompt + validateProductIds; may equal full catalog when slicing off. */
  catalogSlice: CompactCatalogEntry[];
  /** When shadow mode: slice computed but prompt may still use full catalog. */
  promptCatalogSlice: CompactCatalogEntry[];
}

function slicingActiveForVendor(vendorId: string): boolean {
  if (CATALOG_SLICING_ENABLED) return true;
  if (SANDBOX_VENDOR_IDS.length > 0 && SANDBOX_VENDOR_IDS.includes(vendorId)) return true;
  return false;
}

export async function resolveCatalogContextForLlm1(input: {
  vendorId: string;
  mergedContent: string;
  hotSet: HotSet;
  traceId: string;
  whatsappMessageId?: string;
}): Promise<CatalogContextForLlm1> {
  const { vendorId, mergedContent, hotSet, traceId } = input;
  const fullCatalog = hotSet.compactCatalog;
  const plan = planTurnContext({ mergedContent, hotSet, traceId });

  const language = hotSet.memory?.language ?? hotSet.insights?.preferredLanguage ?? null;

  const computeSlice = async (): Promise<CompactCatalogEntry[]> => {
    let retrievalMatches: Awaited<ReturnType<typeof searchCandidateProductsMany>> = [];
    if (plan.retrievalTopK > 0) {
      retrievalMatches = await searchCandidateProductsMany(vendorId, plan.retrievalQuery, fullCatalog, {
        language,
        topK: plan.retrievalTopK
      });
      logCount('RetrievalHitCount', { vendorId, mode: plan.mode }, retrievalMatches.length);
      if (retrievalMatches.length === 0) {
        logCount('RetrievalZeroHit', { vendorId, mode: plan.mode });
      }
    }
    return buildPromptCatalogSlice(fullCatalog, plan, hotSet, retrievalMatches);
  };

  const slicingOn = slicingActiveForVendor(vendorId);
  const shouldCompute = slicingOn || CATALOG_SLICING_SHADOW_LOG;

  let catalogSlice = fullCatalog;
  let promptCatalogSlice = fullCatalog;

  if (shouldCompute) {
    catalogSlice = await computeSlice();
    promptCatalogSlice = catalogSlice;

    if (CATALOG_SLICING_SHADOW_LOG && !slicingOn) {
      promptCatalogSlice = fullCatalog;
      logger.info(
        {
          traceId,
          vendorId,
          mode: plan.mode,
          fullCatalogSize: fullCatalog.length,
          shadowSliceSize: catalogSlice.length,
          omitCatalogTable: plan.omitCatalogTable
        },
        'catalog slicing shadow: computed slice, prompt uses full catalog'
      );
    }
  }

  logCount('CatalogFullSize', { vendorId }, fullCatalog.length);
  logCount('CatalogSliceSize', { vendorId, mode: plan.mode }, catalogSlice.length);
  logCount('TurnContextMode', { mode: plan.mode });

  return { plan, catalogSlice, promptCatalogSlice };
}
