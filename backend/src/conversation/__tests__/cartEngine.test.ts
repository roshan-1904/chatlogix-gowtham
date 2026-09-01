import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Prisma module BEFORE importing the engine. CartEngine.apply runs
// everything inside prisma.$transaction — this txStub captures every call
// the engine makes so we can assert exact writes without a real database.

const orderFindFirst = vi.fn();
const orderUpdate = vi.fn();
const orderCreate = vi.fn();
const orderCount = vi.fn();
const productFindFirst = vi.fn();
const customerInsightsFindUnique = vi.fn();
const orderAuditLogCreate = vi.fn();
const vendorFindUnique = vi.fn();

const txStub = {
  order: {
    findFirst: (...args: unknown[]) => orderFindFirst(...args),
    update: (...args: unknown[]) => orderUpdate(...args),
    create: (...args: unknown[]) => orderCreate(...args),
    count: (...args: unknown[]) => orderCount(...args)
  },
  product: {
    findFirst: (...args: unknown[]) => productFindFirst(...args)
  },
  customerInsights: {
    findUnique: (...args: unknown[]) => customerInsightsFindUnique(...args)
  },
  orderAuditLog: {
    create: (...args: unknown[]) => orderAuditLogCreate(...args)
  },
  vendor: {
    findUnique: (...args: unknown[]) => vendorFindUnique(...args)
  }
};

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    $transaction: async (fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub)
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { apply } from '../cart/engine.js';

const VENDOR_ID = 'vendor-1';
const CONVERSATION_ID = 'conv-1';
const CUSTOMER_ID = 'customer-1';

const brownie = {
  id: 'prod-brownie',
  name: 'Brownie',
  baseUnit: 'box',
  baseQuantity: 1,
  basePrice: 10000,
  fulfillmentType: 'made_to_order',
  inStock: true,
  stockQuantity: null,
  minOrderQuantity: null,
  maxOrderQuantity: null
};

const cookies = {
  id: 'prod-cookies',
  name: 'Cookies',
  baseUnit: 'box',
  baseQuantity: 1,
  basePrice: 5000,
  fulfillmentType: 'made_to_order',
  inStock: true,
  stockQuantity: null,
  minOrderQuantity: null,
  maxOrderQuantity: null
};

function existingOrder(items: unknown, overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    vendorId: VENDOR_ID,
    conversationId: CONVERSATION_ID,
    customerId: CUSTOMER_ID,
    status: 'pending',
    items,
    deliveryAddress: null,
    specialRequests: null,
    deliveryInstructions: null,
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  customerInsightsFindUnique.mockResolvedValue(null);
  orderAuditLogCreate.mockResolvedValue({});
  vendorFindUnique.mockResolvedValue({ orderPrefix: 'TEST' });
  orderCount.mockResolvedValue(0);
});

describe('CartEngine.apply', () => {
  it('§26 test 1: "make the brownies 5" sets brownie qty to 5 without touching cookies', async () => {
    orderFindFirst.mockResolvedValue(
      existingOrder([
        { productId: 'prod-brownie', name: 'Brownie', quantity: 2, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 20000 },
        { productId: 'prod-cookies', name: 'Cookies', quantity: 1, unit: 'box', unitPricePaise: 5000, lineTotalPaise: 5000 }
      ])
    );
    productFindFirst.mockResolvedValue(brownie);
    orderUpdate.mockImplementation(({ data }: any) => ({ ...existingOrder(data.items), ...data }));

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'set_qty', productId: 'prod-brownie', qty: 5 }],
      traceId: 'wamid.1'
    });

    expect(result.mutated).toBe(true);
    expect(result.rejectedOps).toHaveLength(0);
    const brownieLine = result.snapshot.items.find((l) => l.productId === 'prod-brownie');
    const cookiesLine = result.snapshot.items.find((l) => l.productId === 'prod-cookies');
    expect(brownieLine?.quantity).toBe(5);
    expect(cookiesLine?.quantity).toBe(1);
  });

  it('§26 test 2: "also add 2 cookies" with cookies already at 1 sums to 3', async () => {
    orderFindFirst.mockResolvedValue(
      existingOrder([{ productId: 'prod-cookies', name: 'Cookies', quantity: 1, unit: 'box', unitPricePaise: 5000, lineTotalPaise: 5000 }])
    );
    productFindFirst.mockResolvedValue(cookies);
    orderUpdate.mockImplementation(({ data }: any) => ({ ...existingOrder(data.items), ...data }));

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'add', productId: 'prod-cookies', qty: 2 }],
      traceId: 'wamid.2'
    });

    const cookiesLine = result.snapshot.items.find((l) => l.productId === 'prod-cookies');
    expect(cookiesLine?.quantity).toBe(3);
  });

  it('§26 test 3: an add op only adds its own productId, other lines are untouched', async () => {
    orderFindFirst.mockResolvedValue(
      existingOrder([{ productId: 'prod-brownie', name: 'Brownie', quantity: 2, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 20000 }])
    );
    productFindFirst.mockResolvedValue(cookies);
    orderUpdate.mockImplementation(({ data }: any) => ({ ...existingOrder(data.items), ...data }));

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'add', productId: 'prod-cookies', qty: 1 }],
      traceId: 'wamid.3'
    });

    const brownieLine = result.snapshot.items.find((l) => l.productId === 'prod-brownie');
    const cookiesLine = result.snapshot.items.find((l) => l.productId === 'prod-cookies');
    expect(brownieLine?.quantity).toBe(2); // untouched
    expect(cookiesLine?.quantity).toBe(1); // newly added
  });

  it('§26 test 4: confirm without address is rejected, status stays pending, no order write', async () => {
    orderFindFirst.mockResolvedValue(
      existingOrder([{ productId: 'prod-brownie', name: 'Brownie', quantity: 1, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 10000 }])
    );
    customerInsightsFindUnique.mockResolvedValue({ customerName: 'Priya' });

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'confirm' }],
      traceId: 'wamid.4'
    });

    expect(result.mutated).toBe(false);
    expect(result.rejectedOps).toHaveLength(1);
    expect(result.rejectedOps[0].reason).toContain('address');
    expect(result.snapshot.status).toBe('pending');
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('§26 test 5: confirm with name + address + items succeeds, no estimatedDelivery written', async () => {
    orderFindFirst.mockResolvedValue(
      existingOrder([{ productId: 'prod-brownie', name: 'Brownie', quantity: 1, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 10000 }], {
        deliveryAddress: '123 Main St'
      })
    );
    customerInsightsFindUnique.mockResolvedValue({ customerName: 'Priya' });
    orderUpdate.mockImplementation(({ data }: any) => ({ ...existingOrder(data.items), ...data }));

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'confirm' }],
      traceId: 'wamid.5'
    });

    expect(result.mutated).toBe(true);
    expect(result.rejectedOps).toHaveLength(0);
    expect(result.snapshot.missing).toHaveLength(0);
    expect(result.snapshot.status).toBe('pending');
    expect(orderUpdate).toHaveBeenCalledTimes(1);
    const updateCall = orderUpdate.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('estimatedDelivery');
  });

  it('rejects an add for a product not found in the vendor catalog (fail closed, I4)', async () => {
    orderFindFirst.mockResolvedValue(null);
    productFindFirst.mockResolvedValue(null);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'add', productId: 'nonexistent', qty: 1 }],
      traceId: 'wamid.6'
    });

    expect(result.rejectedOps).toEqual([{ op: { type: 'add', productId: 'nonexistent', qty: 1 }, reason: 'product_not_found' }]);
    expect(result.mutated).toBe(false);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('creates a new order on first mutating op when none exists yet', async () => {
    orderFindFirst.mockResolvedValue(null);
    productFindFirst.mockResolvedValue(brownie);
    orderCreate.mockImplementation(({ data }: any) => ({ id: 'new-order', ...data }));

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'add', productId: 'prod-brownie', qty: 2 }],
      traceId: 'wamid.7'
    });

    expect(orderCreate).toHaveBeenCalledTimes(1);
    expect(result.snapshot.orderId).toBe('new-order');
    expect(result.snapshot.items[0].quantity).toBe(2);
  });

  it('rejects cancel when there is no order to cancel', async () => {
    orderFindFirst.mockResolvedValue(null);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'cancel' }],
      traceId: 'wamid.8'
    });

    expect(result.mutated).toBe(false);
    expect(result.rejectedOps).toEqual([{ op: { type: 'cancel' }, reason: 'no_order_to_cancel' }]);
    expect(orderCreate).not.toHaveBeenCalled();
  });
});
