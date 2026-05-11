/**
 * Model Selection Service
 * 
 * Centralizes model selection logic for all stages
 * Quality-focused: Uses better models for naturalness-critical stages
 */

export interface ModelSelectionContext {
  stage: string;
  intent?: string;
  complexity?: 'simple' | 'medium' | 'complex';
  turnNumber?: number;
  needsClarification?: boolean;
  orderItemsCount?: number;
}

/**
 * Get the optimal AI model for a given stage based on context
 * Quality-focused: Prioritizes naturalness and context retention
 */
export function getModelForStage(context: ModelSelectionContext): string {
  const { stage, intent, turnNumber, needsClarification, orderItemsCount } = context;
  
  // Stage-specific model assignments (quality-focused)
  switch (stage) {
    case 'stage_0':
    case 'stage_1.7':
    case 'stage_4.7':
    case 'stage_8.5':
      // Simple tasks - use cheapest model
      return 'gpt-5-nano';
    
    case 'stage_1':
      // Intent classification - critical for routing, keep gpt-4o-mini
      return 'gpt-4o-mini';
    
    case 'stage_4':
      // Primary AI Response - Quality-focused with budget awareness
      // Use gpt-4o for complex cases (5% of messages) to maintain quality
      // Complex logic is handled by Stage 4.5 validation (rule-based)
      // Product matching is algorithmic (fuzzy matching)
      // Price calculation is mathematical
      // For complex cases, gpt-4o provides better reasoning and naturalness
      if (orderItemsCount && orderItemsCount > 3) {
        return 'gpt-4o'; // Complex multi-item orders
      }
      if (turnNumber && turnNumber > 10) {
        return 'gpt-4o'; // Long conversations need better context handling
      }
      return 'gpt-4o-mini'; // Default for most cases
    
    case 'stage_6':
    case 'stage_7':
      // Response refinement and composition - keep gpt-4o-mini for quality
      return 'gpt-4o-mini';
    
    default:
      return 'gpt-4o-mini'; // Default fallback
  }
}

/**
 * Calculate cost estimate for a model call
 */
export function calculateCostEstimate(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-5-nano': { input: 0.05 / 1_000_000, output: 0.40 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 }
  };
  
  const rates = pricing[model] || pricing['gpt-4o-mini'];
  return (inputTokens * rates.input) + (outputTokens * rates.output);
}

/**
 * Determine if Stage 4 should use gpt-4o based on complexity
 * 
 * QUALITY FIX: Conditionally use gpt-4o for complex cases (5% of messages)
 * Maintains quality while staying within budget for most cases
 */
export function shouldUseGPT4oForStage4(
  intent?: string,
  orderItemsCount?: number,
  needsClarification?: boolean,
  turnNumber?: number,
  secondaryIntents?: string[]
): boolean {
  // Use gpt-4o for complex cases that need better reasoning:
  // 1. Multi-item orders (>3 items)
  if (orderItemsCount && orderItemsCount > 3) {
    return true;
  }
  
  // 2. Multi-intent messages with >2 intents
  if (secondaryIntents && secondaryIntents.length > 2) {
    return true;
  }
  
  // 3. Long conversations (>10 turns) need better context handling
  if (turnNumber && turnNumber > 10) {
    return true;
  }
  
  // 4. Complex order updates
  if (intent === 'order_update' && orderItemsCount && orderItemsCount > 2) {
    return true;
  }
  
  // Default: use gpt-4o-mini for most cases (95% of messages)
  return false;
}
