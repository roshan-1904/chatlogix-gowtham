/**
 * Message Composition Service
 * 
 * Formats messages from Stage 4 for Stage 7 (formatting only, no AI call)
 * Reference: Phase 5.9: Stage 7 - Message Composition Service (Implementation Plan)
 * 
 * OPTIMIZATION: Removed AI call to prevent Stage 7 from changing Stage 4's response meaning.
 * Now only applies formatting functions to preserve Stage 4's response exactly.
 */

import { logger } from '../logger.js';
import { PrimaryAIResponse } from './primaryAIResponseService.js';
import { ConversationMemory } from './conversationMemoryService.js';
import { formatWhatsAppMessage, formatMessageWithSmartBreaks } from '../utils/messageFormatter.js';
import { 
  generateOrderSummary, 
  generateAddItemsSummary, 
  generateRemoveItemsSummary,
  generateChangeQuantitySummary,
  generateConfirmationPrompt 
} from './orderSummaryService.js';
import { IntentClassification } from '../types/multiStage.js';

export interface ComposeMessageResult {
  message: string;
  tokensUsed: number;
  cost: number;
}

/**
 * Format message from Stage 4 for final delivery (formatting only, no AI call)
 * 
 * OPTIMIZATION: Removed AI call to prevent Stage 7 from changing Stage 4's response meaning.
 * Now only applies formatting functions to preserve Stage 4's response exactly.
 * 
 * ENHANCEMENT: Includes order summaries for order-related intents.
 * 
 * @param responseData - The response from Stage 4 (PrimaryAIResponse)
 * @param memory - Conversation memory for greeting detection
 * @param vendorConfig - Vendor configuration (for timezone/bot name if needed)
 * @param conversationId - Conversation ID for logging
 * @param vendorId - Vendor ID for logging
 * @param isFirstMessage - Flag to indicate if this is the first customer message
 * @param intentResult - Intent classification result (optional, for order summaries)
 * @param orderData - Order data (optional, for order summaries)
 * @returns Formatted message with tokensUsed: 0 and cost: 0 (no AI call)
 */
export async function composeMessage(
  responseData: PrimaryAIResponse & { availableProducts?: any[] },
  memory: ConversationMemory,
  vendorConfig: any,
  conversationId: string,
  vendorId: string,
  isFirstMessage?: boolean,
  intentResult?: IntentClassification | null,
  orderData?: { order?: any; itemsAdded?: any[]; itemsRemoved?: string[]; quantityChanges?: Array<{product: string, oldQuantity: number, newQuantity: number}> } | null
): Promise<ComposeMessageResult> {
  try {
    // Determine if this is a greeting
    const isGreeting = memory.turnNumber <= 1 || 
                       memory.conversationStage === 'greeting' || 
                       isFirstMessage;
    
    // Get the response from Stage 4
    let message = responseData.response?.trim() || 'I\'m here to help. How can I assist you?';
    
    // ENHANCEMENT: Add order summary for order-related intents
    if (intentResult && orderData?.order) {
      const primaryIntent = intentResult.primaryIntent;
      const orderUpdateType = intentResult.extractedInfo?.orderUpdateType;
      
      if (primaryIntent === 'order_update' && orderData.order) {
        let orderSummary = '';
        
        if (orderUpdateType === 'add_items' && orderData.itemsAdded && orderData.itemsAdded.length > 0) {
          orderSummary = generateAddItemsSummary(orderData.order, orderData.itemsAdded);
        } else if (orderUpdateType === 'remove_items' && orderData.itemsRemoved && orderData.itemsRemoved.length > 0) {
          orderSummary = generateRemoveItemsSummary(orderData.order, orderData.itemsRemoved);
        } else if (orderUpdateType === 'change_quantity' && orderData.quantityChanges && orderData.quantityChanges.length > 0) {
          orderSummary = generateChangeQuantitySummary(orderData.order, orderData.quantityChanges);
        } else {
          orderSummary = generateOrderSummary(orderData.order);
        }
        
        // Append order summary to message
        message = `${message}\n\n${orderSummary}`;
      } else if (primaryIntent === 'order_new' && orderData.order) {
        // For new orders, add confirmation prompt
        const orderSummary = generateOrderSummary(orderData.order);
        message = `${message}\n\n${orderSummary}`;
      } else if (primaryIntent === 'confirm_order' && orderData.order) {
        // For confirmations, show full order summary
        const orderSummary = generateOrderSummary(orderData.order);
        message = `${message}\n\n${orderSummary}`;
      }
    }
    
    // Apply formatting functions (preserves Stage 4's response meaning)
    message = formatWhatsAppMessage(message, isGreeting);
    message = formatMessageWithSmartBreaks(message);
    
    return {
      message,
      tokensUsed: 0,  // No AI call
      cost: 0          // No AI call
    };
  } catch (error) {
    logger.error({ err: error, conversationId }, 'Message formatting failed');
    const fallbackMessage = responseData.response || 'I\'m here to help. How can I assist you?';
    return {
      message: fallbackMessage,
      tokensUsed: 0,
      cost: 0
    };
  }
}

