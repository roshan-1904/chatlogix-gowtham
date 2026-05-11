import { apiClient } from '../lib/api';
import type { Order } from '../components/conversations/types';

export interface OrderStatusUpdate {
  status: string;
  estimatedDelivery?: string;
  cancellationReason?: string;
}

export interface OrderService {
  getOrderDetails(orderId: string): Promise<Order>;
  updateOrderStatus(orderId: string, update: OrderStatusUpdate): Promise<Order>;
  confirmOrder(orderId: string, estimatedDelivery?: string): Promise<Order>;
  cancelOrder(orderId: string, reason?: string): Promise<Order>;
}

export const orderService: OrderService = {
  /**
   * Fetch order details by ID
   * @param orderId - Order ID
   * @returns Order object with all details
   * @throws Error if order not found or access denied
   */
  async getOrderDetails(orderId: string): Promise<Order> {
    try {
      const order = await apiClient.get<Order>(`/orders/${orderId}`);
      return order;
    } catch (error: any) {
      // Transform API errors to user-friendly messages
      if (error?.message?.includes('404') || error?.message?.includes('not found')) {
        throw new Error('Order not found');
      }
      if (error?.message?.includes('403') || error?.message?.includes('unauthorized')) {
        throw new Error('You do not have permission to view this order');
      }
      throw error;
    }
  },

  /**
   * Update order status
   * @param orderId - Order ID
   * @param update - Status update data
   * @returns Updated order object
   */
  async updateOrderStatus(orderId: string, update: OrderStatusUpdate): Promise<Order> {
    try {
      const order = await apiClient.put<Order>(`/orders/${orderId}/status`, update);
      return order;
    } catch (error: any) {
      if (error?.message?.includes('400') || error?.message?.includes('Invalid status')) {
        throw new Error('Invalid status transition');
      }
      throw error;
    }
  },

  /**
   * Confirm an order
   * @param orderId - Order ID
   * @param estimatedDelivery - Optional estimated delivery date (ISO string)
   * @returns Updated order object
   */
  async confirmOrder(orderId: string, estimatedDelivery?: string): Promise<Order> {
    try {
      const order = await apiClient.post<Order>(`/orders/${orderId}/confirm`, {
        estimatedDelivery,
      });
      return order;
    } catch (error: any) {
      throw error;
    }
  },

  /**
   * Cancel an order
   * @param orderId - Order ID
   * @param reason - Optional cancellation reason
   * @returns Updated order object
   */
  async cancelOrder(orderId: string, reason?: string): Promise<Order> {
    try {
      const order = await apiClient.post<Order>(`/orders/${orderId}/cancel`, { reason });
      return order;
    } catch (error: any) {
      throw error;
    }
  },
};

