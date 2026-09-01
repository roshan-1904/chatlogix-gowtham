import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * End-to-end-through-CartEngine regression tests replaying the two
 * motivating bugs from spec §2.2 ("make it 5" corrupting quantities /
 * wiping other lines; "also add cookies" double-counting), as a real
 * multi-turn conversation rather than isolated single-op assertions
 * (cartEngine.test.ts already covers those). Uses a small in-memory fake
 * Order store so state genuinely carries across successive
 * CartEngine.apply() calls the way a real conversation would.
 */

let fakeOrder: any = null;

const orderFindFirst = vi.fn(() => Promise.resolve(fakeOrder));
const orderUpdate = vi.fn(({ data }: any) => {
  fakeOrder = { ...fakeOrder, ...data };
  return Promise.resolve(fakeOrder);
});
const orderCreate = vi.fn(({ data }: any) => {
  fakeOrder = { id: 'order-1', ...data };
  return Promise.resolve(fakeOrder);
});
const orderCount = vi.fn(() => Promise.resolve(0));
const productFindFirst = vi.fn();
const customerInsightsFindUnique = vi.fn(() => Promise.resolve(null));
const orderAuditLogCreate = vi.fn(() => Promise.resolve({}));
const vendorFindUnique = vi.fn(() => Promise.resolve({ orderPrefix: 'TEST' }));

// Referenced directly (no `(...args) => mock(...args)` wrapper) — these
// mocks were declared with explicit, narrower implementation signatures
// above (e.g. zero-arg for orderFindFirst), so wrapping them behind a
// generic `unknown[]` spread doesn't typecheck; the vi.fn() instances are
// already directly callable and independently reconfigurable via
// .mockResolvedValue/.mockImplementation without needing that indirection.
const txStub = {
  order: { findFirst: orderFindFirst, update: orderUpdate, create: orderCreate, count: orderCount },
  product: { findFirst: productFindFirst },
  customerInsights: { findUnique: customerInsightsFindUnique },
  orderAuditLog: { create: orderAuditLogCreate },
  vendor: { findUnique: vendorFindUnique }
};

vi.mock('../../db/prisma.js', () => ({
  prisma: { $transaction: (fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub) }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// llm2.js's module-level `const openai = env.OPENAI_API_KEY ? new OpenAI(...)
// : null;` pulls in real config/env.js (Firebase-config-check logging at
// import time) even though selectFinalReply itself is pure and never
// touches the client. Same class of leak as Step 4/5/6/7 — mock env with no
// key so `openai` stays null and the real config/env.js module never loads.
vi.mock('../../config/env.js', () => ({
  env: { OPENAI_API_KEY: undefined, VERIFY_THRESHOLD: '0.75' }
}));

import { apply } from '../cart/engine.js';
import { selectFinalReply } from '../llm/llm2.js';

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

beforeEach(() => {
  vi.clearAllMocks();
  fakeOrder = null;
  customerInsightsFindUnique.mockResolvedValue(null);
  orderAuditLogCreate.mockResolvedValue({});
  vendorFindUnique.mockResolvedValue({ orderPrefix: 'TEST' });
  orderCount.mockResolvedValue(0);
  productFindFirst.mockImplementation(({ where }: any) =>
    Promise.resolve(where.id === 'prod-cookies' ? cookies : where.id === 'prod-brownie' ? brownie : null)
  );
});

async function addBrowniesAndCookies() {
  return apply({
    vendorId: VENDOR_ID,
    conversationId: CONVERSATION_ID,
    customerId: CUSTOMER_ID,
    orderId: null,
    ops: [
      { type: 'add', productId: 'prod-brownie', qty: 2 },
      { type: 'add', productId: 'prod-cookies', qty: 1 }
    ],
    traceId: 'wamid.turn1'
  });
}

describe('Golden transcripts (spec §2.2 motivating bugs, replayed end-to-end)', () => {
  it('"make it 5" only changes the brownie line — bug used to add 5 on top or wipe other lines', async () => {
    const turn1 = await addBrowniesAndCookies();
    expect(turn1.snapshot.items).toHaveLength(2);

    const turn2 = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: turn1.snapshot.orderId,
      ops: [{ type: 'set_qty', productId: 'prod-brownie', qty: 5 }],
      traceId: 'wamid.turn2'
    });

    const brownieLine = turn2.snapshot.items.find((i) => i.productId === 'prod-brownie');
    const cookiesLine = turn2.snapshot.items.find((i) => i.productId === 'prod-cookies');
    expect(brownieLine?.quantity).toBe(5);
    expect(cookiesLine?.quantity).toBe(1); // untouched, not wiped
  });

  it('"also add 2 cookies" sums onto the existing line — bug used to double-count when the model restated the whole cart', async () => {
    const turn1 = await addBrowniesAndCookies();

    // The model's draftReply prose might say "you now have 2 Brownie and 3
    // Cookies" as free text, but CartEngine never reads draftReply for cart
    // state — only ops, and this turn's ops are exactly one `add`.
    const turn2 = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: turn1.snapshot.orderId,
      ops: [{ type: 'add', productId: 'prod-cookies', qty: 2 }],
      traceId: 'wamid.turn2'
    });

    const brownieLine = turn2.snapshot.items.find((i) => i.productId === 'prod-brownie');
    const cookiesLine = turn2.snapshot.items.find((i) => i.productId === 'prod-cookies');
    expect(brownieLine?.quantity).toBe(2); // untouched
    expect(cookiesLine?.quantity).toBe(3); // 1 + 2, summed once, not doubled
  });

  it('§26 test 9 replayed end-to-end: LLM-2 omitting a line (chained after a real CartEngine.apply) never reaches the customer', async () => {
    const turn1 = await addBrowniesAndCookies();

    const decision = selectFinalReply({
      draftReply: 'Added your items!',
      llm2Result: { skipped: false, finalReply: 'You now have 2 Brownie, total Rs200.', promptTokens: 1, completionTokens: 1 }, // omits Cookies
      snapshot: turn1.snapshot,
      traceId: 'wamid.turn1'
    });

    expect(decision.usedEngineRenderer).toBe(true);
    expect(decision.finalReply).toContain('Cookies');
  });

  it('a batch-merged burst message ("hi" + "2 brownies" in one turn) still results in exactly one op application, not two competing carts', async () => {
    // Simulates burstMerge.mergeSameBatch already having concatenated the
    // two customer messages into one string before LLM-1 ran — from
    // CartEngine's perspective this is indistinguishable from a single
    // turn's ops, which is the point: the merge happens upstream of LLM-1,
    // not inside CartEngine.
    const turn = await apply({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      customerId: CUSTOMER_ID,
      orderId: null,
      ops: [{ type: 'add', productId: 'prod-brownie', qty: 2 }], // "hi\n2 brownies" -> one add op
      traceId: 'wamid.burst'
    });

    expect(turn.mutated).toBe(true);
    expect(turn.snapshot.items).toHaveLength(1);
    expect(turn.snapshot.items[0].quantity).toBe(2);
  });
});
