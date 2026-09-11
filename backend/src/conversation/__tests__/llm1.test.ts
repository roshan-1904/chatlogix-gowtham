import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock() factories are hoisted above the whole module body, including any
// plain `const` declared earlier in source — so a value a factory needs must
// be created via vi.hoisted(), not a plain const, or it's in its temporal
// dead zone when the (also-hoisted) factory runs at import time.
const { createMock, emitMetricMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  emitMetricMock: vi.fn()
}));

// llm1.ts builds its module-level OpenAI client from `env.OPENAI_API_KEY` at
// import time, so the env mock must be in place (via a factory, not a later
// mutation) before `llm1.js` is first imported below.
vi.mock('../../config/env.js', () => ({
  env: { OPENAI_API_KEY: 'test-key' }
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } }
  }))
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../../observability/metrics.js', () => ({
  emitMetric: (...args: unknown[]) => emitMetricMock(...args)
}));

import { runLlm1 } from '../llm/llm1.js';
import type { HotSet } from '../types.js';

const hotSet: HotSet = {
  vendorConfig: {
    id: 'vendor-1',
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
    aiModel: 'gpt-4.1-mini',
    askForPreferredDeliveryDate: false
  },
  compactCatalog: [
    {
      id: 'prod-1',
      name: 'Brownie',
      price: 10000,
      unit: 'box',
      baseQuantity: 1,
      minQty: null,
      maxQty: null,
      keywords: ['brownie'],
      fulfillmentType: 'made_to_order',
      inStock: true,
      stockQuantity: null,
      variants: [],
      description: '',
      isDivisible: true
    }
  ],
  memory: null,
  pendingOrder: null,
  orderHistory: [],
  faqs: [],
  insights: null,
  recentMessages: []
};

function mockCompletion(resultOverrides: Record<string, unknown> = {}, usage = { prompt_tokens: 500, completion_tokens: 80 }) {
  const result = {
    language: 'en',
    intent: 'order_item',
    ops: [{ type: 'add', productId: 'prod-1', qty: 2, notes: null }],
    draftReply: 'Sure, added 2 Brownies!',
    confidence: 0.9,
    needsVerify: false,
    ...resultOverrides
  };
  return {
    choices: [{ message: { content: JSON.stringify(result) } }],
    usage
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runLlm1', () => {
  it('calls the model with the resolved vendor model, strict json_schema, and the §13 token cap', async () => {
    createMock.mockResolvedValue(mockCompletion());

    await runLlm1({ vendorId: 'vendor-1', hotSet, mergedContent: 'add 2 brownies', traceId: 'wamid.1' });

    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe('gpt-4.1-mini');
    expect(call.max_completion_tokens).toBe(400);
    expect(call.response_format.type).toBe('json_schema');
    expect(call.response_format.json_schema.strict).toBe(true);
    expect(call.messages[1]).toEqual({ role: 'user', content: 'add 2 brownies' });
  });

  it('puts voice-note instructions in the system prompt when sourceMessageType is audio', async () => {
    createMock.mockResolvedValue(mockCompletion());

    await runLlm1({
      vendorId: 'vendor-1',
      hotSet,
      mergedContent: 'பையனுக்கு birthday',
      traceId: 'wamid.audio',
      sourceMessageType: 'audio'
    });

    const call = createMock.mock.calls[0][0];
    expect(call.messages[0].content).toContain('VOICE NOTE:');
    expect(call.messages[1]).toEqual({ role: 'user', content: 'பையனுக்கு birthday' });
  });

  it('returns the parsed result plus model/token usage', async () => {
    createMock.mockResolvedValue(mockCompletion());

    const result = await runLlm1({ vendorId: 'vendor-1', hotSet, mergedContent: 'add 2 brownies', traceId: 'wamid.1' });

    expect(result.draftReply).toBe('Sure, added 2 Brownies!');
    expect(result.model).toBe('gpt-4.1-mini');
    expect(result.promptTokens).toBe(500);
    expect(result.completionTokens).toBe(80);
    expect(result.ops).toEqual([{ type: 'add', productId: 'prod-1', qty: 2, notes: null }]);
  });

  it('drops ops referencing a productId not in the compact catalog and emits a metric', async () => {
    createMock.mockResolvedValue(
      mockCompletion({
        ops: [
          { type: 'add', productId: 'prod-1', qty: 1, notes: null },
          { type: 'add', productId: 'hallucinated-id', qty: 1, notes: null }
        ]
      })
    );

    const result = await runLlm1({ vendorId: 'vendor-1', hotSet, mergedContent: 'add stuff', traceId: 'wamid.2' });

    expect(result.ops).toEqual([{ type: 'add', productId: 'prod-1', qty: 1, notes: null }]);
    expect(emitMetricMock).toHaveBeenCalledWith('Llm1HallucinatedProductId', 1, {
      dimensions: { vendorId: 'vendor-1', processor: 'conversation-v1' }
    });
  });

  it('throws if the model refuses', async () => {
    createMock.mockResolvedValue({ choices: [{ message: { refusal: 'unable to comply' } }], usage: {} });

    await expect(runLlm1({ vendorId: 'vendor-1', hotSet, mergedContent: 'x', traceId: 'wamid.3' })).rejects.toThrow(/refused/);
  });

  it('throws if the model returns no content', async () => {
    createMock.mockResolvedValue({ choices: [{ message: {} }], usage: {} });

    await expect(runLlm1({ vendorId: 'vendor-1', hotSet, mergedContent: 'x', traceId: 'wamid.4' })).rejects.toThrow(/no content/);
  });
});
