/**
 * Response Refinement Service
 * 
 * Refines response with additional context if needed (Stage 6)
 * Reference: Phase 5.8: Stage 6 - Response Refinement Service (Implementation Plan)
 */

import { logger } from '../logger.js';
import { PrimaryAIResponse } from './primaryAIResponseService.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';
import { calculateCostFromUsage } from '../utils/costCalculator.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

/**
 * Refine response with additional context
 * Target: 400-600 tokens (only when needed)
 */
export async function refineResponse(
  initialResponse: PrimaryAIResponse,
  additionalData: any,
  currentMessage: string,
  vendorId: string,
  secondaryIntents?: string[],
  intentPrioritization?: any
): Promise<PrimaryAIResponse> {
  // If no clarification needed, return original
  if (!initialResponse.needsClarification && !additionalData) {
    return initialResponse;
  }

  try {
    if (!openai) {
      logger.warn('OpenAI not configured, returning original response');
      return initialResponse;
    }

    // Build multi-intent handling instructions
    let multiIntentInstructions = '';
    if (secondaryIntents && secondaryIntents.length > 0) {
      const handlingStrategy = intentPrioritization?.handlingStrategy || 'handle_all';
      const canCombine = intentPrioritization?.canCombine !== false;
      
      multiIntentInstructions = `\n\n⚠️ MULTIPLE QUESTIONS DETECTED:
Customer Message: "${currentMessage}"
Primary Intent: Already handled in previous response
Secondary Intents: ${secondaryIntents.join(', ')}

CRITICAL: You MUST address ALL questions in your refined response:
1. Keep the primary intent response (already provided)
2. ${canCombine ? 'Address secondary intents naturally in the same response' : 'Address secondary intents after primary response'}
3. Use natural transitions like "Also, regarding your question about..." or "By the way, about..."
4. Make sure to answer ALL questions asked by the customer
5. Do NOT ignore secondary intents - they are part of the customer's message

Handling Strategy: ${handlingStrategy}
${canCombine ? 'You can combine all responses naturally.' : 'Address each intent separately but in one cohesive message.'}`;
    }

    const prompt = `Refine the response with additional context.${multiIntentInstructions}

Previous Response: ${JSON.stringify({
  response: initialResponse.response,
  extractedData: initialResponse.extractedData,
  needsClarification: initialResponse.needsClarification
})}

Additional Context:
${JSON.stringify(additionalData)}

Customer Message: ${currentMessage}

${secondaryIntents && secondaryIntents.length > 0 ? `
REMEMBER: The customer asked multiple questions. Your refined response must:
- Keep the answer to the primary question
- Add answers to secondary questions: ${secondaryIntents.join(', ')}
- Make it feel natural and conversational
- Use transitions to connect different answers
` : ''}

Return refined response with same JSON structure:
{
  "response": "refined response text that addresses ALL questions",
  "extractedData": {...},
  "needsClarification": true|false,
  "clarificationStrategy": {...},
  "conversationFlow": {...}
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
      temperature: 0.5, // Reduced from 0.7 for faster responses
      max_completion_tokens: 400, // Reduced from 500 for faster responses
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    
    // Calculate cost from completion
    const costCalc = calculateCostFromUsage(completion.usage, 'gpt-4o-mini');
    
    let parsed: any;
    
    try {
      parsed = JSON.parse(responseText);
    } catch (parseError) {
      logger.warn({ responseText, parseError }, 'Failed to parse refined response');
      return initialResponse;
    }

    return {
      response: parsed.response || initialResponse.response,
      extractedData: parsed.extractedData || initialResponse.extractedData,
      needsClarification: parsed.needsClarification !== undefined ? parsed.needsClarification : initialResponse.needsClarification,
      clarificationStrategy: parsed.clarificationStrategy || initialResponse.clarificationStrategy,
      conversationFlow: parsed.conversationFlow || initialResponse.conversationFlow,
      tokensUsed: costCalc.tokensUsed,
      cost: costCalc.cost
    };
  } catch (error) {
    logger.error({ err: error }, 'Response refinement failed');
    return initialResponse; // Return original if refinement fails
  }
}

