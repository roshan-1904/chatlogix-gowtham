import { describe, it, expect } from 'vitest';
import { calculateCost, calculateCostFromUsage, calculateCostEstimate, aggregateCostBreakdown } from '../costCalculator.js';

describe('calculateCost', () => {
  it('calculates exact cost with prompt and completion tokens', () => {
    const result = calculateCost('gpt-4o-mini', 1000, 200);
    expect(result.isEstimated).toBe(false);
    expect(result.promptTokens).toBe(1000);
    expect(result.completionTokens).toBe(200);
    expect(result.totalTokens).toBe(1200);
    // gpt-4o-mini: input 0.15/1M, output 0.60/1M
    const expected = 1000 * (0.15 / 1_000_000) + 200 * (0.60 / 1_000_000);
    expect(result.costUsd).toBeCloseTo(expected, 10);
  });

  it('estimates cost when only totalTokens provided', () => {
    const result = calculateCost('gpt-4o-mini', undefined, undefined, 1000);
    expect(result.isEstimated).toBe(true);
    expect(result.promptTokens).toBe(800); // 80%
    expect(result.completionTokens).toBe(200); // 20%
    expect(result.totalTokens).toBe(1000);
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it('falls back to default pricing for unknown models', () => {
    const result = calculateCost('unknown-model-xyz', 1000, 200);
    const defaultResult = calculateCost('gpt-4.1-mini', 1000, 200);
    expect(result.costUsd).toBe(defaultResult.costUsd);
    expect(result.model).toBe('unknown-model-xyz');
  });

  it('returns zero cost when no tokens', () => {
    const result = calculateCost('gpt-4o-mini');
    expect(result.costUsd).toBe(0);
    expect(result.totalTokens).toBe(0);
    expect(result.isEstimated).toBe(true);
  });

  it('calculates gpt-5.6-luna pricing correctly', () => {
    const result = calculateCost('gpt-5.6-luna', 1_000_000, 1_000_000);
    const expected = 1_000_000 * (0.20 / 1_000_000) + 1_000_000 * (1.20 / 1_000_000);
    expect(result.costUsd).toBeCloseTo(expected, 10);
  });

  it('calculates gpt-4.1 pricing correctly', () => {
    const result = calculateCost('gpt-4.1', 1000, 500);
    // gpt-4.1: input 2.00/1M, output 8.00/1M
    const expected = 1000 * (2.00 / 1_000_000) + 500 * (8.00 / 1_000_000);
    expect(result.costUsd).toBeCloseTo(expected, 10);
  });
});

describe('calculateCostFromUsage (backward compat)', () => {
  it('returns zero for undefined usage', () => {
    const result = calculateCostFromUsage(undefined, 'gpt-4o-mini');
    expect(result.tokensUsed).toBe(0);
    expect(result.cost).toBe(0);
  });

  it('calculates from OpenAI usage object', () => {
    const result = calculateCostFromUsage(
      { prompt_tokens: 500, completion_tokens: 100, total_tokens: 600 },
      'gpt-4o-mini'
    );
    expect(result.tokensUsed).toBe(600);
    expect(result.cost).toBeGreaterThan(0);
  });
});

describe('calculateCostEstimate (backward compat)', () => {
  it('estimates with 80/20 split', () => {
    const result = calculateCostEstimate(1000, 'gpt-4o-mini');
    expect(result.tokensUsed).toBe(1000);
    expect(result.cost).toBeGreaterThan(0);
  });
});

describe('aggregateCostBreakdown', () => {
  it('groups costs by model with _totals', () => {
    const stages = [
      { model: 'gpt-4o-mini', promptTokens: 1000, completionTokens: 200, totalTokens: 1200, costUsd: 0.0003 },
      { model: 'gpt-4o-mini', promptTokens: 500, completionTokens: 100, totalTokens: 600, costUsd: 0.0001 },
      { model: 'gpt-4o', promptTokens: 400, completionTokens: 120, totalTokens: 520, costUsd: 0.0022 },
    ];

    const result = aggregateCostBreakdown(stages);

    expect(result['gpt-4o-mini'].promptTokens).toBe(1500);
    expect(result['gpt-4o-mini'].completionTokens).toBe(300);
    expect(result['gpt-4o'].promptTokens).toBe(400);
    expect(result['_totals'].promptTokens).toBe(1900);
    expect(result['_totals'].completionTokens).toBe(420);
    expect(result['_totals'].costUsd).toBeCloseTo(0.0026, 6);
  });

  it('handles empty array', () => {
    const result = aggregateCostBreakdown([]);
    expect(result['_totals'].costUsd).toBe(0);
    expect(result['_totals'].totalTokens).toBe(0);
  });
});
