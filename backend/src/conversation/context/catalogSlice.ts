import type { CandidateMatch } from '../cart/candidateSearch.js';
import type { CompactCatalogEntry, HotSet } from '../types.js';
import { FULL_CATALOG_FAST_PATH_MAX, K_BROWSE } from './catalogContextConfig.js';
import type { TurnContextPlan } from './turnContext.js';

const CONF_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function cartIds(hotSet: Pick<HotSet, 'pendingOrder'>): string[] {
  if (!hotSet.pendingOrder?.items.length) return [];
  return hotSet.pendingOrder.items.map((i) => i.productId);
}

/**
 * Pure slice assembly after optional retrieval (spec §8).
 */
export function buildPromptCatalogSlice(
  fullCatalog: CompactCatalogEntry[],
  plan: TurnContextPlan,
  hotSet: Pick<HotSet, 'pendingOrder' | 'orderHistory'>,
  retrievalMatches: CandidateMatch[]
): CompactCatalogEntry[] {
  const byId = new Map(fullCatalog.map((p) => [p.id, p]));
  const n = fullCatalog.length;

  const useFullFastPath =
    n <= FULL_CATALOG_FAST_PATH_MAX &&
    !plan.omitCatalogTable &&
    (plan.mode === 'product' || plan.mode === 'browse' || plan.mode === 'checkout_fields');

  if (useFullFastPath) {
    return fullCatalog;
  }

  if (plan.mode === 'browse' && n <= 20 && !plan.omitCatalogTable) {
    return fullCatalog;
  }

  if (plan.omitCatalogTable && plan.pinnedProductIds.length === 0 && cartIds(hotSet).length === 0) {
    return [];
  }

  const orderedIds: string[] = [];
  const seen = new Set<string>();

  const pushId = (id: string) => {
    if (!id || seen.has(id) || !byId.has(id)) return;
    seen.add(id);
    orderedIds.push(id);
  };

  for (const id of plan.pinnedProductIds) pushId(id);
  for (const id of cartIds(hotSet)) pushId(id);

  const retrievalSorted = [...retrievalMatches].sort(
    (a, b) => (CONF_RANK[a.confidence] ?? 9) - (CONF_RANK[b.confidence] ?? 9)
  );
  for (const m of retrievalSorted) pushId(m.productId);

  // Generic browse at 21–50 SKUs: stable alphabetical menu when retrieval adds nothing.
  if (plan.mode === 'browse' && orderedIds.length === 0 && n > 20) {
    const alpha = [...fullCatalog].sort((a, b) => a.name.localeCompare(b.name));
    return alpha.slice(0, Math.min(K_BROWSE, n));
  }

  if (orderedIds.length === 0 && !plan.omitCatalogTable && n <= FULL_CATALOG_FAST_PATH_MAX) {
    return fullCatalog;
  }

  return orderedIds.map((id) => byId.get(id)!);
}
