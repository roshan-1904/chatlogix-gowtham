/**
 * Message Normalization Service
 * 
 * Normalizes customer messages for better processing (Stage 0)
 * Reference: Phase 5.1: Stage 0 - Message Normalization Service (Implementation Plan)
 */

import { logger } from '../logger.js';
import { AIService } from './aiService.js';
import { getCached, setCached } from '../utils/redis.js';
import { getNormalizationCacheKey, CACHE_TTL } from '../utils/cacheStrategy.js';
import { NormalizedMessage } from '../types/multiStage.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';

const aiService = new AIService();
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

/**
 * Normalize customer message with emoji interpretation, typo correction, etc.
 * Target: 50-100 tokens
 */
export async function normalizeMessage(
  rawMessage: string,
  vendorId: string
): Promise<NormalizedMessage> {
  // Check cache first
  const cacheKey = getNormalizationCacheKey(rawMessage);
  const cached = await getCached<NormalizedMessage>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    // Quick check - skip AI for simple messages (optimization)
    const isSimpleMessage = !/\p{Emoji}/u.test(rawMessage) && 
                            !hasCommonTypos(rawMessage) && 
                            !hasAbbreviations(rawMessage) &&
                            rawMessage.length < 100 &&
                            rawMessage.trim().length > 0;
    
    if (isSimpleMessage) {
      // Fast path: no AI call needed
      const cleaned = rawMessage.trim().replace(/\s+/g, ' ');
      const language = detectLanguage(rawMessage);
      
      const normalized: NormalizedMessage = {
        original: rawMessage,
        cleaned,
        language,
        emojisInterpreted: [],
        typosCorrected: false,
        abbreviationsExpanded: false,
        hasEmojis: false,
        informalPatterns: [],
        tokensUsed: 0,
        cost: 0
      };
      
      // Cache result
      await setCached(cacheKey, normalized, CACHE_TTL.NORMALIZATION);
      return normalized;
    }
    
    // Basic text cleaning
    const cleaned = rawMessage
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s\p{Emoji}\.,!?]/gu, '');
    
    // Detect language (simple heuristic)
    const language = detectLanguage(rawMessage);
    
    // AI call for emoji interpretation and typo correction (only if message has emojis or seems to need it)
    const needsAINormalization = /\p{Emoji}/u.test(rawMessage) || 
                                  hasCommonTypos(rawMessage) || 
                                  hasAbbreviations(rawMessage);
    
    let aiResult: any = {};
    let tokensUsed = 0;
    let cost = 0;
    
    if (needsAINormalization && openai) {
      try {
        aiResult = await normalizeWithAI(rawMessage, cleaned, vendorId);
        tokensUsed = aiResult.tokensUsed || 100;
        cost = aiResult.cost || 0.00001;
      } catch (aiError) {
        logger.warn({ err: aiError }, 'AI normalization failed, using basic cleaning');
      }
    }
    
    const normalized: NormalizedMessage = {
      original: rawMessage,
      cleaned: aiResult.cleaned || cleaned,
      language: aiResult.language || language,
      emojisInterpreted: aiResult.emojisInterpreted || [],
      typosCorrected: aiResult.typosCorrected || false,
      abbreviationsExpanded: aiResult.abbreviationsExpanded || false,
      hasEmojis: /\p{Emoji}/u.test(rawMessage),
      informalPatterns: aiResult.informalPatterns || [],
      tokensUsed,
      cost
    };
    
    // Cache result
    await setCached(cacheKey, normalized, CACHE_TTL.NORMALIZATION);
    
    return normalized;
  } catch (error) {
    logger.error({ err: error, rawMessage }, 'Normalization failed');
    
    // Fallback: Return basic cleaned version
    return {
      original: rawMessage,
      cleaned: rawMessage.trim(),
      language: 'en',
      emojisInterpreted: [],
      typosCorrected: false,
      abbreviationsExpanded: false,
      hasEmojis: false,
      informalPatterns: []
    };
  }
}

async function normalizeWithAI(
  rawMessage: string,
  cleaned: string,
  vendorId: string
): Promise<any> {
  if (!openai) {
    return {
      cleaned,
      language: 'en',
      emojisInterpreted: [],
      typosCorrected: false,
      abbreviationsExpanded: false,
      informalPatterns: []
    };
  }

  const prompt = `You are a text normalizer for a WhatsApp business assistant.

Task: Normalize the customer message for better processing.

Customer Message: "${rawMessage}"

Tasks:
1. Interpret emojis in context (e.g., 🍕 = pizza, 😊 = happy/positive)
2. Correct obvious typos (e.g., "piza" -> "pizza", "browni" -> "brownie")
3. Expand common abbreviations (e.g., "pls" -> "please", "thx" -> "thanks")
4. Detect language

Return ONLY valid JSON (no markdown):
{
  "cleaned": "normalized text",
  "language": "en|hi|ta|te|...",
  "emojisInterpreted": ["pizza", "happy"],
  "typosCorrected": true|false,
  "abbreviationsExpanded": true|false,
  "informalPatterns": ["pls", "thx"]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: rawMessage
        }
      ],
      temperature: 0.1,
      max_completion_tokens: 150,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    let parsed: any;
    
    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      // Try to extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = {
          cleaned,
          language: 'en',
          emojisInterpreted: [],
          typosCorrected: false,
          abbreviationsExpanded: false,
          informalPatterns: []
        };
      }
    }
    
    const tokensUsed = completion.usage?.total_tokens || 100;
    const cost = calculateCost(tokensUsed);
    
    return {
      ...parsed,
      tokensUsed,
      cost
    };
  } catch (error) {
    logger.error({ err: error }, 'AI normalization failed');
    return {
      cleaned,
      language: 'en',
      emojisInterpreted: [],
      typosCorrected: false,
      abbreviationsExpanded: false,
      informalPatterns: []
    };
  }
}

function detectLanguage(text: string): string {
  // Simple heuristic - can use library like 'franc' or 'langdetect'
  const hindiPattern = /[\u0900-\u097F]/;
  const tamilPattern = /[\u0B80-\u0BFF]/;
  const teluguPattern = /[\u0C00-\u0C7F]/;
  
  if (hindiPattern.test(text)) return 'hi';
  if (tamilPattern.test(text)) return 'ta';
  if (teluguPattern.test(text)) return 'te';
  return 'en';
}

function hasCommonTypos(text: string): boolean {
  const commonTypoPatterns = [
    /piza/i, /browni/i, /chocl/i, /cok/i
  ];
  return commonTypoPatterns.some(pattern => pattern.test(text));
}

function hasAbbreviations(text: string): boolean {
  const abbreviationPatterns = [
    /\bpls\b/i, /\bthx\b/i, /\bu\b/i, /\bur\b/i, /\br\b/i
  ];
  return abbreviationPatterns.some(pattern => pattern.test(text));
}

function calculateCost(tokensUsed: number): number {
  // Using gpt-4o-mini pricing: $0.15/1M input, $0.60/1M output
  // Rough estimate: assume 80% input, 20% output
  const inputTokens = tokensUsed * 0.8;
  const outputTokens = tokensUsed * 0.2;
  
  const inputCost = (inputTokens / 1_000_000) * 0.15;
  const outputCost = (outputTokens / 1_000_000) * 0.60;
  
  return inputCost + outputCost;
}

