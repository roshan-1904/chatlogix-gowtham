/**
 * Proactive Assistance Service
 * 
 * Generates proactive suggestions and recommendations (Stage 4.7)
 * Reference: Phase 5.7: Stage 4.7 - Proactive Assistance Service (Implementation Plan)
 */

import { logger } from '../logger.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface ProactiveSuggestion {
  type: 'reorder_favorite' | 'related_product' | 'complementary_item' | 'special_offer';
  product: string;
  reason: string;
  naturalPhrasing: string;
}

export interface ProactiveAssistanceResult {
  suggestions: ProactiveSuggestion[];
  shouldInclude: boolean;
  tokensUsed?: number;
  cost?: number;
}

/**
 * Generate proactive suggestions based on customer context
 * Target: 150-200 tokens (only when appropriate)
 */
export async function generateProactiveAssistance(
  insights: any,
  orderHistory: any[],
  currentContext: any,
  vendorId: string
): Promise<ProactiveAssistanceResult> {
  // Only suggest if appropriate
  if (!shouldSuggest(insights, orderHistory, currentContext)) {
    return {
      suggestions: [],
      shouldInclude: false,
      tokensUsed: 0,
      cost: 0
    };
  }
  
  try {
    if (!openai) {
      return {
        suggestions: [],
        shouldInclude: false,
        tokensUsed: 0,
        cost: 0
      };
    }

    const prompt = `Generate proactive suggestions based on customer context.

Customer Insights: ${JSON.stringify(insights || {})}
Order History (last 5): ${JSON.stringify((orderHistory || []).slice(0, 5))}
Current Conversation Stage: ${currentContext?.conversationStage || 'unknown'}

Suggest:
1. Related products (based on order history)
2. Reorder favorites
3. Complementary items
4. Special offers

Return suggestions if relevant, otherwise return empty array.

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "type": "reorder_favorite|related_product|complementary_item|special_offer",
      "product": "brownie",
      "reason": "You ordered this last time",
      "naturalPhrasing": "Would you like to order brownie again? You seemed to enjoy it last time!"
    }
  ],
  "shouldInclude": true|false
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: 'Generate suggestions'
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 250,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    let parsed: any;
    
    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      logger.warn({ responseText, parseError }, 'Failed to parse proactive assistance');
      return {
        suggestions: [],
        shouldInclude: false,
        tokensUsed: 0,
        cost: 0
      };
    }

    const tokensUsed = completion.usage?.total_tokens || 150;
    const cost = calculateCost(tokensUsed);

    return {
      suggestions: parsed.suggestions || [],
      shouldInclude: parsed.shouldInclude !== undefined ? parsed.shouldInclude : (parsed.suggestions?.length > 0),
      tokensUsed,
      cost
    };
  } catch (error) {
    logger.error({ err: error }, 'Proactive assistance failed');
    return {
      suggestions: [],
      shouldInclude: false,
      tokensUsed: 0,
      cost: 0
    };
  }
}

function shouldSuggest(insights: any, orderHistory: any[], context: any): boolean {
  // Don't suggest during order confirmation
  if (context?.conversationStage === 'order_confirmation') {
    return false;
  }
  
  // Don't suggest if customer is asking questions
  if (context?.intent === 'product_inquiry' || context?.intent === 'order_status') {
    return false;
  }
  
  // Suggest if customer has order history
  if (orderHistory && orderHistory.length > 0) {
    return true;
  }
  
  return false;
}

function calculateCost(tokensUsed: number): number {
  const inputTokens = tokensUsed * 0.8;
  const outputTokens = tokensUsed * 0.2;
  
  const inputCost = (inputTokens / 1_000_000) * 0.15;
  const outputCost = (outputTokens / 1_000_000) * 0.60;
  
  return inputCost + outputCost;
}

