import { env } from '../config/env.js';
import OpenAI from 'openai';
import { prisma } from '../db/prisma.js';
import { ConversationStateService } from './conversationStateService.js';
import { computeCustomerUpdateEvent, computeOrderUpdateEvent } from './stateDiffService.js';
import { ConversationStateResponseSchema } from '../types/conversationState.js';
import { logConversation } from '../logger.js';
import { costMonitor } from '../utils/costMonitor.js';
import { OrderService } from './orderService.js';
import { logger } from '../logger.js';
import { AIStructuredResponse, CustomerInsightsContext, VendorAIConfig } from '../types/aiResponse.js';
import { CustomerInsightsService } from './customerInsightsService.js';

export class AIService {
  private openai: OpenAI | null = null;
  private orderService: OrderService;
  private insightsService: CustomerInsightsService;

  constructor() {
    if (env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: env.OPENAI_API_KEY,
      });
    }
    this.orderService = new OrderService();
    this.insightsService = new CustomerInsightsService();
  }

  /**
   * Generate response - deprecated, use generateStructuredResponse instead
   * Kept for backward compatibility
   */
  async generateResponse(context: string, intent: string, vendorId?: string, conversationId?: string): Promise<string> {
    // Always use structured response system
    if (vendorId && conversationId) {
      try {
        const structuredResponse = await this.generateStructuredResponse(context, vendorId, conversationId);
        return structuredResponse.customerMessage;
      } catch (error) {
        logger.error('Structured response failed, falling back to basic response', { error, vendorId, conversationId } as any);
      }
    }

    // Fallback if no vendor/conversation context
    if (!this.openai) {
      return 'Hi! I\'m here to help you. How can I assist you today?';
    }

    // Basic fallback response
    return 'Hi! I\'m here to help you. How can I assist you today?';
  }

  private async buildConversationContext(conversationId?: string, currentMessage?: string): Promise<Array<{role: 'user' | 'assistant', content: string}>> {
    if (!conversationId) {
      return [];
    }

    try {
      // Fetch last 10 messages from the conversation for context
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: {
          senderType: true,
          content: true,
          type: true,
          timestamp: true
        }
      });

      // Reverse to get chronological order (oldest first)
      const chronologicalMessages = messages.reverse();

      // Convert to OpenAI message format, excluding the current message
      const contextMessages = chronologicalMessages
        .filter((msg: any) => msg.content !== currentMessage) // Exclude current message
        .map((msg: any) => ({
          role: msg.senderType === 'customer' ? 'user' as const : 'assistant' as const,
          content: msg.content
        }));

      // Limit context to last 8 messages to avoid token limits
      return contextMessages.slice(-8);
    } catch (error) {
      console.error('Error fetching conversation context:', error);
      return [];
    }
  }

  /**
   * Check if this is a new customer greeting
   */
  private async isNewCustomerGreeting(conversationId: string, context: string): Promise<boolean> {
    try {
      // Get conversation message count
      const messageCount = await prisma.message.count({
        where: { 
          conversationId,
          senderType: 'customer'
        }
      });

      // Check if this is the first customer message
      if (messageCount <= 1) {
        // Check if the message is a greeting
        const greetingPatterns = [
          /^(hi|hello|hey|namaste|good morning|good afternoon|good evening)/i,
          /^(mam|sir|madam)/i,
          /^(how are you|how do you do)/i
        ];
        
        const isGreeting = greetingPatterns.some(pattern => pattern.test(context.trim()));
        
        if (isGreeting) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error({ error }, 'Error checking new customer greeting');
      return false;
    }
  }

  /**
   * Send welcome message with product details for new customers
   */
  private async sendWelcomeMessage(vendorId: string, context: string, conversationId?: string): Promise<string> {
    try {
      const vendorConfig = await this.getVendorAIConfig(vendorId);
      
      if (!vendorConfig) {
        return "Hello! Welcome to our store. How can I help you today?";
      }

      // Get customer insights if available
      let customerInsights = '';
      if (conversationId) {
        try {
          const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { customer: true }
          });
          
          if (conversation) {
            const insights = await this.insightsService.getOrCreateInsights(
              conversation.customerId,
              vendorId
            );
            customerInsights = this.insightsService.formatInsightsForAI(insights);
          }
        } catch (error) {
          // Could not fetch customer insights for welcome message
        }
      }

      // Use vendor's greeting message
      if (typeof vendorConfig.aiGreeting === 'string') {
        return vendorConfig.aiGreeting;
      }

      // Generate AI-powered welcome message
      if (this.openai) {
        const systemPrompt = `You are ${vendorConfig.aiBotName || 'AI Assistant'} for ${vendorConfig.businessName || 'our business'}.

${vendorConfig.aiPersonality || 'Be friendly and helpful'}

The customer just greeted you with: "${context}"

${customerInsights ? `CUSTOMER INSIGHTS:
${customerInsights}

` : ''}Your task: Respond warmly and introduce your products/services. Keep it conversational and suitable for WhatsApp.

Available Products:
${vendorConfig.aiProducts || 'Please ask about our products'}

Be friendly, welcoming, and encourage them to ask about products or place an order.`;

        const modelToUse = this.getAIModel(vendorConfig);
        const startTime = Date.now();
        logger.info({
          operation: 'generate_welcome_message',
          model: modelToUse,
          vendorId,
          conversationId,
          contextLength: context.length,
          hasCustomerInsights: !!customerInsights,
          timestamp: new Date().toISOString()
        }, '🤖 Starting AI welcome message generation');

        const completion = await this.openai.chat.completions.create({
          model: modelToUse,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: context }
          ],
          max_completion_tokens: 150,
          temperature: 0.7,
        });

        const duration = Date.now() - startTime;

        if (completion.usage) {
          costMonitor.logUsage(completion.usage);
          
          logger.info({
            operation: 'generate_welcome_message',
            model: modelToUse,
            vendorId,
            conversationId,
            duration,
            responseLength: completion.choices[0]?.message?.content?.trim().length || 0,
            tokens: completion.usage,
            cost: completion.usage.total_tokens * 0.0005 / 1000, // Approximate cost
            timestamp: new Date().toISOString()
          }, '🤖 AI welcome message generation completed');
        }

        // Ensure the result is always a string (not an object/array)
        const aiResponse = completion.choices[0]?.message?.content?.trim();
        if (typeof aiResponse === "string" && aiResponse.length > 0) {
          return aiResponse;
        }
        // Check for vendor greeting
        const vendorGreeting = vendorConfig?.aiGreeting;
        if (vendorGreeting) {
          const greetingStr = String(vendorGreeting);
          if (greetingStr.length > 0) {
            return greetingStr;
          }
        }
        return "Hello! Welcome! How can I help you today?";
      }

      // Fallback to vendor greeting (make sure it's a string)
      const vendorGreeting = vendorConfig?.aiGreeting;
      if (vendorGreeting) {
        const greetingStr = String(vendorGreeting);
        if (greetingStr.length > 0) {
          return greetingStr;
        }
      }
      const businessName = vendorConfig?.businessName || 'our store';
      return `Hello! Welcome to ${businessName}! How can I help you today?`;
      
    } catch (error) {
      console.error('Error sending welcome message:', error);
      return "Hello! Welcome! How can I help you today?";
    }
  }

  /**
   * Get existing pending order (don't create new one)
   */
  private async getExistingPendingOrder(conversationId: string, vendorId: string) {
    try {
      // First, verify the conversation belongs to the correct vendor
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { customer: true }
      });

      if (!conversation) {
        return null;
      }

      // Validate vendor matches the conversation's vendor
      if (conversation.vendorId !== vendorId) {
        return null;
      }

      // Look for existing pending order for this customer-vendor pair
      const pendingOrder = await prisma.order.findFirst({
        where: { 
          vendorId,
          customerId: conversation.customerId,
          status: 'pending'
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          deliveryAddress: true,
          deliveryInstructions: true,
          specialRequests: true,
          items: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return pendingOrder;
    } catch (error) {
      console.error('Error getting existing pending order:', error);
      return null;
    }
  }

  /**
   * Get or create the single pending order for this customer-vendor pair
   * This is the core of our straightforward approach
   */
  private async getOrCreatePendingOrder(conversationId: string, vendorId: string) {
    try {
      // First, verify the conversation belongs to the correct vendor
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { customer: true }
      });

      if (!conversation) {
        return null;
      }

      // Validate vendor matches the conversation's vendor
      if (conversation.vendorId !== vendorId) {
        return null;
      }

      // Look for existing pending order for this customer-vendor pair
      let pendingOrder = await prisma.order.findFirst({
        where: { 
          vendorId,
          customerId: conversation.customerId,
          status: 'pending'
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          deliveryAddress: true,
          deliveryInstructions: true,
          specialRequests: true,
          items: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // If no pending order exists, create one
      if (!pendingOrder) {
        const orderNumber = await this.generateOrderNumber(vendorId);
        pendingOrder = await prisma.order.create({
          data: {
            vendorId,
            customerId: conversation.customerId,
            conversationId,
            orderNumber,
            items: [],
            totalAmount: 0,
            status: 'pending'
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            deliveryAddress: true,
            deliveryInstructions: true,
            specialRequests: true,
            items: true,
            createdAt: true,
            updatedAt: true
          }
        });
      }

      return pendingOrder;
    } catch (error) {
      logger.error({ error, conversationId, vendorId }, 'Error getting/creating pending order');
      return null;
    }
  }

  /**
   * Get vendor's order count for current month
   */
  private async getVendorOrderCountForMonth(vendorId: string): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const count = await prisma.order.count({
      where: {
        vendorId,
        createdAt: { gte: startOfMonth }
      }
    });
    return count + 1; // Next order number
  }

  /**
   * Generate order number for vendor
   * Format: ORD-{prefix}-YYYYMM{4-digit-count}
   */
  private async generateOrderNumber(vendorId: string): Promise<string> {
    // Fetch vendor to get orderPrefix
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { orderPrefix: true }
    });

    // Use orderPrefix from vendor, or default to 'ORDER' if not set
    const prefix = (vendor?.orderPrefix || 'ORDER').toUpperCase().substring(0, 5).padEnd(5, 'X');
    
    // Get current date components
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const yearMonth = `${year}${month}`;
    
    // Get order count for current month
    const orderCount = await this.getVendorOrderCountForMonth(vendorId);
    
    // Format: ORD-{prefix}-YYYYMM{4-digit-count}
    return `ORD-${prefix}-${yearMonth}${String(orderCount).padStart(4, '0')}`;
  }

  /**
   * Generate a friendly, conversational response using AI
   */
  private async generateFriendlyResponse(order: any, context: string, intent: string, conversationId: string, vendorId: string): Promise<string> {
    try {
      // Get vendor configuration for personalized responses
      const vendorConfig = await this.getVendorAIConfig(vendorId);
      
      // Use vendor's AI system prompt directly
      const vendorPrompt = vendorConfig?.aiSystemPrompt;
      const systemPrompt: string = typeof vendorPrompt === 'string' ? vendorPrompt : `You are a friendly, helpful AI assistant for ${vendorConfig?.businessName || 'our bakery'}. 

Please generate a friendly, conversational response that:
1. Acknowledges their message naturally
2. Responds appropriately to their inquiry
3. Offers helpful assistance without being mechanical
4. Uses a warm, personal tone
5. Avoids repetitive bullet points
6. Makes the customer feel valued

Keep it concise but warm. Don't use numbered lists unless absolutely necessary.`;

      if (!this.openai) {
        return 'Hi! I\'m here to help you. How can I assist you today?';
      }

      // Ensure context is a string
      const contextString: string = typeof context === 'string' ? context : String(context);
      
      const modelToUse = this.getAIModel(vendorConfig);
      const startTime = Date.now();
      logger.info({
        operation: 'generate_friendly_response',
        model: modelToUse,
        vendorId,
        conversationId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        contextLength: contextString.length,
        intent,
        usesVendorPrompt: !!vendorConfig?.aiSystemPrompt,
        timestamp: new Date().toISOString()
      }, '🤖 Starting AI friendly response generation');

      const response = await this.openai.chat.completions.create({
        model: modelToUse,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: contextString
          }
        ],
        max_completion_tokens: 200,
        temperature: 0.7
      });

      const duration = Date.now() - startTime;
      const responseText = response.choices[0]?.message?.content || 'Hi! I\'m here to help you. How can I assist you today?';

      logger.info({
        operation: 'generate_friendly_response',
        model: 'gpt-3.5-turbo',
        vendorId,
        conversationId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        duration,
        responseLength: responseText.length,
        intent,
        usesVendorPrompt: !!vendorConfig?.aiSystemPrompt,
        timestamp: new Date().toISOString()
      }, '🤖 AI friendly response generation completed');

      return responseText;
    } catch (error) {
      console.error('Error generating friendly response:', error);
      return 'Hi! I\'m here to help you. How can I assist you today?';
    }
  }



  /**
   * Update the pending order with new information
   */
  private async updatePendingOrder(orderId: string, extractedOrder: any): Promise<any> {
    try {
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          items: extractedOrder.items,
          totalAmount: extractedOrder.totalAmount,
          deliveryAddress: extractedOrder.deliveryAddress,
          deliveryInstructions: extractedOrder.deliveryInstructions,
          specialRequests: extractedOrder.specialRequests,
          updatedAt: new Date()
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          deliveryAddress: true,
          deliveryInstructions: true,
          specialRequests: true,
          items: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return updatedOrder;
    } catch (error) {
      logger.error({ error, orderId }, 'Error updating pending order');
      return null;
    }
  }

  /**
   * Cancel the pending order
   */
  private async cancelPendingOrder(orderId: string, orderNumber: string): Promise<string> {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Customer requested cancellation',
          updatedAt: new Date()
        }
      });

      return `✅ Your order ${orderNumber} has been cancelled successfully. I can now help you place a new order if you'd like. What would you like to order?`;
    } catch (error) {
      logger.error({ error, orderNumber }, 'Error cancelling order');
      return `❌ Sorry, I couldn't cancel your order ${orderNumber} right now. Please try again or contact our support team.`;
    }
  }

  /**
   * Confirm the pending order
   */
  private async confirmPendingOrder(orderId: string, orderNumber: string): Promise<string> {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'confirmed',
          confirmedAt: new Date(),
          updatedAt: new Date()
        }
      });

      return `🎉 Great! Your order ${orderNumber} has been confirmed successfully. We'll start preparing it right away and update you on the progress. Thank you for your order!`;
    } catch (error) {
      logger.error({ error, orderNumber }, 'Error confirming order');
      return `❌ Sorry, I couldn't confirm your order ${orderNumber} right now. Please try again or contact our support team.`;
    }
  }

  /**
   * Handle all order updates for the single pending order
   * This is where all the magic happens - every message updates the order
   */
  private async handleOrderUpdate(order: any, context: string, intent: string, conversationId: string, vendorId: string): Promise<string> {
    const orderNumber = order.orderNumber;
    
    // Check for specific order actions first
    const orderAction = this.detectOrderAction(context);
    
    if (orderAction.action === 'cancel') {
      return await this.cancelPendingOrder(order.id, orderNumber);
    }
    
    if (orderAction.action === 'confirm') {
      return await this.confirmPendingOrder(order.id, orderNumber);
    }

    // Extract new order information from the conversation
    const extractedOrder = await this.orderService.extractOrderFromConversation(conversationId);
    
    if (extractedOrder && extractedOrder.items.length > 0) {
      // Update the pending order with new information
      const updatedOrder = await this.updatePendingOrder(order.id, extractedOrder);
      
      if (updatedOrder) {
        // Use AI to generate a friendly response
        return await this.generateFriendlyResponse(updatedOrder, context, intent, conversationId, vendorId);
      }
    }

    // If no new order information extracted, generate friendly response for current order
    return await this.generateFriendlyResponse(order, context, intent, conversationId, vendorId);
  }

  // Detect order actions from customer messages
  private detectOrderAction(message: string): { action: string | null; details?: any } {
    const msg = message.toLowerCase();
    
    // Cancel actions
    if (msg.includes('cancel') && (msg.includes('order') || msg.includes('this'))) {
      return { action: 'cancel' };
    }
    
    // Confirm actions
    if (msg.includes('confirm') || msg.includes('yes') || msg.includes('proceed')) {
      return { action: 'confirm' };
    }
    
    // Update/modify actions
    if (msg.includes('update') || msg.includes('change') || msg.includes('modify')) {
      return { action: 'update' };
    }
    
    // Add items actions
    if (msg.includes('add') || msg.includes('more') || msg.includes('also')) {
      return { action: 'add' };
    }
    
    // New order actions
    if (msg.includes('new order') || msg.includes('place new') || msg.includes('fresh order')) {
      return { action: 'new_order' };
    }
    
    return { action: null };
  }

  // Cart-like order management methods
  private async cancelOrder(orderId: string): Promise<boolean> {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: { 
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Customer requested cancellation'
        }
      });
      return true;
    } catch (error) {
      console.error('Error cancelling order:', error);
      return false;
    }
  }

  private async updateOrderItems(orderId: string, newItems: any[]): Promise<boolean> {
    try {
      const totalAmount = newItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      await prisma.order.update({
        where: { id: orderId },
        data: { 
          items: newItems,
          totalAmount: totalAmount,
          updatedAt: new Date()
        }
      });
      return true;
    } catch (error) {
      console.error('Error updating order items:', error);
      return false;
    }
  }

  private async confirmOrder(orderId: string): Promise<boolean> {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: { 
          status: 'confirmed',
          confirmedAt: new Date(),
          updatedAt: new Date()
        }
      });
      return true;
    } catch (error) {
      console.error('Error confirming order:', error);
      return false;
    }
  }

  private async getVendorAIConfig(vendorId: string) {
    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          id: true,
          businessName: true,
          aiBotName: true,
          aiPersonality: true,
          aiSystemPrompt: true,
          aiProducts: true,
          aiGreeting: true,
          aiClosing: true,
          aiModel: true,
          // Only include fields that actually exist in the database
        }
      });
      if (!vendor) {
        logger.error({ vendorId }, '⚠️ Vendor not found in database');
      }
      
      return vendor;
    } catch (error) {
      logger.error({ error, vendorId }, '⚠️ Error fetching vendor AI config from database');
      return null;
    }
  }

  /**
   * Get the AI model to use for a vendor, with fallback to default
   */
  private getAIModel(vendorConfig: any): string {
    // Default model if not specified
    const DEFAULT_MODEL = 'gpt-4.1-mini';
    
    if (vendorConfig?.aiModel) {
      return vendorConfig.aiModel;
    }
    
    return DEFAULT_MODEL;
  }


  async getVendorGreeting(vendorId?: string): Promise<string> {
    if (!vendorId) {
      return 'Hello! How can I help you today?';
    }

    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId }
      });

      if ((vendor as any)?.aiGreeting) return (vendor as any).aiGreeting;

      if ((vendor as any)?.aiBotName) return `Hi! I'm ${(vendor as any).aiBotName}. How can I help you today?`;

      return 'Hello! How can I help you today?';
    } catch (error) {
      console.error('Error fetching vendor greeting:', error);
      return 'Hello! How can I help you today?';
    }
  }

  async getVendorClosing(vendorId?: string): Promise<string> {
    if (!vendorId) {
      return 'Thank you for your time!';
    }

    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId }
      });

      return (vendor as any)?.aiClosing || 'Thank you for your time!';
    } catch (error) {
      console.error('Error fetching vendor closing:', error);
      return 'Thank you for your time!';
    }
  }

  private getSystemPrompt(intent: string): string {
    // Platform-wide base prompt. This is used only if vendor hasn't provided an override.
    const basePrompt = `You are a helpful customer service representative for a WhatsApp business platform called ChatLogix. 
    You help customers with their inquiries in a friendly, professional, and concise manner.
    Keep responses under 100 words and be specific to the customer's needs.
    
    IMPORTANT: Use the conversation history provided to understand context. If the customer has mentioned:
    - Their address or location, remember it for future reference
    - Delivery preferences, note them down
    - Previous orders or specific requirements, reference them
    - Any personal details shared earlier, use them to personalize responses

    ORDER COLLECTION NOTES:
    - When discussing a new order, politely ask if the customer has any tiny notes or minor modifications (e.g., "no nuts", "less sweet").
    - Reassure them that we will make a confirmation call before we start baking if we have any clarifications.
    - If they share notes, acknowledge them and confirm they have been recorded.

    SERVICE-LEVEL TIMING:
    - Preparation time is typically 2–3 hours AFTER order confirmation.
    - Do NOT claim 24–48 hours; keep timelines consistent with 2–3 hours unless vendor config specifies otherwise.`;

    switch (intent) {
      case 'pricing_query':
        return `${basePrompt}
        
        You're responding to pricing inquiries. Our plans are:
        - Basic: ₹99/month (100 messages)
        - Pro: ₹299/month (500 messages) 
        - Enterprise: ₹999/month (unlimited messages)
        
        Mention that we offer a free trial and can provide custom pricing for high-volume needs.
        If they've mentioned their business type or volume before, tailor the recommendation accordingly.`;

      case 'order_status':
        return `${basePrompt}
        
        You're helping with order status inquiries. If customer order information is provided in the context, 
        display the order details EXACTLY as provided in the context, preserving all line breaks and formatting.
        
        IMPORTANT FORMATTING RULES:
        - Always preserve line breaks (\n) in your response
        - Use the exact formatting provided in the order context
        - Do not compress multiple lines into single lines
        - Keep each piece of information on its own line
        
        For each order, show:
        - Order number and date
        - Current status with appropriate emoji
        - Items ordered and total amount
        - Delivery information if available
        
        If the customer has delivered orders, offer to help them repeat the order.
        If they ask to modify a new order, ask for any tiny notes and remind them we'll confirm by phone before baking if needed.
        Inform that standard preparation time is 2–3 hours after order confirmation (or vendor-configured timing). 
        If no order information is available, ask for order ID or phone number to look it up.
        Be helpful and reassuring about resolving their order issues.
        If they've mentioned their address before, reference it when discussing delivery.`;

      case 'delivery_request':
        return `${basePrompt}
        
        You're helping with delivery scheduling questions (day/time feasibility). 
        - Ask for the preferred date and a time window.
        - Mention preparation usually takes 2–3 hours after confirmation (or vendor-configured timing) and confirm feasibility.
        - If it's feasible, acknowledge and note it; otherwise propose the nearest feasible window.`;

      case 'support_request':
        return `${basePrompt}
        
        You're providing general support. Be helpful and try to understand their specific issue.
        If you can't resolve it directly, offer to connect them with a specialist or provide relevant resources.
        Reference any previous context from the conversation to provide more personalized help.`;

      case 'cancellation_request':
        return `${basePrompt}
        
        You're handling cancellation or refund requests. Be understanding and helpful.
        Ask for order details and explain the process. If it's within our policy, offer to process it immediately.
        If they've mentioned specific issues before, acknowledge them and address their concerns.`;

      default:
        return `${basePrompt}
        
        You're responding to a general inquiry. Be welcoming and ask how you can help them today.
        If they indicate interest in placing an order, ask for items, quantity, address, and any tiny notes/minor modifications.
        Let them know we'll place a quick confirmation call before baking if we need clarifications.
        Mention that preparation typically takes 2–3 hours after confirmation (or vendor-configured timing).
        Mention our key services: order management, customer support, and business automation.
        Use conversation history to provide more personalized and contextual responses.`;
    }
  }


  /**
   * Check if the intent and context suggest an order-related message
   */
  private isOrderRelatedIntent(intent: string, context: string): boolean {
    const orderKeywords = [
      'order', 'buy', 'purchase', 'want', 'need', 'get', 'take',
      'brownie', 'brownies', 'karuppu', 'mapillai', 'kg', 'piece',
      'deliver', 'address', 'location', 'quantity', 'how many'
    ];
    
    const contextLower = context.toLowerCase();
    return intent === 'general' && orderKeywords.some(keyword => contextLower.includes(keyword));
  }

  /**
   * Check if the conversation contains a complete order ready for creation
   */
  private async isOrderComplete(conversationId: string): Promise<boolean> {
    try {
      // Get recent messages from the conversation
      const messages = await prisma.message.findMany({
        where: { 
          conversationId,
          senderType: 'customer'
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
        select: { content: true, timestamp: true }
      });

      const conversationText = messages.map((m: any) => m.content).join(' ').toLowerCase();
      
      // Check for order completion indicators
      const completionKeywords = [
        'confirm', 'yes', 'okay', 'fine', 'good', 'correct', 'proceed',
        'everything is fine', 'all good', 'confirmed', 'place order'
      ];
      
      const hasCompletionKeyword = completionKeywords.some(keyword => 
        conversationText.includes(keyword)
      );
      
      // Check if we have order details (items, address, etc.)
      const hasOrderDetails = this.hasOrderDetails(conversationText);
      
      return hasCompletionKeyword && hasOrderDetails;
    } catch (error) {
      console.error('Error checking order completion:', error);
      return false;
    }
  }

  /**
   * Check if conversation contains order details
   */
  private hasOrderDetails(conversationText: string): boolean {
    const orderDetailPatterns = [
      // Product patterns
      /karuppu.*kavuni|mapillai.*samba|brownie/i,
      // Quantity patterns  
      /(\d+)\s*(kg|piece|pieces|half|quarter)/i,
      // Address patterns
      /address|location|deliver|coimbatore|trichy/i,
      // Price patterns
      /₹\d+|rs\.?\s*\d+|price|cost|total/i
    ];
    
    return orderDetailPatterns.some(pattern => pattern.test(conversationText));
  }

  /**
   * Handle order creation when order is complete
   */
  private async handleOrderCreation(conversationId: string, vendorId?: string): Promise<void> {
    try {
      if (!vendorId) return;

      // First, verify the conversation belongs to the correct vendor
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { customer: true }
      });

      if (!conversation) {
        return;
      }

      // Validate vendor matches the conversation's vendor
      if (conversation.vendorId !== vendorId) {
        return;
      }

      // Check if order already exists for this conversation
      const existingOrder = await prisma.order.findFirst({
        where: { 
          conversationId,
          status: { in: ['pending', 'confirmed', 'preparing', 'ready'] }
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          deliveryAddress: true,
          specialRequests: true,
          items: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (existingOrder) {
        return;
      }

      // Extract order information
      const extractedOrder = await this.orderService.extractOrderFromConversation(conversationId);
      
      if (extractedOrder && extractedOrder.items.length > 0) {
        // Create new order
        const order = await this.orderService.createOrder(
          vendorId,
          conversation.customerId,
          conversationId,
          extractedOrder
        );

      }
    } catch (error) {
      logger.error({ error, conversationId, vendorId }, 'Error creating order from conversation');
    }
  }

  /**
   * Handle order extraction from conversation
   */
  private async handleOrderExtraction(conversationId: string, vendorId?: string): Promise<void> {
    try {
      if (!vendorId) return;

      // First, verify the conversation belongs to the correct vendor
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { vendorId: true, customerId: true }
      });

      if (!conversation) {
        return;
      }

      // Validate vendor matches the conversation's vendor
      if (conversation.vendorId !== vendorId) {
        return;
      }

      // Get conversation details with customer
      const conversationWithCustomer = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { customer: true }
      });

      if (!conversationWithCustomer) return;

      // Extract order information
      const extractedOrder = await this.orderService.extractOrderFromConversation(conversationId);
      
      if (extractedOrder && extractedOrder.items.length > 0) {
        // Check if order already exists for this conversation
        const existingOrder = await prisma.order.findFirst({
          where: { 
            conversationId,
            status: { in: ['pending', 'confirmed', 'preparing', 'ready'] }
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            deliveryAddress: true,
            specialRequests: true,
            createdAt: true,
            updatedAt: true
            // Skip customerNotes field that doesn't exist in database yet
          }
        });

        if (!existingOrder) {
          // Create new order
          const order = await this.orderService.createOrder(
            vendorId,
            conversationWithCustomer.customerId,
            conversationId,
            extractedOrder
          );

        }
      }
    } catch (error) {
      logger.error({ error, conversationId, vendorId }, 'Error handling order extraction');
    }
  }

  /**
   * Get customer order context for order status inquiries
   */
  async getCustomerOrderContext(conversationId: string): Promise<string> {
    try {
      // Get conversation details
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { customer: true }
      });

      if (!conversation) {
        return '';
      }

      // Get customer's orders ordered by most recent first
      const orders = await prisma.order.findMany({
        where: { customerId: conversation.customerId },
        orderBy: { createdAt: 'desc' },
        take: 3, // Get last 3 orders
        include: {
          vendor: { select: { businessName: true } }
        }
      });

      if (orders.length === 0) {
        return 'No orders found for this customer.';
      }

      let orderContext = '';
      
      orders.forEach((order: any, index: number) => {
        const orderDate = new Date(order.createdAt).toLocaleDateString('en-IN');
        const statusEmoji = this.getStatusEmoji(order.status);
        
        orderContext += `📦 Order ${index + 1}\n`;
        orderContext += `Order Number: ${order.orderNumber}\n`;
        orderContext += `Date: ${orderDate}\n`;
        orderContext += `Status: ${statusEmoji} ${order.status}\n`;
        orderContext += `Total: ₹${order.totalAmount}\n\n`;
        
        // Parse and display items
        if (order.items && typeof order.items === 'object') {
          const items = Array.isArray(order.items) ? order.items : [order.items];
          orderContext += `🛍️ Items:\n`;
          items.forEach((item: any) => {
            orderContext += `• ${item.product} x${item.quantity} (₹${item.unitPrice} each)\n`;
          });
          orderContext += '\n';
        }
        
        // Add delivery information if available
        if (order.estimatedDelivery) {
          const deliveryDate = new Date(order.estimatedDelivery);
          const day = deliveryDate.getDate().toString().padStart(2, '0');
          const month = (deliveryDate.getMonth() + 1).toString().padStart(2, '0');
          const year = deliveryDate.getFullYear();
          const hours = deliveryDate.getHours();
          const minutes = deliveryDate.getMinutes().toString().padStart(2, '0');
          const ampm = hours >= 12 ? 'PM' : 'AM';
          const displayHours = hours % 12 || 12;
          const formattedDateTime = `${day}/${month}/${year} ${displayHours}:${minutes} ${ampm}`;
          orderContext += `🚚 Estimated Delivery: ${formattedDateTime}\n`;
        }
        
        if (order.deliveryAddress) {
          orderContext += `📍 Delivery Address: ${order.deliveryAddress}\n`;
        }
        
        orderContext += '\n---\n\n';
      });

      // Add repeat order suggestion for delivered orders
      const deliveredOrders = orders.filter((order: any) => order.status === 'delivered');
      if (deliveredOrders.length > 0) {
        orderContext += '💡 Would you like to repeat any of your previous orders? Just let me know which one! 😊\n';
      }

      return orderContext.trim();
    } catch (error) {
      console.error('Error fetching customer order context:', error);
      return '';
    }
  }

  /**
   * Get formatted order response with proper line breaks
   */
  private getFormattedOrderResponse(orderContext: string): string {
    const responses = [
      `Hi! 😊 Here are your order details:\n\n${orderContext}\n\nIf you'd like to place a new order or have any questions, just let me know! 😊🍫`,
      `Of course! Here are your last order details:\n\n${orderContext}\n\nIs there anything specific you'd like to know about your order? 📦`,
      `Here's your order information:\n\n${orderContext}\n\nWould you like to repeat this order or have any questions? 🚚`
    ];
    
    // Return a random response for variety
    const randomIndex = Math.floor(Math.random() * responses.length);
    return responses[randomIndex];
  }

  /**
   * Get emoji for order status
   */
  private getStatusEmoji(status: string): string {
    const statusEmojis: { [key: string]: string } = {
      'pending': '⏳',
      'confirmed': '✅',
      'preparing': '👨‍🍳',
      'ready': '📦',
      'out_for_delivery': '🚚',
      'delivered': '🎉',
      'cancelled': '❌'
    };
    return statusEmojis[status] || '📋';
  }

  /**
   * Extract customer preferences from conversation history
   * This can be used to build a customer profile over time
   */
  async extractCustomerPreferences(conversationId: string): Promise<{
    address?: string;
    deliveryPreferences?: string;
    orderHistory?: string[];
    specialRequirements?: string[];
  }> {
    try {
      const messages = await prisma.message.findMany({
        where: { 
          conversationId,
          senderType: 'customer'
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
        select: { content: true }
      });

      const preferences = {
        address: undefined as string | undefined,
        deliveryPreferences: undefined as string | undefined,
        orderHistory: [] as string[],
        specialRequirements: [] as string[]
      };

      // Simple keyword-based extraction (can be enhanced with NLP)
      const allContent = messages.map((m: any) => m.content).join(' ').toLowerCase();
      
      // Extract address patterns
      const addressPatterns = [
        /(?:address|location|deliver to|ship to)[\s:]*([^.!?]+)/gi,
        /(?:live in|staying at|located at)[\s:]*([^.!?]+)/gi
      ];
      
      for (const pattern of addressPatterns) {
        const match = pattern.exec(allContent);
        if (match && match[1]) {
          preferences.address = match[1].trim();
          break;
        }
      }

      // Extract delivery preferences
      const deliveryPatterns = [
        /(?:delivery|shipping|prefer)[\s:]*([^.!?]+)/gi,
        /(?:time|when|schedule)[\s:]*([^.!?]+)/gi
      ];
      
      for (const pattern of deliveryPatterns) {
        const match = pattern.exec(allContent);
        if (match && match[1]) {
          preferences.deliveryPreferences = match[1].trim();
          break;
        }
      }

      return preferences;
    } catch (error) {
      console.error('Error extracting customer preferences:', error);
      return {
        address: undefined,
        deliveryPreferences: undefined,
        orderHistory: [],
        specialRequirements: []
      };
    }
  }

  /**
   * Generate structured AI response with customer insights and multi-event processing
   */
  async generateStructuredResponse(
    context: string,
    vendorId: string,
    conversationId: string
  ): Promise<AIStructuredResponse> {
    try {
      // Build structured conversation state (prefill JSON) for the AI
      const conversationState = await ConversationStateService.buildConversationState(conversationId, vendorId);
      // stateJson will be prepared after vendorConfig/pendingOrder are fetched
      let stateJson = '';
      
      // 2. Check if this is a new customer greeting
      const isNewCustomer = await this.isNewCustomerGreeting(conversationId, context);
      
      if (isNewCustomer) {
        // Send welcome message for new customers
        const welcomeMessage = await this.sendWelcomeMessage(vendorId, context, conversationId);
        
        return {
          customerMessage: welcomeMessage,
          customerUpdateEvent: {
            shouldUpdate: true,
            updates: {
              communicationStyle: "New customer interaction detected"
            }
          },
          reasoning: "New customer greeting detected - sending welcome message"
        };
      }

      // 2. Fetch customer insights for returning customers
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { customer: true }
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const insights = await this.insightsService.getOrCreateInsights(
        conversation.customerId,
        vendorId
      );

      // 2. Fetch current pending order
      const pendingOrder = await prisma.order.findFirst({
        where: {
          vendorId,
          customerId: conversation.customerId,
          status: 'pending'
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          deliveryAddress: true,
          deliveryInstructions: true,
          specialRequests: true,
          items: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // 3. Fetch vendor AI configuration
      const vendorConfig = await this.getVendorAIConfig(vendorId);

      // Debug: Log vendor config
      logger.info({
        vendorId,
        hasVendorConfig: !!vendorConfig,
        vendorConfigPreview: vendorConfig ? {
          businessName: vendorConfig.businessName,
          aiBotName: vendorConfig.aiBotName,
          hasPersonality: !!vendorConfig.aiPersonality,
          systemPromptLength: vendorConfig.aiSystemPrompt?.length || 0,
          productsLength: vendorConfig.aiProducts?.length || 0
        } : null
      }, '🔧 Vendor config fetched');

      // Prepare minimized state JSON with enrichment (after we have vendorConfig and pendingOrder)
      try {
        let minimizedState = this.minimizeStateForModel(conversationState as any);
        // Ensure order/items field exists, then enrich from pendingOrder if present
        if (minimizedState?.state) {
          minimizedState.state.order = minimizedState.state.order || {};
          if (!Array.isArray(minimizedState.state.order.items)) {
            minimizedState.state.order.items = [];
          }
          if (minimizedState.state.order.items.length === 0 && pendingOrder?.items) {
            let items: any = pendingOrder.items;
            if (typeof items === 'string') {
              try { items = JSON.parse(items); } catch {}
            }
            if (Array.isArray(items)) {
              minimizedState.state.order.items = items
                .filter((it: any) => it && (it.product || it.name || it.title || it.productName))
                .map((it: any) => ({
                  product: it.product || it.name || it.title || it.productName || '',
                  quantity: Number(it.quantity) || 0,
                  unitPrice: Number(it.unitPrice) || 0,
                  totalPrice: Number(it.totalPrice) || 0,
                  unit: it.unit
                }));
            }
          }
          // Build a separate orders array (do not merge products into current order)
          if (conversation?.customerId) {
            try {
              const recentOrders = await prisma.order.findMany({
                where: { vendorId, customerId: conversation.customerId },
                orderBy: { createdAt: 'desc' },
                take: 5,
                select: { id: true, status: true, items: true, deliveryAddress: true, totalAmount: true, estimatedDelivery: true, createdAt: true, updatedAt: true }
              });
              const ordersPayload: any[] = [];
              for (const ro of recentOrders) {
                let rItems: any = ro.items;
                if (typeof rItems === 'string') {
                  try { rItems = JSON.parse(rItems); } catch {}
                }
                const mappedItems = Array.isArray(rItems) ? rItems
                  .filter((it: any) => it && (it.product || it.name || it.title || it.productName))
                  .map((it: any) => ({
                    product: it.product || it.name || it.title || it.productName || '',
                    quantity: Number(it.quantity) || 0,
                    unitPrice: Number(it.unitPrice) || 0,
                    totalPrice: Number(it.totalPrice) || 0,
                    unit: it.unit
                  })) : [];
                ordersPayload.push({
                  id: ro.id,
                  status: ro.status,
                  products: mappedItems,
                  deliveryAddress: ro.deliveryAddress || '',
                  totalAmount: Number(ro.totalAmount) || 0,
                  deliveryDate: ro.estimatedDelivery ? new Date(ro.estimatedDelivery).toISOString().split('T')[0] : '',
                  deliveryTime: ro.estimatedDelivery ? new Date(ro.estimatedDelivery).toISOString().split('T')[1]?.split('.')[0] || '' : '',
                  createdAt: ro.createdAt?.toISOString?.() || (ro.createdAt ? String(ro.createdAt) : undefined),
                  updatedAt: ro.updatedAt?.toISOString?.() || (ro.updatedAt ? String(ro.updatedAt) : undefined)
                });
              }
              if (!minimizedState.state.orders && ordersPayload.length > 0) {
                minimizedState.state.orders = ordersPayload;
              }
            } catch (e) {
              logger.warn({ e, conversationId, vendorId }, '⚠️ Failed to build orders payload');
            }
          }

          // If 'order' has no meaningful data, remove it to save tokens
          try {
            const o = minimizedState.state.order || {};
            const noItems = !Array.isArray(o.items) || o.items.length === 0;
            const noDelivery = !o.deliveryDate && !o.deliveryTime && !o.deliveryAddress && !o.deliveryInstructions && !o.specialRequests;
            if (noItems && noDelivery) {
              delete minimizedState.state.order;
            }
          } catch {}
        }
        // Enrich vendor products: only keep full products array in state.vendor.products
        if (minimizedState?.state) {
          minimizedState.state.vendor = minimizedState.state.vendor || {};
          if (vendorConfig?.aiProducts) {
            let products: any = vendorConfig.aiProducts;
            if (typeof products === 'string') {
              try { products = JSON.parse(products); } catch {}
            }
            const fullArray = Array.isArray(products?.products)
              ? products.products
              : (Array.isArray(products) ? products : undefined);
            if (Array.isArray(fullArray)) {
              minimizedState.state.vendor.products = fullArray;
            }
          }
        }
        stateJson = JSON.stringify(minimizedState, null, 2);
      } catch {
        stateJson = JSON.stringify(this.minimizeStateForModel(conversationState as any), null, 2);
      }

      // 4. Use general intent for all responses (no classification needed)
      const intent = 'general';

      // 5. Build comprehensive prompt using vendor-specific prompts based on intent
      const systemPrompt = this.buildStructuredSystemPrompt(vendorConfig, insights, pendingOrder, intent);
      
      // 6. Request structured response from OpenAI
      if (!this.openai) {
        return this.getFallbackStructuredResponse(context, insights);
      }

      const modelToUse = this.getAIModel(vendorConfig);
      const startTime = Date.now();
      logger.info({
        operation: 'generate_structured_response',
        model: modelToUse,
        vendorId,
        conversationId,
        intent,
        contextLength: context.length,
        hasInsights: !insights.isNewCustomer,
        hasPendingOrder: !!pendingOrder,
        systemPromptLength: systemPrompt.length,
        systemPromptFirst500: systemPrompt.substring(0, 500),
        timestamp: new Date().toISOString()
      }, '🤖 Starting AI structured response generation');

      // Log the actual prompt sections for debugging
      const sections = {
        start: systemPrompt.substring(0, 300),
        roleSection: systemPrompt.includes('Role') ? systemPrompt.substring(
          systemPrompt.indexOf('Role'), 
          systemPrompt.indexOf('Role') + 300
        ) : 'Not found',
        vendorPromptStart: systemPrompt.includes('Vendor Prompt') ? systemPrompt.substring(
          systemPrompt.indexOf('Vendor Prompt'), 
          systemPrompt.indexOf('Vendor Prompt') + 300
        ) : 'Not found',
        end: systemPrompt.substring(systemPrompt.length - 300)
      };
      
      // Removed prompt file write to avoid runtime errors in ESM environments
      
      logger.info({
        systemPromptStructure: {
          totalLength: systemPrompt.length,
          sections: {
            start: systemPrompt.substring(0, 300),
            end: systemPrompt.substring(systemPrompt.length - 300)
          },
          hasRole: systemPrompt.includes('Role'),
          hasResponsibilities: systemPrompt.includes('Responsibilities'),
          hasVendorPrompt: systemPrompt.includes('Vendor Prompt'),
          hasCustomerInsights: systemPrompt.includes('CUSTOMER INSIGHTS'),
          hasOutputContract: systemPrompt.includes('OUTPUT CONTRACT'),
          savedToFile: 'logs/last-prompt.txt'
        }
      }, '📋 System prompt structure check - Full prompt saved to logs/last-prompt.txt');

      const messages: any = [
        { role: "system", content: `${systemPrompt}\n\nUse CONVERSATION_STATE_JSON as the single source of truth for current details. Do not re-ask for known info; prefer filling missing fields and keep responses concise and warm.\n\nIMPORTANT: When the customer mentions delivery date/time (e.g., "tomorrow 8pm", "today 6pm", "31st October at 8PM"), you MUST:\n1. Extract the exact date and populate order.deliveryDate (YYYY-MM-DD format) and order.deliveryTime (HH:MM 24-hour format) in the state JSON\n2. ALSO populate orderUpdateEvent.estimatedDelivery as an ISO 8601 date-time string (e.g., "2025-10-31T20:00:00.000Z")\n3. Use meta.nowIso to determine the current date for relative dates like "tomorrow" or "today".` },
        { role: "system", content: `CONVERSATION_STATE_JSON:\n\n\`\`\`json\n${stateJson}\n\`\`\`` },
        { role: "user", content: context }
      ];

      // Removed verbose composed prompt logging

      // (full composed prompt logging reverted per request)

      let completion = await this.openai.chat.completions.create({
        model: modelToUse,
        messages,
        max_completion_tokens: 500,
        temperature: 0.7,
      });

      const duration = Date.now() - startTime;

      if (completion.usage) {
        costMonitor.logUsage(completion.usage);
        
        logger.info({
          operation: 'generate_structured_response',
          model: modelToUse,
          vendorId,
          conversationId,
          intent,
          duration,
          tokens: completion.usage,
          cost: completion.usage.total_tokens * 0.0005 / 1000, // Approximate cost
          timestamp: new Date().toISOString()
        }, '🤖 AI structured response generation completed');
      }

      // 7. Parse and validate response
      let rawResponse = completion.choices[0]?.message?.content || '';
      // Log summary of AI response (truncated) into conversation log
      logConversation('outbound', {
        conversationId,
        vendorId,
        content: `[AI_STRUCTURED_RESPONSE_RAW] ${rawResponse.substring(0, 500)}${rawResponse.length > 500 ? '...' : ''}`,
        messageType: 'system',
        status: 'ai_response'
      });
      
      // Parse the response using our existing parser (which handles fallbacks gracefully)
      let structuredResponse = this.parseStructuredResponse(rawResponse);
      let needsRetry = false;
      
      // Try to enhance the response with ConversationStateResponse validation if available
      try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const candidate = JSON.parse(jsonMatch[0]);
          const parsed = ConversationStateResponseSchema.safeParse(candidate);
          if (parsed.success) {
            // If state response present, prefer the model's customerMessage
            if (parsed.data.customerMessage) {
              structuredResponse.customerMessage = parsed.data.customerMessage;
            }
            // Optionally map fields back to our existing response shape if needed
            if (Array.isArray(parsed.data.state?.productRecommendations)) {
              structuredResponse.productRecommendations = parsed.data.state.productRecommendations as any;
            }
            // Compute diffs to derive customer and order events
            const prevState = conversationState.state;
            const nextState = parsed.data.state as typeof prevState;
            const customerEvent = computeCustomerUpdateEvent(prevState, nextState);
            const orderEvent = computeOrderUpdateEvent(prevState, nextState);
            if (customerEvent) {
              structuredResponse.customerUpdateEvent = customerEvent;
            }
            if (orderEvent) {
              structuredResponse.orderUpdateEvent = orderEvent;
            }

            // Log diff summary to conversation log
            const updatedKeys: string[] = [];
            if (customerEvent?.updates) {
              updatedKeys.push(...Object.keys(customerEvent.updates).map(k => `customer.${k}`));
            }
            if (orderEvent) {
              updatedKeys.push('order.*');
            }
            logConversation('outbound', {
              conversationId,
              vendorId,
              content: `[AI_STATE_DIFF] updated=${updatedKeys.join(', ') || 'none'}`,
              messageType: 'system',
              status: 'ai_state_diff'
            });
          } else {
            // Schema validation failed - check if the response is completely invalid
            // Only retry if we got a completely malformed response (no JSON at all or no customerMessage)
            if (!structuredResponse.customerMessage || structuredResponse.customerMessage.includes('Parse error')) {
              needsRetry = true;
              logger.warn({
                conversationId,
                vendorId,
                parseErrors: parsed.error?.errors,
                rawResponsePreview: rawResponse.substring(0, 200)
              }, '⚠️ Schema validation failed and fallback also failed - will retry');
            }
          }
        } else {
          // No JSON found in response - likely a malformed response
          needsRetry = true;
          logger.warn({
            conversationId,
            vendorId,
            rawResponsePreview: rawResponse.substring(0, 200)
          }, '⚠️ No JSON found in response - will retry');
        }
      } catch (error) {
        // Parse error occurred - check if we have a valid fallback
        if (!structuredResponse.customerMessage || structuredResponse.customerMessage.includes('Parse error')) {
          needsRetry = true;
          logger.warn({
            conversationId,
            vendorId,
            error: error instanceof Error ? error.message : String(error)
          }, '⚠️ Parse error and no valid fallback - will retry');
        }
      }

      // Only retry if we got a completely invalid response
      if (needsRetry) {
        try {
          logger.info({ conversationId, vendorId }, '🔄 Retrying with stricter prompt due to parse failure');
          
          completion = await this.openai.chat.completions.create({
            model: modelToUse,
            messages: [
              { role: "system", content: `${systemPrompt}\n\nReturn ONLY valid JSON matching the schema. No prose.\n\nIMPORTANT: When the customer mentions delivery date/time, extract the exact date and:\n1. Populate order.deliveryDate (YYYY-MM-DD) and order.deliveryTime (HH:MM 24-hour format) in the state JSON\n2. ALSO populate orderUpdateEvent.estimatedDelivery as an ISO 8601 date-time string.` },
              { role: "system", content: `CONVERSATION_STATE_JSON:\n\n\`\`\`json\n${stateJson}\n\`\`\`` },
              { role: "user", content: context }
            ],
            max_completion_tokens: 500,
            temperature: 0.3,
          });
          
          rawResponse = completion.choices[0]?.message?.content || rawResponse;
          structuredResponse = this.parseStructuredResponse(rawResponse);
          
          // Try to enhance with ConversationStateResponse validation again
          try {
            const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const candidate = JSON.parse(jsonMatch[0]);
              const parsed = ConversationStateResponseSchema.safeParse(candidate);
              if (parsed.success) {
                if (parsed.data.customerMessage) structuredResponse.customerMessage = parsed.data.customerMessage;
                if (Array.isArray(parsed.data.state?.productRecommendations)) structuredResponse.productRecommendations = parsed.data.state.productRecommendations as any;
                const prevState = conversationState.state;
                const nextState = parsed.data.state as typeof prevState;
                const customerEvent = computeCustomerUpdateEvent(prevState, nextState);
                const orderEvent = computeOrderUpdateEvent(prevState, nextState);
                if (customerEvent) structuredResponse.customerUpdateEvent = customerEvent;
                if (orderEvent) structuredResponse.orderUpdateEvent = orderEvent;
              }
            }
          } catch {}
        } catch (error) {
          logger.error({ error, conversationId, vendorId }, '❌ Retry also failed - using fallback response');
        }
      }

      // Add token usage to response if available
      if (completion.usage) {
        structuredResponse.tokensUsed = completion.usage.total_tokens;
      }

      logger.info({
        operation: 'parse_structured_response',
        conversationId,
        vendorId,
        responseLength: rawResponse.length,
        hasOrderEvent: !!structuredResponse.orderUpdateEvent,
        hasCustomerEvent: !!structuredResponse.customerUpdateEvent,
        tokensUsed: structuredResponse.tokensUsed,
        timestamp: new Date().toISOString()
      }, '🤖 Parsed structured AI response');

      return structuredResponse;
    } catch (error) {
      logger.error('Error generating structured response', { error, vendorId, conversationId } as any);
      
      // Try to get customerId from conversation for fallback insights
      let fallbackInsights: CustomerInsightsContext;
      try {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { customerId: true }
        });
        
        if (conversation?.customerId) {
          fallbackInsights = await this.insightsService.getOrCreateInsights(conversation.customerId, vendorId);
        } else {
          // If no customerId available, create minimal insights object without DB call
          fallbackInsights = {
            isNewCustomer: true,
            basicDetails: '',
            preferences: '',
            communicationStyle: '',
            currentOrder: '',
            deliveryAddress: '',
            deliveryInstructions: '',
            specialRequests: '',
            lastUpdated: new Date()
          };
        }
      } catch (insightsError) {
        // If even getting insights fails, use minimal object
        logger.error('Error getting fallback insights', { error: insightsError, vendorId, conversationId } as any);
        fallbackInsights = {
          isNewCustomer: true,
          basicDetails: '',
          preferences: '',
          communicationStyle: '',
          currentOrder: '',
          deliveryAddress: '',
          deliveryInstructions: '',
          specialRequests: '',
          lastUpdated: new Date()
        };
      }
      
      return this.getFallbackStructuredResponse(context, fallbackInsights);
    }
  }

  /**
   * Build system prompt for structured responses
   */
  private buildStructuredSystemPrompt(
    vendorConfig: any,
    insights: CustomerInsightsContext,
    pendingOrder: any,
    intent: string
  ): string {
    // Log warning if vendorConfig is missing
    if (!vendorConfig) {
      logger.error('⚠️ vendorConfig is null/undefined in buildStructuredSystemPrompt!');
      return this.getSystemPrompt(intent); // Fallback to default prompt
    }
    
		const formattedInsights = this.insightsService.formatInsightsForAI(insights);
		const orderSummary = pendingOrder 
			? `Current Order: ${pendingOrder.orderNumber} - ${JSON.stringify(pendingOrder.items)} for ₹${pendingOrder.totalAmount} (Status: ${pendingOrder.status})`
			: 'No pending order';

	const vendorName = vendorConfig?.businessName || 'Vendor';
	const botName = vendorConfig?.aiBotName || 'Assistant';
	const personality = vendorConfig?.aiPersonality || 'Warm, helpful, concise, and polite.';
	const aiProducts = vendorConfig?.aiProducts || 'No product catalog available';
	const basePrompt = vendorConfig?.aiSystemPrompt || this.getSystemPrompt(intent);
	
	// Debug logging
	logger.info({
	  vendorName,
	  botName,
	  hasPersonality: !!personality,
	  hasBasePrompt: !!basePrompt,
	  productsLength: aiProducts?.length || 0
	}, '🔍 Building system prompt with vendor config');

	// Extract customizable section content from vendor config (with defaults)
	const defaultResponsibilities = `- Clearly introduce and describe products.
- Briefly share pricing, toppings, and packaging information.
- Gather customer details: name, product, quantity (kg or pieces), delivery address, and EXACT delivery date and time (e.g., "tomorrow 8pm", "31st October at 6PM").
- Extract and store the exact delivery date/time in order.deliveryDate (YYYY-MM-DD) and order.deliveryTime (HH:MM 24-hour format).
- Confirm and summarize the order including exact delivery date and time.
- Explain delivery methods and timeline.
- Close with a friendly, warm message (e.g., "Thank you so much 😊 Your order will be freshly packed with love ❤️").`;

	const defaultConversationRules = `- Keep messages short, clear, and WhatsApp-friendly; use emojis naturally (🍫😊❤️).
- Stay strictly on topic: products, order, delivery.
- If unsure about an answer, respond with: "I'll check with the team and let you know 😊"
- Never invent or assume details; maintain continuity with chat history.`;

	const defaultImportantInstructions = `- Read customer insights and conversation state before responding.
- Use known information; do not repeat questions unnecessarily.
- Reference recognized details rather than re-asking.
- Extract and update any new customer information including: name, phone, email, language preferences, purchase history, dietary restrictions, special occasions, payment preferences, and delivery addresses.
- When customers mention previous orders or favorite products, update purchaseHistory field to track their buying patterns.
- Store preferences, special requests, and delivery instructions for vendor fulfillment.
- When customer shares WhatsApp location, extract and store in whatsappLocation with latitude, longitude, address, and optional name.
- When the customer mentions a delivery date and/or time (e.g., "tomorrow 8pm", "31st October 8PM", "today 6pm"):
  * Extract the EXACT date and time from the customer's message
  * Populate order.deliveryDate (YYYY-MM-DD) and order.deliveryTime (HH:MM 24-hour) in the conversation state JSON
  * ALSO populate orderUpdateEvent.estimatedDelivery as an ISO 8601 date-time string (e.g., "2025-10-31T20:00:00.000Z" for tomorrow 8pm)
  * Convert relative dates ("today", "tomorrow", "day after tomorrow") to absolute dates using meta.nowIso as the current date reference
  * Examples: "tomorrow 8pm" → estimatedDelivery: "2025-10-31T20:00:00.000Z" (assuming today is Oct 30, 2025)
  * Examples: "today 6pm" → estimatedDelivery: "2025-10-30T18:00:00.000Z" (use meta.nowIso to determine today's date)`;

	const responsibilitiesContent = vendorConfig?.aiContentResponsibilities || defaultResponsibilities;
	const conversationRulesContent = vendorConfig?.aiContentConversationRules || defaultConversationRules;
	const importantInstructionsContent = vendorConfig?.aiContentImportantInstructions || defaultImportantInstructions;

	return `# ${botName} — ${vendorName} (WhatsApp Assistant)
## Role
You are ${botName}, the friendly WhatsApp assistant for ${vendorName}.
${personality}
\n
## Responsibilities
${responsibilitiesContent}
\n
## Conversation Rules
${conversationRulesContent}
\n
## Vendor Prompt
${basePrompt}
\n
## Context
All current conversation and vendor data is provided in CONVERSATION_STATE_JSON below. Always reference it for products, customer details, message history, and order state. Do not rely on separate sections.
\n
## IMPORTANT INSTRUCTIONS
${importantInstructionsContent}
\n
\n
## Output Contract (Return JSON only)
Return a single valid JSON object with the structure below:
- 'customerMessage': A friendly, concise, personalized response. (string, required)
- 'orderUpdateEvent': object; includes:
- 'action': (string, required) One of "create", "update", "cancel", "confirm", "none". Use "none" if there is no change.
- 'items': (array, required) Ordered items list (as objects; see schema). Empty array if no order event.
- 'deliveryAddress': (string, optional) Only if newly provided or updated.
- 'deliveryInstructions': (string, optional) Only if newly provided or updated.
- 'specialRequests': (string, optional) Newly merged special requests, concatenated with commas or semicolons as needed.
- 'estimatedDelivery': (string, optional) ISO 8601 date-time string (e.g., "2025-10-31T20:00:00.000Z" for tomorrow 8pm). Extract exact date/time from customer message and convert relative dates (tomorrow, today) to absolute dates based on current date.
- 'customerUpdateEvent': object; includes:
- 'shouldUpdate': (boolean, required) True if customer data is updated; false if not.
- 'updates': (object, required) Only newly provided/merged info. Empty object if none.
- Valid keys: 'customerName', 'alternativePhoneNumber', 'email', 'preferredLanguage', 'basicDetails', 'purchaseHistory', 'preferences', 'communicationStyle', 'currentOrder', 'primaryDeliveryAddress', 'deliveryAddress', 'deliveryInstructions', 'whatsappLocation', 'specialRequests', 'specialOccasions', 'dietaryRestrictions', 'paymentPreferences'.
- Note: 'whatsappLocation' should be a JSON object with {latitude, longitude, address?, name?, sharedAt?}. 'specialOccasions' should be an array of {name, date, occasion} objects.
- 'productRecommendations': array, optional. Include if applicable, each entry: { product, reason, price, upsell, qtySuggestion }.
- 'reasoning': (string, required) Brief explanation of the assistant's analysis.
\n
Order items in 'orderUpdateEvent' must map to products in the product catalog. Items not found must be excluded, with an explanation in 'reasoning'.
\n
Return empty arrays/objects if there is no new info or request, specifying all required fields. Set 'orderUpdateEvent.action' to "none" and 'items' to empty array if no order change is needed. Never omit required fields or output null or undefined values.
\n
After producing your output, validate that the JSON matches the provided schema. If validation fails, self-correct the output and re-validate.
\n
### Response JSON Format
\`\`\`json
{
"customerMessage": "string (required)",
"orderUpdateEvent": {
"action": "create|update|cancel|confirm|none",
"items": [
{ "product": "string", "quantity": number, "unitPrice": number, "totalPrice": number }
],
"deliveryAddress": "string (optional)",
"deliveryInstructions": "string (optional)",
"specialRequests": "string (optional)",
"estimatedDelivery": "string (optional, ISO 8601 format like '2025-10-31T20:00:00.000Z')"
},
"customerUpdateEvent": {
"shouldUpdate": true|false,
"updates": {
"customerName": "string (optional)",
"alternativePhoneNumber": "string (optional)",
"email": "string (optional)",
"preferredLanguage": "string (optional)",
"basicDetails": "string (optional)",
"purchaseHistory": "string (optional)",
"preferences": "string (optional)",
"communicationStyle": "string (optional)",
"currentOrder": "string (optional)",
"primaryDeliveryAddress": "string (optional)",
"deliveryAddress": "string (optional)",
"deliveryInstructions": "string (optional)",
"whatsappLocation": {"latitude": number, "longitude": number, "address": "string (optional)", "name": "string (optional)", "sharedAt": "string (optional)"},
"specialRequests": "string (optional)",
"specialOccasions": [{"name": "string", "date": "string (ISO date)", "occasion": "string"}],
"dietaryRestrictions": "string (optional)",
"paymentPreferences": "string (optional)"
}
},
"productRecommendations": [
{ "product": "string", "reason": "string", "price": number, "upsell": true|false, "qtySuggestion": "string" }
],
"reasoning": "string (required)"
}
\`\`\`
\n
- All outputs must be valid JSON matching the schema.
- Omit 'productRecommendations' if not relevant.
- Always specify 'shouldUpdate' and return all required fields, even if empty.
- In 'customerUpdateEvent.updates', include only newly merged info; leave as empty object if none.
- Exclude any referenced product not in the vendor catalog, noting this in 'reasoning'.
- The 'reasoning' field is always present and non-empty.
\n
Only return the above JSON structure, with no additional output.
`;
  }

  /**
   * Parse structured response from AI
   */
  private parseStructuredResponse(rawResponse: string): AIStructuredResponse {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate required fields
      if (!parsed.customerMessage) {
        throw new Error('Missing customerMessage');
      }

      return {
        customerMessage: parsed.customerMessage,
        orderUpdateEvent: parsed.orderUpdateEvent,
        customerUpdateEvent: parsed.customerUpdateEvent,
        productRecommendations: parsed.productRecommendations,
        reasoning: parsed.reasoning
      };
    } catch (error) {
      logger.error('Error parsing structured response', { error, rawResponse } as any);
      
      // Return fallback response
      return {
        customerMessage: "I understand your message. Let me help you with that.",
        reasoning: `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get fallback structured response when AI is unavailable
   */
  private getFallbackStructuredResponse(context: string, insights: CustomerInsightsContext): AIStructuredResponse {
    const isNewCustomer = insights.isNewCustomer;
    
    return {
      customerMessage: isNewCustomer 
        ? "Hello! I'm here to help you with your order. What would you like to order today?"
        : "I understand your message. Let me help you with that.",
      customerUpdateEvent: {
        shouldUpdate: isNewCustomer,
        updates: isNewCustomer ? {
          communicationStyle: "New customer interaction detected"
        } : {}
      },
      reasoning: "Fallback response - AI unavailable"
    };
  }

  /**
   * Minimize conversation state JSON for model consumption
   * - meta: keep vendorId, conversationId, nowIso
   * - lastMessages: array of simple strings "customer: ..." | "assistant: ..."
   * - customer/order: include only non-empty keys; drop totals and notes
   */
  private minimizeStateForModel(state: any): any {
    if (!state || !state.state) return state;
    const s = state.state;

    const meta = {
      vendorId: s.meta?.vendorId,
      conversationId: s.meta?.conversationId,
      nowIso: s.meta?.nowIso
    };

    const compact = (obj: Record<string, any>) => Object.fromEntries(
      Object.entries(obj || {}).filter(([, v]) => {
        if (v === undefined || v === null) return false;
        if (typeof v === 'string') return v.trim() !== '';
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.keys(v).length > 0;
        return true;
      })
    );

    const customer = compact({
      // Customer Basic Information
      customerName: s.customer?.customerName,
      alternativePhoneNumber: s.customer?.alternativePhoneNumber,
      email: s.customer?.email,
      preferredLanguage: s.customer?.preferredLanguage,
      // Customer Summary Fields
      basicDetails: s.customer?.basicDetails,
      purchaseHistory: s.customer?.purchaseHistory,
      preferences: s.customer?.preferences,
      communicationStyle: s.customer?.communicationStyle,
      currentOrder: s.customer?.currentOrder,
      // Delivery Information
      primaryDeliveryAddress: s.customer?.primaryDeliveryAddress,
      deliveryAddress: s.customer?.deliveryAddress,
      deliveryInstructions: s.customer?.deliveryInstructions,
      whatsappLocation: s.customer?.whatsappLocation,
      // Special Information
      specialRequests: s.customer?.specialRequests,
      specialOccasions: s.customer?.specialOccasions,
      dietaryRestrictions: s.customer?.dietaryRestrictions,
      // Payment & Preferences
      paymentPreferences: s.customer?.paymentPreferences
    });

    const order = compact({
      status: s.order?.status,
      items: (s.order?.items || []).filter((it: any) => it && it.product),
      deliveryDate: s.order?.deliveryDate,
      deliveryTime: s.order?.deliveryTime,
      deliveryAddress: s.order?.deliveryAddress,
      deliveryInstructions: s.order?.deliveryInstructions,
      specialRequests: s.order?.specialRequests
    });

    // Keep separate orders list if present
    const orders = Array.isArray(s.orders) ? s.orders.map((o: any) => compact({
      id: o.id,
      status: o.status,
      deliveryAddress: o.deliveryAddress,
      totalAmount: o.totalAmount,
      deliveryDate: o.deliveryDate,
      deliveryTime: o.deliveryTime,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      products: Array.isArray(o.products) ? o.products.filter((it: any) => it && it.product) : undefined
    })).filter((o: any) => Object.keys(o).length > 0) : undefined;

    const lastMessages = (s.lastMessages || []).map((m: any) => `${m.senderType === 'customer' ? 'customer' : 'assistant'}: ${m.content}`);

    const vendorProductsFull = Array.isArray((s.vendor as any)?.products) ? (s.vendor as any).products : undefined;
    const aiPreparationTimeMinutes = typeof s.vendor?.aiPreparationTimeMinutes === 'number' && s.vendor.aiPreparationTimeMinutes > 0
      ? s.vendor.aiPreparationTimeMinutes
      : undefined;

    const minimized = {
      schemaVersion: state.schemaVersion,
      state: compact({
        meta,
        customer,
        order,
        orders,
        lastMessages: lastMessages.length > 0 ? lastMessages : undefined,
        vendor: compact({
          products: vendorProductsFull,
          aiPreparationTimeMinutes
        })
      }),
      task: state.task
    };

    return minimized;
  }
}


