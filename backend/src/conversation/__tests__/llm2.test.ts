import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('../../config/env.js', () => ({
  env: { OPENAI_API_KEY: 'test-key', VERIFY_THRESHOLD: '0.75' }
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } }
  }))
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../metrics.js', () => ({
  logCount: vi.fn()
}));

import {
  shouldRunLlm2,
  runLlm2,
  renderSnapshotReply,
  renderRejectedOpsReply,
  renderSetFieldConfirmation,
  copyMatchesSnapshot,
  selectFinalReply,
  possiblyOverclaimsAgainstCatalog,
  isPhantomMutation,
  renderPossibleMissedItemReply
} from '../llm/llm2.js';
import type { CartOp, CartSnapshot, CompactCatalogEntry } from '../types.js';

const snapshotWithItems: CartSnapshot = {
  orderId: 'order-1',
  status: 'pending',
  items: [
    { productId: 'prod-1', name: 'Brownie', quantity: 2, unit: 'box', unitPricePaise: 10000, lineTotalPaise: 20000 },
    { productId: 'prod-2', name: 'Cookies', quantity: 1, unit: 'box', unitPricePaise: 5000, lineTotalPaise: 5000 }
  ],
  totalPaise: 25000,
  customerName: 'Priya',
  address: '123 Main St',
  missing: []
};

const emptySnapshot: CartSnapshot = {
  orderId: null,
  status: 'none',
  items: [],
  totalPaise: 0,
  customerName: null,
  address: null,
  missing: ['name', 'address', 'items']
};

const compactCatalog: CompactCatalogEntry[] = [
  { id: 'prod-1', name: 'Brownie', price: 10000, unit: 'box', baseQuantity: 1, minQty: null, maxQty: null, keywords: [], fulfillmentType: 'made_to_order', inStock: true, stockQuantity: null, variants: [], description: '', isDivisible: true, imageCount: 0, videoCount: 0, mediaLabels: [] },
  { id: 'prod-2', name: 'Cookies', price: 5000, unit: 'box', baseQuantity: 1, minQty: null, maxQty: null, keywords: [], fulfillmentType: 'made_to_order', inStock: true, stockQuantity: null, variants: [], description: '', isDivisible: true, imageCount: 0, videoCount: 0, mediaLabels: [] },
  // Mirrors the real 2026-09-04 incident's catalog entry: sold loose by kg
  // (isDivisible: true) AND as fixed box variants -- the actual root cause
  // of that incident was the prompt not surfacing isDivisible at all.
  { id: 'prod-3', name: 'Karuppu Kavuni Rice Brownie with Cashew', price: 120000, unit: 'kg', baseQuantity: 1, minQty: 0.5, maxQty: 100, keywords: [], fulfillmentType: 'made_to_order', inStock: true, stockQuantity: 1000, variants: [], description: '', isDivisible: true, imageCount: 0, videoCount: 0, mediaLabels: [] }
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('shouldRunLlm2', () => {
  const noop: CartOp[] = [{ type: 'noop' }];
  const addOp: CartOp[] = [{ type: 'add', productId: 'p1', qty: 1 }];

  it('runs for cart-mutating op types except set_field-only', () => {
    expect(shouldRunLlm2(addOp, false, 0.99)).toBe(true);
    expect(shouldRunLlm2([{ type: 'set_qty', productId: 'p1', qty: 1 }], false, 0.99)).toBe(true);
    expect(shouldRunLlm2([{ type: 'remove', productId: 'p1' }], false, 0.99)).toBe(true);
    expect(shouldRunLlm2([{ type: 'confirm' }], false, 0.99)).toBe(true);
    expect(shouldRunLlm2([{ type: 'cancel' }], false, 0.99)).toBe(true);
  });

  it('does not run for noop/handoff/knowledge_gap alone with high confidence and no needsVerify', () => {
    expect(shouldRunLlm2(noop, false, 0.99)).toBe(false);
    expect(shouldRunLlm2([{ type: 'handoff' }], false, 0.99)).toBe(false);
    expect(
      shouldRunLlm2(
        [{ type: 'knowledge_gap', question: 'Does it include dividers?', category: 'product', productId: null }],
        false,
        0.99
      )
    ).toBe(false);
  });

  it('runs when needsVerify is true, even with only a noop', () => {
    expect(shouldRunLlm2(noop, true, 0.99)).toBe(true);
  });

  it('runs when confidence is below the threshold', () => {
    expect(shouldRunLlm2(noop, false, 0.5)).toBe(true);
    expect(shouldRunLlm2(noop, false, 0.8, 0.9)).toBe(true); // explicit threshold override
  });

  it('does not run for set_field-only ops (deterministic confirmation path)', () => {
    expect(shouldRunLlm2([{ type: 'set_field', field: 'address', value: '123 Main St' }], false, 0.99)).toBe(false);
    expect(shouldRunLlm2(
      [{ type: 'set_field', field: 'name', value: 'Raji' }, { type: 'set_field', field: 'address', value: 'Coimbatore' }],
      true,
      0.99
    )).toBe(false);
  });
});

describe('runLlm2', () => {
  const baseInput = {
    draftReply: 'Sure, added 2 Brownies and 1 Cookies!',
    snapshot: snapshotWithItems,
    vendorId: 'vendor-1',
    language: 'en',
    model: 'gpt-4.1-mini',
    ops: [{ type: 'add' as const, productId: 'prod-1', qty: 2 }],
    needsVerify: false,
    confidence: 0.9
  };

  it('skips without calling OpenAI when shouldRunLlm2 is false', async () => {
    const result = await runLlm2({ ...baseInput, ops: [{ type: 'noop' }], confidence: 0.99 });

    expect(result).toEqual({ skipped: true });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('calls the model with the given model id, strict schema, and the §8 latency-budget token cap', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ finalReply: 'polished reply' }) } }],
      usage: { prompt_tokens: 300, completion_tokens: 40 }
    });

    const result = await runLlm2(baseInput);

    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('gpt-4.1-mini');
    expect(call.max_completion_tokens).toBe(300);
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(result).toEqual({ skipped: false, finalReply: 'polished reply', promptTokens: 300, completionTokens: 40 });
  });

  it('throws if the model refuses', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { refusal: 'no' } }], usage: {} });

    await expect(runLlm2(baseInput)).rejects.toThrow(/refused/);
  });
});

describe('renderSnapshotReply', () => {
  it('lists every line and the total for a non-empty cart', () => {
    const text = renderSnapshotReply(snapshotWithItems);
    expect(text).toContain('Brownie x2 box');
    expect(text).toContain('Cookies x1 box');
    expect(text).toContain('250.00');
  });

  it('returns an empty-cart message for an empty cart', () => {
    expect(renderSnapshotReply(emptySnapshot)).toMatch(/empty/i);
  });

  it('uses universal Total: Rs label for all languages', () => {
    const text = renderSnapshotReply(snapshotWithItems, 'ml');
    expect(text).toContain('Total: Rs250.00');
    expect(text).toContain('Brownie x2 box');
  });
});

describe('renderRejectedOpsReply', () => {
  it('never claims success — states the rejection reason and shows the true (empty) cart', () => {
    const text = renderRejectedOpsReply(
      [{ op: { type: 'add', productId: 'nonexistent', qty: 1 }, reason: 'product_not_found' }],
      emptySnapshot
    );
    expect(text).toMatch(/catalog/i);
    expect(text).toMatch(/empty/i);
    expect(text).not.toMatch(/added|confirmed/i);
  });

  it('reflects a variant_not_found rejection distinctly from product_not_found', () => {
    const text = renderRejectedOpsReply(
      [{ op: { type: 'add', productId: 'prod-1', variantSku: 'no-cashew', qty: 1 }, reason: 'variant_not_found' }],
      emptySnapshot
    );
    expect(text).toMatch(/option/i);
  });

  it('still shows real cart contents when other items succeeded in the same turn', () => {
    const text = renderRejectedOpsReply(
      [{ op: { type: 'add', productId: 'nonexistent', qty: 1 }, reason: 'product_not_found' }],
      snapshotWithItems
    );
    expect(text).toContain('Brownie x2 box');
    expect(text).toContain('Cookies x1 box');
  });

  it('combines multiple distinct rejection reasons into one message', () => {
    const text = renderRejectedOpsReply(
      [
        { op: { type: 'add', productId: 'nonexistent', qty: 1 }, reason: 'product_not_found' },
        { op: { type: 'confirm' }, reason: 'missing_address' }
      ],
      emptySnapshot
    );
    expect(text).toMatch(/catalog/i);
    expect(text).toMatch(/details/i);
  });
});

describe('copyMatchesSnapshot', () => {
  it('is true when every item name is mentioned', () => {
    expect(copyMatchesSnapshot('You have 2 Brownie and 1 Cookies in your cart.', snapshotWithItems)).toBe(true);
  });

  it('is false when a snapshot line is omitted (§26 test 9 scenario)', () => {
    expect(copyMatchesSnapshot('You have 2 Brownie in your cart.', snapshotWithItems)).toBe(false);
  });

  it('accepts non-English replies that include total and quantities without English product names', () => {
    const hindiReply = 'ठीक है! 2 बॉक्स और 1 बॉक्स जोड़ दिया। कुल Rs250.00 है।';
    expect(copyMatchesSnapshot(hindiReply, snapshotWithItems, 'hi')).toBe(true);
    expect(copyMatchesSnapshot(hindiReply, snapshotWithItems, 'ml')).toBe(true);
  });
});

describe('renderSetFieldConfirmation', () => {
  it('uses English templates for en', () => {
    const text = renderSetFieldConfirmation(
      [{ type: 'set_field', field: 'address', value: 'Tower 10, Coimbatore' }],
      snapshotWithItems,
      'en'
    );
    expect(text).toContain('Tower 10, Coimbatore');
    expect(text).not.toContain('Brownie x2');
  });

  it('uses LLM draftReply for non-English instead of English templates', () => {
    const malayalamDraft = 'നന്ദി! ഡെലിവറി വിലാസം സേവ് ചെയ്തു.';
    const text = renderSetFieldConfirmation(
      [{ type: 'set_field', field: 'address', value: 'Kochi' }],
      snapshotWithItems,
      'ml',
      malayalamDraft
    );
    expect(text).toBe(malayalamDraft);
    expect(text).not.toContain('Brownie x2');
  });
});

describe('selectFinalReply', () => {
  it('uses the draft reply as-is when LLM-2 was skipped', () => {
    const decision = selectFinalReply({
      draftReply: 'draft text',
      llm2Result: { skipped: true },
      snapshot: snapshotWithItems,
      traceId: 'wamid.1',
      intent: 'query',
      ops: [],
      compactCatalog,
      language: 'en'
    });
    expect(decision).toEqual({ finalReply: 'draft text', usedEngineRenderer: false });
  });

  it('uses set_field confirmation when LLM-2 was skipped for address-only ops', () => {
    const decision = selectFinalReply({
      draftReply: 'Thanks, saved your address!',
      llm2Result: { skipped: true },
      snapshot: snapshotWithItems,
      traceId: 'wamid.1b',
      intent: 'set_field',
      ops: [{ type: 'set_field', field: 'address', value: '123 Main St' }],
      compactCatalog,
      language: 'en'
    });
    expect(decision.usedEngineRenderer).toBe(true);
    expect(decision.finalReply).toContain('123 Main St');
    expect(decision.finalReply).not.toContain('Brownie x2');
  });

  it('uses LLM-2\'s copy when it matches the snapshot', () => {
    const decision = selectFinalReply({
      draftReply: 'draft text',
      llm2Result: { skipped: false, finalReply: 'You ordered 2 Brownie and 1 Cookies, total Rs250.', promptTokens: 1, completionTokens: 1 },
      snapshot: snapshotWithItems,
      traceId: 'wamid.2',
      intent: 'add',
      ops: [{ type: 'add', productId: 'prod-1', qty: 2 }],
      compactCatalog,
      language: 'en'
    });
    expect(decision.finalReply).toBe('You ordered 2 Brownie and 1 Cookies, total Rs250.');
    expect(decision.usedEngineRenderer).toBe(false);
  });

  it('§26 test 9: merges draft lead with grounded cart when LLM-2 omits a snapshot line', () => {
    const decision = selectFinalReply({
      draftReply: 'Added your items!',
      llm2Result: { skipped: false, finalReply: 'You ordered 2 Brownie, total Rs250.', promptTokens: 1, completionTokens: 1 }, // omits Cookies
      snapshot: snapshotWithItems,
      traceId: 'wamid.3',
      intent: 'add',
      ops: [{ type: 'add', productId: 'prod-1', qty: 2 }],
      compactCatalog,
      language: 'en',
      cartMutated: true
    });
    expect(decision.usedEngineRenderer).toBe(true);
    expect(decision.finalReply).toContain('Added your items!');
    expect(decision.finalReply).toContain('Cookies');
    expect(decision.finalReply).not.toBe('You ordered 2 Brownie, total Rs250.');
  });

  it('keeps non-English address reply without cart dump on query turns', () => {
    const hindiReply = 'कृपया अपना पूरा डिलीवरी पता भेजें — अभी तक हमारे पास पता नहीं है।';
    const decision = selectFinalReply({
      draftReply: hindiReply,
      llm2Result: { skipped: false, finalReply: hindiReply, promptTokens: 1, completionTokens: 1 },
      snapshot: snapshotWithItems,
      traceId: 'wamid.3b',
      intent: 'query',
      ops: [{ type: 'noop' }],
      compactCatalog,
      language: 'hi'
    });
    expect(decision.usedEngineRenderer).toBe(false);
    expect(decision.finalReply).toBe(hindiReply);
    expect(decision.finalReply).not.toContain('Brownie x2');
  });

  it('keeps Malayalam query reply without cart dump', () => {
    const mlReply = 'ദയവായി നിങ്ങളുടെ ഡെലിവറി വിലാസം അയയ്ക്കുക.';
    const decision = selectFinalReply({
      draftReply: mlReply,
      llm2Result: { skipped: false, finalReply: mlReply, promptTokens: 1, completionTokens: 1 },
      snapshot: snapshotWithItems,
      traceId: 'wamid.3c',
      intent: 'query',
      ops: [{ type: 'noop' }],
      compactCatalog,
      language: 'ml'
    });
    expect(decision.finalReply).toBe(mlReply);
    expect(decision.finalReply).not.toContain('Brownie');
  });

  it('2026-09-04 incident repro: LLM-2 skipped, ops empty, intent "add", draftReply confirms an item not in the cart — falls back to renderPossibleMissedItemReply instead of the false confirmation', () => {
    const draftReply = 'Got it! Adding 2.5 kg of Karuppu Kavuni Rice Brownie with Cashew to your order. Could you please share your name and delivery address to proceed?';
    const decision = selectFinalReply({
      draftReply,
      llm2Result: { skipped: true },
      snapshot: snapshotWithItems, // Brownie/Cookies only — no Karuppu Kavuni line
      traceId: 'wamid.4',
      intent: 'add',
      ops: [],
      compactCatalog,
      language: 'en'
    });
    expect(decision.usedEngineRenderer).toBe(true);
    expect(decision.finalReply).not.toContain('Adding 2.5 kg of Karuppu Kavuni');
    expect(decision.finalReply).toBe(renderPossibleMissedItemReply(snapshotWithItems));
  });

  it('does not treat an informational mention as a phantom mutation when intent is "query"', () => {
    const draftReply = 'We also have Karuppu Kavuni Rice Brownie with Cashew if you\'d like to try it!';
    const decision = selectFinalReply({
      draftReply,
      llm2Result: { skipped: true },
      snapshot: snapshotWithItems,
      traceId: 'wamid.5',
      intent: 'query',
      ops: [],
      compactCatalog,
      language: 'en'
    });
    expect(decision).toEqual({ finalReply: draftReply, usedEngineRenderer: false });
  });
});

describe('possiblyOverclaimsAgainstCatalog', () => {
  it('is true when the text names a catalog product absent from the snapshot', () => {
    expect(possiblyOverclaimsAgainstCatalog('Adding Karuppu Kavuni Rice Brownie with Cashew now!', snapshotWithItems, compactCatalog)).toBe(true);
  });

  it('is false when the named product is already in the snapshot', () => {
    expect(possiblyOverclaimsAgainstCatalog('Adding another Brownie!', snapshotWithItems, compactCatalog)).toBe(false);
  });

  it('is false when no catalog product name appears in the text', () => {
    expect(possiblyOverclaimsAgainstCatalog('Sure, what would you like to order?', snapshotWithItems, compactCatalog)).toBe(false);
  });
});

describe('isPhantomMutation', () => {
  it('fires for a mutating intent with empty ops and an overclaiming draft reply', () => {
    expect(
      isPhantomMutation('add', [], 'Adding Karuppu Kavuni Rice Brownie with Cashew now!', snapshotWithItems, compactCatalog)
    ).toBe(true);
  });

  it('never fires when ops is non-empty, regardless of intent', () => {
    expect(
      isPhantomMutation('add', [{ type: 'noop' }], 'Adding Karuppu Kavuni Rice Brownie with Cashew now!', snapshotWithItems, compactCatalog)
    ).toBe(false);
  });

  it('never fires for a non-mutating intent (e.g. "query")', () => {
    expect(
      isPhantomMutation('query', [], 'We also have Karuppu Kavuni Rice Brownie with Cashew!', snapshotWithItems, compactCatalog)
    ).toBe(false);
  });
});
