import { apiClient } from '../lib/api';
import type { Order } from '../components/conversations/types';

export interface WhatsAppNotificationService {
  sendOrderStatusUpdate(
    orderId: string,
    status: string,
    orderData: Order
  ): Promise<{ success: boolean; queued?: boolean; messageId?: string; error?: string }>;

  sendOrderTemplateMessage(
    customerPhone: string,
    templateName: string,
    parameters: Record<string, string>
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;
}

/**
 * Send order status update notification via WhatsApp
 * Note: Backend may handle notifications automatically with status update.
 * This endpoint is optional and may not be implemented yet.
 */
export const whatsappNotifications: WhatsAppNotificationService = {
  async sendOrderStatusUpdate(orderId: string, status: string, orderData: Order) {
    try {
      // Backend now queues notifications, so response indicates queued status
      // Note: Backend automatically sends notifications on status update, so this may not be needed
      const response = await apiClient.post<{ success: boolean; queued: boolean; error?: string }>(
        `/orders/${orderId}/notify`,
        {
          status,
          orderNumber: orderData.orderNumber,
          customerPhone: orderData.customer?.phone,
        }
      );

      return {
        success: response.success,
        queued: response.queued || false,
        messageId: undefined, // Will be available after processing via notification history
      };
    } catch (error: any) {
      // Handle 501 Not Implemented gracefully (backend may handle automatically)
      if (error?.message?.includes('501') || error?.message?.includes('Not implemented')) {
        return {
          success: true,
          queued: false,
          message: 'Notifications are handled automatically by the backend',
        };
      }
      
      // Don't throw - return error info so caller can handle gracefully
      return {
        success: false,
        error: error?.message || 'Failed to queue notification',
      };
    }
  },

  async sendOrderTemplateMessage(
    customerPhone: string,
    templateName: string,
    parameters: Record<string, string>
  ) {
    try {
      const response = await apiClient.post<{ success: boolean; messageId?: string }>(
        '/notifications/send-template',
        {
          customerPhone,
          templateName,
          parameters,
        }
      );

      return {
        success: response.success,
        messageId: response.messageId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to send template message',
      };
    }
  },
};

