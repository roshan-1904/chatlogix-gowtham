/**
 * Quality Assessment Service
 * 
 * Assesses response quality and logs metrics (Stage 8.5)
 * Reference: Phase 5.12: Stage 8.5 - Quality Assessment Service (Implementation Plan)
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { ConversationMemory } from './conversationMemoryService.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';
import { calculateCostFromUsage } from '../utils/costCalculator.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface QualityAssessment {
  naturalnessScore: number; // 0-5
  informationCompleteness: number; // 0-1
  conversationContinuity: number; // 0-1
  overallScore: number; // 0-5
  issues: string[];
  tokensUsed?: number;
  cost?: number;
}

/**
 * Assess response quality
 * Target: 150-200 tokens
 */
export async function assessQuality(
  finalMessage: string,
  intent: string,
  extractedData: any,
  memory: ConversationMemory,
  conversationId: string,
  vendorId: string,
  messageId: string,
  stagesExecuted: string[],
  totalTokensUsed: number,
  totalCost: number,
  totalDuration: number
): Promise<QualityAssessment> {
  try {
    // Naturalness scoring (using AI)
    const naturalnessResult = await scoreNaturalness(finalMessage, conversationId, vendorId);
    const naturalnessScore = naturalnessResult.score;
    const tokensUsed = naturalnessResult.tokensUsed;
    const cost = naturalnessResult.cost;
    
    // Information completeness check
    const completeness = checkInformationCompleteness(intent, extractedData);
    
    // Conversation continuity check
    const continuity = checkConversationContinuity(finalMessage, memory);
    
    // Overall score calculation
    const overallScore = (
      naturalnessScore * 0.4 +
      completeness * 0.3 +
      continuity * 0.3
    ) * 5;
    
    const issues = identifyIssues(finalMessage, extractedData, naturalnessScore, completeness, continuity);
    
    const assessment: QualityAssessment = {
      naturalnessScore,
      informationCompleteness: completeness,
      conversationContinuity: continuity,
      overallScore,
      issues,
      tokensUsed,
      cost
    };
    
    // Save to database using Prisma (now that schema is updated)
    try {
      await prisma.qualityMetrics.create({
        data: {
          id: crypto.randomUUID(),
          conversationId,
          vendorId,
          messageId,
          naturalnessScore,
          completenessScore: completeness,
          continuityScore: continuity,
          overallScore,
          stagesExecuted: stagesExecuted,
          totalTokensUsed,
          totalCost,
          totalDuration,
          issues: issues.length > 0 ? issues : undefined
        }
      });
    } catch (dbError) {
      logger.warn({ err: dbError, conversationId }, 'Failed to save quality metrics to database');
    }
    
    return assessment;
  } catch (error) {
    logger.error({ err: error, conversationId }, 'Quality assessment failed');
    return {
      naturalnessScore: 0,
      informationCompleteness: 0,
      conversationContinuity: 0,
      overallScore: 0,
      issues: ['Quality assessment failed'],
      tokensUsed: 0,
      cost: 0
    };
  }
}

async function scoreNaturalness(message: string, conversationId: string, vendorId: string): Promise<{ score: number; tokensUsed: number; cost: number }> {
  try {
    if (!openai) {
      return { score: 3.5, tokensUsed: 0, cost: 0 }; // Default score if AI unavailable
    }

    const prompt = `Score the naturalness of this WhatsApp message on scale 0-5.

Message: ${message}

Rate naturalness considering:
1. Conversational tone
2. Natural flow
3. Appropriate use of language
4. Personalization
5. Emoji usage

Return ONLY a number between 0 and 5 (no explanation, just the number).`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: prompt
        },
        {
          role: 'user',
          content: message
        }
      ],
      temperature: 0.1,
      max_completion_tokens: 10
    });

    const responseText = completion.choices[0]?.message?.content?.trim() || '3.5';
    const score = parseFloat(responseText.replace(/[^\d.]/g, ''));
    
    // Calculate cost from completion
    const costCalc = calculateCostFromUsage(completion.usage, 'gpt-4o-mini');
    
    return {
      score: Math.max(0, Math.min(5, score || 3.5)),
      tokensUsed: costCalc.tokensUsed,
      cost: costCalc.cost
    };
  } catch (error) {
    logger.error({ err: error }, 'Naturalness scoring failed');
    return { score: 3.5, tokensUsed: 0, cost: 0 }; // Default score
  }
}

function checkInformationCompleteness(intent: string, extractedData: any): number {
  // Check if all required fields for intent are present
  let requiredFields = 0;
  let presentFields = 0;
  
  if (intent === 'order_new') {
    requiredFields = 2; // products, quantities
    if (extractedData.orderItems && Array.isArray(extractedData.orderItems) && extractedData.orderItems.length > 0) {
      presentFields++;
      // Check if quantities are present
      if (extractedData.orderItems.every((item: any) => item.quantity > 0)) {
        presentFields++;
      }
    }
  } else if (intent === 'order_update') {
    requiredFields = 1; // order update type or items
    if (extractedData.orderUpdateType || extractedData.orderItems) {
      presentFields++;
    }
  } else if (intent === 'order_status') {
    requiredFields = 1; // order mention
    if (extractedData.mentionsOrder) {
      presentFields++;
    }
  } else {
    // For other intents, completeness is less critical
    return 1.0;
  }
  
  return requiredFields > 0 ? presentFields / requiredFields : 1;
}

function checkConversationContinuity(message: string, memory: ConversationMemory): number {
  // Check if message references previous conversation
  let continuityScore = 0.5; // Base score
  
  if (memory.keyFacts && memory.keyFacts.length > 0) {
    // Check if message references key facts
    const messageLower = message.toLowerCase();
    for (const fact of memory.keyFacts.slice(0, 5)) {
      const factKeywords = fact.toLowerCase().split(' ').slice(0, 3);
      if (factKeywords.some(keyword => messageLower.includes(keyword))) {
        continuityScore += 0.1;
      }
    }
  }
  
  // Check if message references ongoing topics
  if (memory.ongoingTopics && memory.ongoingTopics.length > 0) {
    const messageLower = message.toLowerCase();
    for (const topic of memory.ongoingTopics) {
      if (messageLower.includes(topic.toLowerCase())) {
        continuityScore += 0.2;
      }
    }
  }
  
  return Math.min(1, continuityScore);
}

function identifyIssues(
  message: string,
  extractedData: any,
  naturalness: number,
  completeness: number,
  continuity: number
): string[] {
  const issues: string[] = [];
  
  if (naturalness < 4.0) {
    issues.push('Low naturalness score');
  }
  
  if (completeness < 0.8) {
    issues.push('Incomplete information extraction');
  }
  
  if (continuity < 0.7) {
    issues.push('Poor conversation continuity');
  }
  
  if (!message || message.trim().length < 10) {
    issues.push('Response too short');
  }
  
  return issues;
}

