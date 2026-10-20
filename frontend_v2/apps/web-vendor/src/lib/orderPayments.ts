import { apiClient } from './api';

export async function sendPaymentLink(orderId: string, sendWhatsApp = true) {
  return apiClient.post<{
    paymentLink: string;
    paymentLinkId: string;
    expiresAt: string;
    amountPaise: number;
    sent: boolean;
  }>(`/orders/${orderId}/payment-link`, { sendWhatsApp });
}

export async function sendUpiQr(orderId: string) {
  return apiClient.post<{ sent: true; messageId?: string }>(`/orders/${orderId}/send-upi-qr`, {});
}

export async function switchToCod(orderId: string) {
  return apiClient.post(`/orders/${orderId}/switch-to-cod`, {});
}

export async function markPaymentReceived(
  orderId: string,
  body: { paymentMethod?: 'vendor_collected'; reference?: string; amountPaise: number }
) {
  return apiClient.post(`/orders/${orderId}/mark-cash-collected`, body);
}

export async function dismissPaymentAlert(orderId: string, alertId: string) {
  return apiClient.post(`/orders/${orderId}/alerts/${alertId}/dismiss`, {});
}

export async function patchPaymentSettings(
  vendorId: string,
  body: Partial<{ paymentLinkAutoSend: boolean; upiVpa: string | null; upiPayeeName: string | null }>
) {
  return apiClient.patch(`/vendors/${vendorId}/payments/settings`, body);
}
