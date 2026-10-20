import type { Order } from '../conversations/types';

export function getOrderNextStep(order: Order): { label: string; action: string } | null {
  const badge = order.paymentBadge;
  const needsPayment =
    badge === 'unpaid' ||
    badge === 'link_sent' ||
    badge === 'upi_sent' ||
    badge === 'payment_initiated';

  if (needsPayment && order.status !== 'cancelled') {
    return { label: 'Collect payment', action: 'collect_payment' };
  }

  switch (order.status) {
    case 'pending':
      return { label: 'Confirm order', action: 'confirm' };
    case 'confirmed':
      return { label: 'Start preparing', action: 'start_preparing' };
    case 'preparing':
      return { label: 'Mark ready', action: 'mark_ready' };
    case 'ready':
      return { label: 'Out for delivery', action: 'out_for_delivery' };
    case 'out_for_delivery':
      return { label: 'Mark delivered', action: 'mark_delivered' };
    default:
      return null;
  }
}
