/**
 * Cost Calculator Utility
 * Calculates actual OpenAI API costs based on model and token usage.
 * Single source of truth for all AI cost calculations.
 */

import { logger } from '../logger.js';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CostCalculation {
  tokensUsed: number;
  cost: number;
  model: string;
}

export interface CostResult {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  isEstimated: boolean;
}

/**
 * Model pricing per token (derived from per-1M-token rates)
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 2.00 / 1_000_000, output: 8.00 / 1_000_000 },
  'gpt-4.1-mini': { input: 0.40 / 1_000_000, output: 1.60 / 1_000_000 },
  'gpt-4.1-nano': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  'gpt-5-nano': { input: 0.05 / 1_000_000, output: 0.40 / 1_000_000 },
  'gpt-3.5-turbo': { input: 0.50 / 1_000_000, output: 1.50 / 1_000_000 },
};

const DEFAULT_MODEL = 'gpt-4.1-mini';

function getPricing(model: string): { input: number; output: number } {
  const pricing = MODEL_PRICING[model];
  if (pricing) return pricing;

  logger.warn({ model }, 'Unknown model for cost calculation, falling back to default pricing');
  return MODEL_PRICING[DEFAULT_MODEL];
}

/**
 * Calculate normalized cost result from an OpenAI usage object.
 * Preferred entry point for all cost calculations.
 */
export function calculateCost(
  model: string,
  promptTokens?: number,
  completionTokens?: number,
  totalTokens?: number
): CostResult {
  const pricing = getPricing(model);

  // When we have exact prompt/completion split
  if (promptTokens != null && completionTokens != null && (promptTokens > 0 || completionTokens > 0)) {
    const total = totalTokens ?? (promptTokens + completionTokens);
    const costUsd = promptTokens * pricing.input + completionTokens * pricing.output;
    return { model, promptTokens, completionTokens, totalTokens: total, costUsd, isEstimated: false };
  }

  // Fallback: only total tokens available — use 80/20 estimate
  const total = totalTokens ?? 0;
  const estPrompt = Math.round(total * 0.8);
  const estCompletion = total - estPrompt;
  const costUsd = estPrompt * pricing.input + estCompletion * pricing.output;
  return { model, promptTokens: estPrompt, completionTokens: estCompletion, totalTokens: total, costUsd, isEstimated: true };
}

/**
 * Calculate cost from OpenAI completion usage object.
 * Kept for backward compatibility — delegates to calculateCost.
 */
export function calculateCostFromUsage(
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined,
  model: string
): CostCalculation {
  if (!usage) {
    return { tokensUsed: 0, cost: 0, model };
  }

  const result = calculateCost(
    model,
    usage.prompt_tokens,
    usage.completion_tokens,
    usage.total_tokens
  );

  return {
    tokensUsed: result.totalTokens,
    cost: result.costUsd,
    model
  };
}

/**
 * Calculate cost estimate when only total tokens are known.
 * Kept for backward compatibility — delegates to calculateCost.
 */
export function calculateCostEstimate(
  totalTokens: number,
  model: string = DEFAULT_MODEL
): CostCalculation {
  const result = calculateCost(model, undefined, undefined, totalTokens);

  return {
    tokensUsed: result.totalTokens,
    cost: result.costUsd,
    model
  };
}

/**
 * Aggregate multiple CostResults into a model-wise breakdown with _totals.
 */
export function aggregateCostBreakdown(
  stageCosts: Array<{ model: string; promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number }>
): Record<string, { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number }> {
  const breakdown: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number; costUsd: number }> = {};
  const totals = { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };

  for (const stage of stageCosts) {
    if (!breakdown[stage.model]) {
      breakdown[stage.model] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
    }
    breakdown[stage.model].promptTokens += stage.promptTokens;
    breakdown[stage.model].completionTokens += stage.completionTokens;
    breakdown[stage.model].totalTokens += stage.totalTokens;
    breakdown[stage.model].costUsd += stage.costUsd;

    totals.promptTokens += stage.promptTokens;
    totals.completionTokens += stage.completionTokens;
    totals.totalTokens += stage.totalTokens;
    totals.costUsd += stage.costUsd;
  }

  breakdown['_totals'] = totals;
  return breakdown;
}
