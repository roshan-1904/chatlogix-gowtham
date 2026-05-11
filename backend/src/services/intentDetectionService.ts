/**
 * Intent Detection Service
 * 
 * Detects order-related intents (add, remove, change, replace, etc.) from customer messages.
 * Uses pattern matching for fast path (80%+ cases), AI for ambiguous cases, and fallback logic.
 * 
 * Reference: Phase 1 of Order Management System Implementation Plan
 */

import { logger } from '../logger.js';
import { OrderIntent, OrderItem } from '../types/orderManagement.js';
import { ConversationState } from '../types/conversationState.js';
import { ConversationMemory } from './conversationMemoryService.js';
import { env } from '../config/env.js';
import OpenAI from 'openai';
import { calculateCostFromUsage } from '../utils/costCalculator.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

/**
 * Intent Pattern Definition
 */
interface IntentPattern {
  type: 'add' | 'remove' | 'change' | 'replace' | 'confirm' | 'cancel' | 'new';
  patterns: RegExp[];
  languages: string[];
  confidence: number;
}

/**
 * Pattern Library for Intent Detection
 * Multi-language support: English, Tamil, Hindi
 */
const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: 'add',
    patterns: [
      // English patterns
      /add\s+(.+?)\s+(?:to|with|in)\s+(?:this|the|my|our)\s+order/i,
      /(?:also|and|plus)\s+(?:add|include|want|need)\s+(.+?)/i,
      /(?:can|could|please)\s+(?:you\s+)?add\s+(.+?)/i,
      /(?:include|put)\s+(.+?)\s+(?:in|with|to)\s+(?:this|the)\s+order/i,
      /(?:with|along\s+with)\s+(?:this|the)\s+order/i,
      /(?:i|we)\s+(?:also|too)\s+(?:want|need|like)\s+(.+?)/i,
      /(?:give|get)\s+me\s+(?:also|too)\s+(.+?)/i,
      // Tamil patterns
      /(.+?)\s+(?:சேர்க்க|கூட்ட|சேர்த்து)/i,
      /(?:மேலும்|கூடுதலாக)\s+(.+?)/i,
      /(?:நானும்|நாங்களும்)\s+(?:வேண்டும்|விரும்புகிறோம்)\s+(.+?)/i,
      // Hindi patterns
      /(.+?)\s+(?:जोड़|मिला|शामिल)/i,
      /(?:और|भी)\s+(.+?)/i,
      /(?:मुझे|हमें)\s+(?:भी|और)\s+(?:चाहिए|दो)/i,
      // Generic
      /\+/g
    ],
    languages: ['en', 'ta', 'hi'],
    confidence: 0.85
  },
  {
    type: 'remove',
    patterns: [
      // English patterns
      /remove\s+(.+?)\s+(?:from|out of)\s+(?:this|the|my|our)\s+order/i,
      /(?:delete|take\s+out|drop)\s+(.+?)\s+(?:from|out of)\s+(?:this|the|my|our)\s+order/i,
      /(?:don't|do\s+not)\s+(?:want|need)\s+(.+?)/i,
      /(?:cancel|skip)\s+(.+?)/i,
      /(?:without|minus)\s+(.+?)/i,
      // Tamil patterns
      /(.+?)\s+(?:நீக்க|அகற்ற|விலக்க)/i,
      /(?:வேண்டாம்|தேவையில்லை)\s+(.+?)/i,
      // Hindi patterns
      /(.+?)\s+(?:हटा|निकाल|मिटा)/i,
      /(?:नहीं\s+चाहिए|नहीं\s+दो)\s+(.+?)/i
    ],
    languages: ['en', 'ta', 'hi'],
    confidence: 0.85
  },
  {
    type: 'change',
    patterns: [
      // English patterns
      /change\s+(.+?)\s+(?:to|into)\s+(.+?)/i,
      /(?:make|set)\s+(?:it|them)\s+(?:as|to)\s+(\d+)/i,
      /(?:update|modify)\s+(?:quantity|qty|amount)\s+(?:of|for)\s+(.+?)\s+(?:to|as)\s+(\d+)/i,
      /(?:increase|decrease)\s+(.+?)\s+(?:to|by)\s+(\d+)/i,
      // Tamil patterns
      /(.+?)\s+(?:மாற்ற|போட)\s+(.+?)/i,
      /(.+?)\s+(?:ஆக|என)\s+(\d+)/i,
      // Hindi patterns
      /(.+?)\s+(?:बदल|कर)\s+(.+?)/i,
      /(.+?)\s+(?:को|में)\s+(\d+)/i
    ],
    languages: ['en', 'ta', 'hi'],
    confidence: 0.80
  },
  {
    type: 'replace',
    patterns: [
      // English patterns
      /replace\s+(?:this|the|my|our)\s+order\s+(?:with|by)\s+(.+?)/i,
      /(?:instead|instead\s+of)\s+(?:this|that)\s+(.+?)/i,
      /(?:cancel|remove)\s+(?:this|the|my|our)\s+order\s+(?:and|,)\s+(?:order|get)\s+(.+?)/i,
      // Tamil patterns
      /(?:இந்த|எனது)\s+(?:ஆர்டரை|ஓர்டரை)\s+(?:மாற்ற|பதிலாக)\s+(.+?)/i,
      // Hindi patterns
      /(?:इस|मेरा)\s+(?:ऑर्डर|आर्डर)\s+(?:बदल|के\s+बजाय)\s+(.+?)/i
    ],
    languages: ['en', 'ta', 'hi'],
    confidence: 0.90
  },
  {
    type: 'confirm',
    patterns: [
      // English patterns
      /^(?:yes|yeah|yep|ok|okay|confirm|proceed|go\s+ahead|finalize|place\s+order)/i,
      /(?:i\s+confirm|confirmed|that's\s+correct|that's\s+right)/i,
      // Tamil patterns
      /^(?:ஆம்|சரி|உறுதி|செய்)/i,
      // Hindi patterns
      /^(?:हाँ|ठीक|पुष्टि|करो)/i
    ],
    languages: ['en', 'ta', 'hi'],
    confidence: 0.90
  },
  {
    type: 'cancel',
    patterns: [
      // English patterns
      /(?:cancel|stop|abort)\s+(?:this|the|my|our)\s+order/i,
      /(?:don't|do\s+not)\s+(?:want|need)\s+(?:this|the|my|our)\s+order/i,
      // Tamil patterns
      /(?:ரத்து|நிறுத்த|வேண்டாம்)\s+(?:ஆர்டர்|ஓர்டர்)/i,
      // Hindi patterns
      /(?:रद्द|रोक|नहीं\s+चाहिए)\s+(?:ऑर्डर|आर्डर)/i
    ],
    languages: ['en', 'ta', 'hi'],
    confidence: 0.85
  },
  {
    type: 'new',
    patterns: [
      // English patterns - only when no existing order
      /(?:i|we)\s+(?:want|need|like|order|get)\s+(.+?)/i,
      /(?:give|send)\s+me\s+(.+?)/i,
      /(?:i'll\s+take|i'd\s+like)\s+(.+?)/i,
      // Tamil patterns
      /(?:நான்|நாங்கள்)\s+(?:வேண்டும்|விரும்புகிறோம்)\s+(.+?)/i,
      // Hindi patterns
      /(?:मुझे|हमें)\s+(?:चाहिए|दो)\s+(.+?)/i
    ],
    languages: ['en', 'ta', 'hi'],
    confidence: 0.75
  }
];

/**
 * Detect intent from patterns (fast path - 80%+ cases)
 * 
 * @param message - Customer message
 * @param hasExistingOrder - Whether there's an existing pending/confirmed order
 * @returns OrderIntent if pattern matches, null otherwise
 */
export function detectIntentFromPatterns(
  message: string,
  hasExistingOrder: boolean
): OrderIntent | null {
  const cleanedMessage = message.trim();
  
  // Check patterns in order of specificity (most specific first)
  // Replace and Cancel are most specific, so check them first
  for (const patternGroup of INTENT_PATTERNS) {
    for (const pattern of patternGroup.patterns) {
      if (pattern.test(cleanedMessage)) {
        // Special handling for 'new' intent - only if no existing order
        if (patternGroup.type === 'new' && hasExistingOrder) {
          // If order exists and pattern matches "I want X", treat as 'add' instead
          return {
            type: 'add',
            confidence: 0.70,
            reasoning: `Pattern matched "new" but order exists, treating as "add" (safe default)`
          };
        }
        
        // Special handling for ambiguous "I want X" patterns
        if (patternGroup.type === 'new' && hasExistingOrder) {
          continue; // Skip 'new' patterns when order exists
        }
        
        return {
          type: patternGroup.type,
          confidence: patternGroup.confidence,
          reasoning: `Pattern matched: ${pattern.toString()}`
        };
      }
    }
  }
  
  return null;
}

/**
 * Detect intent using AI (for ambiguous cases)
 * 
 * @param message - Customer message
 * @param conversationState - Current conversation state
 * @param memory - Conversation memory
 * @param existingOrder - Existing order if any
 * @returns OrderIntent detected by AI
 */
export async function detectIntentWithAI(
  message: string,
  conversationState: ConversationState | null,
  memory: ConversationMemory | null,
  existingOrder: any | null
): Promise<OrderIntent> {
  if (!openai) {
    logger.warn('OpenAI not configured, using fallback intent detection');
    return fallbackIntentDetection(message, !!existingOrder, []);
  }

  const hasExistingOrder = !!existingOrder;
  const existingOrderItems = existingOrder?.items 
    ? (Array.isArray(existingOrder.items) ? existingOrder.items : JSON.parse(existingOrder.items || '[]'))
    : [];

  const prompt = `You are an intent detection system for an order management chatbot. Analyze the customer message and determine their intent.

Customer Message: "${message}"

Context:
- Existing Order: ${hasExistingOrder ? 'Yes' : 'No'}
${hasExistingOrder ? `- Current Order Items: ${JSON.stringify(existingOrderItems)}` : ''}
${memory?.conversationSummary ? `- Conversation Summary: ${memory.conversationSummary}` : ''}

Intent Types:
1. "add" - Customer wants to ADD items to existing order (e.g., "add cookies to my order", "also want brownie")
2. "remove" - Customer wants to REMOVE items from order (e.g., "remove cookies", "don't want brownie")
3. "change" - Customer wants to CHANGE quantity of items (e.g., "change cookies to 5", "make it 3")
4. "replace" - Customer wants to REPLACE entire order (e.g., "replace order with cookies", "instead of that, give me cookies")
5. "confirm" - Customer is confirming/placing order (e.g., "yes", "confirm", "proceed")
6. "cancel" - Customer wants to cancel order (e.g., "cancel order", "don't want it")
7. "new" - Customer wants to create NEW order (only if no existing order)

CRITICAL RULES:
- If order exists AND customer mentions items without explicit "add" → treat as "add" (safe default)
- If order exists AND customer says "I want X" → treat as "add", NOT "replace"
- Only use "replace" if customer EXPLICITLY says "replace" or "instead"
- If no order exists AND customer mentions items → treat as "new"

Return JSON with:
{
  "type": "add" | "remove" | "change" | "replace" | "confirm" | "cancel" | "new",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
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
          content: message
        }
      ],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' }
    });

    const response = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(response);

    const cost = calculateCostFromUsage(completion.usage, 'gpt-4o-mini');
    logger.debug({ 
      message, 
      intent: parsed.type, 
      confidence: parsed.confidence,
      cost: cost.cost,
      tokens: cost.tokensUsed 
    }, 'AI intent detection completed');

    return {
      type: parsed.type || 'add',
      confidence: parsed.confidence || 0.7,
      reasoning: parsed.reasoning || 'AI detection'
    };
  } catch (error) {
    logger.error({ err: error, message }, 'AI intent detection failed, using fallback');
    return fallbackIntentDetection(message, hasExistingOrder, []);
  }
}

/**
 * Fallback intent detection (safe defaults when intent unclear)
 * 
 * @param message - Customer message
 * @param hasExistingOrder - Whether there's an existing order
 * @param extractedItems - Items extracted from message
 * @returns OrderIntent with safe defaults
 */
export function fallbackIntentDetection(
  message: string,
  hasExistingOrder: boolean,
  extractedItems: OrderItem[]
): OrderIntent {
  const lowerMessage = message.toLowerCase();
  
  // Safe defaults based on context
  if (hasExistingOrder && extractedItems.length > 0) {
    // If order exists and items mentioned → likely ADD (safe default)
    return {
      type: 'add',
      confidence: 0.60,
      extractedItems,
      reasoning: 'Fallback: Order exists + items mentioned → ADD (safe default to prevent replacement)'
    };
  }
  
  if (!hasExistingOrder && extractedItems.length > 0) {
    // If no order and items mentioned → NEW order
    return {
      type: 'new',
      confidence: 0.65,
      extractedItems,
      reasoning: 'Fallback: No order + items mentioned → NEW'
    };
  }
  
  // Check for confirmation keywords
  if (/^(yes|yeah|ok|okay|confirm|proceed)/i.test(message)) {
    return {
      type: 'confirm',
      confidence: 0.70,
      reasoning: 'Fallback: Confirmation keywords detected'
    };
  }
  
  // Check for cancellation keywords
  if (/(cancel|stop|don't want|no)/i.test(message)) {
    return {
      type: 'cancel',
      confidence: 0.65,
      reasoning: 'Fallback: Cancellation keywords detected'
    };
  }
  
  // Default to 'add' if order exists (safest default)
  if (hasExistingOrder) {
    return {
      type: 'add',
      confidence: 0.50,
      reasoning: 'Fallback: Order exists, defaulting to ADD (safest default)'
    };
  }
  
  // Default to 'new' if no order
  return {
    type: 'new',
    confidence: 0.50,
    reasoning: 'Fallback: No order, defaulting to NEW'
  };
}

