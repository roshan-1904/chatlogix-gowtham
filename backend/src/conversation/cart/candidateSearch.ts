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

const MULTI_SEGMENT_DELIMITERS = /\s+and\s+|\s*&\s*|,\s*|\s+\+\s+|மற்றும்|और/gi;

function splitRetrievalSegments(query: string): string[] {
  const parts = query
    .split(MULTI_SEGMENT_DELIMITERS)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [query.trim()];
}

function segmentGraphemeLength(segment: string): number {
  return [...segment].length;
}

async function matchOneSegment(
  vendorId: string,
  segment: string,
  catalog: CompactCatalogEntry[],
  language: string | null | undefined,
  allowAi: boolean
): Promise<CandidateMatch | null> {
  const products = catalog.map((c) => ({ id: c.id, name: c.name, keywords: c.keywords }));
  const isNonEnglish = Boolean(language && language !== 'en');

  const tryMatch = async (enableAIMatching: boolean) => {
    const match = await findBestProductMatch(segment, products, {
      enableFuzzy: true,
      enableAIMatching,
      customerLanguage: language ?? undefined,
      vendorId
    });
    if (!match) return null;
    return { productId: match.product.id, name: match.matchedName, confidence: match.confidence };
  };

  const fuzzyOnly = await tryMatch(false);
  if (fuzzyOnly) return fuzzyOnly;

  if (allowAi && isNonEnglish && segmentGraphemeLength(segment) >= 2) {
    const withAi = await tryMatch(true);
    if (withAi) return withAi;
  }

  if (isNonEnglish && !fuzzyOnly) {
    emitMetric('ProductMatchMiss', 1, { dimensions: { language: language ?? 'unknown', processor: 'conversation-v1' } });
  }

  return null;
}

/**
 * Top-K product retrieval for pre–LLM-1 catalog slicing (spec §7).
 */
export async function searchCandidateProductsMany(
  vendorId: string,
  query: string,
  catalog: CompactCatalogEntry[],
  options?: {
    language?: string | null;
    topK?: number;
    minConfidence?: 'high' | 'medium' | 'low';
  }
): Promise<CandidateMatch[]> {
  const topK = options?.topK ?? 12;
  const language = options?.language ?? null;
  const allowAi = true;

  const segments = splitRetrievalSegments(query);
  const queries = [...new Set([query.trim(), ...segments].filter(Boolean))];

  const bestById = new Map<string, CandidateMatch>();
  const rank = { high: 0, medium: 1, low: 2 };

  for (const q of queries) {
    const hit = await matchOneSegment(vendorId, q, catalog, language, allowAi);
    if (!hit) continue;
    const existing = bestById.get(hit.productId);
    if (!existing || rank[hit.confidence] < rank[existing.confidence]) {
      bestById.set(hit.productId, hit);
    }
  }

  const merged = [...bestById.values()].sort((a, b) => rank[a.confidence] - rank[b.confidence]);
  const minConf = options?.minConfidence;
  const filtered = minConf
    ? merged.filter((m) => rank[m.confidence] <= rank[minConf])
    : merged;

  return filtered.slice(0, Math.min(topK, catalog.length));
}
