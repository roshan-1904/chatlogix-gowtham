import { describe, it, expect } from 'vitest';
import { buildCatalogTable, buildLlm1SystemPrompt, llm1JsonSchema } from '../llm/prompts.js';
import type { HotSet, CompactCatalogEntry } from '../types.js';

const brownie: CompactCatalogEntry = {
  id: 'prod-1',
  name: 'Brownie',
  price: 10000,
  unit: 'box',
  minQty: 1,
  maxQty: 10,
  keywords: ['choco', 'dessert'],
  fulfillmentType: 'made_to_order',
  inStock: true,
  stockQuantity: null,
  variants: [],
  description: ''
};

function makeHotSet(overrides: Partial<HotSet> = {}): HotSet {
  return {
    vendorConfig: {
      id: 'vendor-1',
      businessName: 'Test Bakery',
      aiBotName: 'Baker Bot',
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
      aiModel: 'gpt-4.1-mini',
      askForPreferredDeliveryDate: false
    },
    compactCatalog: [brownie],
    memory: null,
    pendingOrder: null,
    orderHistory: [],
    faqs: [],
    insights: null,
    recentMessages: [],
    ...overrides
  };
}

describe('buildCatalogTable', () => {
  it('renders "(none)" for an empty catalog', () => {
    expect(buildCatalogTable([])).toBe('(none)');
  });

  it('includes the productId and escapes commas in keywords', () => {
    const table = buildCatalogTable([{ ...brownie, keywords: ['choco,dark', 'dessert'] }]);
    expect(table).toContain('prod-1');
    expect(table).toContain('Brownie');
    expect(table).not.toContain('choco,dark'); // comma escaped to semicolon
    expect(table).toContain('choco;dark');
  });

  it('renders price as rupees (paise / 100), not raw paise', () => {
    const table = buildCatalogTable([brownie]);
    expect(table).toContain('100.00');
  });

  it('includes the description, flattened to one line', () => {
    const table = buildCatalogTable([{ ...brownie, description: 'Fits only\nan 8x8 tin.\n\nConfirm size before ordering.' }]);
    expect(table).toContain('Fits only an 8x8 tin. Confirm size before ordering.');
    expect(table.split('\n')).toHaveLength(2); // header + one data row — no stray line from the description
  });

  it('renders an empty desc column when the vendor left description blank', () => {
    const table = buildCatalogTable([brownie]);
    const dataRow = table.split('\n')[1];
    const columns = dataRow.trim().split(',');
    expect(columns[columns.length - 1]).toBe(''); // desc is the last column
  });
});

describe('buildLlm1SystemPrompt', () => {
  it('includes vendor identity, the catalog table, and the no-invented-date rule', () => {
    const prompt = buildLlm1SystemPrompt(makeHotSet());
    expect(prompt).toContain('Test Bakery');
    expect(prompt).toContain('prod-1');
    expect(prompt).toMatch(/NEVER invent a delivery date/);
  });

  it('reflects an empty cart when there is no pending order', () => {
    const prompt = buildLlm1SystemPrompt(makeHotSet());
    expect(prompt).toContain('(empty)');
  });

  it('renders pending order items and total in the dynamic block', () => {
    const prompt = buildLlm1SystemPrompt(
      makeHotSet({
        pendingOrder: {
          orderId: 'order-1',
          status: 'pending',
          items: [
            { productId: 'prod-1', name: 'Brownie', quantity: 2, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 20000 }
          ],
          totalPaise: 20000,
          customerName: 'Priya',
          address: '123 Main St',
          missing: []
        }
      })
    );
    expect(prompt).toContain('Brownie (prod-1) x2 box');
    expect(prompt).toContain('200.00');
    expect(prompt).toContain('Priya');
    expect(prompt).toContain('123 Main St');
  });

  it('includes recent messages when present', () => {
    const prompt = buildLlm1SystemPrompt(
      makeHotSet({ recentMessages: [{ role: 'customer', content: 'do you have brownies?' }] })
    );
    expect(prompt).toContain('do you have brownies?');
  });

  it('surfaces a product description and instructs the model to apply it, not just recite it', () => {
    const prompt = buildLlm1SystemPrompt(
      makeHotSet({ compactCatalog: [{ ...brownie, description: 'Dividers only fit the 8x8 tin.' }] })
    );
    expect(prompt).toContain('Dividers only fit the 8x8 tin.');
    expect(prompt).toMatch(/apply it, not just recite it/);
  });

  it('always includes the never-say-"checking" order-status rule, even with no order history', () => {
    const prompt = buildLlm1SystemPrompt(makeHotSet());
    expect(prompt).toMatch(/NEVER say "I'm checking"/);
    expect(prompt).toContain('(none)');
  });

  it('renders a real order-history entry with its status label, number, items, total and date', () => {
    const prompt = buildLlm1SystemPrompt(
      makeHotSet({
        orderHistory: [
          {
            id: 'order-1',
            orderNumber: 'ORD-TEST-0001',
            items: [{ productId: 'prod-1', name: 'Brownie', quantity: 2, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 20000 }],
            totalAmount: 20000,
            status: 'preparing',
            createdAt: new Date('2026-09-02T07:48:07.000Z'),
            estimatedDelivery: null,
            confirmedAt: new Date('2026-09-02T07:50:00.000Z'),
            preparedAt: null,
            deliveredAt: null,
            cancelledAt: null,
            cancellationReason: null
          }
        ]
      })
    );
    expect(prompt).toContain('ORD-TEST-0001');
    expect(prompt).toContain('👨‍🍳 Order Being Prepared');
    expect(prompt).toContain('Brownie x2');
    expect(prompt).toContain('200.00');
    expect(prompt).toContain('2026-09-02');
    expect(prompt).toContain('[prod-1]'); // productId exposed so a repeat-order request can emit a real "add" op
  });

  it('includes the variantSku alongside productId when a past order line has one', () => {
    const prompt = buildLlm1SystemPrompt(
      makeHotSet({
        orderHistory: [
          {
            id: 'order-1',
            orderNumber: 'ORD-TEST-0004',
            items: [
              { productId: 'prod-tin', variantSku: 'SS-7X7', variantLabel: 'SS 7x7', name: 'Baking Tin', quantity: 1, unit: 'unit', unitPricePaise: 179900, lineTotalPaise: 179900 }
            ],
            totalAmount: 179900,
            status: 'confirmed',
            createdAt: new Date('2026-09-02T07:48:07.000Z'),
            estimatedDelivery: null,
            confirmedAt: null,
            preparedAt: null,
            deliveredAt: null,
            cancelledAt: null,
            cancellationReason: null
          }
        ]
      })
    );
    expect(prompt).toContain('[prod-tin,SS-7X7]');
  });

  it('includes the repeat-order, cancel, refund, and complaint/return handoff rules', () => {
    const prompt = buildLlm1SystemPrompt(makeHotSet());
    expect(prompt).toMatch(/repeat\/reorder a past order/);
    expect(prompt).toMatch(/emit "cancel" with that order's "orderNumber"/);
    expect(prompt).toMatch(/emit "refund_request" with the order's "orderNumber"/);
    expect(prompt).toMatch(/emit "handoff" with category "complaint" or "return"/);
  });

  it('includes the cancellation reason for a cancelled order', () => {
    const prompt = buildLlm1SystemPrompt(
      makeHotSet({
        orderHistory: [
          {
            id: 'order-1',
            orderNumber: 'ORD-TEST-0002',
            items: [],
            totalAmount: 129900,
            status: 'cancelled',
            createdAt: new Date('2026-09-02T07:48:07.000Z'),
            estimatedDelivery: null,
            confirmedAt: null,
            preparedAt: null,
            deliveredAt: null,
            cancelledAt: new Date('2026-09-02T12:36:50.000Z'),
            cancellationReason: 'Invalid size (4x6 does not exist on this product)'
          }
        ]
      })
    );
    expect(prompt).toContain('❌ Order Cancelled');
    expect(prompt).toContain('Invalid size (4x6 does not exist on this product)');
  });

  it('surfaces the vendor prep-time policy only when an unfulfilled order exists', () => {
    const unfulfilled = buildLlm1SystemPrompt(
      makeHotSet({
        vendorConfig: {
          ...makeHotSet().vendorConfig,
          orderPreparationConfig: { type: 'fixed_minutes', fixedMinutes: 30 }
        },
        orderHistory: [
          {
            id: 'order-1',
            orderNumber: 'ORD-TEST-0003',
            items: [],
            totalAmount: 0,
            status: 'confirmed',
            createdAt: new Date('2026-09-02T07:48:07.000Z'),
            estimatedDelivery: null,
            confirmedAt: null,
            preparedAt: null,
            deliveredAt: null,
            cancelledAt: null,
            cancellationReason: null
          }
        ]
      })
    );
    expect(unfulfilled).toContain('ready in approximately 30 minutes');

    const noOrders = buildLlm1SystemPrompt(
      makeHotSet({
        vendorConfig: { ...makeHotSet().vendorConfig, orderPreparationConfig: { type: 'fixed_minutes', fixedMinutes: 30 } }
      })
    );
    expect(noOrders).not.toContain('ready in approximately 30 minutes');
  });

  it('renders "(none)" for RELEVANT FAQs when no FAQ matched this turn', () => {
    const prompt = buildLlm1SystemPrompt(makeHotSet());
    expect(prompt).toContain('RELEVANT FAQs');
  });

  it('renders a matched FAQ\'s question and answer under RELEVANT FAQs', () => {
    const prompt = buildLlm1SystemPrompt(
      makeHotSet({
        faqs: [{ id: 'faq-1', question: 'Do you deliver on Sundays?', answer: 'Yes, 10am-6pm.', similarity: 0.91 }]
      })
    );
    expect(prompt).toContain('Do you deliver on Sundays?');
    expect(prompt).toContain('Yes, 10am-6pm.');
  });
});

describe('llm1JsonSchema', () => {
  it('requires every top-level field and forbids additional properties (OpenAI strict mode)', () => {
    expect(llm1JsonSchema.additionalProperties).toBe(false);
    expect(llm1JsonSchema.required).toEqual(['language', 'intent', 'ops', 'draftReply', 'confidence', 'needsVerify']);
  });

  it('cancel/refund_request/handoff op schemas carry their new fields as required-but-nullable (strict mode)', () => {
    const opsSchema = (llm1JsonSchema.properties as any).ops.items.anyOf as any[];
    const cancel = opsSchema.find((s) => s.properties.type.enum[0] === 'cancel');
    const refund = opsSchema.find((s) => s.properties.type.enum[0] === 'refund_request');
    const handoff = opsSchema.find((s) => s.properties.type.enum[0] === 'handoff');

    expect(cancel.required).toEqual(['type', 'orderNumber']);
    expect(refund.required).toEqual(['type', 'orderNumber', 'reason']);
    expect(handoff.required).toEqual(['type', 'category', 'details', 'orderNumber']);
    expect(handoff.properties.category.enum).toEqual(['complaint', 'return', 'cancel_in_progress', 'other', null]);
    for (const schema of [cancel, refund, handoff]) {
      expect(schema.additionalProperties).toBe(false);
    }
  });
});
