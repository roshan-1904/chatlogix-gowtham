export type LlmSamplingRole = 'llm1' | 'llm2';

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
