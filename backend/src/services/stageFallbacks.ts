/**
 * Stage-specific fallback handlers for Multi-Stage AI Processing
 * 
 * Reference: Phase 6 - Error Handling & Fallbacks
 * Provides fallback mechanisms when AI stages fail
 */

import { logger } from '../logger.js';
import { NormalizedMessage, IntentClassification } from '../types/multiStage.js';

/**
 * Fallback for Stage 0 (Normalization)
 */
export function fallbackNormalization(rawMessage: string): NormalizedMessage {
  logger.warn({ rawMessage }, 'Using fallback normalization');
  
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

/**
 * Fallback for Stage 1 (Intent Classification)
 * Uses keyword-based intent detection
 */
export function fallbackIntentClassification(message: string): IntentClassification {
  logger.warn({ message }, 'Using fallback intent classification');
  
  const lower = message.toLowerCase();
  
  let primaryIntent: IntentClassification['primaryIntent'] = 'other';
  let confidence = 0.5;
  
  if (lower.includes('order') || lower.includes('buy') || lower.includes('want') || lower.includes('need')) {
    primaryIntent = 'order_new';
    confidence = 0.7;
  } else if (lower.includes('status') || lower.includes('where') || lower.includes('when') || lower.includes('track')) {
    primaryIntent = 'order_status';
    confidence = 0.7;
  } else if (lower.includes('update') || lower.includes('change') || lower.includes('modify')) {
    primaryIntent = 'order_update';
    confidence = 0.6;
  } else if (lower.includes('cancel') || lower.includes('remove')) {
    primaryIntent = 'cancel_order';
    confidence = 0.7;
  } else if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey') || lower.includes('namaste')) {
    primaryIntent = 'greeting';
    confidence = 0.8;
  } else if (lower.includes('price') || lower.includes('cost') || lower.includes('available') || lower.includes('menu')) {
    primaryIntent = 'product_inquiry';
    confidence = 0.7;
  }
  
  return {
    primaryIntent,
    confidence,
    extractedInfo: {
      hasDeliveryInfo: false,
      hasSpecialRequests: false,
      mentionsOrder: false,
      urgency: 'low'
    },
    needsMoreContext: true,
    reasoning: 'Keyword-based fallback detection'
  };
}

/**
 * Fallback for Stage 4 (Primary AI Response)
 */
export function fallbackAIResponse(intent: string, vendorId: string): string {
  logger.warn({ intent, vendorId }, 'Using fallback AI response');
  
  const templates: Record<string, string> = {
    'greeting': 'Hi! How can I help you today?',
    'order_new': 'I\'d be happy to help you place an order. What would you like?',
    'order_update': 'I can help you update your order. What would you like to change?',
    'order_status': 'Let me check your order status for you.',
    'product_inquiry': 'I can help you with product information. What are you looking for?',
    'cancel_order': 'I can help you cancel your order. Please confirm the order details.',
    'support': 'I\'m here to help. Could you tell me more about what you need?',
    'other': 'I\'m here to help. Could you tell me more about what you need?'
  };
  
  return templates[intent] || templates['other'];
}

/**
 * Fallback for Stage 7 (Message Composition)
 */
export function fallbackMessageComposition(aiResponse: any, intent: string): string {
  logger.warn({ intent }, 'Using fallback message composition');
  
  if (aiResponse?.response) {
    return aiResponse.response;
  }
  
  return fallbackAIResponse(intent, '');
}

/**
 * Fallback for Stage 1.5 (Intent Prioritization)
 */
export function fallbackIntentPrioritization(primaryIntent: string, secondaryIntents: string[]): {
  handlingStrategy: 'handle_all' | 'handle_primary_first' | 'ask_clarification';
  intentOrder: string[];
  canCombine: boolean;
  followUpNeeded: boolean;
} {
  logger.warn({ primaryIntent, secondaryIntents }, 'Using fallback intent prioritization');
  
  return {
    handlingStrategy: 'handle_primary_first',
    intentOrder: [primaryIntent, ...secondaryIntents],
    canCombine: false,
    followUpNeeded: secondaryIntents.length > 0
  };
}

/**
 * Fallback for Stage 1.7 (Correction Detection)
 */
export function fallbackCorrectionDetection(): {
  isCorrection: boolean;
  correctedField: null;
  originalUnderstanding: null;
  correctedValue: null;
  confidence: number;
} {
  return {
    isCorrection: false,
    correctedField: null,
    originalUnderstanding: null,
    correctedValue: null,
    confidence: 0
  };
}

/**
 * Fallback for Stage 4.5 (Order Update Validation)
 */
export function fallbackOrderUpdateValidation(update: any, currentOrder: any): {
  isValid: boolean;
  conflicts: any[];
  priceChanges: { oldTotal: number; newTotal: number; difference: number };
  requiresConfirmation: boolean;
  validatedUpdate: any;
} {
  logger.warn({ update, currentOrder }, 'Using fallback order update validation');
  
  return {
    isValid: true, // Allow update by default in fallback
    conflicts: [],
    priceChanges: {
      oldTotal: currentOrder?.totalAmount || 0,
      newTotal: currentOrder?.totalAmount || 0,
      difference: 0
    },
    requiresConfirmation: false,
    validatedUpdate: update
  };
}

/**
 * Fallback for Stage 4.7 (Proactive Assistance)
 */
export function fallbackProactiveAssistance(): {
  suggestions: any[];
  shouldInclude: boolean;
} {
  return {
    suggestions: [],
    shouldInclude: false
  };
}

/**
 * Fallback for Stage 6 (Response Refinement)
 */
export function fallbackResponseRefinement(initialResponse: any): any {
  logger.warn('Using fallback response refinement');
  return initialResponse;
}

/**
 * Fallback for Stage 7.5 (Data Validation)
 */
export function fallbackDataValidation(extractedData: any): {
  isValid: boolean;
  errors: any[];
  validatedData: any;
} {
  logger.warn({ extractedData }, 'Using fallback data validation');
  
  return {
    isValid: true, // Allow by default in fallback
    errors: [],
    validatedData: extractedData
  };
}

/**
 * Fallback for Stage 8.5 (Quality Assessment)
 */
export function fallbackQualityAssessment(): {
  naturalnessScore: number;
  informationCompleteness: number;
  conversationContinuity: number;
  overallScore: number;
  issues: string[];
} {
  return {
    naturalnessScore: 3.5,
    informationCompleteness: 0.8,
    conversationContinuity: 0.7,
    overallScore: 3.5,
    issues: ['Quality assessment unavailable']
  };
}

