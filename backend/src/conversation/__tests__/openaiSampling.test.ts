import { describe, it, expect } from 'vitest';
import {
  isUnsupportedTemperatureError,
  maxCompletionTokensForModel,
  modelUsesDefaultSamplingOnly,
  openaiChatCompletionParams,
  retryMaxCompletionTokens,
  shouldRetryEmptyContent
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

  it('detects the live OpenAI temperature 400 shape', () => {
    expect(
      isUnsupportedTemperatureError({
        status: 400,
        code: 'unsupported_value',
        param: 'temperature'
      })
    ).toBe(true);
    expect(
      isUnsupportedTemperatureError(
        Object.assign(new Error("400 Unsupported value: 'temperature' does not support 0.3 with this model."), {
          status: 400
        })
      )
    ).toBe(true);
    expect(isUnsupportedTemperatureError({ status: 400, code: 'invalid_request_error' })).toBe(false);
  });

  it('retries empty length/stop completions but not refusals or content_filter', () => {
    expect(shouldRetryEmptyContent({ finish_reason: 'length', message: { content: null } })).toBe(true);
    expect(shouldRetryEmptyContent({ finish_reason: 'stop', message: {} })).toBe(true);
    expect(shouldRetryEmptyContent({ finish_reason: 'content_filter', message: {} })).toBe(false);
    expect(shouldRetryEmptyContent({ finish_reason: 'stop', message: { refusal: 'no' } })).toBe(false);
    expect(retryMaxCompletionTokens('llm1')).toBe(4000);
  });
});
