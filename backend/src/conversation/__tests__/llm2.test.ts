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

import { shouldRunLlm2, runLlm2, renderSnapshotReply, copyMatchesSnapshot, selectFinalReply } from '../llm/llm2.js';
import type { CartOp, CartSnapshot } from '../types.js';

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('shouldRunLlm2', () => {
  const noop: CartOp[] = [{ type: 'noop' }];
  const addOp: CartOp[] = [{ type: 'add', productId: 'p1', qty: 1 }];

  it('runs for any cart-mutating op type', () => {
    expect(shouldRunLlm2(addOp, false, 0.99)).toBe(true);
    expect(shouldRunLlm2([{ type: 'set_qty', productId: 'p1', qty: 1 }], false, 0.99)).toBe(true);
    expect(shouldRunLlm2([{ type: 'remove', productId: 'p1' }], false, 0.99)).toBe(true);
    expect(shouldRunLlm2([{ type: 'set_field', field: 'address', value: 'x' }], false, 0.99)).toBe(true);
    expect(shouldRunLlm2([{ type: 'confirm' }], false, 0.99)).toBe(true);
    expect(shouldRunLlm2([{ type: 'cancel' }], false, 0.99)).toBe(true);
  });

  it('does not run for noop/handoff alone with high confidence and no needsVerify', () => {
    expect(shouldRunLlm2(noop, false, 0.99)).toBe(false);
    expect(shouldRunLlm2([{ type: 'handoff' }], false, 0.99)).toBe(false);
  });

  it('runs when needsVerify is true, even with only a noop', () => {
    expect(shouldRunLlm2(noop, true, 0.99)).toBe(true);
  });

  it('runs when confidence is below the threshold', () => {
    expect(shouldRunLlm2(noop, false, 0.5)).toBe(true);
    expect(shouldRunLlm2(noop, false, 0.8, 0.9)).toBe(true); // explicit threshold override
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
});

describe('copyMatchesSnapshot', () => {
  it('is true when every item name is mentioned', () => {
    expect(copyMatchesSnapshot('You have 2 Brownie and 1 Cookies in your cart.', snapshotWithItems)).toBe(true);
  });

  it('is false when a snapshot line is omitted (§26 test 9 scenario)', () => {
    expect(copyMatchesSnapshot('You have 2 Brownie in your cart.', snapshotWithItems)).toBe(false);
  });
});

describe('selectFinalReply', () => {
  it('uses the draft reply as-is when LLM-2 was skipped', () => {
    const decision = selectFinalReply({
      draftReply: 'draft text',
      llm2Result: { skipped: true },
      snapshot: snapshotWithItems,
      traceId: 'wamid.1'
    });
    expect(decision).toEqual({ finalReply: 'draft text', usedEngineRenderer: false });
  });

  it('uses LLM-2\'s copy when it matches the snapshot', () => {
    const decision = selectFinalReply({
      draftReply: 'draft text',
      llm2Result: { skipped: false, finalReply: 'You ordered 2 Brownie and 1 Cookies, total Rs250.', promptTokens: 1, completionTokens: 1 },
      snapshot: snapshotWithItems,
      traceId: 'wamid.2'
    });
    expect(decision.finalReply).toBe('You ordered 2 Brownie and 1 Cookies, total Rs250.');
    expect(decision.usedEngineRenderer).toBe(false);
  });

  it('§26 test 9: falls back to the engine renderer when LLM-2 omits a snapshot line, never sending LLM-2\'s bad list', () => {
    const decision = selectFinalReply({
      draftReply: 'draft text',
      llm2Result: { skipped: false, finalReply: 'You ordered 2 Brownie, total Rs250.', promptTokens: 1, completionTokens: 1 }, // omits Cookies
      snapshot: snapshotWithItems,
      traceId: 'wamid.3'
    });
    expect(decision.usedEngineRenderer).toBe(true);
    expect(decision.finalReply).toBe(renderSnapshotReply(snapshotWithItems));
    expect(decision.finalReply).toContain('Cookies');
  });
});
