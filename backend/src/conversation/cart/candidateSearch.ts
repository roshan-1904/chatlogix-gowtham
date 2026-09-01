import { findBestProductMatch } from '../../utils/productMatcher.js';
import { emitMetric } from '../../observability/metrics.js';
import type { CompactCatalogEntry } from '../types.js';

export interface CandidateMatch {
  productId: string;
  name: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Keyword/fuzzy/AI-multilingual candidate search against the compact catalog
 * (spec §11: "top 8-15 rows into the prompt or a search_products tool") —
 * grounding for LLM-1's prompt, not a write path. Reuses
 * `productMatcher.findBestProductMatch`, which already has an AI
 * multi-language fallback in production, rather than reinventing matching.
 *
 * Deliberately kept out of cart/productResolve.ts: `findBestProductMatch`
 * pulls in cacheStrategy.js -> redis.js (a real Redis connection at import
 * time) and config/env.js, which CartEngine.apply's own tests have no
 * business paying for.
 *
 * Emits `ProductMatchMiss{language}` on a miss for a non-English query — a
 * Day-1 requirement (§11), not deferred to "later if names miss too often":
 * this is how the eventual embeddings decision gets made from real fleet
 * data instead of anecdote.
 */
export async function searchCandidateProducts(
  vendorId: string,
  query: string,
  catalog: CompactCatalogEntry[],
  language?: string | null
): Promise<CandidateMatch | null> {
  const products = catalog.map((c) => ({ id: c.id, name: c.name, keywords: c.keywords }));
  const isNonEnglish = Boolean(language && language !== 'en');

  const match = await findBestProductMatch(query, products, {
    enableFuzzy: true,
    enableAIMatching: isNonEnglish,
    customerLanguage: language ?? undefined,
    vendorId
  });

  if (!match && isNonEnglish) {
    emitMetric('ProductMatchMiss', 1, { dimensions: { language: language ?? 'unknown', processor: 'conversation-v1' } });
  }

  if (!match) return null;
  return { productId: match.product.id, name: match.matchedName, confidence: match.confidence };
}
