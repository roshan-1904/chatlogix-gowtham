import type { Order } from '../components/conversations/types';
import { formatAmountWithSymbol } from '../utils/currency';
import { formatOrderDate } from '../utils/dateFormatting';

export interface WhatsAppTemplate {
  name: string;
  language: string;
  components: Array<{
    type: 'body' | 'header' | 'button';
    parameters: Array<{ type: string; text: string }>;
  }>;
}

export const orderStatusTemplates: Record<string, WhatsAppTemplate> = {
  order_confirmed: {
    name: 'order_confirmed',
    language: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: '{{orderNumber}}' },
          { type: 'text', text: '{{totalAmount}}' },
          { type: 'text', text: '{{estimatedDelivery}}' }
        ]
      }
    ]
  },
  order_preparing: {
    name: 'order_preparing',
    language: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: '{{orderNumber}}' }
        ]
      }
    ]
  },
  order_ready: {
    name: 'order_ready',
    language: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: '{{orderNumber}}' },
          { type: 'text', text: '{{pickupInfo}}' }
        ]
      }
    ]
  },
  order_out_for_delivery: {
    name: 'order_out_for_delivery',
    language: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: '{{orderNumber}}' },
          { type: 'text', text: '{{trackingNumber}}' }
        ]
      }
    ]
  },
  order_delivered: {
    name: 'order_delivered',
    language: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: '{{orderNumber}}' },
          { type: 'text', text: '{{thankYouMessage}}' }
        ]
      }
    ]
  },
  order_cancelled: {
    name: 'order_cancelled',
    language: 'en',
    components: [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: '{{orderNumber}}' },
          { type: 'text', text: '{{cancellationReason}}' }
        ]
      }
    ]
  }
};

export function getTemplateParameters(
  _status: string,
  order: Order
): Record<string, string> {
  // Map order data to template parameters
  // HARDCODED MAPPING - Replace with actual data transformation
  return {
    orderNumber: order.orderNumber,
    totalAmount: formatAmountWithSymbol(order.totalAmount),
    estimatedDelivery: order.estimatedDelivery
      ? formatOrderDate(order.estimatedDelivery)
      : 'TBD',
    pickupInfo: 'Please collect your order from our store.',
    trackingNumber: 'N/A',
    thankYouMessage: 'Thank you for your order!',
    cancellationReason: 'Order cancelled by vendor',
  };
}

