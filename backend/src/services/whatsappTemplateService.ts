import { prisma } from '../db/prisma.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import {
  resolveVendorSendingNumber,
  resolveVendorSendingPhoneNumberId
} from './whatsapp/vendorSendingNumber.js';

export class WhatsAppTemplateService {
  /**
   * Map order status to template name
   */
  private getTemplateNameForStatus(status: string): string {
    const templateMap: Record<string, string> = {
      'confirmed': 'order_confirmed',
      'preparing': 'order_preparing',
      'ready': 'order_ready',
      'out_for_delivery': 'order_out_for_delivery',
      'delivered': 'order_delivered',
      'cancelled': 'order_cancelled',
    };
    return templateMap[status] || 'order_update';
  }

  /**
   * Format order data for messages
   */
  private formatOrderData(order: any): {
    orderNumber: string;
    totalAmount: string;
    estimatedDelivery?: string;
    trackingNumber?: string;
    cancellationReason?: string;
    vendorName?: string;
  } {
    return {
      orderNumber: order.orderNumber || order.id,
      totalAmount: `₹${(order.totalAmount / 100).toFixed(2)}`,
      estimatedDelivery: order.estimatedDelivery 
        ? new Date(order.estimatedDelivery).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : undefined,
      trackingNumber: order.trackingNumber,
      cancellationReason: order.cancellationReason || 'Order cancelled by vendor',
      vendorName: order.vendor?.businessName,
    };
  }

  /**
   * Format order status update as text message
   */
  private formatOrderStatusMessage(
    status: string,
    orderData: ReturnType<typeof this.formatOrderData>
  ): string {
    const statusMessages: Record<string, string> = {
      'confirmed': '✅ Order Confirmed',
      'preparing': '👨‍🍳 Order Being Prepared',
      'ready': '✅ Order Ready for Pickup',
      'out_for_delivery': '🚚 Order Out for Delivery',
      'delivered': '🎉 Order Delivered',
      'cancelled': '❌ Order Cancelled',
    };

    const statusLabel = statusMessages[status] || `📦 Order Status: ${status}`;
    let message = `${statusLabel}\n\n`;
    message += `Order #: ${orderData.orderNumber}\n`;
    message += `Amount: ${orderData.totalAmount}\n`;

    if (orderData.vendorName) {
      message += `From: ${orderData.vendorName}\n`;
    }

    switch (status) {
      case 'confirmed':
        if (orderData.estimatedDelivery) {
          message += `\nEstimated Delivery: ${orderData.estimatedDelivery}\n`;
        }
        message += `\nThank you for your order! We'll keep you updated.`;
        break;
      
      case 'preparing':
        message += `\nYour order is being prepared. We'll notify you when it's ready!`;
        break;
      
      case 'ready':
        message += `\nYour order is ready for pickup! Please collect it at your earliest convenience.`;
        break;
      
      case 'out_for_delivery':
        message += `\nYour order is on the way!`;
        if (orderData.trackingNumber) {
          message += `\nTracking: ${orderData.trackingNumber}`;
        }
        message += `\nExpected delivery: ${orderData.estimatedDelivery || 'Soon'}`;
        break;
      
      case 'delivered':
        message += `\nYour order has been delivered!`;
        message += `\nThank you for choosing us. We hope you enjoy your order!`;
        break;
      
      case 'cancelled':
        message += `\nReason: ${orderData.cancellationReason}`;
        message += `\nIf you have any questions, please contact us.`;
        break;
      
      default:
        message += `\nStatus: ${status}`;
    }

    return message;
  }

  /**
   * Build template parameters based on status
   */
  private buildTemplateParameters(
    status: string,
    orderData: ReturnType<typeof this.formatOrderData>
  ): {
    body: Array<{ type: 'text'; text: string }>;
    header?: Array<{ type: 'text'; text: string }>;
    buttons?: Array<{ type: 'url'; text: string; url: string }>;
  } {
    const params: {
      body: Array<{ type: 'text'; text: string }>;
      header?: Array<{ type: 'text'; text: string }>;
      buttons?: Array<{ type: 'url'; text: string; url: string }>;
    } = {
      body: []
    };

    switch (status) {
      case 'confirmed':
        params.body = [
          { type: 'text', text: orderData.orderNumber },
          { type: 'text', text: orderData.totalAmount }
        ];
        if (orderData.estimatedDelivery) {
          params.body.push({ type: 'text', text: orderData.estimatedDelivery });
        }
        break;
      
      case 'preparing':
        params.body = [
          { type: 'text', text: orderData.orderNumber }
        ];
        break;
      
      case 'ready':
        params.body = [
          { type: 'text', text: orderData.orderNumber }
        ];
        break;
      
      case 'out_for_delivery':
        params.body = [
          { type: 'text', text: orderData.orderNumber }
        ];
        if (orderData.trackingNumber) {
          params.body.push({ type: 'text', text: orderData.trackingNumber });
        }
        break;
      
      case 'delivered':
        params.body = [
          { type: 'text', text: orderData.orderNumber }
        ];
        break;
      
      case 'cancelled':
        params.body = [
          { type: 'text', text: orderData.orderNumber },
          { type: 'text', text: orderData.cancellationReason || 'Order cancelled by vendor' }
        ];
        break;
      
      default:
        params.body = [
          { type: 'text', text: orderData.orderNumber },
          { type: 'text', text: `Status: ${status}` }
        ];
    }

    return params;
  }

  /**
   * Get vendor's WhatsApp phone number ID
   */
  private async getVendorPhoneNumberId(vendorId: string): Promise<string | undefined> {
    try {
      return await resolveVendorSendingPhoneNumberId(vendorId);
    } catch (error) {
      logger.error({ error, vendorId }, 'Failed to get vendor phone number ID');
      return undefined;
    }
  }

  /**
   * Check if notifications are enabled
   */
  private async checkNotificationEnabled(
    vendorId: string,
    orderId?: string
  ): Promise<boolean> {
    try {
      // Check vendor settings (gracefully handle if column doesn't exist yet)
      // Use select to avoid errors if notificationSettings column doesn't exist
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          id: true,
          // Note: notificationSettings is not included in select to avoid errors if column doesn't exist
          // If column exists, we can add it later. For now, default to enabled.
        }
      });

      // Note: notificationSettings check is skipped if column doesn't exist in database
      // This is intentional - we default to enabled until migration is run
      // Once migration is run, we can add notificationSettings to the select above

      // Check order-level override (gracefully handle if column doesn't exist yet)
      if (orderId) {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: {
            id: true,
            // Note: sendNotifications is not included in select to avoid errors if column doesn't exist
            // If column exists, we can add it later. For now, default to enabled.
          }
        });
        
        // Note: sendNotifications check is skipped if column doesn't exist in database
        // This is intentional - we default to enabled until migration is run
      }

      return true;
    } catch (error) {
      // If there's an error (e.g., column doesn't exist), default to enabled
      logger.warn({ error, vendorId, orderId }, 'Error checking notification settings, defaulting to enabled');
      return true;
    }
  }

  /**
   * Send order status update notification (queues message)
   */
  async sendOrderStatusUpdate(
    orderId: string,
    newStatus: string
  ): Promise<{ success: boolean; queued: boolean; error?: string }> {
    try {
      // 1. Fetch order details
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: { select: { phone: true, id: true } },
          vendor: { select: { id: true, businessName: true } }
        }
      });

      if (!order) {
        throw new Error(`Order not found: ${orderId}`);
      }

      if (!order.customer?.phone) {
        throw new Error(`Customer phone not found for order: ${orderId}`);
      }

      // 2. Check if notifications enabled
      const enabled = await this.checkNotificationEnabled(order.vendorId, orderId);
      if (!enabled) {
        logger.info({ orderId, status: newStatus }, 'Notifications disabled for order');
        return { success: true, queued: false };
      }

      // 3. Create notification history record
      const notification = await prisma.notificationHistory.create({
        data: {
          vendorId: order.vendorId,
          orderId: orderId,
          customerId: order.customerId,
          notificationType: 'order_status_update',
          templateName: this.getTemplateNameForStatus(newStatus),
          status: 'pending'
        }
      });

      // 4. Format order data and build text message
      const orderData = this.formatOrderData(order);
      const messageText = this.formatOrderStatusMessage(newStatus, orderData);

      // 5. Get vendor's WhatsApp phone number ID
      const phoneNumberId = await this.getVendorPhoneNumberId(order.vendorId);

      // 6. Queue text message (instead of template message)
      const queueMessage = {
        type: 'text' as const,
        to: order.customer.phone,
        text: messageText,
        vendorId: order.vendorId,
        customerId: order.customerId,
        phoneNumberId,
        metadata: {
          notificationId: notification.id,
          orderId: orderId,
          orderNumber: order.orderNumber,
          status: newStatus,
          notificationType: 'order_status_update'
        }
      };

      await publishToQueue(env.RESPONSE_QUEUE_URL, queueMessage);

      logger.info({
        orderId,
        status: newStatus,
        notificationId: notification.id,
        messageLength: messageText.length
      }, 'Order status notification queued (text message)');

      return { success: true, queued: true };
    } catch (error: any) {
      logger.error({
        orderId,
        status: newStatus,
        error: error.message
      }, 'Failed to queue order status notification');
      
      return {
        success: false,
        queued: false,
        error: error.message || 'Failed to queue notification'
      };
    }
  }

  /**
   * Send payment link notification (queues message)
   */
  async sendPaymentLink(
    customerPhone: string,
    paymentLink: string,
    orderNumber: string,
    amount: string,
    orderId: string,
    vendorId: string,
    customerId: string
  ): Promise<{ success: boolean; queued: boolean; error?: string }> {
    try {
      // Create notification history
      const notification = await prisma.notificationHistory.create({
        data: {
          vendorId,
          orderId,
          customerId,
          notificationType: 'payment_link',
          templateName: 'payment_link',
          status: 'pending'
        }
      });

      // Get vendor's WhatsApp phone number ID
      const phoneNumberId = await this.getVendorPhoneNumberId(vendorId);

      // Format payment link message
      const messageText = `💳 Payment Link\n\n` +
        `Order #: ${orderNumber}\n` +
        `Amount: ${amount}\n\n` +
        `Please complete your payment using the link below:\n` +
        `${paymentLink}\n\n` +
        `Thank you!`;

      // Queue text message
      const queueMessage = {
        type: 'text' as const,
        to: customerPhone,
        text: messageText,
        vendorId,
        customerId,
        phoneNumberId,
        metadata: {
          notificationId: notification.id,
          orderId,
          orderNumber,
          paymentLink,
          notificationType: 'payment_link'
        }
      };

      await publishToQueue(env.RESPONSE_QUEUE_URL, queueMessage);

      logger.info({
        orderId,
        notificationId: notification.id,
        messageLength: messageText.length
      }, 'Payment link notification queued (text message)');

      return { success: true, queued: true };
    } catch (error: any) {
      logger.error({
        orderId,
        error: error.message
      }, 'Failed to queue payment link notification');
      
      return {
        success: false,
        queued: false,
        error: error.message
      };
    }
  }

  /**
   * Send shipping update notification (queues message)
   */
  async sendShippingUpdate(
    customerPhone: string,
    orderNumber: string,
    trackingNumber: string,
    status: 'created' | 'in_transit' | 'delivered',
    updateMessage: string,
    orderId: string,
    vendorId: string,
    customerId: string
  ): Promise<{ success: boolean; queued: boolean; error?: string }> {
    try {
      const templateName = status === 'delivered' 
        ? 'shipment_delivered' 
        : 'shipment_update';

      const notification = await prisma.notificationHistory.create({
        data: {
          vendorId,
          orderId,
          customerId,
          notificationType: 'shipping_update',
          templateName,
          status: 'pending'
        }
      });

      // Get vendor's WhatsApp phone number ID
      const phoneNumberId = await this.getVendorPhoneNumberId(vendorId);

      // Format shipping update message
      const statusEmoji = status === 'delivered' ? '🎉' : status === 'in_transit' ? '🚚' : '📦';
      const statusLabel = status === 'delivered' ? 'Delivered' : status === 'in_transit' ? 'In Transit' : 'Shipped';
      
      const messageText = `${statusEmoji} Shipping Update: ${statusLabel}\n\n` +
        `Order #: ${orderNumber}\n` +
        `Tracking #: ${trackingNumber}\n\n` +
        `${updateMessage}\n\n` +
        `You can track your shipment using the tracking number above.`;

      // Queue text message
      const queueMessage = {
        type: 'text' as const,
        to: customerPhone,
        text: messageText,
        vendorId,
        customerId,
        phoneNumberId,
        metadata: {
          notificationId: notification.id,
          orderId,
          orderNumber,
          trackingNumber,
          status,
          notificationType: 'shipping_update'
        }
      };

      await publishToQueue(env.RESPONSE_QUEUE_URL, queueMessage);

      logger.info({
        orderId,
        notificationId: notification.id,
        trackingNumber,
        messageLength: messageText.length
      }, 'Shipping update notification queued (text message)');

      return { success: true, queued: true };
    } catch (error: any) {
      logger.error({
        orderId,
        error: error.message
      }, 'Failed to queue shipping update notification');
      
      return {
        success: false,
        queued: false,
        error: error.message
      };
    }
  }

  /**
   * Notify vendor about a new order placed via the multi-stage AI pipeline.
   * Sends a WhatsApp message to the vendor's registered phone number.
   * Fire-and-forget safe — caller should not await if it would block the response.
   */
  async notifyVendorNewOrder(
    vendorId: string,
    orderId: string
  ): Promise<{ success: boolean; queued: boolean; error?: string }> {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          customer: { select: { phone: true } },
          vendor: { select: { businessName: true, phone: true } }
        }
      });

      if (!order) {
        logger.warn({ vendorId, orderId }, 'notifyVendorNewOrder: order not found');
        return { success: false, queued: false, error: 'Order not found' };
      }

      // Vendor phone is the notification destination; phoneNumberId identifies the sender account
      const vendorPhone = order.vendor?.phone;
      if (!vendorPhone) {
        logger.warn({ vendorId, orderId }, 'notifyVendorNewOrder: no vendor phone configured');
        return { success: false, queued: false, error: 'No vendor phone' };
      }

      const vendorWhatsApp = await resolveVendorSendingNumber(vendorId);

      const orderItems = Array.isArray(order.items)
        ? (order.items as any[]).map((item: any) => `• ${item.name || item.productName} x${item.quantity}`).join('\n')
        : 'See order details';

      const totalFormatted = `₹${((order.totalAmount || 0) / 100).toFixed(2)}`;

      const messageText =
        `🛒 *New Order Received*\n\n` +
        `Order #: ${order.orderNumber}\n` +
        `Customer: ${order.customer?.phone || 'Unknown'}\n\n` +
        `*Items:*\n${orderItems}\n\n` +
        `*Total:* ${totalFormatted}\n` +
        (order.deliveryAddress ? `*Delivery:* ${order.deliveryAddress}\n` : '') +
        (order.specialRequests ? `*Notes:* ${order.specialRequests}\n` : '') +
        `\nPlease confirm or prepare the order.`;

      const queueMessage = {
        type: 'text' as const,
        to: vendorPhone,
        text: messageText,
        vendorId,
        phoneNumberId: vendorWhatsApp?.phoneNumberId || '',
        metadata: {
          orderId,
          orderNumber: order.orderNumber,
          notificationType: 'vendor_new_order_alert'
        }
      };

      await publishToQueue(env.RESPONSE_QUEUE_URL, queueMessage);

      logger.info({ vendorId, orderId, orderNumber: order.orderNumber }, 'Vendor new order notification queued');
      return { success: true, queued: true };
    } catch (error: any) {
      logger.error({ vendorId, orderId, error: error.message }, 'Failed to notify vendor of new order');
      return { success: false, queued: false, error: error.message };
    }
  }
}
