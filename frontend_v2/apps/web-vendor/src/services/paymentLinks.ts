import { apiClient } from '../lib/api';
import { whatsappNotifications } from './whatsappNotifications';

export interface PaymentLinkResponse {
  paymentLink: string;
  paymentLinkId: string;
  expiresAt?: string;
}

export interface PaymentLinkStatus {
  status: 'pending' | 'paid' | 'expired' | 'failed';
  paidAt?: string;
  amount?: number;
}

export interface PaymentLinkService {
  generatePaymentLink(
    orderId: string,
    amount: number,
    customerPhone: string
  ): Promise<{ success: boolean; paymentLink?: string; error?: string }>;

  sendPaymentLink(
    orderId: string,
    paymentLink: string,
    customerPhone: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }>;

  getPaymentLinkStatus(
    paymentLinkId: string
  ): Promise<{ status: 'pending' | 'paid' | 'expired' | 'failed'; paidAt?: string }>;
}

export const paymentLinkService: PaymentLinkService = {
  /**
   * Generate payment link for an order
   * Note: Backend endpoint may return 501 if not implemented yet
   */
  async generatePaymentLink(orderId: string, amount: number, customerPhone: string) {
    try {
      const response = await apiClient.post<PaymentLinkResponse>(
        `/orders/${orderId}/payment-link`,
        {
          amount,
          customerPhone,
        }
      );

      return {
        success: true,
        paymentLink: response.paymentLink,
      };
    } catch (error: any) {
      // Handle 501 Not Implemented gracefully
      if (error?.message?.includes('501') || error?.message?.includes('Not implemented')) {
        return {
          success: false,
          error: 'Payment link generation is not yet available. Please contact support.',
        };
      }
      
      return {
        success: false,
        error: error?.message || 'Failed to generate payment link',
      };
    }
  },

  /**
   * Send payment link via WhatsApp
   */
  async sendPaymentLink(orderId: string, paymentLink: string, customerPhone: string) {
    try {
      // Use WhatsApp notification service to send payment link
      const result = await whatsappNotifications.sendOrderTemplateMessage(
        customerPhone,
        'payment_link',
        {
          paymentLink,
          orderNumber: orderId, // Or get from order data if available
        }
      );

      return result;
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Failed to send payment link',
      };
    }
  },

  /**
   * Get payment link status
   * Note: Backend endpoint may return 501 if not implemented yet
   */
  async getPaymentLinkStatus(paymentLinkId: string) {
    try {
      const response = await apiClient.get<PaymentLinkStatus>(
        `/payment-links/${paymentLinkId}/status`
      );
      return response;
    } catch (error: any) {
      // Handle 501 Not Implemented gracefully
      if (error?.message?.includes('501') || error?.message?.includes('Not implemented')) {
        // Return default status if endpoint not available
        return { status: 'pending' as const };
      }
      throw new Error(error?.message || 'Failed to get payment link status');
    }
  },
};

