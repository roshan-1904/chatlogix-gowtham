import { describe, it, expect, vi, beforeEach } from 'vitest';

const findBestProductMatchMock = vi.fn();
vi.mock('../../utils/productMatcher.js', () => ({
  findBestProductMatch: (...args: unknown[]) => findBestProductMatchMock(...args)
}));

const emitMetricMock = vi.fn();
vi.mock('../../observability/metrics.js', () => ({
  emitMetric: (...args: unknown[]) => emitMetricMock(...args)
}));

import { searchCandidateProducts, searchCandidateProductsMany } from '../cart/candidateSearch.js';
import type { CompactCatalogEntry } from '../types.js';

const catalog: CompactCatalogEntry[] = [
  {
    id: 'p1',
    name: 'Brownie',
    price: 10000,
    unit: 'box',
    baseQuantity: 1,
    minQty: null,
    maxQty: null,
    keywords: ['brownie'],
    fulfillmentType: 'made_to_order',
    inStock: true,
    stockQuantity: null,
    variants: [],
    description: '',
    isDivisible: true,
    imageCount: 0,
    videoCount: 0,
    mediaLabels: []
  }
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('searchCandidateProducts', () => {
  it('returns the match without emitting a metric when found', async () => {
    findBestProductMatchMock.mockResolvedValue({ product: { id: 'p1' }, matchedName: 'Brownie', confidence: 'high' });

    const result = await searchCandidateProducts('vendor-1', 'brownie', catalog, 'en');

    expect(result).toEqual({ productId: 'p1', name: 'Brownie', confidence: 'high' });
    expect(emitMetricMock).not.toHaveBeenCalled();
  });

  it('emits ProductMatchMiss on a miss for a non-English query (§11 Day-1 requirement)', async () => {
    findBestProductMatchMock.mockResolvedValue(null);

    const result = await searchCandidateProducts('vendor-1', 'brownie in tamil', catalog, 'ta');

    expect(result).toBeNull();
    expect(emitMetricMock).toHaveBeenCalledWith('ProductMatchMiss', 1, {
      dimensions: { language: 'ta', processor: 'conversation-v1' }
    });
  });

  it('does not emit a metric on a miss for an English query', async () => {
    findBestProductMatchMock.mockResolvedValue(null);

    await searchCandidateProducts('vendor-1', 'nonexistent thing', catalog, 'en');

    expect(emitMetricMock).not.toHaveBeenCalled();
  });

  it('searchCandidateProductsMany merges segments and caps topK', async () => {
    findBestProductMatchMock
      .mockResolvedValueOnce({ product: { id: 'p1' }, matchedName: 'Brownie', confidence: 'high' })
      .mockResolvedValue(null);

    const result = await searchCandidateProductsMany('vendor-1', 'brownie and cookie', catalog, { language: 'en', topK: 2 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(findBestProductMatchMock.mock.calls.some((c) => c[2]?.enableAIMatching === false)).toBe(true);
  });

  it('enables AI multi-language matching only for non-English queries', async () => {
    findBestProductMatchMock.mockResolvedValue(null);

    await searchCandidateProducts('vendor-1', 'brownie', catalog, 'en');
    expect(findBestProductMatchMock).toHaveBeenCalledWith('brownie', expect.any(Array), expect.objectContaining({ enableAIMatching: false }));

    await searchCandidateProducts('vendor-1', 'brownie-ta', catalog, 'ta');
    expect(findBestProductMatchMock).toHaveBeenCalledWith('brownie-ta', expect.any(Array), expect.objectContaining({ enableAIMatching: true }));
  });
});
