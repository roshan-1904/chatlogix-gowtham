import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

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
const orderAuditLogFindFirst = vi.fn();
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
    create: (...args: unknown[]) => orderAuditLogCreate(...args),
    findFirst: (...args: unknown[]) => orderAuditLogFindFirst(...args)
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

// A variant-bearing product (regression fixture for the "4x6 doesn't exist,
// SS 7x7 got priced as Kadai" bug): basePrice is intentionally nonsense —
// any op naming a real variantSku must price from that variant, never fall
// back to this.
const bakingTin = {
  id: 'prod-tin',
  name: 'Premium Baking Tin',
  baseUnit: 'unit',
  baseQuantity: 1,
  basePrice: 129900,
  fulfillmentType: 'made_to_order',
  inStock: true,
  stockQuantity: null,
  minOrderQuantity: null,
  maxOrderQuantity: null,
  variants: [
    { sku: 'KD-7X7', label: 'Kadai 7x7', attributes: { size: '7x7', material: 'Kadai' }, unit: 'unit', baseQuantity: 1, price: 129900, isDivisible: false, isActive: true },
    { sku: 'SS-7X7', label: 'SS 7x7', attributes: { size: '7x7', material: 'Stainless Steel' }, unit: 'unit', baseQuantity: 1, price: 179900, isDivisible: false, isActive: true }
  ]
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
  orderAuditLogFindFirst.mockResolvedValue(null); // no prior application by default -- individual retry-guard tests override this
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

  it("allocates the next global orderNumber for the prefix+month, not this vendor's monthly count", async () => {
    const yearMonth = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const stem = `ORD-TESTX-${yearMonth}`;
    orderFindFirst.mockImplementation((args: any) => {
      if (args?.where?.orderNumber?.startsWith === stem) {
        return Promise.resolve({ orderNumber: `${stem}0007` });
      }
      return Promise.resolve(null);
    });
    productFindFirst.mockResolvedValue(brownie);
    orderCreate.mockImplementation(({ data }: any) => ({ id: 'new-order', ...data }));

    await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'add', productId: 'prod-brownie', qty: 2 }],
      traceId: 'wamid.7b'
    });

    expect(orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderNumber: `${stem}0008` })
      })
    );
  });

  it('retries apply when order.create hits a unique constraint on orderNumber', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`orderNumber`)', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['orderNumber'] }
    });
    orderFindFirst.mockResolvedValue(null);
    productFindFirst.mockResolvedValue(brownie);
    orderCreate
      .mockRejectedValueOnce(p2002)
      .mockImplementation(({ data }: any) => ({ id: 'new-order', ...data }));

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'add', productId: 'prod-brownie', qty: 2 }],
      traceId: 'wamid.7c'
    });

    expect(orderCreate).toHaveBeenCalledTimes(2);
    expect(result.snapshot.orderId).toBe('new-order');
  });

  it('does not retry apply on a non-conflict cart error', async () => {
    orderFindFirst.mockResolvedValue(null);
    productFindFirst.mockResolvedValue(brownie);
    orderCreate.mockRejectedValue(new Error('connection reset'));

    await expect(
      apply({
        vendorId: VENDOR_ID,
        conversationId: CONVERSATION_ID,
        customerId: CUSTOMER_ID,
        orderId: null,
        ops: [{ type: 'add', productId: 'prod-brownie', qty: 2 }],
        traceId: 'wamid.7d'
      })
    ).rejects.toThrow('connection reset');
    expect(orderCreate).toHaveBeenCalledTimes(1);
  });

  it('does not create a phantom order for a set_field-only op with no items (the empty-order bug)', async () => {
    orderFindFirst.mockResolvedValue(null);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'set_field', field: 'address', value: '123 Main St' }],
      traceId: 'wamid.12'
    });

    expect(orderCreate).not.toHaveBeenCalled();
    expect(result.snapshot.orderId).toBeNull();
    // address still flows into the snapshot so persist.ts can save it to CustomerInsights
    expect(result.snapshot.address).toBe('123 Main St');
  });

  it('treats send_product_media as a no-op — no cart mutation', async () => {
    orderFindFirst.mockResolvedValue(null);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'send_product_media', productId: 'prod-tin', kind: 'image' }],
      traceId: 'wamid.media'
    });

    expect(orderCreate).not.toHaveBeenCalled();
    expect(result.mutated).toBe(false);
  });

  it('treats knowledge_gap as a no-op — no cart mutation, no new order', async () => {
    orderFindFirst.mockResolvedValue(null);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'knowledge_gap', question: 'Does the tin include dividers?', category: 'product', productId: 'prod-tin' }],
      traceId: 'wamid.kg'
    });

    expect(orderCreate).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(result.mutated).toBe(false);
    expect(result.rejectedOps).toEqual([]);
    expect(result.snapshot.orderId).toBeNull();
  });

  it('does not create a phantom order for a set_field notes-only op with no items', async () => {
    orderFindFirst.mockResolvedValue(null);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'set_field', field: 'notes', value: 'call before delivery' }],
      traceId: 'wamid.13'
    });

    expect(orderCreate).not.toHaveBeenCalled();
    expect(result.snapshot.orderId).toBeNull();
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

  it('prices an add from the selected variant, not the product basePrice', async () => {
    orderFindFirst.mockResolvedValue(null);
    productFindFirst.mockResolvedValue(bakingTin);
    orderCreate.mockImplementation(({ data }: any) => ({ id: 'new-order', ...data }));

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'add', productId: 'prod-tin', qty: 1, variantSku: 'SS-7X7' }],
      traceId: 'wamid.9'
    });

    expect(result.rejectedOps).toHaveLength(0);
    const line = result.snapshot.items[0];
    expect(line.unitPricePaise).toBe(179900); // SS price, not the 129900 basePrice
    expect(line.variantSku).toBe('SS-7X7');
    expect(line.variantLabel).toBe('SS 7x7');
  });

  it('rejects an add naming a variantSku that does not exist on the product (fail closed, I4) — this is the exact hallucinated-size bug', async () => {
    orderFindFirst.mockResolvedValue(null);
    productFindFirst.mockResolvedValue(bakingTin);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'add', productId: 'prod-tin', qty: 1, variantSku: 'SS-4X6' }],
      traceId: 'wamid.10'
    });

    expect(result.rejectedOps).toEqual([
      { op: { type: 'add', productId: 'prod-tin', qty: 1, variantSku: 'SS-4X6' }, reason: 'variant_not_found' }
    ]);
    expect(result.mutated).toBe(false);
    expect(orderCreate).not.toHaveBeenCalled();
  });

  it('keeps two variants of the same product as separate lines rather than merging quantity/price', async () => {
    orderFindFirst.mockResolvedValue(
      existingOrder([
        { productId: 'prod-tin', name: 'Premium Baking Tin', quantity: 1, unit: 'unit', unitPricePaise: 129900, lineTotalPaise: 129900, variantSku: 'KD-7X7', variantLabel: 'Kadai 7x7' }
      ])
    );
    productFindFirst.mockResolvedValue(bakingTin);
    orderUpdate.mockImplementation(({ data }: any) => ({ ...existingOrder(data.items), ...data }));

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'add', productId: 'prod-tin', qty: 1, variantSku: 'SS-7X7' }],
      traceId: 'wamid.11'
    });

    expect(result.snapshot.items).toHaveLength(2);
    const kadaiLine = result.snapshot.items.find((l) => l.variantSku === 'KD-7X7');
    const ssLine = result.snapshot.items.find((l) => l.variantSku === 'SS-7X7');
    expect(kadaiLine?.quantity).toBe(1);
    expect(ssLine?.quantity).toBe(1);
    expect(ssLine?.unitPricePaise).toBe(179900);
  });

  it('rounds lineTotalPaise/totalPaise to an integer for a divisible (weight-based) product, even after floating-point-prone qty accumulation', async () => {
    const riceBrownie = {
      id: 'prod-rice-brownie',
      name: 'Karuppu Kavuni Rice Brownie',
      baseUnit: 'kg',
      baseQuantity: 1,
      basePrice: 120000, // Rs1200/kg
      fulfillmentType: 'made_to_order',
      inStock: true,
      stockQuantity: null,
      minOrderQuantity: 0.1,
      maxOrderQuantity: 100
    };
    // Existing line at 0.1kg -- adding 0.2kg reproduces the classic
    // 0.1 + 0.2 = 0.30000000000000004 floating-point case.
    orderFindFirst.mockResolvedValue(
      existingOrder([
        { productId: 'prod-rice-brownie', name: 'Karuppu Kavuni Rice Brownie', quantity: 0.1, unit: 'kg', unitPricePaise: 120000, lineTotalPaise: 12000 }
      ])
    );
    productFindFirst.mockResolvedValue(riceBrownie);
    orderUpdate.mockImplementation(({ data }: any) => ({ ...existingOrder(data.items), ...data }));

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'add', productId: 'prod-rice-brownie', qty: 0.2 }],
      traceId: 'wamid.30'
    });

    const line = result.snapshot.items.find((l) => l.productId === 'prod-rice-brownie');
    expect(Number.isInteger(line?.lineTotalPaise)).toBe(true);
    expect(Number.isInteger(result.snapshot.totalPaise)).toBe(true);
    // 0.1 + 0.2 kg at Rs1200/kg = Rs360.00 exactly, not 359.9999... or 360.00000006
    expect(line?.lineTotalPaise).toBe(36000);
  });

  it('retry guard: skips re-applying ops when this traceId was already applied to the order (SQS redelivery)', async () => {
    orderFindFirst.mockResolvedValue(
      existingOrder([{ productId: 'prod-brownie', name: 'Brownie', quantity: 2, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 20000 }])
    );
    productFindFirst.mockResolvedValue(brownie);
    // Simulates a prior successful apply() for this exact traceId already
    // having written an OrderAuditLog row for this order.
    orderAuditLogFindFirst.mockResolvedValue({ id: 'audit-1', orderId: 'order-1', changes: { traceId: 'wamid.retry-1' } });

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'add', productId: 'prod-brownie', qty: 2 }], // would double 2 -> 4 if re-applied
      traceId: 'wamid.retry-1'
    });

    expect(result.mutated).toBe(false);
    expect(result.rejectedOps).toHaveLength(0);
    const brownieLine = result.snapshot.items.find((l) => l.productId === 'prod-brownie');
    expect(brownieLine?.quantity).toBe(2); // unchanged, not doubled to 4
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(orderAuditLogCreate).not.toHaveBeenCalled();
  });

  it('retry guard: a different traceId for the same order is NOT treated as a duplicate', async () => {
    orderFindFirst.mockResolvedValue(
      existingOrder([{ productId: 'prod-brownie', name: 'Brownie', quantity: 2, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 20000 }])
    );
    productFindFirst.mockResolvedValue(brownie);
    orderUpdate.mockImplementation(({ data }: any) => ({ ...existingOrder(data.items), ...data }));
    // No audit log row matches THIS traceId (default beforeEach mock: null).

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'add', productId: 'prod-brownie', qty: 2 }],
      traceId: 'wamid.a-genuinely-new-turn'
    });

    expect(result.mutated).toBe(true);
    const brownieLine = result.snapshot.items.find((l) => l.productId === 'prod-brownie');
    expect(brownieLine?.quantity).toBe(4); // legitimately applied
  });
});

describe('CartEngine.apply — refund_request and historical cancel (#3)', () => {
  /** No live draft for this conversation — every scenario here targets a past order by orderNumber. */
  function mockNoLiveDraftThenHistoricalOrder(historicalOrder: any) {
    orderFindFirst.mockImplementation(({ where }: any) => {
      if (where.orderNumber) return Promise.resolve(historicalOrder);
      return Promise.resolve(null); // top-of-function live-draft lookup, and the no-orderNumber fallback
    });
  }

  it('refund_request: eligible (pending, within 7 days) cancels the order and reports refund_approved', async () => {
    const historicalOrder = {
      id: 'order-hist-1',
      orderNumber: 'ORD-HIST-0001',
      status: 'pending',
      totalAmount: 129900,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
    };
    mockNoLiveDraftThenHistoricalOrder(historicalOrder);
    orderUpdate.mockResolvedValue({});

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'refund_request', orderNumber: 'ORD-HIST-0001', reason: 'changed my mind' }],
      traceId: 'wamid.20'
    });

    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-hist-1' },
      data: { status: 'cancelled', cancelledAt: expect.any(Date), cancellationReason: 'changed my mind' }
    });
    expect(result.mutated).toBe(true);
    expect(result.postSalesOutcome).toEqual({
      type: 'refund_approved',
      orderId: 'order-hist-1',
      orderNumber: 'ORD-HIST-0001',
      detail: expect.stringContaining('₹1299.00')
    });
    // Regression: this order is NOT `order` (the conversation's own live
    // draft — there is none here), so it must not be silently skipped by
    // the shared mutated-gated audit write.
    expect(orderAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-hist-1',
          action: 'refund_request',
          previousState: { status: 'pending' },
          newState: { status: 'cancelled' }
        })
      })
    );
  });

  it('refund_request: ineligible status (already delivered) leaves the order untouched and reports refund_denied', async () => {
    const historicalOrder = {
      id: 'order-hist-2',
      orderNumber: 'ORD-HIST-0002',
      status: 'delivered',
      totalAmount: 50000,
      createdAt: new Date()
    };
    mockNoLiveDraftThenHistoricalOrder(historicalOrder);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'refund_request', orderNumber: 'ORD-HIST-0002', reason: null }],
      traceId: 'wamid.21'
    });

    expect(orderUpdate).not.toHaveBeenCalled();
    expect(result.mutated).toBe(false);
    expect(result.postSalesOutcome).toEqual({
      type: 'refund_denied',
      orderId: 'order-hist-2',
      orderNumber: 'ORD-HIST-0002',
      detail: expect.stringContaining('delivered')
    });
  });

  it('refund_request: ineligible — outside the 7-day window — leaves the order untouched and reports refund_denied', async () => {
    const historicalOrder = {
      id: 'order-hist-3',
      orderNumber: 'ORD-HIST-0003',
      status: 'confirmed',
      totalAmount: 50000,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
    };
    mockNoLiveDraftThenHistoricalOrder(historicalOrder);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'refund_request', orderNumber: 'ORD-HIST-0003', reason: null }],
      traceId: 'wamid.22'
    });

    expect(orderUpdate).not.toHaveBeenCalled();
    expect(result.postSalesOutcome?.type).toBe('refund_denied');
    expect(result.postSalesOutcome?.detail).toContain('7-day');
  });

  it('cancel: targeting a past orderNumber (not the live conversation draft) cancels it and reports order_cancelled', async () => {
    const historicalOrder = {
      id: 'order-hist-4',
      orderNumber: 'ORD-HIST-0004',
      status: 'confirmed',
      totalAmount: 50000,
      createdAt: new Date()
    };
    mockNoLiveDraftThenHistoricalOrder(historicalOrder);
    orderUpdate.mockResolvedValue({});

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'cancel', orderNumber: 'ORD-HIST-0004' }],
      traceId: 'wamid.23'
    });

    expect(orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-hist-4' },
      data: { status: 'cancelled', cancelledAt: expect.any(Date), cancellationReason: 'Cancelled via AI assistant' }
    });
    expect(result.mutated).toBe(true);
    expect(result.postSalesOutcome).toEqual({
      type: 'order_cancelled',
      orderId: 'order-hist-4',
      orderNumber: 'ORD-HIST-0004',
      detail: 'Cancelled as requested.'
    });
    // Regression: a cancel on a historical order previously left zero audit trail.
    expect(orderAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-hist-4',
          action: 'cancel',
          previousState: { status: 'confirmed' },
          newState: { status: 'cancelled' }
        })
      })
    );
  });

  it('cancel: rejects with not_cancellable_at_this_stage when the target order is already preparing, and does not mutate it', async () => {
    const historicalOrder = {
      id: 'order-hist-5',
      orderNumber: 'ORD-HIST-0005',
      status: 'preparing',
      totalAmount: 50000,
      createdAt: new Date()
    };
    mockNoLiveDraftThenHistoricalOrder(historicalOrder);

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'cancel', orderNumber: 'ORD-HIST-0005' }],
      traceId: 'wamid.24'
    });

    expect(orderUpdate).not.toHaveBeenCalled();
    expect(result.mutated).toBe(false);
    expect(result.rejectedOps).toEqual([
      { op: { type: 'cancel', orderNumber: 'ORD-HIST-0005' }, reason: 'not_cancellable_at_this_stage' }
    ]);
    expect(result.postSalesOutcome).toEqual({
      type: 'not_cancellable_at_this_stage',
      orderId: 'order-hist-5',
      orderNumber: 'ORD-HIST-0005',
      detail: expect.stringContaining('preparing')
    });
  });

  it('cancel: a bare cancel (no orderNumber) on the live draft that is already preparing is rejected with the same new reason', async () => {
    orderFindFirst.mockResolvedValue(
      existingOrder([{ productId: 'prod-brownie', name: 'Brownie', quantity: 1, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 10000 }], {
        status: 'preparing'
      })
    );

    const result = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: 'order-1',
      ops: [{ type: 'cancel' }],
      traceId: 'wamid.25'
    });

    expect(orderUpdate).not.toHaveBeenCalled();
    expect(result.rejectedOps[0].reason).toBe('not_cancellable_at_this_stage');
    expect(result.postSalesOutcome?.type).toBe('not_cancellable_at_this_stage');
  });
});
