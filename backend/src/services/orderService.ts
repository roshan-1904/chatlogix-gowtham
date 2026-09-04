import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { ServiceErrorLogger, createServiceErrorLogger } from '../utils/errorLogger.js';

export interface OrderItem {
  product: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  unit?: string; // 'piece', 'kg', 'box', 'pack', etc.
  notes?: string;
  matchedProductId?: string;
}

export interface ExtractedOrder {
  items: OrderItem[];
  totalAmount: number;
  deliveryAddress?: string;
  deliveryInstructions?: string;
  deliveryTime?: string;
  specialRequests?: string;
  customerNotes?: string;
}

export class OrderService {
  /**
   * Extract order information from conversation messages
   */
  async extractOrderFromConversation(conversationId: string): Promise<ExtractedOrder | null> {
    const errorLogger = createServiceErrorLogger('OrderService', 'extractOrderFromConversation', {
      conversationId
    });

    try {
      errorLogger.logInfo('Starting order extraction from conversation');

      // Get conversation with vendor information
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          vendor: {
            select: {
              id: true,
              businessName: true,
              aiProducts: true
            }
          }
        }
      });

      if (!conversation) {
        errorLogger.logError('Conversation not found');
        return null;
      }

      // Get recent messages from the conversation
      const messages = await prisma.message.findMany({
        where: { 
          conversationId,
          senderType: 'customer'
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
        select: { content: true, timestamp: true }
      });

      errorLogger.logInfo('Retrieved conversation messages', { messageCount: messages.length });

      const conversationText = messages.map((m: any) => m.content).join(' ');
      
      // Parse vendor products
      let vendorProducts = null;
      if (conversation.vendor.aiProducts) {
        try {
          vendorProducts = JSON.parse(conversation.vendor.aiProducts);
          errorLogger.logInfo('Parsed vendor products', { productCount: vendorProducts?.products?.length || 0 });
        } catch (e: any) {
          errorLogger.logError('Failed to parse vendor products', { error: e.message });
        }
      }
      
      // Extract order items using vendor's product catalog
      const orderItems = this.extractOrderItems(conversationText, vendorProducts);
      
      if (orderItems.length === 0) {
        errorLogger.logWarning('No order items found in conversation');
        return null;
      }

      errorLogger.logInfo('Extracted order items', { itemCount: orderItems.length });

      // Extract delivery information
      const deliveryAddress = this.extractDeliveryAddress(conversationText);
      const deliveryInstructions = this.extractDeliveryInstructions(conversationText);
      const deliveryTime = this.extractDeliveryTime(conversationText);
      const specialRequests = this.extractSpecialRequests(conversationText);
      
      // Extract customizations and calculate additional charges
      const { customizations, additionalCharges } = this.extractCustomizations(conversationText, vendorProducts);
      
      // Combine special requests and customizations for customer notes
      const allRequests = [];
      if (specialRequests) allRequests.push(specialRequests);
      if (customizations.length > 0) allRequests.push(customizations.join('; '));
      const customerNotes = allRequests.length > 0 ? allRequests.join('; ') : undefined;

      // Calculate total amount including customizations
      const baseAmount = orderItems.reduce((sum, item) => sum + item.totalPrice, 0);
      const totalAmount = baseAmount + additionalCharges;

      const extractedOrder = {
        items: orderItems,
        totalAmount,
        deliveryAddress,
        deliveryInstructions,
        deliveryTime,
        specialRequests,
        customerNotes
      };

      errorLogger.logSuccess({ 
        itemCount: orderItems.length, 
        totalAmount,
        hasDeliveryAddress: !!deliveryAddress,
        hasSpecialRequests: !!specialRequests
      });

      return extractedOrder;
    } catch (error) {
      errorLogger.logDatabaseError(error, 'findMany', 'message', { conversationId });
      return null;
    }
  }

  /**
   * Create a new order from extracted information
   */
  async createOrder(
    vendorId: string,
    customerId: string,
    conversationId: string,
    extractedOrder: ExtractedOrder
  ): Promise<any> {
    try {
      const orderNumber = await this.generateOrderNumber(vendorId);
      
      // Parse delivery date/time if provided
      let estimatedDelivery: Date | undefined = undefined;
      if (extractedOrder.deliveryTime) {
        // Try to parse delivery time string (e.g., "tomorrow 8pm")
        const { parseEstimatedDelivery } = await import('../utils/dateParser.js');
        estimatedDelivery = parseEstimatedDelivery('', extractedOrder.deliveryTime);
      }
      
      // Create order data without customerNotes to avoid database errors
      const orderData = {
        vendorId,
        customerId,
        conversationId,
        orderNumber,
        items: extractedOrder.items as any,
        totalAmount: extractedOrder.totalAmount,
        deliveryAddress: extractedOrder.deliveryAddress,
        deliveryInstructions: extractedOrder.deliveryInstructions,
        specialRequests: extractedOrder.specialRequests,
        estimatedDelivery,
        status: 'pending' as const
      };

      const order = await prisma.order.create({
        data: orderData,
        include: {
          vendor: { select: { businessName: true, aiBotName: true } },
          customer: { select: { phone: true } }
        }
      });

      logger.info({ orderId: order.id, orderNumber }, 'Order created successfully');
      return order;
    } catch (error) {
      logger.error({ error }, 'Error creating order');
      throw error;
    }
  }

  /**
   * Update order status
   */
  // Valid order status transitions — terminal states (delivered, cancelled) cannot transition further
  private static readonly validStatusTransitions: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['preparing', 'cancelled'],
    preparing: ['ready', 'cancelled'],
    ready: ['out_for_delivery', 'cancelled'],
    out_for_delivery: ['delivered'],
    delivered: [],
    cancelled: []
  };

  async updateOrderStatus(
    orderId: string,
    status: string,
    additionalData?: {
      estimatedDelivery?: Date;
      cancellationReason?: string;
    }
  ): Promise<any> {
    try {
      // Validate status transition
      const currentOrder = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true }
      });

      if (!currentOrder) {
        throw new Error(`Order ${orderId} not found`);
      }

      const allowedTransitions = OrderService.validStatusTransitions[currentOrder.status] || [];
      if (!allowedTransitions.includes(status)) {
        throw new Error(
          `Invalid status transition: cannot move from '${currentOrder.status}' to '${status}'. ` +
          `Allowed transitions: ${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : 'none (terminal state)'}`
        );
      }

      const updateData: any = {
        status,
        updatedAt: new Date()
      };

      // Add status-specific timestamps
      switch (status) {
        case 'confirmed':
          updateData.confirmedAt = new Date();
          break;
        case 'preparing':
          updateData.preparedAt = new Date();
          break;
        case 'delivered':
          updateData.deliveredAt = new Date();
          break;
        case 'cancelled':
          updateData.cancelledAt = new Date();
          if (additionalData?.cancellationReason) {
            updateData.cancellationReason = additionalData.cancellationReason;
          }
          break;
      }

      if (additionalData?.estimatedDelivery) {
        updateData.estimatedDelivery = additionalData.estimatedDelivery;
      }

      const [order] = await prisma.$transaction([
        prisma.order.update({
          where: { id: orderId },
          data: updateData,
          include: {
            vendor: { select: { businessName: true, aiBotName: true } },
            customer: { select: { phone: true } }
          }
        }),
        // Regression: this was the entire vendor-dashboard mutation surface
        // writing zero OrderAuditLog rows -- only AI-driven cart changes
        // were ever logged, leaving every manual status change invisible to
        // a future "what happened to this order" investigation.
        prisma.orderAuditLog.create({
          data: {
            id: crypto.randomUUID(),
            orderId,
            action: 'vendor_status_update',
            changes: { vendorInitiated: true, requestedStatus: status },
            previousState: { status: currentOrder.status },
            // JSON round-trip: updateData mixes Date objects (confirmedAt
            // etc.) with plain values -- normalize to plain JSON rather than
            // relying on Prisma's Json-field Date handling.
            newState: JSON.parse(JSON.stringify({ status, ...updateData })),
            timestamp: new Date()
          }
        })
      ]);

      logger.info({ orderId, status }, 'Order status updated');
      return order;
    } catch (error) {
      logger.error({ error }, 'Error updating order status');
      throw error;
    }
  }

  /**
   * Get orders for a vendor
   */
  async getVendorOrders(vendorId: string, status?: string): Promise<any[]> {
    try {
      const whereClause: any = { vendorId };
      if (status) {
        whereClause.status = status;
      }

      // Try to fetch orders with customerNotes first
      try {
        const orders = await prisma.order.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: { select: { phone: true } },
            conversation: { 
              select: { 
                id: true,
                messages: {
                  orderBy: { timestamp: 'desc' },
                  take: 1,
                  select: { content: true, timestamp: true }
                }
              }
            }
          }
        });

        return orders;
      } catch (dbError: any) {
        // If customerNotes column doesn't exist, fetch without it
        if (dbError.code === 'P2022' && dbError.meta?.column === 'Order.customerNotes') {
          logger.warn('customerNotes column not found, fetching orders without it');
          
          const orders = await prisma.order.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              vendorId: true,
              customerId: true,
              conversationId: true,
              orderNumber: true,
              status: true,
              items: true,
              totalAmount: true,
              deliveryAddress: true,
              deliveryInstructions: true,
              specialRequests: true,
              // Skip customerNotes since it doesn't exist
              estimatedDelivery: true,
              confirmedAt: true,
              preparedAt: true,
              deliveredAt: true,
              cancelledAt: true,
              cancellationReason: true,
              createdAt: true,
              updatedAt: true,
              customer: { select: { phone: true } },
              conversation: { 
                select: { 
                  id: true,
                  messages: {
                    orderBy: { timestamp: 'desc' },
                    take: 1,
                    select: { content: true, timestamp: true }
                  }
                }
              }
            }
          });

          // Add null customerNotes to maintain API compatibility
          return orders.map(order => ({
            ...order,
            customerNotes: null
          }));
        }
        
        // Re-throw if it's a different error
        throw dbError;
      }
    } catch (error) {
      logger.error({ error }, 'Error fetching vendor orders');
      throw error;
    }
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string): Promise<any> {
    try {
      // Try to fetch order with customerNotes first
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: {
            vendor: { select: { businessName: true, aiBotName: true, phone: true } },
            customer: { select: { phone: true } },
            conversation: {
              include: {
                messages: {
                  orderBy: { timestamp: 'asc' },
                  select: { content: true, senderType: true, timestamp: true }
                }
              }
            }
          }
        });

        return order;
      } catch (dbError: any) {
        // If customerNotes column doesn't exist, fetch without it
        if (dbError.code === 'P2022' && dbError.meta?.column === 'Order.customerNotes') {
          logger.warn('customerNotes column not found, fetching order details without it');
          
          const order = await prisma.order.findUnique({
            where: { id: orderId },
            select: {
              id: true,
              vendorId: true,
              customerId: true,
              conversationId: true,
              orderNumber: true,
              status: true,
              items: true,
              totalAmount: true,
              deliveryAddress: true,
              deliveryInstructions: true,
              specialRequests: true,
              // Skip customerNotes since it doesn't exist
              estimatedDelivery: true,
              confirmedAt: true,
              preparedAt: true,
              deliveredAt: true,
              cancelledAt: true,
              cancellationReason: true,
              createdAt: true,
              updatedAt: true,
              vendor: { select: { businessName: true, aiBotName: true, phone: true } },
              customer: { select: { phone: true } },
              conversation: {
                include: {
                  messages: {
                    orderBy: { timestamp: 'asc' },
                    select: { content: true, senderType: true, timestamp: true }
                  }
                }
              }
            }
          });

          // Add null customerNotes to maintain API compatibility
          return order ? { ...order, customerNotes: null } : null;
        }
        
        // Re-throw if it's a different error
        throw dbError;
      }
    } catch (error) {
      logger.error({ error }, 'Error fetching order details');
      throw error;
    }
  }

  /**
   * Extract order items from conversation text using vendor's product catalog
   */
  private extractOrderItems(text: string, vendorProducts?: any): OrderItem[] {
    const items: OrderItem[] = [];
    
    if (!vendorProducts || !vendorProducts.products) {
      logger.warn('No vendor products available for order extraction');
      return items;
    }

    const products = vendorProducts.products;
    const textLower = text.toLowerCase();

    // Quantity patterns
    const quantityPatterns = [
      /(\d+(?:\.\d+)?)\s*(?:kg|kilogram|kilo)/gi,
      /(\d+(?:\.\d+)?)\s*(?:pieces?|pcs?|nos?)/gi,
      /(?:half|quarter|one\s+half)\s*(?:kg|kilogram|kilo)/gi,
      /(\d+)\s*(?:pack|packs)/gi,
      /(\d+)\s*(?:box|boxes)/gi
    ];

    // Extract quantities from text
    const quantities: { value: number; unit: string; context: string }[] = [];
    for (const qtyPattern of quantityPatterns) {
      let match;
      while ((match = qtyPattern.exec(text)) !== null) {
        let value: number;
        let unit: string;
        
        if (match[0].toLowerCase().includes('half')) {
          value = 0.5;
          unit = 'kg';
        } else if (match[0].toLowerCase().includes('quarter')) {
          value = 0.25;
          unit = 'kg';
        } else {
          value = parseFloat(match[1]);
          unit = match[0].toLowerCase().includes('kg') ? 'kg' : 'piece';
        }
        
        const context = text.substring(Math.max(0, match.index - 30), match.index + 30);
        quantities.push({ value, unit, context });
      }
    }

    // Match products to text
    for (const product of products) {
      const productName = product.name.toLowerCase();
      const productKeywords = this.extractProductKeywords(product.name, product.description);
      
      // Check if any product keywords are mentioned in the text
      const isMentioned = productKeywords.some(keyword => textLower.includes(keyword));
      
      if (isMentioned) {
        // Check if this product is already in the items list
        const alreadyExists = items.some(item => item.product === product.name);
        if (alreadyExists) {
          continue; // Skip if already added
        }
        
        // Find the most relevant quantity for this product
        const relevantQuantity = this.findRelevantQuantity(quantities, productKeywords, textLower);
        
        if (relevantQuantity) {
          const unitPrice = relevantQuantity.unit === 'kg' ? product.pricePerKg : product.pricePerPiece;
          const totalPrice = relevantQuantity.value * unitPrice;
          
          items.push({
            product: product.name,
            quantity: relevantQuantity.value,
            unitPrice,
            totalPrice,
            unit: relevantQuantity.unit
          });
        } else {
          // Default to 1 piece if no quantity found
          items.push({
            product: product.name,
            quantity: 1,
            unitPrice: product.pricePerPiece,
            totalPrice: product.pricePerPiece,
            unit: 'piece'
          });
        }
      }
    }

    return items;
  }

  /**
   * Extract keywords from product name and description for better matching
   */
  private extractProductKeywords(name: string, description: string): string[] {
    const keywords: string[] = [];
    
    // Add product name words
    const nameWords = name.toLowerCase().split(/\s+/);
    keywords.push(...nameWords);
    
    // Add key descriptive words
    const descriptionWords = description.toLowerCase().split(/\s+/);
    const importantWords = descriptionWords.filter(word => 
      word.length > 3 && 
      !['made', 'from', 'with', 'and', 'the', 'for', 'are'].includes(word)
    );
    keywords.push(...importantWords);
    
    // Add specific product variations (more specific matching)
    if (name.toLowerCase().includes('karuppu')) {
      keywords.push('karuppu', 'black', 'rice', 'kavuni');
    }
    if (name.toLowerCase().includes('mapillai')) {
      keywords.push('mapillai', 'samba');
    }
    
    // Remove generic words that cause false matches
    const filteredKeywords = keywords.filter(keyword => 
      !['brownie', 'cake', 'brownies', 'cakes'].includes(keyword)
    );
    
    // Don't add back generic keywords - rely only on specific product keywords
    // This prevents false matches when conversation mentions "brownies" or "cakes"
    
    return [...new Set(filteredKeywords)]; // Remove duplicates
  }

  /**
   * Find the most relevant quantity for a product based on context
   */
  private findRelevantQuantity(quantities: { value: number; unit: string; context: string }[], productKeywords: string[], textLower: string): { value: number; unit: string } | null {
    if (quantities.length === 0) return null;
    
    // If only one quantity, use it
    if (quantities.length === 1) {
      return { value: quantities[0].value, unit: quantities[0].unit };
    }
    
    // Find quantity with most product keywords in context
    let bestMatch = quantities[0];
    let maxMatches = 0;
    
    for (const qty of quantities) {
      const contextLower = qty.context.toLowerCase();
      const matches = productKeywords.filter(keyword => contextLower.includes(keyword)).length;
      
      if (matches > maxMatches) {
        maxMatches = matches;
        bestMatch = qty;
      }
    }
    
    return { value: bestMatch.value, unit: bestMatch.unit };
  }

  /**
   * Extract delivery address from conversation
   */
  private extractDeliveryAddress(text: string): string | undefined {
    const addressPatterns = [
      // Pattern for "Name [name], [address]" format
      /(?:name|my name is)\s+([^,]+),\s*([^.!?\n]+(?:road|street|avenue|lane|nagar|colony|heights|apartment|flat|house)[^.!?\n]*)/gi,
      // Pattern for addresses starting with building/unit numbers
      /([a-z0-9]+\s+\d+[^.!?\n]*(?:road|street|avenue|lane|nagar|colony|heights|apartment|flat|house)[^.!?\n]*)/gi,
      // Pattern for general address mentions
      /(?:address|location|deliver to|ship to|delivery address)[\s:]*([^.!?\n]+(?:road|street|avenue|lane|nagar|colony|heights|apartment|flat|house)[^.!?\n]*)/gi,
      // Pattern for "live in" or "staying at"
      /(?:live in|staying at|located at|my address)[\s:]*([^.!?\n]+(?:road|street|avenue|lane|nagar|colony|heights|apartment|flat|house)[^.!?\n]*)/gi,
      // Pattern for "address is"
      /(?:address is|my address is)[\s:]*([^.!?\n]+(?:road|street|avenue|lane|nagar|colony|heights|apartment|flat|house)[^.!?\n]*)/gi,
      // Pattern for "deliver at" or "drop at"
      /(?:deliver at|drop at)[\s:]*([^.!?\n]+(?:road|street|avenue|lane|nagar|colony|heights|apartment|flat|house)[^.!?\n]*)/gi
    ];

    for (const pattern of addressPatterns) {
      const match = pattern.exec(text);
      if (match) {
        let address: string;
        
        // Handle the "Name [name], [address]" format
        if (match.length > 2 && match[2]) {
          address = match[2].trim();
        } else {
          address = match[1].trim();
        }
        
        // Filter out very short or generic addresses
        if (address.length > 15 && 
            !address.toLowerCase().includes('please') && 
            !address.toLowerCase().includes('thank') &&
            !address.toLowerCase().includes('mam') &&
            !address.toLowerCase().includes('akka')) {
          return address;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract delivery instructions
   */
  private extractDeliveryInstructions(text: string): string | undefined {
    const instructionPatterns = [
      /(?:delivery instructions?|instructions?|delivery note)[\s:]*([^.!?\n]+)/gi,
      /(?:deliver|drop|leave)[\s:]*([^.!?\n]+)/gi,
      /(?:call me|contact me|ring me)[\s:]*([^.!?\n]+)/gi,
      /(?:door|gate|entrance)[\s:]*([^.!?\n]+)/gi
    ];

    for (const pattern of instructionPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        const instruction = match[1].trim();
        if (instruction.length > 5) {
          return instruction;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract delivery time preferences
   */
  private extractDeliveryTime(text: string): string | undefined {
    const timePatterns = [
      /(?:deliver|delivery|by|before|after)[\s:]*([^.!?\n]+(?:morning|afternoon|evening|night|am|pm|today|tomorrow|weekend)[^.!?\n]*)/gi,
      /(?:time|when)[\s:]*([^.!?\n]+(?:morning|afternoon|evening|night|am|pm|today|tomorrow|weekend)[^.!?\n]*)/gi,
      /(?:prefer|want|need)[\s:]*([^.!?\n]+(?:morning|afternoon|evening|night|am|pm|today|tomorrow|weekend)[^.!?\n]*)/gi
    ];

    for (const pattern of timePatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        const time = match[1].trim();
        if (time.length > 5) {
          return time;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract special requests and customizations from conversation
   */
  private extractSpecialRequests(text: string): string | undefined {
    const requestPatterns = [
      // Decoration patterns
      /(?:decoration|decorate|decorating)[\s:]*([^.!?\n]+)/gi,
      /(?:simple|beautiful|special)\s+(?:decoration|decorate)[\s:]*([^.!?\n]+)/gi,
      /(?:with|add)\s+(?:nut|nuts|toppings|topping)[\s:]*([^.!?\n]+)/gi,
      
      // Message patterns
      /(?:write|put|add)\s+(?:message|text|words)[\s:]*([^.!?\n]+)/gi,
      /(?:message|text|words)[\s:]*([^.!?\n]+)/gi,
      /(?:congratulations|happy|birthday|anniversary)[\s:]*([^.!?\n]+)/gi,
      
      // General special requests
      /(?:special|custom|extra)[\s:]*([^.!?\n]+)/gi,
      /(?:please|can you|could you)[\s:]*([^.!?\n]+)/gi
    ];

    const requests: string[] = [];

    for (const pattern of requestPatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        const request = match[1].trim();
        if (request.length > 5 && !request.toLowerCase().includes('mam') && !request.toLowerCase().includes('akka')) {
          requests.push(request);
        }
      }
    }

    if (requests.length > 0) {
      return requests.join('; ');
    }

    return undefined;
  }

  /**
   * Extract customization details and calculate additional charges
   */
  private extractCustomizations(text: string, vendorProducts?: any): { customizations: string[]; additionalCharges: number } {
    const customizations: string[] = [];
    let additionalCharges = 0;

    if (!vendorProducts || !vendorProducts.customizations) {
      return { customizations, additionalCharges };
    }

    const textLower = text.toLowerCase();
    const vendorCustomizations = vendorProducts.customizations;

    // Check for decorations
    if (textLower.includes('decoration') || textLower.includes('decorate') || textLower.includes('simple')) {
      const decorationCustomization = vendorCustomizations.find((c: any) => 
        c.type.toLowerCase().includes('decoration') || c.type.toLowerCase().includes('cream')
      );
      if (decorationCustomization) {
        customizations.push(`Simple decoration with chocolate cream`);
        additionalCharges += decorationCustomization.price;
      }
    }

    // Check for nut toppings
    if (textLower.includes('nut') || textLower.includes('nuts') || textLower.includes('topping')) {
      const toppingCustomization = vendorCustomizations.find((c: any) => 
        c.type.toLowerCase().includes('topping') || c.type.toLowerCase().includes('premium')
      );
      if (toppingCustomization) {
        customizations.push(`Nut toppings`);
        additionalCharges += toppingCustomization.price;
      }
    }

    // Check for custom messages
    const messagePatterns = [
      /(?:write|put|add|message|text|words)[\s:]*["']?([^"'\n]+?)["']?(?:\s+on\s+the\s+cake|\s+on\s+cake|$)/gi,
      /(?:congratulations|happy|birthday|anniversary)[\s:]*["']?([^"'\n]+?)["']?(?:\s+on\s+the\s+cake|\s+on\s+cake|$)/gi,
      /["']([^"'\n]+?)["'](?:\s+on\s+the\s+cake|\s+on\s+cake)/gi
    ];

    for (const pattern of messagePatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        const messageText = match[1].trim();
        if (messageText.length > 3 && !messageText.toLowerCase().includes('cake') && !messageText.toLowerCase().includes('mam')) {
          customizations.push(`Message: "${messageText}"`);
          // Add message customization charge (typically ₹150)
          additionalCharges += 150;
          break;
        }
      }
    }

    return { customizations, additionalCharges };
  }

  /**
   * Extract customer notes (minor modifications or preferences)
   */
  private extractCustomerNotes(text: string): string | undefined {
    const notePatterns = [
      /(?:customer\s*notes?|notes?|tiny\s*notes?|minor\s*(?:mods|modifications)|small\s*changes|without\s+[^.!?]+|no\s+[^.!?]+|please\s+avoid\s+[^.!?]+)[\s:]*([^.!?]+)/gi,
      /(?:note\s*that|please\s*note)[\s:]*([^.!?]+)/gi
    ];

    for (const pattern of notePatterns) {
      const match = pattern.exec(text);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return undefined;
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
   * Generate unique order number
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
}
