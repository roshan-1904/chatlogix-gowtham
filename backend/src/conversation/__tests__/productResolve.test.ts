import { describe, it, expect } from 'vitest';
import { computeUnitPricePaise, resolveVariant, validateProductIds } from '../cart/productResolve.js';
import type { CompactCatalogEntry } from '../types.js';

describe('computeUnitPricePaise', () => {
  it('divides basePrice by baseQuantity', () => {
    expect(computeUnitPricePaise({ basePrice: 10000, baseQuantity: 2 })).toBe(5000);
  });

  it('treats a missing/zero baseQuantity as 1', () => {
    expect(computeUnitPricePaise({ basePrice: 10000, baseQuantity: 0 })).toBe(10000);
  });

  it('prices from the given variant instead of the product basePrice', () => {
    const variant = { sku: 'SS-7X7', label: 'SS 7x7', attributes: {}, unit: 'unit', baseQuantity: 1, price: 179900, isDivisible: false, isActive: true };
    expect(computeUnitPricePaise({ basePrice: 129900, baseQuantity: 1 }, variant)).toBe(179900);
  });
});

describe('resolveVariant', () => {
  const product = {
    variants: [
      { sku: 'KD-7X7', label: 'Kadai 7x7', attributes: {}, unit: 'unit', baseQuantity: 1, price: 129900, isDivisible: false, isActive: true },
      { sku: 'SS-7X7', label: 'SS 7x7', attributes: {}, unit: 'unit', baseQuantity: 1, price: 179900, isDivisible: false, isActive: false }
    ]
  };

  it('finds an active variant by exact sku', () => {
    expect(resolveVariant(product, 'KD-7X7')?.price).toBe(129900);
  });

  it('returns null for a sku that does not exist (the hallucinated-size case)', () => {
    expect(resolveVariant(product, 'SS-4X6')).toBeNull();
  });

  it('returns null for an inactive variant', () => {
    expect(resolveVariant(product, 'SS-7X7')).toBeNull();
  });
});

describe('validateProductIds — variantSku hallucination guard', () => {
  const catalog: CompactCatalogEntry[] = [
    {
      id: 'prod-tin',
      name: 'Premium Baking Tin',
      price: 129900,
      unit: 'unit',
      minQty: null,
      maxQty: null,
      keywords: [],
      fulfillmentType: 'made_to_order',
      inStock: true,
      stockQuantity: null,
      variants: [{ sku: 'SS-7X7', label: 'SS 7x7', attributes: {}, unit: 'unit', baseQuantity: 1, price: 179900, isDivisible: false, isActive: true }],
      description: ''
    }
  ];

  it('drops an add op for a variant-bearing product with no variantSku', () => {
    const { valid, invalid } = validateProductIds([{ type: 'add', productId: 'prod-tin', qty: 1 }], catalog);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('drops an add op naming a variantSku not in the catalog (e.g. an invented "4x6")', () => {
    const { valid, invalid } = validateProductIds([{ type: 'add', productId: 'prod-tin', qty: 1, variantSku: 'SS-4X6' }], catalog);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(1);
  });

  it('keeps an add op naming a real variantSku', () => {
    const { valid, invalid } = validateProductIds([{ type: 'add', productId: 'prod-tin', qty: 1, variantSku: 'SS-7X7' }], catalog);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(0);
  });
});
