import { apiClient } from '../lib/api';

export interface ShippingData {
  deliveryAddress: string;
  customerPhone: string;
  customerName?: string;
  weight?: number;
  dimensions?: { length: number; width: number; height: number };
  shippingPartner?: 'shiprocket' | 'delhivery' | 'self';
}

export interface ShippingRate {
  partner: string;
  service: string;
  cost: number;
  estimatedDays: number;
}

export interface ShipmentResponse {
  shipmentId: string;
  trackingNumber: string;
  shippingPartner: string;
}

export interface ShippingUpdate {
  status: string;
  location?: string;
  timestamp: string;
  description: string;
}

export interface ShippingService {
  createShipment(
    orderId: string,
    shippingData: ShippingData
  ): Promise<{ success: boolean; shipmentId?: string; trackingNumber?: string; error?: string }>;

  getShippingRates(
    orderId: string,
    deliveryAddress: string
  ): Promise<{ success: boolean; rates?: ShippingRate[]; error?: string }>;

  generateShippingLabel(
    shipmentId: string
  ): Promise<{ success: boolean; labelUrl?: string; error?: string }>;

  trackShipment(
    trackingNumber: string
  ): Promise<{ success: boolean; status?: string; updates?: ShippingUpdate[]; error?: string }>;
}

export const shippingService: ShippingService = {
  /**
   * Create shipment for an order
   * Note: Backend endpoint may return 501 if not implemented yet
   */
  async createShipment(orderId: string, shippingData: ShippingData) {
    try {
      const response = await apiClient.post<ShipmentResponse>(
        `/orders/${orderId}/shipment`,
        shippingData
      );

      return {
        success: true,
        shipmentId: response.shipmentId,
        trackingNumber: response.trackingNumber,
      };
    } catch (error: any) {
      // Handle 501 Not Implemented gracefully
      if (error?.message?.includes('501') || error?.message?.includes('Not implemented')) {
        return {
          success: false,
          error: 'Shipment creation is not yet available. Please contact support.',
        };
      }
      
      return {
        success: false,
        error: error?.message || 'Failed to create shipment',
      };
    }
  },

  /**
   * Get shipping rates for an order
   * Note: Backend endpoint may return 501 if not implemented yet
   */
  async getShippingRates(orderId: string, deliveryAddress: string) {
    try {
      // Construct URL with query params
      const queryParams = new URLSearchParams({ address: deliveryAddress });
      const response = await apiClient.get<ShippingRate[]>(
        `/orders/${orderId}/shipping-rates?${queryParams.toString()}`
      );

      return {
        success: true,
        rates: Array.isArray(response) ? response : [],
      };
    } catch (error: any) {
      // Handle 501 Not Implemented gracefully
      if (error?.message?.includes('501') || error?.message?.includes('Not implemented')) {
        return {
          success: false,
          error: 'Shipping rates are not yet available. Please contact support.',
        };
      }
      
      return {
        success: false,
        error: error?.message || 'Failed to get shipping rates',
      };
    }
  },

  /**
   * Generate shipping label
   * Note: Backend endpoint may return 501 if not implemented yet
   */
  async generateShippingLabel(shipmentId: string) {
    try {
      const response = await apiClient.get<{ labelUrl: string }>(
        `/shipments/${shipmentId}/label`
      );

      return {
        success: true,
        labelUrl: response.labelUrl,
      };
    } catch (error: any) {
      // Handle 501 Not Implemented gracefully
      if (error?.message?.includes('501') || error?.message?.includes('Not implemented')) {
        return {
          success: false,
          error: 'Label generation is not yet available. Please contact support.',
        };
      }
      
      return {
        success: false,
        error: error?.message || 'Failed to generate shipping label',
      };
    }
  },

  /**
   * Track shipment
   * Note: Backend endpoint may return 501 if not implemented yet
   */
  async trackShipment(trackingNumber: string) {
    try {
      const response = await apiClient.get<ShippingUpdate[]>(
        `/shipments/${trackingNumber}/track`
      );

      return {
        success: true,
        updates: Array.isArray(response) ? response : [],
      };
    } catch (error: any) {
      // Handle 501 Not Implemented gracefully
      if (error?.message?.includes('501') || error?.message?.includes('Not implemented')) {
        return {
          success: false,
          error: 'Shipment tracking is not yet available. Please contact support.',
        };
      }
      
      return {
        success: false,
        error: error?.message || 'Failed to track shipment',
      };
    }
  },
};

