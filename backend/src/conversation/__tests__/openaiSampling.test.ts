import { describe, it, expect } from 'vitest';
import {
  maxCompletionTokensForModel,
  modelUsesDefaultSamplingOnly,
  openaiChatCompletionParams
} from '../llm/openaiSampling.js';

describe('openaiSampling', () => {
  it('treats gpt-5.6-luna as reasoning-only sampling', () => {
    expect(modelUsesDefaultSamplingOnly('gpt-5.6-luna')).toBe(true);
    const params = openaiChatCompletionParams('gpt-5.6-luna', 'llm1');
    expect(params.temperature).toBeUndefined();
    expect(params.max_completion_tokens).toBe(2500);
    expect(params.reasoning_effort).toBe('low');
  });

  it('keeps classic caps for gpt-4.1-mini', () => {
    expect(modelUsesDefaultSamplingOnly('gpt-4.1-mini')).toBe(false);
    expect(maxCompletionTokensForModel('gpt-4.1-mini', 'llm1')).toBe(400);
    expect(openaiChatCompletionParams('gpt-4.1-mini', 'llm1').temperature).toBe(0.3);
  });
});
