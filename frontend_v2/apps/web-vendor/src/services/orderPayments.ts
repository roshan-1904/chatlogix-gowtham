import { apiClient } from '../lib/api';

export interface SendUpiQrResult {
  sent: true;
  payeeName: string;
  upiVpa: string;
  amountPaise: number;
  tapToPayUrl: string;
}

export interface MarkCashCollectedBody {
  paymentMethod?: 'vendor_collected' | 'cod';
  reference?: string;
}

export const orderPayments = {
  sendUpiQr(orderId: string): Promise<SendUpiQrResult> {
    return apiClient.post<SendUpiQrResult>(`/orders/${orderId}/send-upi-qr`);
  },

  switchToCod(orderId: string): Promise<{ id: string; status: string; paymentMethod: string }> {
    return apiClient.post(`/orders/${orderId}/switch-to-cod`);
  },

  markCashCollected(orderId: string, body: MarkCashCollectedBody): Promise<unknown> {
    return apiClient.post(`/orders/${orderId}/mark-cash-collected`, body);
  },

  dismissPaymentAlert(orderId: string, alertId: string): Promise<{ dismissed: true }> {
    return apiClient.post<{ dismissed: true }>(`/orders/${orderId}/alerts/${alertId}/dismiss`);
  },

  getTapToPayUrl(orderId: string): Promise<{ tapToPayUrl: string }> {
    return apiClient.get<{ tapToPayUrl: string }>(`/orders/${orderId}/tap-to-pay-url`);
  },
};
