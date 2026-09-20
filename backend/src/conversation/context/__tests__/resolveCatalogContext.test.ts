import { describe, it, expect, vi, beforeEach } from 'vitest';

const searchManyMock = vi.fn();
vi.mock('../../cart/candidateSearch.js', () => ({
  searchCandidateProductsMany: (...args: unknown[]) => searchManyMock(...args)
}));

vi.mock('../../metrics.js', () => ({
  logCount: vi.fn()
}));

import { resolveCatalogContextForLlm1 } from '../resolveCatalogContext.js';
import type { HotSet } from '../../types.js';

function hotSetWithCatalog(n: number): HotSet {
  const compactCatalog = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Item ${i}`,
    price: 100,
    unit: 'pc',
    baseQuantity: 1,
    minQty: null,
    maxQty: null,
    keywords: [],
    fulfillmentType: 'stock' as const,
    inStock: true,
    stockQuantity: null,
    variants: [],
    description: '',
    isDivisible: true,
    imageCount: 0,
    videoCount: 0,
    mediaLabels: []
  }));
  return {
    vendorConfig: {
      id: 'v1',
      businessName: 'T',
      aiBotName: null,
      aiPersonality: null,
      aiSystemPrompt: null,
      aiGreeting: null,
      aiClosing: null,
      aiToneExample: null,
      aiContentResponsibilities: null,
      aiContentConversationRules: null,
      aiContentImportantInstructions: null,
      aiDeliveryInstructions: null,
      aiPickupDeliveryAddress: null,
      orderPreparationConfig: null,
      timezone: 'Asia/Kolkata',
      aiModel: 'gpt-5.6-luna',
      askForPreferredDeliveryDate: false
    },
    compactCatalog,
    memory: null,
    pendingOrder: null,
    orderHistory: [],
    faqs: [],
    insights: null,
    recentMessages: []
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchManyMock.mockResolvedValue([]);
});

describe('resolveCatalogContextForLlm1', () => {
  it('returns full catalog when slicing disabled', async () => {
    const hotSet = hotSetWithCatalog(30);
    const result = await resolveCatalogContextForLlm1({
      vendorId: 'v1',
      mergedContent: '2 chocolate cakes',
      hotSet,
      traceId: 't1'
    });
    expect(result.catalogSlice.length).toBe(30);
    expect(result.promptCatalogSlice.length).toBe(30);
    expect(searchManyMock).not.toHaveBeenCalled();
  });
});
