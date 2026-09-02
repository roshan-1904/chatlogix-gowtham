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
});

describe('llm1JsonSchema', () => {
  it('requires every top-level field and forbids additional properties (OpenAI strict mode)', () => {
    expect(llm1JsonSchema.additionalProperties).toBe(false);
    expect(llm1JsonSchema.required).toEqual(['language', 'intent', 'ops', 'draftReply', 'confidence', 'needsVerify']);
  });
});
