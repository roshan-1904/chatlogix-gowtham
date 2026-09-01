import { describe, it, expect, vi, beforeEach } from 'vitest';

// prefetchHotSet runs 6 independent Redis-first/Postgres-fallback lookups —
// mock both layers so we can assert cache-hit vs cache-miss behavior and the
// Decimal-to-number/legacy-field mapping without a real DB or Redis.

const cacheStore = new Map<string, unknown>();

const getCachedMock = vi.fn(async (key: string) => (cacheStore.has(key) ? cacheStore.get(key) : null));
const setCachedMock = vi.fn(async (key: string, value: unknown, _ttlSeconds: number) => {
  cacheStore.set(key, value);
});
const deleteCachedMock = vi.fn(async (key: string) => {
  cacheStore.delete(key);
});

vi.mock('../../utils/redis.js', () => ({
  getCached: (...args: [string]) => getCachedMock(...args),
  setCached: (...args: [string, unknown, number]) => setCachedMock(...args),
  deleteCached: (...args: [string]) => deleteCachedMock(...args)
}));

const vendorFindUnique = vi.fn();
const productFindMany = vi.fn();
const conversationMemoryFindUnique = vi.fn();
const customerInsightsFindUnique = vi.fn();
const messageFindMany = vi.fn();
const orderFindFirst = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) },
    product: { findMany: (...args: unknown[]) => productFindMany(...args) },
    conversationMemory: { findUnique: (...args: unknown[]) => conversationMemoryFindUnique(...args) },
    customerInsights: { findUnique: (...args: unknown[]) => customerInsightsFindUnique(...args) },
    message: { findMany: (...args: unknown[]) => messageFindMany(...args) },
    order: { findFirst: (...args: unknown[]) => orderFindFirst(...args) }
  }
}));

import { prefetchHotSet, invalidateCompactCatalog } from '../prefetch.js';

const VENDOR_ID = 'vendor-1';
const CONVERSATION_ID = 'conv-1';
const CUSTOMER_ID = 'customer-1';

beforeEach(() => {
  vi.clearAllMocks();
  cacheStore.clear();

  vendorFindUnique.mockResolvedValue({
    id: VENDOR_ID,
    businessName: 'Test Bakery',
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
    aiModel: null,
    askForPreferredDeliveryDate: false
  });
  productFindMany.mockResolvedValue([]);
  conversationMemoryFindUnique.mockResolvedValue(null);
  customerInsightsFindUnique.mockResolvedValue(null);
  messageFindMany.mockResolvedValue([]);
  orderFindFirst.mockResolvedValue(null);
});

describe('prefetchHotSet', () => {
  it('falls back to Postgres on a cache miss and applies the aiModel fallback (Q10)', async () => {
    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID);

    expect(vendorFindUnique).toHaveBeenCalledTimes(1);
    expect(hotSet.vendorConfig.aiModel).toBe('gpt-4.1-mini'); // aiModel was null on the fetched vendor
    expect(setCachedMock).toHaveBeenCalledWith('vendor:vendor-1:config', expect.any(Object), 600);
  });

  it('serves a subsequent call from cache without hitting Postgres again', async () => {
    await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID);
    vendorFindUnique.mockClear();
    productFindMany.mockClear();

    await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID);

    expect(vendorFindUnique).not.toHaveBeenCalled();
    expect(productFindMany).not.toHaveBeenCalled();
  });

  it('converts Decimal-typed min/max/stock quantities to plain numbers in the compact catalog', async () => {
    productFindMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Brownie',
        basePrice: 10000,
        baseUnit: 'box',
        minOrderQuantity: { toString: () => '2' }, // Decimal-like stub
        maxOrderQuantity: null,
        keywords: ['brownie'],
        fulfillmentType: 'made_to_order',
        inStock: true,
        stockQuantity: null
      }
    ]);

    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID);

    expect(hotSet.compactCatalog).toEqual([
      {
        id: 'prod-1',
        name: 'Brownie',
        price: 10000,
        unit: 'box',
        minQty: 2,
        maxQty: null,
        keywords: ['brownie'],
        fulfillmentType: 'made_to_order',
        inStock: true,
        stockQuantity: null
      }
    ]);
  });

  it('prefers primaryDeliveryAddress over deliveryAddress on CustomerInsights', async () => {
    customerInsightsFindUnique.mockResolvedValue({
      customerName: 'Priya',
      primaryDeliveryAddress: '123 Main St',
      deliveryAddress: 'Old address',
      preferredLanguage: 'ta'
    });

    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID);

    expect(hotSet.insights).toEqual({ name: 'Priya', address: '123 Main St', language: 'ta' });
  });

  it('returns recent messages in chronological order, mapping senderType to role', async () => {
    messageFindMany.mockResolvedValue([
      { senderType: 'assistant', content: 'newest' },
      { senderType: 'customer', content: 'oldest' }
    ]); // findMany returns newest-first (orderBy timestamp desc)

    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID);

    expect(hotSet.recentMessages).toEqual([
      { role: 'customer', content: 'oldest' },
      { role: 'assistant', content: 'newest' }
    ]);
  });

  it('invalidateCompactCatalog deletes exactly the compact-catalog key', async () => {
    await invalidateCompactCatalog(VENDOR_ID);
    expect(deleteCachedMock).toHaveBeenCalledWith('vendor:vendor-1:catalog_compact');
  });
});
