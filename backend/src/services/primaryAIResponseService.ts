/**
 * Primary AI Response Service
 * 
 * Generates AI response using focused prompt for Stage 4
 * CRITICAL: This replaces legacy generateStructuredResponse to achieve cost reduction
 * Reference: Phase 5.5: Stage 4 - Primary AI Response Service (Implementation Plan)
 */

import { logger } from '../logger.js';
import { AIService } from './aiService.js';
import { fallbackAIResponse } from './stageFallbacks.js';
import { executeWithCircuitBreaker } from '../utils/circuitBreaker.js';
import { ConversationMemory } from './conversationMemoryService.js';
import { NormalizedMessage } from '../types/multiStage.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';
import { formatWhatsAppMessage } from '../utils/messageFormatter.js';
import { getModelForStage, shouldUseGPT4oForStage4 } from './modelSelectionService.js';
import { calculateCostFromUsage } from '../utils/costCalculator.js';

const aiService = new AIService();
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface PrimaryAIResponse {
  response: string;
  extractedData: {
    orderItems?: any[];
    deliveryAddress?: string;
    deliveryInstructions?: string;
    specialRequests?: string;
    customerInfo?: {
      name?: string;
      email?: string;
      phone?: string;
    };
  };
  needsClarification: boolean;
  clarificationStrategy?: {
    missingFields: string[];
    clarificationQuestions: Array<{
      field: string;
      question: string;
      priority: 'high' | 'medium' | 'low';
      naturalPhrasing: string;
    }>;
    canProceedWithDefaults: boolean;
  };
  conversationFlow?: {
    nextStage: string;
    naturalTransition: string;
  };
  tokensUsed?: number;
  cost?: number;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
}

/**
 * Generate primary AI response using focused prompt
 * Target: 600-1000 tokens (vs 4000+ in legacy)
 */
export async function generatePrimaryAIResponse(
  prompt: string,
  normalizedMessage: NormalizedMessage,
  memory: ConversationMemory,
  conversationId: string,
  vendorId: string,
  intent?: string,
  extractedInfo?: any,
  secondaryIntents?: string[] // QUALITY FIX: Added for conditional model selection
): Promise<PrimaryAIResponse> {
  return await executeWithCircuitBreaker(
    'primary_ai_response',
    async () => {
      // Determine if this is actually a greeting
      const isGreeting = memory.turnNumber <= 1 || memory.conversationStage === 'greeting';
      
      // ENHANCEMENT: Add naturalness instructions for maximum conversational quality
      const naturalnessInstructions = `
CRITICAL NATURALNESS REQUIREMENTS:
- Reference previous conversation naturally (e.g., "As you mentioned earlier...")
- Remember customer preferences (e.g., "I remember you prefer morning delivery")
- Acknowledge context (e.g., "Since you're ordering for your birthday...")
- Use natural transitions (e.g., "Great! Now, about your delivery address...")
- Never ask for information already provided
- Match customer's communication style
- Feel like continuing a conversation, not starting a new one
- Maintain all context - never lose any information
- Reference specific details from conversation history when relevant
`;

      // NEW: Clarification rules to avoid unnecessary questions
      const clarificationRules = `
CRITICAL CLARIFICATION RULES - STRICTLY ENFORCE:

1. ONLY ASK QUESTIONS WHEN ABSOLUTELY CRITICAL:
   - Missing information that PREVENTS order completion (name, address for order confirmation)
   - Missing information that PREVENTS order placement (customer name, delivery address for order_new)
   - Missing information that PREVENTS accurate product matching (unclear product name)
   - Missing information that PREVENTS order creation (no products specified)
   - DO NOT ask for optional information (special requests, delivery time preferences)
   - DO NOT ask questions that can be inferred from conversation history
   - DO NOT ask questions that can be retrieved from customer memory

2. USE MEMORY INSTEAD OF ASKING:
   - If customer name exists in memory → USE IT, don't ask
   - If delivery address exists in memory → USE IT, don't ask
   - If preferences exist in memory → USE THEM, don't ask again
   - If product was mentioned before → REFERENCE IT, don't ask to confirm

3. FOCUS ON CUSTOMER RESPONSE:
   - Respond to what customer said, don't ask follow-up questions
   - If customer provided information → ACKNOWLEDGE and USE IT
   - If customer asked a question → ANSWER IT directly
   - If customer made a statement → RESPOND to it naturally
   - Only ask ONE question at a time, and only if CRITICAL
   - **CRITICAL: Question-Response Pattern Recognition:**
     * If the previous Assistant message asked for customer name, and the current Customer message is a single word or short phrase (e.g., "Murali", "John", "Ravi"), treat it as the customer providing their name → EXTRACT IT and DON'T ask for name again
     * If the previous Assistant message asked for delivery address, and the current Customer message contains location information, treat it as the customer providing their address → EXTRACT IT and DON'T ask for address again
     * When customer provides information in response to a question, ACKNOWLEDGE it explicitly (e.g., "Thank you, Murali! Now I need your delivery address...")

4. EXAMPLES OF WHAT NOT TO ASK:
   ❌ "What would you like to order?" (if customer already mentioned products)
   ❌ "What's your name?" (if name exists in memory)
   ❌ "What's your address?" (if address exists in memory)
   ❌ "Any special requests?" (optional, don't ask)
   ❌ "When do you need it?" (can infer from context or use defaults)
   
5. EXAMPLES OF WHEN TO ASK:
   ✅ "Could you please provide your name so I can confirm your order?" (critical for order placement - name missing)
   ✅ "I need your delivery address to confirm the order" (critical for order confirmation)
   ✅ "Which product did you mean? I have X, Y, Z" (unclear product name)
   ✅ "How many would you like?" (quantity missing for order)

6. SET needsClarification ONLY WHEN:
   - Critical information is missing AND
   - Cannot proceed without it AND
   - Cannot infer from memory or context
`;

      // Add confirm_order-specific instructions
      const confirmOrderInstructions = intent === 'confirm_order' ? `
CRITICAL: This is a CONFIRMATION - customer already said yes/confirm/proceed.
- DO NOT ask for confirmation again - they already confirmed!
- Acknowledge: "Thank you for confirming!" or "Perfect! Your order is confirmed!"
- Confirm order details clearly (items, quantities, total, delivery address)
- Thank the customer
- Provide next steps (preparation time, delivery estimate if available)
- Set conversationFlow.nextStage to "closing" (order is confirmed)
- Set needsClarification to false (no more questions needed)
` : '';

      // Add cancel_order-specific instructions
      const cancelOrderInstructions = intent === 'cancel_order' ? `
CRITICAL: This is a CANCELLATION - customer wants to cancel their order.
- Acknowledge cancellation clearly: "I've canceled your order" or "Your order has been canceled"
- Reference the order being canceled (order number, items, total)
- Be empathetic and understanding
- Offer to help with a new order if appropriate
- Set conversationFlow.nextStage to "closing" (order is canceled)
- Set needsClarification to false (no more questions needed)
` : '';

      const fullPrompt = `${prompt}\n\nConversation Flow Context:
- Turn Number: ${memory.turnNumber}
- Conversation Stage: ${memory.conversationStage}
- Previous Topic: ${memory.ongoingTopics[memory.ongoingTopics.length - 1] || 'None'}
- Is Greeting: ${isGreeting}

${naturalnessInstructions}

${clarificationRules}
${confirmOrderInstructions}
${cancelOrderInstructions}

User Message: ${normalizedMessage.cleaned || normalizedMessage.original}

Generate a helpful, natural WhatsApp response. 

CRITICAL RULES - STRICTLY ENFORCE:
${isGreeting ? 
  '- This IS a greeting - start naturally with Hi/Hello if appropriate' :
  '- This is NOT a greeting - DO NOT start with "Hi" or "Hello" - answer the question directly'
}
- ONLY mention products from the "AVAILABLE PRODUCTS" section above
- Match customer queries using KEYWORDS and product names - be flexible and intelligent
- Support multi-language matching: Customer may ask in different language than product names (e.g., Tamil, Hindi, English)
- Use product keywords to match partial queries and typos
- DO NOT say "I don't have that product" if a similar product exists - instead say "I have [product name] which includes [what customer asked for]"
- If customer asks about something and you have a matching product (by keyword or name), ALWAYS show it with full product name
- Only say "I don't have that product" if NO products in the catalog match the customer's query at all
- Always use EXACT product names from the catalog when mentioning products
- Format with line breaks (\\n) for readability, especially for lists or multiple points
- Keep it conversational and natural
- Use emojis appropriately

CRITICAL EXTRACTION RULES:
- Only extract orderItems if product name can be matched to products in "AVAILABLE PRODUCTS"
- Match products using keywords, partial names, and fuzzy matching (handles typos)
- If customer mentions a product that doesn't exist in catalog, use empty array: []
- If product name is unclear or ambiguous, use empty array: []
- NEVER use "Unknown", "N/A", or placeholder values for product names
- Support multi-language matching: If customer message is in different language than product names, use semantic matching
- If customer has typos or uses different language, try to match to closest product
- Use the FULL product name from catalog when possible
- Match products regardless of language (customer can ask in Tamil, Hindi, English, etc.)
- For quantity, use DECIMAL values when appropriate (e.g., 0.5 for half kg, 0.25 for quarter kg). Do NOT round fractional quantities to whole numbers.
- Always include the unit for each item (kg, box, piece, pack, etc.) based on what the customer specified or the product's default unit.

Return JSON:
{
  "response": "Your response text (use \\n for line breaks)",
  "extractedData": {
    "orderItems": [{"product": "EXACT product name from catalog", "quantity": 1.0, "unit": "kg or box or piece or pack", "notes": "any special notes from customer"}],
    "deliveryAddress": "address if mentioned",
    "deliveryInstructions": "delivery instructions, notes, or preferences if mentioned (e.g., 'call before delivery', 'leave at door', 'ring the bell', 'deliver after 6pm')",
    "specialRequests": "requests if mentioned",
    "customerInfo": {
      "name": "customer name if mentioned or provided",
      "email": "email if mentioned",
      "phone": "phone number if mentioned (alternative to main customer phone)"
    }
  },
  "needsClarification": true|false,
  "clarificationStrategy": {
    "missingFields": ["field1"],
    "clarificationQuestions": [{"field": "field1", "question": "question", "priority": "high", "naturalPhrasing": "natural question"}],
    "canProceedWithDefaults": false
  },
  "conversationFlow": {
    "nextStage": "information_gathering|order_confirmation|closing",
    "naturalTransition": "transition text"
  }
}`;

      if (!openai) {
        logger.warn('OpenAI not configured, using fallback');
        throw new Error('OpenAI not configured');
      }

      // QUALITY FIX: Conditional model selection based on complexity
      // Use gpt-4o for complex cases (5% of messages) to maintain quality
      const orderItemsCount = extractedInfo?.orderItems?.length || 0;
      const needsClarification = false; // Could be determined from context if needed
      const shouldUseGPT4o = shouldUseGPT4oForStage4(
        intent,
        orderItemsCount,
        needsClarification,
        memory.turnNumber,
        secondaryIntents // Pass secondary intents for multi-intent detection
      );
      
      const selectedModel = shouldUseGPT4o ? 'gpt-4o' : 'gpt-4o-mini';
      
      logger.debug({ 
        conversationId, 
        intent, 
        orderItemsCount, 
        turnNumber: memory.turnNumber,
        selectedModel 
      }, 'Model selected for Stage 4');

      const completion = await openai.chat.completions.create({
        model: selectedModel, // ENHANCEMENT: Use conditional model selection
        messages: [
          {
            role: 'system',
            content: fullPrompt
          },
          {
            role: 'user',
            content: normalizedMessage.cleaned || normalizedMessage.original
          }
        ],
        temperature: 0.5, // Reduced from 0.7 for faster, more deterministic responses
        max_completion_tokens: 400, // Reduced from 500 for faster responses
        response_format: { type: 'json_object' }
      });

      const responseTextRaw = completion.choices[0]?.message?.content || '{}';
      let parsed: any;
      
      try {
        parsed = JSON.parse(responseTextRaw);
      } catch (parseError) {
        logger.warn({ responseTextRaw, parseError }, 'Failed to parse AI response, extracting text');
        // Try to extract JSON from response
        const jsonMatch = responseTextRaw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: use response text as-is
          parsed = {
            response: responseTextRaw,
            extractedData: {},
            needsClarification: false
          };
        }
      }

      // Calculate cost from actual token usage
      const costCalc = calculateCostFromUsage(completion.usage, selectedModel);
      const tokensUsed = costCalc.tokensUsed || completion.usage?.total_tokens || 800;
      const cost = costCalc.cost;

      let responseText = parsed.response || fallbackAIResponse('other', vendorId);
      
      // Post-process response: remove forced greetings and format (isGreeting already declared above)
      responseText = formatWhatsAppMessage(responseText, isGreeting);
      
      const result: PrimaryAIResponse = {
        response: responseText,
        extractedData: parsed.extractedData || {},
        needsClarification: parsed.needsClarification || false,
        clarificationStrategy: parsed.clarificationStrategy,
        conversationFlow: parsed.conversationFlow || {
          nextStage: 'response',
          naturalTransition: ''
        },
        tokensUsed,
        cost,
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        model: selectedModel
      };

      return result;
    },
    async () => {
      // Fallback
      logger.warn({ conversationId }, 'Using fallback AI response');
      return {
        response: fallbackAIResponse('other', vendorId),
        extractedData: {},
        needsClarification: true,
        tokensUsed: 0,
        cost: 0
      };
    }
  );
}


