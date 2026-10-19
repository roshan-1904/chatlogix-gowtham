import { apiClient } from '../lib/api';

export interface PaymentLinkResponse {
  paymentLink: string;
  paymentLinkId: string;
  expiresAt?: string;
  amountPaise?: number;
  sent?: boolean;
}

export interface PaymentLinkStatus {
  status: 'pending' | 'paid' | 'expired' | 'failed';
  paidAt?: string;
  amountPaise?: number;
  orderId?: string;
  expiresAt?: string;
  url?: string;
}

export const paymentLinkService = {
  async generatePaymentLink(orderId: string, sendWhatsApp = true) {
    try {
      const response = await apiClient.post<PaymentLinkResponse>(`/orders/${orderId}/payment-link`, {
        sendWhatsApp
      });
      return {
        success: true as const,
        paymentLink: response.paymentLink,
        paymentLinkId: response.paymentLinkId
      };
    } catch (error: unknown) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : 'Failed to generate payment link'
      };
    }
  },

  async getPaymentLinkStatus(paymentLinkId: string): Promise<PaymentLinkStatus> {
    return apiClient.get<PaymentLinkStatus>(`/payment-links/${paymentLinkId}/status`);
  }
};
