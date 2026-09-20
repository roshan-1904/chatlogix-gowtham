import { describe, it, expect } from 'vitest';
import type { CartSnapshot, CompactCatalogEntry, HotSet, OrderHistoryEntry } from '../../types.js';
import { planTurnContext } from '../turnContext.js';

const compactCatalog: CompactCatalogEntry[] = [
  {
    id: 'p1',
    name: 'Brownie',
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
    description: '',
    isDivisible: true,
    imageCount: 0,
    videoCount: 0,
    mediaLabels: []
  },
  {
    id: 'p2',
    name: 'Cake',
    price: 20000,
    unit: 'box',
    baseQuantity: 1,
    minQty: null,
    maxQty: null,
    keywords: [],
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

const pendingBrownie: CartSnapshot = {
  orderId: 'ord-1',
  status: 'pending',
  items: [
    {
      productId: 'p1',
      name: 'Brownie',
      quantity: 1,
      unit: 'box',
      unitPricePaise: 10000,
      lineTotalPaise: 10000
    }
  ],
  totalPaise: 10000,
  customerName: null,
  address: null,
  missing: ['name', 'address']
};

const deliveredOrder: OrderHistoryEntry = {
  id: 'order-1',
  orderNumber: 'T-1',
  status: 'delivered',
  items: [{ productId: 'p1', qty: 2 }],
  totalAmount: 20000,
  createdAt: new Date(),
  estimatedDelivery: null,
  confirmedAt: null,
  preparedAt: null,
  deliveredAt: null,
  cancelledAt: null,
  cancellationReason: null
};

function baseHotSet(overrides: Partial<HotSet> = {}): HotSet {
  return {
    vendorConfig: { aiModel: 'gpt-5.6-luna', businessName: 'Test Shop' },
    compactCatalog,
    memory: null,
    insights: null,
    recentMessages: [],
    orderHistory: [],
    faqs: [],
    pendingOrder: null,
    ...overrides
  } as HotSet;
}

describe('planTurnContext', () => {
  it('routes Tamil order-status phrase before product default', () => {
    const plan = planTurnContext({
      mergedContent: 'என் ஆர்டர் எப்போ வரும்',
      hotSet: baseHotSet()
    });
    expect(plan.mode).toBe('order_status');
    expect(plan.omitCatalogTable).toBe(true);
  });

  it('treats hypothetical prep with empty history as product, not order_status', () => {
    const plan = planTurnContext({
      mergedContent: 'how long if I order today?',
      hotSet: baseHotSet({ orderHistory: [] })
    });
    expect(plan.mode).not.toBe('order_status');
  });

  it('pins reorder product ids when reorder phrase matches on an order-status turn', () => {
    const plan = planTurnContext({
      mergedContent: 'where is my order — same as last time please',
      hotSet: baseHotSet({
        orderHistory: [deliveredOrder]
      })
    });
    expect(plan.mode).toBe('order_status');
    expect(plan.pinnedProductIds).toContain('p1');
    expect(plan.omitCatalogTable).toBe(false);
  });

  it('general mode for greeting-only turns', () => {
    const plan = planTurnContext({
      mergedContent: 'Hi',
      hotSet: baseHotSet()
    });
    expect(plan.mode).toBe('general');
    expect(plan.omitCatalogTable).toBe(true);
  });

  it('browse mode for menu requests', () => {
    const plan = planTurnContext({
      mergedContent: 'send menu',
      hotSet: baseHotSet()
    });
    expect(plan.mode).toBe('browse');
  });

  it('product default pins cart lines', () => {
    const plan = planTurnContext({
      mergedContent: 'one more brownie',
      hotSet: baseHotSet({
        pendingOrder: pendingBrownie
      })
    });
    expect(plan.mode).toBe('product');
    expect(plan.pinnedProductIds).toEqual(['p1']);
  });

  it('tolerates missing orderHistory on hot set mocks', () => {
    const hotSet = baseHotSet();
    delete (hotSet as { orderHistory?: HotSet['orderHistory'] }).orderHistory;
    const plan = planTurnContext({ mergedContent: 'order status', hotSet });
    expect(plan.mode).toBe('order_status');
  });
});
