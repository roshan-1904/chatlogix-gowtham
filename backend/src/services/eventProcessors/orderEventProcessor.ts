import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger.js';
import { OrderUpdateEvent, CustomerUpdateEvent, EventProcessingContext, EventProcessingResult } from '../../types/aiResponse.js';
import { CustomerInsightsService } from '../customerInsightsService.js';

export class OrderEventProcessor {
  private insightsService: CustomerInsightsService;

  constructor() {
    this.insightsService = new CustomerInsightsService();
  }

  async processEvent(
    event: OrderUpdateEvent,
    context: EventProcessingContext
  ): Promise<void> {
    if (!event || event.action === 'none') {
      return;
    }


    switch (event.action) {
      case 'create':
        await this.createOrder(event, context);
        break;
      case 'update':
        // Find or create order before updating
        const orderIdForUpdate = await this.findOrCreateOrder(context, event);
        await this.updateOrder(orderIdForUpdate, event, context);
        break;
      case 'cancel':
        if (!context.orderId) {
          logger.warn({ context }, 'Cannot cancel order - no orderId provided');
          return;
        }
        await this.cancelOrder(context.orderId, context);
        break;
      case 'confirm':
        // Find or create order before confirming
        const orderIdForConfirm = await this.findOrCreateOrder(context, event);
        await this.confirmOrder(orderIdForConfirm, context);
        break;
    }
  }

  private async createOrder(event: OrderUpdateEvent, context: EventProcessingContext): Promise<void> {
    // Generate order number
    const orderNumber = await this.generateOrderNumber(context.vendorId);
    
    // Create order data
    const orderData = {
      vendorId: context.vendorId,
      customerId: context.customerId,
      conversationId: context.conversationId,
      orderNumber,
      items: JSON.stringify(event.items || []),
      totalAmount: this.calculateTotalAmount(event.items || []),
      deliveryAddress: event.deliveryAddress,
      deliveryInstructions: event.deliveryInstructions,
      specialRequests: event.specialRequests,
      // customerNotes is not present in DB schema; avoid writing to prevent errors
      estimatedDelivery: event.estimatedDelivery ? new Date(event.estimatedDelivery) : undefined,
      status: 'pending' as const
    };

    try {
      const order = await prisma.order.create({
        data: orderData,
        include: {
          vendor: { select: { businessName: true, aiBotName: true } },
          customer: { select: { phone: true } }
        }
      });

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error, 
        context,
        orderData: {
          ...orderData,
          items: typeof orderData.items === 'string' ? 'stringified' : orderData.items
        }
      }, 'Error creating order');
      throw error;
    }
  }

  private async updateOrder(orderId: string, event: OrderUpdateEvent, context: EventProcessingContext): Promise<void> {
    const updateData: any = {};
    
    if (event.items) updateData.items = JSON.stringify(event.items);
    if (event.deliveryAddress) updateData.deliveryAddress = event.deliveryAddress;
    if (event.deliveryInstructions) updateData.deliveryInstructions = event.deliveryInstructions;
    if (event.specialRequests) updateData.specialRequests = event.specialRequests;
    // Skip customerNotes; column may not exist
    if (event.items) updateData.totalAmount = this.calculateTotalAmount(event.items);
    if (event.estimatedDelivery) {
      try {
        updateData.estimatedDelivery = new Date(event.estimatedDelivery);
      } catch {}
    }

    try {
      await prisma.order.update({
        where: { id: orderId },
        data: updateData
      });

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        orderId, 
        context,
        updateData
      }, 'Error updating order');
      throw error;
    }
  }

  private async cancelOrder(orderId: string, context: EventProcessingContext): Promise<void> {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Customer requested cancellation'
        }
      });

    } catch (error) {
      logger.error({ error, orderId, context }, 'Error cancelling order');
      throw error;
    }
  }

  private async confirmOrder(orderId: string, context: EventProcessingContext): Promise<void> {
    try {
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'confirmed',
          confirmedAt: new Date()
        }
      });

    } catch (error) {
      logger.error({ 
        error: error instanceof Error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : error,
        orderId, 
        context 
      }, 'Error confirming order');
      throw error;
    }
  }

  private calculateTotalAmount(items: any[]): number {
    return items.reduce((total, item) => total + (item.totalPrice || 0), 0);
  }

  /**
   * Find existing pending order or create a new one
   */
  private async findOrCreateOrder(
    context: EventProcessingContext,
    event: OrderUpdateEvent
  ): Promise<string> {
    // If orderId is provided, use it
    if (context.orderId) {
      return context.orderId;
    }

    // Try to find existing pending order for this conversation
    const existingOrder = await prisma.order.findFirst({
      where: {
        conversationId: context.conversationId,
        status: 'pending'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existingOrder) {
      return existingOrder.id;
    }

    // No existing order found - create one
    await this.createOrder(event, context);

    // Fetch the newly created order
    const newOrder = await prisma.order.findFirst({
      where: {
        conversationId: context.conversationId,
        status: 'pending'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!newOrder) {
      throw new Error('Failed to create order');
    }

    return newOrder.id;
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
}
