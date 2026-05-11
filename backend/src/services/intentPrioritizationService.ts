/**
 * Intent Prioritization Service
 * 
 * Determines which intent to handle first when multiple intents detected (Stage 1.5)
 * Reference: Phase 5 - Stage 1.5: Intent Prioritization (Implementation Plan)
 */

import { logger } from '../logger.js';
import { IntentClassification } from '../types/multiStage.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';
import { calculateCostFromUsage } from '../utils/costCalculator.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface IntentPrioritization {
  handlingStrategy: 'handle_all' | 'handle_primary_first' | 'ask_clarification';
  intentOrder: string[];
  canCombine: boolean;
  followUpNeeded: boolean;
  tokensUsed?: number;
  cost?: number;
}

/**
 * Prioritize intents when multiple intents detected
 * Target: 100-150 tokens (only when needed)
 */
export async function prioritizeIntents(
  primaryIntent: string,
  secondaryIntents: string[],
  normalizedMessage: string
): Promise<IntentPrioritization> {
  // If no secondary intents, return simple prioritization
  if (!secondaryIntents || secondaryIntents.length === 0) {
    return {
      handlingStrategy: 'handle_primary_first',
      intentOrder: [primaryIntent],
      canCombine: false,
      followUpNeeded: false,
      tokensUsed: 0,
      cost: 0
    };
  }

  try {
    if (!openai) {
      // Fallback: Handle primary first, then secondary
      return {
        handlingStrategy: 'handle_primary_first',
        intentOrder: [primaryIntent, ...secondaryIntents],
        canCombine: false,
        followUpNeeded: true
      };
    }

    const prompt = `You are an intent prioritizer for a WhatsApp business assistant.

Primary Intent: ${primaryIntent}
Secondary Intents: ${JSON.stringify(secondaryIntents)}
Customer Message: "${normalizedMessage}"

Determine:
1. Which intent should be handled first?
2. Can multiple intents be handled in one response?
3. Should follow-up questions be asked?

Return ONLY valid JSON:
{
  "handlingStrategy": "handle_all|handle_primary_first|ask_clarification",
  "intentOrder": ["intent1", "intent2"],
  "canCombine": true|false,
  "followUpNeeded": true|false
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
          content: normalizedMessage
        }
      ],
      temperature: 0.5,
      max_completion_tokens: 150,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    
    // Calculate cost from completion
    const costCalc = calculateCostFromUsage(completion.usage, 'gpt-4o-mini');
    
    let parsed: any;
    
    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      logger.warn({ responseText, parseError }, 'Failed to parse intent prioritization');
      return {
        handlingStrategy: 'handle_primary_first',
        intentOrder: [primaryIntent, ...secondaryIntents],
        canCombine: false,
        followUpNeeded: true,
        tokensUsed: costCalc.tokensUsed,
        cost: costCalc.cost
      };
    }

    return {
      handlingStrategy: parsed.handlingStrategy || 'handle_primary_first',
      intentOrder: parsed.intentOrder || [primaryIntent, ...secondaryIntents],
      canCombine: parsed.canCombine || false,
      followUpNeeded: parsed.followUpNeeded !== undefined ? parsed.followUpNeeded : true,
      tokensUsed: costCalc.tokensUsed,
      cost: costCalc.cost
    };
  } catch (error) {
    logger.error({ err: error }, 'Intent prioritization failed');
    return {
      handlingStrategy: 'handle_primary_first',
      intentOrder: [primaryIntent, ...secondaryIntents],
      canCombine: false,
      followUpNeeded: true,
      tokensUsed: 0,
      cost: 0
    };
  }
}

