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
const productUpdate = vi.fn();
const transactionMock = vi.fn(async (arg: unknown) => {
  if (Array.isArray(arg)) return Promise.all(arg);
  throw new Error('unexpected $transaction shape');
});
const conversationMemoryFindUnique = vi.fn();
const customerInsightsFindUnique = vi.fn();
const messageFindMany = vi.fn();
const orderFindFirst = vi.fn();
const orderFindMany = vi.fn();
const customerPaymentFindMany = vi.fn();
const paymentLinkFindMany = vi.fn();
const orderAuditLogFindMany = vi.fn();
const faqCount = vi.fn();
const queryRaw = vi.fn();
const productMediaFindMany = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) },
    product: {
      findMany: (...args: unknown[]) => productFindMany(...args),
      update: (...args: unknown[]) => productUpdate(...args)
    },
    productMedia: { findMany: (...args: unknown[]) => productMediaFindMany(...args) },
    $transaction: (arg: unknown) => transactionMock(arg),
    conversationMemory: { findUnique: (...args: unknown[]) => conversationMemoryFindUnique(...args) },
    customerInsights: { findUnique: (...args: unknown[]) => customerInsightsFindUnique(...args) },
    message: { findMany: (...args: unknown[]) => messageFindMany(...args) },
    order: {
      findFirst: (...args: unknown[]) => orderFindFirst(...args),
      findMany: (...args: unknown[]) => orderFindMany(...args)
    },
    customerPayment: { findMany: (...args: unknown[]) => customerPaymentFindMany(...args) },
    paymentLink: { findMany: (...args: unknown[]) => paymentLinkFindMany(...args) },
    orderAuditLog: { findMany: (...args: unknown[]) => orderAuditLogFindMany(...args) },
    faq: { count: (...args: unknown[]) => faqCount(...args) },
    // Tagged-template mock: prefetch.ts calls prisma.$queryRaw`...` — a plain
    // vi.fn() can't be invoked as a tag function, so wrap it.
    $queryRaw: (...args: unknown[]) => queryRaw(...args)
  }
}));

const embedTextMock = vi.fn();

vi.mock('../faq/embedding.js', () => ({
  embedText: (...args: unknown[]) => embedTextMock(...args),
  toVectorLiteral: (embedding: number[]) => `[${embedding.join(',')}]`
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { prefetchHotSet, invalidateCompactCatalog, invalidateFaqs } from '../prefetch.js';

const VENDOR_ID = 'vendor-1';
const CONVERSATION_ID = 'conv-1';
const CUSTOMER_ID = 'customer-1';
const MESSAGE_TEXT = 'do you deliver on Sundays?';

beforeEach(() => {
  vi.clearAllMocks();
  cacheStore.clear();
  productMediaFindMany.mockResolvedValue([]);
  faqCount.mockResolvedValue(0);
  embedTextMock.mockResolvedValue(null);
  queryRaw.mockResolvedValue([]);

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
  productUpdate.mockResolvedValue({ id: 'prod-1' });
  conversationMemoryFindUnique.mockResolvedValue(null);
  customerInsightsFindUnique.mockResolvedValue(null);
  messageFindMany.mockResolvedValue([]);
  orderFindFirst.mockResolvedValue(null);
  orderFindMany.mockResolvedValue([]);
  customerPaymentFindMany.mockResolvedValue([]);
  paymentLinkFindMany.mockResolvedValue([]);
  orderAuditLogFindMany.mockResolvedValue([]);
});

describe('prefetchHotSet', () => {
  it('falls back to Postgres on a cache miss and applies the aiModel fallback (Q10)', async () => {
    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

    expect(vendorFindUnique).toHaveBeenCalledTimes(1);
    expect(hotSet.orderPaymentStatuses).toEqual([]);
    expect(hotSet.vendorConfig.aiModel).toBe('gpt-5.6-luna'); // aiModel was null on the fetched vendor
    expect(setCachedMock).toHaveBeenCalledWith('vendor:vendor-1:config', expect.any(Object), 600);
  });

  it('serves a subsequent call from cache without hitting Postgres again', async () => {
    await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);
    vendorFindUnique.mockClear();
    productFindMany.mockClear();

    await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

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
        baseQuantity: 1,
        minOrderQuantity: { toString: () => '2' }, // Decimal-like stub
        maxOrderQuantity: null,
        keywords: ['brownie'],
        fulfillmentType: 'made_to_order',
        inStock: true,
        stockQuantity: null,
        variants: [],
        description: '',
        isDivisible: false
      }
    ]);
    productMediaFindMany.mockResolvedValue([
      { productId: 'prod-1', kind: 'image', label: 'Front', sortOrder: 0, createdAt: new Date() },
      { productId: 'prod-1', kind: 'video', label: 'Demo', sortOrder: 1, createdAt: new Date() }
    ]);

    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

    expect(hotSet.compactCatalog).toEqual([
      {
        id: 'prod-1',
        name: 'Brownie',
        price: 10000,
        unit: 'box',
        baseQuantity: 1,
        minQty: 2,
        maxQty: null,
        keywords: ['brownie'],
        fulfillmentType: 'made_to_order',
        inStock: true,
        stockQuantity: null,
        variants: [],
        description: '',
        isDivisible: false,
        imageCount: 1,
        videoCount: 1,
        mediaLabels: ['Front', 'Demo']
      }
    ]);
  });

  it('ignores a Redis compact catalog whose prices look 100× inflated and persists the healed paise', async () => {
    cacheStore.set('vendor:vendor-1:catalog_compact', [
      {
        id: 'prod-1',
        name: 'Plain Bar',
        price: 1_800_000,
        unit: 'piece',
        baseQuantity: 1,
        minQty: null,
        maxQty: null,
        keywords: ['plain'],
        fulfillmentType: 'made_to_order',
        inStock: true,
        stockQuantity: null,
        variants: [],
        description: '',
        isDivisible: false
      }
    ]);
    productFindMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Plain Bar',
        basePrice: 1_800_000,
        baseUnit: 'piece',
        baseQuantity: 1,
        minOrderQuantity: null,
        maxOrderQuantity: null,
        keywords: ['plain'],
        fulfillmentType: 'made_to_order',
        inStock: true,
        stockQuantity: null,
        variants: [],
        description: '',
        isDivisible: false
      }
    ]);

    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

    expect(hotSet.compactCatalog[0]?.price).toBe(18000);
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { basePrice: 18000 }
    });
    expect(transactionMock).toHaveBeenCalledOnce();
    expect(deleteCachedMock).toHaveBeenCalledWith('vendor:vendor-1:catalog_compact');
    expect(setCachedMock).toHaveBeenCalledWith(
      'vendor:vendor-1:catalog_compact',
      expect.arrayContaining([expect.objectContaining({ id: 'prod-1', price: 18000 })]),
      3600
    );
  });

  it('does not rewrite Product rows when Redis is inflated but Postgres is already healed', async () => {
    cacheStore.set('vendor:vendor-1:catalog_compact', [
      {
        id: 'prod-1',
        name: 'Plain Bar',
        price: 1_800_000,
        unit: 'piece',
        baseQuantity: 1,
        minQty: null,
        maxQty: null,
        keywords: ['plain'],
        fulfillmentType: 'made_to_order',
        inStock: true,
        stockQuantity: null,
        variants: [],
        description: '',
        isDivisible: false
      }
    ]);
    productFindMany.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Plain Bar',
        basePrice: 18000,
        baseUnit: 'piece',
        baseQuantity: 1,
        minOrderQuantity: null,
        maxOrderQuantity: null,
        keywords: ['plain'],
        fulfillmentType: 'made_to_order',
        inStock: true,
        stockQuantity: null,
        variants: [],
        description: '',
        isDivisible: false
      }
    ]);

    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

    expect(hotSet.compactCatalog[0]?.price).toBe(18000);
    expect(productUpdate).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('prefers primaryDeliveryAddress over deliveryAddress on CustomerInsights', async () => {
    customerInsightsFindUnique.mockResolvedValue({
      customerName: 'Priya',
      primaryDeliveryAddress: '123 Main St',
      deliveryAddress: 'Old address',
      preferredLanguage: 'ta'
    });

    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

    expect(hotSet.insights).toMatchObject({
      customerName: 'Priya',
      primaryDeliveryAddress: '123 Main St',
      preferredLanguage: 'ta',
      isNewCustomer: false
    });
  });

  it('returns recent messages in chronological order, mapping senderType to role', async () => {
    messageFindMany.mockResolvedValue([
      { senderType: 'assistant', content: 'newest' },
      { senderType: 'customer', content: 'oldest' }
    ]); // findMany returns newest-first (orderBy timestamp desc)

    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

    expect(hotSet.recentMessages).toEqual([
      { role: 'customer', content: 'oldest' },
      { role: 'assistant', content: 'newest' }
    ]);
  });

  it('invalidateCompactCatalog deletes exactly the compact-catalog key', async () => {
    await invalidateCompactCatalog(VENDOR_ID);
    expect(deleteCachedMock).toHaveBeenCalledWith('vendor:vendor-1:catalog_compact');
  });

  it('loads order history scoped by customerId+vendorId (not conversationId), newest first, capped at 10', async () => {
    await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: CUSTOMER_ID, vendorId: VENDOR_ID },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    );
  });

  it('returns an empty order history array when the customer has no orders', async () => {
    orderFindMany.mockResolvedValue([]);
    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);
    expect(hotSet.orderHistory).toEqual([]);
  });

  it('caches order history under a customer+vendor key with a 60s TTL, separate from the pending-order key', async () => {
    await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);
    expect(setCachedMock).toHaveBeenCalledWith('customer:customer-1:vendor-1:order_history', expect.any(Array), 60);
  });

  it('serves order history from cache on a subsequent call without hitting Postgres again', async () => {
    await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);
    orderFindMany.mockClear();

    await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

    expect(orderFindMany).not.toHaveBeenCalled();
  });

  describe('FAQ retrieval', () => {
    it('skips the embedding call entirely when the vendor has zero active FAQs', async () => {
      faqCount.mockResolvedValue(0);

      const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

      expect(embedTextMock).not.toHaveBeenCalled();
      expect(queryRaw).not.toHaveBeenCalled();
      expect(hotSet.faqs).toEqual([]);
    });

    it('returns FAQs at or above the similarity threshold, dropping ones below it', async () => {
      faqCount.mockResolvedValue(2);
      embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
      queryRaw.mockResolvedValue([
        { id: 'faq-1', question: 'Do you deliver on Sundays?', answer: 'Yes, 10am-6pm.', similarity: 0.91 },
        { id: 'faq-2', question: 'Do you ship internationally?', answer: 'No.', similarity: 0.4 }
      ]);

      const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

      expect(hotSet.faqs).toEqual([
        { id: 'faq-1', question: 'Do you deliver on Sundays?', answer: 'Yes, 10am-6pm.', similarity: 0.91 }
      ]);
    });

    it('fails open to an empty array when the embedding call fails (OpenAI down/misconfigured)', async () => {
      faqCount.mockResolvedValue(3);
      embedTextMock.mockResolvedValue(null);

      const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, MESSAGE_TEXT);

      expect(queryRaw).not.toHaveBeenCalled();
      expect(hotSet.faqs).toEqual([]);
    });

    it('invalidateFaqs deletes exactly the faq-count key', async () => {
      await invalidateFaqs(VENDOR_ID);
      expect(deleteCachedMock).toHaveBeenCalledWith('vendor:vendor-1:faq_count');
    });
  });

  it('loads orderPaymentStatuses when managed collection is on', async () => {
    vendorFindUnique.mockImplementation(({ select }: { select?: Record<string, boolean> }) => {
      if (select?.paymentsManagedByChatlogix) {
        return Promise.resolve({ paymentsManagedByChatlogix: true });
      }
      return Promise.resolve({
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
    });
    orderFindMany.mockResolvedValue([
      {
        id: 'ord-1',
        orderNumber: 'ORD-1',
        items: [],
        totalAmount: 50000,
        paymentMethod: 'razorpay',
        status: 'awaiting_payment',
        createdAt: new Date(),
        estimatedDelivery: null,
        confirmedAt: null,
        preparedAt: null,
        deliveredAt: null,
        cancelledAt: null,
        cancellationReason: null
      }
    ]);
    customerPaymentFindMany.mockResolvedValue([]);
    paymentLinkFindMany.mockResolvedValue([{ orderId: 'ord-1', amountPaise: 50000, expiresAt: new Date() }]);
    orderAuditLogFindMany.mockResolvedValue([]);

    const hotSet = await prefetchHotSet(VENDOR_ID, CONVERSATION_ID, CUSTOMER_ID, 'did my payment go through?');

    expect(hotSet.orderPaymentStatuses).toEqual([
      expect.objectContaining({
        orderNumber: 'ORD-1',
        paymentStatus: 'link_pending',
        amountPaise: 50000
      })
    ]);
  });
});
