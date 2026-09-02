import type { ProductVariant } from '../types.js';

/**
 * Normalizes raw `Product.variants` Json into `ProductVariant[]`, tolerating
 * rows written before routes/products.ts's VariantSchema made `sku`/`label`
 * optional-but-recommended: a variant missing `sku` gets a synthetic
 * `${index}` one so LLM-1's VARIANTS table (prompts.ts) always has a stable,
 * referenceable id per row — CartOp.variantSku must always be able to name
 * an exact row, never a guess.
 */
export function normalizeVariants(raw: unknown): ProductVariant[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v: any, index: number) => {
    const attributes = v?.attributes && typeof v.attributes === 'object' ? v.attributes : {};
    const sku = typeof v?.sku === 'string' && v.sku.length > 0 ? v.sku : `v${index}`;
    const label =
      typeof v?.label === 'string' && v.label.length > 0
        ? v.label
        : Object.values(attributes).join(' ') || sku;
    return {
      sku,
      label,
      attributes,
      unit: typeof v?.unit === 'string' ? v.unit : '',
      baseQuantity: Number(v?.baseQuantity) || 1,
      price: Number(v?.price) || 0,
      isDivisible: Boolean(v?.isDivisible),
      isActive: v?.isActive !== false
    };
  });
}

/** Active-only lookup by exact sku — CartEngine fails closed (I4) if this returns null for a variant-bearing product. */
export function findActiveVariant(variants: ProductVariant[], sku: string): ProductVariant | null {
  return variants.find((v) => v.isActive && v.sku === sku) ?? null;
}
