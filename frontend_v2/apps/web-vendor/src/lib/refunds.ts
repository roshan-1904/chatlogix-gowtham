import { apiClient } from './api';

export interface VendorRefundResult {
  refundId: string;
  status: string;
  shortfallMilli: string;
  amountPaise: number;
  customerPaymentId: string;
}

export interface ShopFundingIntent {
  customerRefundId: string;
  amountPaise: number;
  shortfallMilli: string;
  clientAction: {
    type: 'razorpay_checkout';
    orderId: string;
    amountPaise: number;
    keyId: string;
  };
}

export async function requestOrderRefund(orderId: string, refundPaise?: number): Promise<VendorRefundResult> {
  return apiClient.post<VendorRefundResult>(`/orders/${orderId}/refund`, {
    ...(refundPaise != null ? { refundPaise } : {})
  });
}

export async function createShopFundingIntent(customerRefundId: string): Promise<ShopFundingIntent> {
  return apiClient.post<ShopFundingIntent>('/payments/shop-funding-intent', { customerRefundId });
}
