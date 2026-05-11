/**
 * Memory Update Helper Functions
 * 
 * Helper functions for extracting and updating conversation memory
 * Used in Stage 2 and Stage 4 for incremental memory updates
 * 
 * Reference: Memory Update and Clarification Plan
 */

import { ConversationMemory } from './conversationMemoryService.js';
import { PrimaryAIResponse } from './primaryAIResponseService.js';

/**
 * Extract ongoing topics from intent and extracted info (Stage 2)
 */
export function extractOngoingTopicsFromIntent(
  intent: string,
  extractedInfo: any,
  secondaryIntents?: string[]
): string[] {
  const topics: string[] = [];
  
  // Add primary intent topic
  const intentTopics: Record<string, string> = {
    'order_new': 'Placing new order',
    'order_update': 'Updating order',
    'order_status': 'Checking order status',
    'product_inquiry': 'Product inquiry',
    'confirm_order': 'Order confirmation',
    'cancel_order': 'Order cancellation',
    'repeat_order': 'Repeating previous order',
    'delivery_inquiry': 'Delivery inquiry',
    'payment_inquiry': 'Payment inquiry',
    'complaint': 'Customer complaint',
    'support': 'Support request',
    'refund_request': 'Refund request',
    'return_request': 'Return request',
    'feedback': 'Customer feedback',
    'account_inquiry': 'Account inquiry',
    'greeting': 'Greeting',
    'other': 'Other inquiry'
  };
  
  if (intentTopics[intent]) {
    topics.push(intentTopics[intent]);
  }
  
  // Add secondary intents as topics
  if (secondaryIntents && secondaryIntents.length > 0) {
    secondaryIntents.forEach(secIntent => {
      if (intentTopics[secIntent] && !topics.includes(intentTopics[secIntent])) {
        topics.push(intentTopics[secIntent]);
      }
    });
  }
  
  // Add product-related topics
  if (extractedInfo?.products?.length > 0) {
    const productList = extractedInfo.products.slice(0, 3).join(', ');
    topics.push(`Products: ${productList}`);
  }
  
  // Add delivery-related topics
  if (extractedInfo?.hasDeliveryInfo) {
    topics.push('Delivery information provided');
  }
  
  // Add special requests topic
  if (extractedInfo?.hasSpecialRequests) {
    topics.push('Special requests mentioned');
  }
  
  return topics;
}

/**
 * Extract ongoing topics from AI response (Stage 4)
 */
export function extractOngoingTopicsFromResponse(aiResponse: PrimaryAIResponse): string[] {
  const topics: string[] = [];
  
  // Add topics based on extracted data
  if (aiResponse.extractedData?.orderItems && Array.isArray(aiResponse.extractedData.orderItems) && aiResponse.extractedData.orderItems.length > 0) {
    const productNames = aiResponse.extractedData.orderItems
      .map((item: any) => item.product)
      .filter(Boolean)
      .slice(0, 3);
    if (productNames.length > 0) {
      topics.push(`Order items: ${productNames.join(', ')}`);
    }
  }
  
  if (aiResponse.needsClarification) {
    const missingFields = aiResponse.clarificationStrategy?.missingFields || [];
    if (missingFields.length > 0) {
      topics.push(`Awaiting: ${missingFields.join(', ')}`);
    }
  }
  
  // Add conversation flow stage
  if (aiResponse.conversationFlow?.nextStage) {
    topics.push(`Stage: ${aiResponse.conversationFlow.nextStage}`);
  }
  
  return topics;
}

/**
 * Extract customer preferences from customer insights (Stage 2)
 */
export function extractPreferencesFromInsights(insights: any): Record<string, any> {
  const preferences: Record<string, any> = {};
  
  if (!insights) return preferences;
  
  if (insights.customerName) {
    preferences.customerName = insights.customerName;
  }
  
  if (insights.primaryDeliveryAddress || insights.deliveryAddress) {
    preferences.deliveryAddress = 
      insights.primaryDeliveryAddress || insights.deliveryAddress;
  }
  
  if (insights.preferences) {
    preferences.preferences = insights.preferences;
  }
  
  if (insights.communicationStyle) {
    preferences.communicationStyle = insights.communicationStyle;
  }
  
  if (insights.paymentPreferences) {
    preferences.paymentPreferences = insights.paymentPreferences;
  }
  
  if (insights.specialRequests) {
    preferences.specialRequests = insights.specialRequests;
  }
  
  return preferences;
}

/**
 * Extract customer preferences from AI-extracted data (Stage 4)
 */
export function extractPreferencesFromExtractedData(extractedData: any): Record<string, any> {
  const preferences: Record<string, any> = {};
  
  if (!extractedData) return preferences;
  
  if (extractedData.deliveryAddress) {
    preferences.deliveryAddress = extractedData.deliveryAddress;
  }
  
  if (extractedData.specialRequests) {
    preferences.specialRequests = extractedData.specialRequests;
  }
  
  if (extractedData.deliveryTime) {
    preferences.deliveryTime = extractedData.deliveryTime;
  }
  
  if (extractedData.paymentMethod) {
    preferences.paymentMethod = extractedData.paymentMethod;
  }
  
  if (extractedData.customerName) {
    preferences.customerName = extractedData.customerName;
  }
  
  // Also check customerInfo object for name
  if (extractedData.customerInfo?.name) {
    preferences.customerName = extractedData.customerInfo.name;
  }
  
  if (extractedData.deliveryInstructions) {
    preferences.deliveryInstructions = extractedData.deliveryInstructions;
  }
  
  return preferences;
}

/**
 * Validate if clarification is actually needed
 * Checks memory and extracted data to avoid asking unnecessary questions
 */
export function validateClarificationNeeds(
  parsed: any,
  memory: ConversationMemory,
  extractedData: any
): boolean {
  if (!parsed.needsClarification) {
    return false;
  }

  const missingFields = parsed.clarificationStrategy?.missingFields || [];

  if (missingFields.length === 0) {
    return false;
  }

  // Check each missing field against memory AND conversation history
  const convHistory: any[] = (memory as any).conversationHistory || [];
  const recentCustomerMessages = convHistory
    .filter((m: any) => m.senderType === 'customer')
    .slice(-3)
    .map((m: any) => m.content || '');

  for (const field of missingFields) {
    // --- customerName ---
    if (field === 'customerName') {
      if (memory.customerPreferences?.information?.name ||
          memory.customerPreferences?.customerName) {
        return false; // Name exists in memory
      }
      // Check if extractedData already has it
      if (extractedData?.customerName || extractedData?.customerInfo?.name) {
        return false;
      }
    }

    // --- deliveryAddress ---
    if (field === 'deliveryAddress') {
      if (memory.customerPreferences?.deliveryAddress ||
          memory.customerPreferences?.primaryDeliveryAddress) {
        return false; // Address exists in memory
      }
      if (extractedData?.deliveryAddress) {
        return false;
      }
      // Check recent customer messages for address-like content
      const addressPattern = /(?:road|street|nagar|colony|layout|heights|apartment|flat|floor|block|sector|phase|plot|\d{6})/i;
      for (const msg of recentCustomerMessages) {
        if (addressPattern.test(msg) && (msg.split(',').length >= 2 || /\b\d{6}\b/.test(msg))) {
          return false; // Customer already provided address in recent message
        }
      }
    }

    // --- preferredDeliveryDate ---
    if (field === 'deliveryDate' || field === 'preferredDeliveryDate') {
      const datePattern = /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[\s/-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i;
      for (const msg of recentCustomerMessages) {
        if (datePattern.test(msg)) {
          return false; // Customer already mentioned a delivery date
        }
      }
    }

    // Generic: if extractedData already has the field, don't need clarification
    if (extractedData && extractedData[field]) {
      return false;
    }
  }

  // Only need clarification if critical fields are truly missing
  const criticalFields = ['customerName', 'deliveryAddress', 'orderItems'];
  return missingFields.some((f: string) => criticalFields.includes(f));
}

