import type { ProductForPricing } from '../types.js';

export type AvailabilityReason = 'out_of_stock' | 'insufficient_stock' | 'below_min_qty' | 'above_max_qty';

export interface AvailabilityResult {
  allowed: boolean;
  reason?: AvailabilityReason;
}

/**
 * Converts a Prisma Decimal (or number/string/null/undefined) to a plain number.
 * `null`/`undefined` mean "no limit" for min/max quantity fields, not zero.
 */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Stock vs made-to-order availability gating (spec §15, Q14).
 * `stock` products reject when out of stock or under the requested quantity.
 * `made_to_order` products are never blocked on stock, but both types still
 * enforce min/max order quantity.
 */
export function checkAvailability(
  product: Pick<ProductForPricing, 'fulfillmentType' | 'inStock' | 'stockQuantity' | 'minOrderQuantity' | 'maxOrderQuantity'>,
  requestedQty: number
): AvailabilityResult {
  if (product.fulfillmentType === 'stock') {
    if (!product.inStock) {
      return { allowed: false, reason: 'out_of_stock' };
    }
    const stockQuantity = toNumber(product.stockQuantity);
    if (stockQuantity !== null && stockQuantity < requestedQty) {
      return { allowed: false, reason: 'insufficient_stock' };
    }
  }

  const minOrderQuantity = toNumber(product.minOrderQuantity);
  if (minOrderQuantity !== null && requestedQty < minOrderQuantity) {
    return { allowed: false, reason: 'below_min_qty' };
  }

  const maxOrderQuantity = toNumber(product.maxOrderQuantity);
  if (maxOrderQuantity !== null && requestedQty > maxOrderQuantity) {
    return { allowed: false, reason: 'above_max_qty' };
  }

  return { allowed: true };
}
