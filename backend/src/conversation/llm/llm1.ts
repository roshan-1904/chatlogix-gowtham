import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { logger } from '../../logger.js';
import { emitMetric } from '../../observability/metrics.js';
import { buildLlm1SystemPrompt, llm1JsonSchema } from './prompts.js';
import { validateProductIds } from '../cart/productResolve.js';
import type { CompactCatalogEntry, HotSet, Llm1Result } from '../types.js';
import { logCount } from '../metrics.js';
import { openaiSamplingParams } from './openaiSampling.js';

// Module-level singleton, same pattern as every other OpenAI call site in
// the codebase (e.g. unifiedAIProcessorService.ts).
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface Llm1Input {
  vendorId: string;
  hotSet: HotSet;
  catalogSlice: CompactCatalogEntry[];
  /** When set (shadow mode), prompt uses this slice while guards use catalogSlice. */
  promptCatalogSlice?: CompactCatalogEntry[];
  mergedContent: string; // post burst-merge (Step 8)
  traceId: string;
  sourceMessageType?: 'audio' | 'image';
}

export interface Llm1Output extends Llm1Result {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

/**
 * One chat completion producing cart ops + a draft reply (spec §13). Uses
 * OpenAI Structured Outputs (`response_format: json_schema, strict: true`)
 * rather than `json_object` mode — `json_object` is what
 * unifiedAIProcessorService.ts uses today and is part of why untyped cart
 * JSON became a problem this rewrite exists to fix; a strict schema enforces
 * Llm1Result's shape at the API level instead of trusting the model's prose.
 */
export async function runLlm1(input: Llm1Input): Promise<Llm1Output> {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }

  const { vendorId, hotSet, catalogSlice, promptCatalogSlice, mergedContent, traceId, sourceMessageType } = input;
  // Already resolved with the aiService.ts-style fallback in prefetch.ts's
  // loadVendorConfig (Q10) — unifiedAIProcessorService.ts never applies this
  // fallback despite fetching vendor config, which is a real bug there, not
  // a pattern to copy.
  const model = hotSet.vendorConfig.aiModel;
  const sliceForPrompt = promptCatalogSlice ?? catalogSlice;
  const systemPrompt = buildLlm1SystemPrompt(hotSet, { sourceMessageType, catalogSlice: sliceForPrompt });

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: mergedContent }
    ],
    ...openaiSamplingParams(model, 'llm1'),
    max_completion_tokens: 400, // spec §13: draftReply <=~120 words, cap completion tokens (~400)
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'llm1_result', schema: llm1JsonSchema, strict: true }
    }
  });

  const choice = completion.choices[0];
  if (choice?.message?.refusal) {
    throw new Error(`LLM-1 refused: ${choice.message.refusal}`);
  }
  const content = choice?.message?.content;
  if (!content) {
    throw new Error('LLM-1 returned no content');
  }

  const parsed = JSON.parse(content) as Llm1Result;

  // Hallucination guard (spec §13): drop any op referencing a productId not
  // in this turn's compact catalog before it ever reaches the pipeline.
  // CartEngine.apply's own DB-level resolveProduct check (Step 3) is still
  // the real backstop (I4) — this is a cheap, dependency-free pre-filter,
  // not a replacement for it.
  const { valid, invalid } = validateProductIds(parsed.ops, catalogSlice);
  if (invalid.length > 0) {
    logger.warn({ traceId, vendorId, invalidOps: invalid }, 'LLM-1 emitted an op for a productId not in the catalog slice — dropped');
    logCount('ValidateProductIdDropped', { vendorId }, invalid.length);
    emitMetric('Llm1HallucinatedProductId', invalid.length, { dimensions: { vendorId, processor: 'conversation-v1' } });
  }

  return {
    ...parsed,
    ops: valid,
    model,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0
  };
}
