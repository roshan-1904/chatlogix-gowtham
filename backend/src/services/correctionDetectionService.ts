/**
 * Correction Detection Service
 * 
 * Detects when customer is correcting previous understanding (Stage 1.7)
 * Reference: Phase 5 - Stage 1.7: Correction Detection (Implementation Plan)
 */

import { logger } from '../logger.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';
import { calculateCostFromUsage } from '../utils/costCalculator.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface CorrectionDetection {
  isCorrection: boolean;
  correctedField?: 'quantity' | 'product' | 'address' | 'delivery_time' | 'other' | null;
  originalUnderstanding?: string;
  correctedValue?: string;
  confidence: number;
  tokensUsed?: number;
  cost?: number;
}

/**
 * Detect if customer is correcting previous understanding
 * Target: 100-150 tokens
 */
export async function detectCorrection(
  currentMessage: string,
  previousMessages: Array<{ senderType: string; content: string }>
): Promise<CorrectionDetection> {
  // Quick heuristic check first
  const correctionKeywords = ['no,', 'actually', 'correction', "that's wrong", 'i said', 'i meant', 'not', 'wrong'];
  const hasCorrectionKeyword = correctionKeywords.some(keyword => 
    currentMessage.toLowerCase().includes(keyword)
  );

  if (!hasCorrectionKeyword && previousMessages.length < 2) {
    return {
      isCorrection: false,
      confidence: 0.9,
      tokensUsed: 0,
      cost: 0
    };
  }

  try {
    if (!openai) {
      // Fallback: Basic keyword detection
      return {
        isCorrection: hasCorrectionKeyword,
        correctedField: hasCorrectionKeyword ? 'other' : null,
        confidence: hasCorrectionKeyword ? 0.6 : 0.9,
        tokensUsed: 0,
        cost: 0
      };
    }

    const previousContext = previousMessages.slice(-3)
      .map(m => `${m.senderType === 'customer' ? 'Customer' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const prompt = `Detect if customer is correcting previous understanding.

Current Message: "${currentMessage}"

Previous Messages:
${previousContext}

Look for correction patterns:
- "no, I meant..."
- "actually..."
- "correction..."
- "that's wrong..."
- "I said..."

Return ONLY valid JSON:
{
  "isCorrection": true|false,
  "correctedField": "quantity|product|address|delivery_time|other" | null,
  "originalUnderstanding": "what AI understood before",
  "correctedValue": "what customer actually meant",
  "confidence": 0.0-1.0
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
          content: currentMessage
        }
      ],
      temperature: 0.1,
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
      logger.warn({ responseText, parseError }, 'Failed to parse correction detection');
      return {
        isCorrection: hasCorrectionKeyword,
        correctedField: hasCorrectionKeyword ? 'other' : null,
        confidence: hasCorrectionKeyword ? 0.6 : 0.9,
        tokensUsed: costCalc.tokensUsed,
        cost: costCalc.cost
      };
    }

    return {
      isCorrection: parsed.isCorrection || false,
      correctedField: parsed.correctedField || null,
      originalUnderstanding: parsed.originalUnderstanding,
      correctedValue: parsed.correctedValue,
      confidence: parsed.confidence || 0.5,
      tokensUsed: costCalc.tokensUsed,
      cost: costCalc.cost
    };
  } catch (error) {
    logger.error({ err: error }, 'Correction detection failed');
    return {
      isCorrection: hasCorrectionKeyword,
      correctedField: hasCorrectionKeyword ? 'other' : null,
      confidence: hasCorrectionKeyword ? 0.6 : 0.9,
      tokensUsed: 0,
      cost: 0
    };
  }
}

