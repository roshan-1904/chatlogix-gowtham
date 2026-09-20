export type LlmSamplingRole = 'llm1' | 'llm2';

/** Visible JSON for LLM-1 is capped ~400 tokens; gpt-5.* also spends budget on hidden reasoning. */
export const LLM1_MAX_COMPLETION_TOKENS_CLASSIC = 400;
export const LLM2_MAX_COMPLETION_TOKENS_CLASSIC = 300;

/** Enough headroom for reasoning + strict JSON on gpt-5.* / o* (see OpenAI community: 400 → empty content). */
export const LLM1_MAX_COMPLETION_TOKENS_REASONING = 2500;
export const LLM2_MAX_COMPLETION_TOKENS_REASONING = 1200;

/**
 * OpenAI models in the gpt-5.* and o* reasoning families only support the
 * default temperature (1). Omit `temperature` so the API does not return 400.
 */
export function modelUsesDefaultSamplingOnly(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (/^gpt-5/i.test(normalized)) return true;
  if (/^o/i.test(normalized)) return true;
  return false;
}

/** LLM-1 uses 0.3, LLM-2 uses 0.2 unless the model requires default sampling. */
export function openaiSamplingParams(model: string, role: LlmSamplingRole): { temperature?: number } {
  if (modelUsesDefaultSamplingOnly(model)) {
    return {};
  }
  return { temperature: role === 'llm1' ? 0.3 : 0.2 };
}

export function maxCompletionTokensForModel(model: string, role: LlmSamplingRole): number {
  if (modelUsesDefaultSamplingOnly(model)) {
    return role === 'llm1' ? LLM1_MAX_COMPLETION_TOKENS_REASONING : LLM2_MAX_COMPLETION_TOKENS_REASONING;
  }
  return role === 'llm1' ? LLM1_MAX_COMPLETION_TOKENS_CLASSIC : LLM2_MAX_COMPLETION_TOKENS_CLASSIC;
}

/**
 * Chat Completions knobs for LLM-1 / LLM-2. Reasoning models need a larger
 * `max_completion_tokens` budget and lower `reasoning_effort` or the API
 * returns finish_reason=length with empty message.content.
 */
export function openaiChatCompletionParams(
  model: string,
  role: LlmSamplingRole
): {
  temperature?: number;
  max_completion_tokens: number;
  reasoning_effort?: 'low' | 'minimal' | 'medium' | 'high';
} {
  const params: {
    temperature?: number;
    max_completion_tokens: number;
    reasoning_effort?: 'low' | 'minimal' | 'medium' | 'high';
  } = {
    ...openaiSamplingParams(model, role),
    max_completion_tokens: maxCompletionTokensForModel(model, role)
  };
  if (modelUsesDefaultSamplingOnly(model)) {
    params.reasoning_effort = 'low';
  }
  return params;
}
