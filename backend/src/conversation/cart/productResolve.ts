import type { Prisma } from '@prisma/client';
import type { ProductForPricing, ProductVariant, CartOp, CompactCatalogEntry } from '../types.js';
import { normalizeVariants, findActiveVariant } from './variants.js';

type TxClient = Prisma.TransactionClient;

/**
 * Resolves a CartOp's `productId` to the Product row CartEngine needs for
 * pricing/availability. Returns null if the product doesn't exist, doesn't
 * belong to this vendor, or is inactive — CartEngine rejects the op rather
 * than trusting an LLM-supplied id blindly (I4: fail closed on cart writes).
 *
 * This is the DB-level guard for CartEngine.apply. A separate hallucination
 * guard against the in-memory compact catalog (validateProductIds) is added
 * in this file when LLM-1 is implemented (spec §13). Keep this file's
 * dependencies minimal (Prisma only) — CartEngine.apply's whole test suite
 * pays for whatever this file imports, so keyword/AI-matching concerns live
 * in cart/candidateSearch.ts instead, not here.
 */
export async function resolveProduct(
  tx: TxClient,
  vendorId: string,
  productId: string
): Promise<ProductForPricing | null> {
  return tx.product.findFirst({
    where: { id: productId, vendorId, isActive: true },
    select: {
      id: true,
      name: true,
      baseUnit: true,
      baseQuantity: true,
      basePrice: true,
      fulfillmentType: true,
      inStock: true,
      stockQuantity: true,
      minOrderQuantity: true,
      maxOrderQuantity: true,
      variants: true
    }
  });
}

/**
 * Resolves a CartOp's `variantSku` against the product's own `variants`
 * (DB-level guard, mirrors resolveProduct's fail-closed pattern, I4). Returns
 * null both when the product has no variants and when it has variants but
 * none match — callers must distinguish those (the latter is a hallucinated
 * sku and the op must be rejected, never silently priced from basePrice).
 */
export function resolveVariant(product: Pick<ProductForPricing, 'variants'>, variantSku: string): ProductVariant | null {
  return findActiveVariant(normalizeVariants(product.variants), variantSku);
}

/**
 * Paise price for one unit (spec §14: "Prices and units come from Product
 * ..., not from the model"). Mirrors the `Math.round(price / baseQuantity)`
 * convention already used by dataExtractionService.ts's mutators. Prices
 * from the resolved variant when given (a product with variants has no
 * meaningful single basePrice per unit), else from the product's own
 * basePrice/baseQuantity as before.
 */
export function computeUnitPricePaise(
  product: Pick<ProductForPricing, 'basePrice' | 'baseQuantity'>,
  variant?: ProductVariant | null
): number {
  if (variant) {
    return Math.round(variant.price / (variant.baseQuantity || 1));
  }
  const baseQty = Number(product.baseQuantity ?? 1) || 1;
  return Math.round(product.basePrice / baseQty);
}

/**
 * Hallucination guard against the in-memory compact catalog (spec §13:
 * "productId must come from the compact catalog or keyword search... never
 * write a fuzzy unmatched line into Order.items"). This runs right after
 * LLM-1 returns, before ops ever reach CartEngine — cheap, dependency-free
 * (no DB call), so bad ops don't even make it to the pipeline. `resolveProduct`
 * above is still CartEngine.apply's own, stronger, DB-level backstop (I4) —
 * this is a defense-in-depth pass, not a replacement for it.
 */
export function validateProductIds(
  ops: CartOp[],
  compactCatalog: CompactCatalogEntry[]
): { valid: CartOp[]; invalid: CartOp[] } {
  const catalogById = new Map(compactCatalog.map((p) => [p.id, p]));
  // Only products that actually have variants require a matching sku — a
  // plain single-price product's ops correctly carry variantSku: null.
  const variantSkusByProduct = new Map(compactCatalog.map((p) => [p.id, new Set(p.variants.map((v) => v.sku))]));

  const valid: CartOp[] = [];
  const invalid: CartOp[] = [];

  for (const op of ops) {
    const referencesProduct = op.type === 'add' || op.type === 'set_qty' || op.type === 'remove';
    if (!referencesProduct) {
      valid.push(op);
      continue;
    }
    const product = catalogById.get(op.productId);
    if (!product) {
      invalid.push(op);
      continue;
    }
    const requiredSkus = variantSkusByProduct.get(op.productId);
    const hasVariants = requiredSkus && requiredSkus.size > 0;
    const missingOrInvalidSku = !op.variantSku || !requiredSkus!.has(op.variantSku);
    // Hallucination guard (spec §13, same rationale as productId above):
    // a product that has variants normally has no meaningful single price,
    // so an op naming an unrecognized (or missing) variantSku for it must be
    // dropped here rather than reaching CartEngine, which would otherwise be
    // the only backstop against a fabricated size/material.
    //
    // Exception (2026-09-04 incident): a product can be sold BOTH loose by
    // its base unit (isDivisible: true — e.g. by weight in kg) AND as fixed
    // variants (e.g. pre-packed boxes). For such a product, omitting
    // variantSku is a legitimate "add by base unit" op, not a hallucination
    // — only an explicitly wrong/invented variantSku is still rejected below.
    if (hasVariants && missingOrInvalidSku) {
      const baseOrderableWithNoSku = !op.variantSku && product.isDivisible;
      if (!baseOrderableWithNoSku) {
        invalid.push(op);
        continue;
      }
    }
    valid.push(op);
  }

  return { valid, invalid };
}
