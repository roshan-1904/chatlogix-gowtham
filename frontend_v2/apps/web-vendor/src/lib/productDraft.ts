import type { NormalizedProductDraft } from '../types/catalogImport';

export const ONBOARDING_DEMO_PRODUCT_LIMIT = 10;

export function createManualProductDraft(
  patch: Partial<NormalizedProductDraft> = {}
): NormalizedProductDraft {
  return {
    rowId: crypto.randomUUID(),
    name: '',
    description: '',
    basePrice: null,
    baseUnit: 'piece',
    baseQuantity: 1,
    isDivisible: false,
    isActive: true,
    keywords: [],
    overrideProtected: false,
    sourceMeta: {
      source: 'manual',
      confidence: 1,
      fieldConfidence: {},
      warnings: [],
    },
    ...patch,
  };
}

export function committableProducts(drafts: NormalizedProductDraft[]): NormalizedProductDraft[] {
  return drafts
    .filter((d) => d.name.trim().length > 0 && d.baseUnit.trim().length > 0 && d.baseQuantity > 0)
    .slice(0, ONBOARDING_DEMO_PRODUCT_LIMIT);
}

export function limitDemoProducts(drafts: NormalizedProductDraft[]): NormalizedProductDraft[] {
  if (drafts.length <= ONBOARDING_DEMO_PRODUCT_LIMIT) return drafts;
  return [...drafts]
    .sort((a, b) => (b.sourceMeta.confidence ?? 0) - (a.sourceMeta.confidence ?? 0))
    .slice(0, ONBOARDING_DEMO_PRODUCT_LIMIT);
}

/** Paise at or above this look like rupees that were multiplied by 100 twice (₹5,000+). */
const INFLATED_PAISE_FLOOR = 500_000;

/**
 * Brochure extraction sometimes returns paise, then coercion multiplies by 100 again.
 * If every priced row looks like that (₹5,000+ and a round 100-rupee step), divide back.
 */
export function repairInflatedCatalogPrices(
  drafts: NormalizedProductDraft[]
): NormalizedProductDraft[] {
  const priced = drafts.filter((d) => d.basePrice != null && d.basePrice > 0);
  if (priced.length === 0) return drafts;
  const looksDoubleConverted = priced.every(
    (d) => d.basePrice! >= INFLATED_PAISE_FLOOR && d.basePrice! % 10_000 === 0
  );
  if (!looksDoubleConverted) return drafts;
  return drafts.map((d) =>
    d.basePrice != null && d.basePrice > 0
      ? { ...d, basePrice: Math.round(d.basePrice / 100) }
      : d
  );
}
