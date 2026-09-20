import { describe, it, expect } from 'vitest';
import type { CartSnapshot, CompactCatalogEntry } from '../../types.js';
import type { CandidateMatch } from '../../cart/candidateSearch.js';
import { buildPromptCatalogSlice } from '../catalogSlice.js';
import type { TurnContextPlan } from '../turnContext.js';

function compactProduct(id: string, name: string, description = ''): CompactCatalogEntry {
  return {
    id,
    name,
    price: 10000,
    unit: 'box',
    baseQuantity: 1,
    minQty: null,
    maxQty: null,
    keywords: [],
    fulfillmentType: 'made_to_order',
    inStock: true,
    stockQuantity: null,
    variants: [],
    description,
    isDivisible: true,
    imageCount: 0,
    videoCount: 0,
    mediaLabels: []
  };
}

function catalog(n: number): CompactCatalogEntry[] {
  return Array.from({ length: n }, (_, i) =>
    compactProduct(`p${i + 1}`, `Product ${String.fromCharCode(90 - i)}`, 'x'.repeat(300))
  );
}

function pendingWithProducts(...productIds: string[]): CartSnapshot {
  const items = productIds.map((productId) => ({
    productId,
    name: productId,
    quantity: 1,
    unit: 'box',
    unitPricePaise: 100,
    lineTotalPaise: 100
  }));
  return {
    orderId: 'o1',
    status: 'pending',
    items,
    totalPaise: items.length * 100,
    customerName: null,
    address: null,
    missing: ['name', 'address']
  };
}

describe('buildPromptCatalogSlice', () => {
  it('fast path returns full catalog when n <= 12', () => {
    const full = catalog(10);
    const plan: TurnContextPlan = {
      mode: 'product',
      retrievalQuery: 'brownie',
      retrievalTopK: 0,
      omitCatalogTable: false,
      pinnedProductIds: [],
      reasons: []
    };
    const slice = buildPromptCatalogSlice(full, plan, { pendingOrder: null, orderHistory: [] }, []);
    expect(slice).toHaveLength(10);
    expect(slice.map((p) => p.id)).toEqual(full.map((p) => p.id));
  });

  it('browse at n=45 with no retrieval uses alphabetical top-K', () => {
    const full = catalog(45);
    const plan: TurnContextPlan = {
      mode: 'browse',
      retrievalQuery: 'menu',
      retrievalTopK: 25,
      omitCatalogTable: false,
      pinnedProductIds: [],
      reasons: ['browse_phrase']
    };
    const slice = buildPromptCatalogSlice(full, plan, { pendingOrder: null, orderHistory: [] }, []);
    expect(slice.length).toBe(25);
    const names = slice.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('checkout slice keeps cart product ids only when small catalog', () => {
    const full = catalog(18);
    const plan: TurnContextPlan = {
      mode: 'checkout_fields',
      retrievalQuery: 'my address is 12 main st',
      retrievalTopK: 0,
      omitCatalogTable: false,
      pinnedProductIds: ['p3', 'p7'],
      reasons: ['checkout_fields']
    };
    const slice = buildPromptCatalogSlice(
      full,
      plan,
      {
        pendingOrder: pendingWithProducts('p3'),
        orderHistory: []
      },
      []
    );
    expect(slice.map((p) => p.id)).toEqual(['p3', 'p7']);
  });

  it('dedupes pinned, cart, and retrieval ids', () => {
    const full = catalog(30);
    const plan: TurnContextPlan = {
      mode: 'product',
      retrievalQuery: 'cake',
      retrievalTopK: 12,
      omitCatalogTable: false,
      pinnedProductIds: ['p1'],
      reasons: []
    };
    const match: CandidateMatch = { productId: 'p1', name: 'Product Z', confidence: 'high' };
    const slice = buildPromptCatalogSlice(
      full,
      plan,
      {
        pendingOrder: pendingWithProducts('p1'),
        orderHistory: []
      },
      [match]
    );
    expect(slice.filter((p) => p.id === 'p1')).toHaveLength(1);
  });
});
