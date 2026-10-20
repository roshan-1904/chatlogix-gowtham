import type { BadgeVariant } from '@chatlogix/ui';
import type { Order } from '../components/conversations/types';
import { isValidStatusTransition } from './orderConstants';

/**
 * Contract badge is `cod`. The list API currently also emits `cash_on_delivery`
 * for the same state. Both render as "Cash on delivery".
 */
export const PAYMENT_BADGES = [
  'unpaid',
  'link_sent',
  'paid_online',
  'upi_sent',
  'paid_to_shop',
  'cod',
  'cash_on_delivery',
  'payment_initiated',
] as const;

export type PaymentBadge = (typeof PAYMENT_BADGES)[number];

export type PaymentFilter = 'all' | 'unpaid' | 'link_sent' | 'upi_sent' | 'paid' | 'cash';

const BADGE_SET = new Set<string>(PAYMENT_BADGES);

export function isPaymentBadge(value: string | null | undefined): value is PaymentBadge {
  return !!value && BADGE_SET.has(value);
}

export function isCashBadge(badge: PaymentBadge): boolean {
  return badge === 'cod' || badge === 'cash_on_delivery';
}

export function paymentBadgeLabel(badge: PaymentBadge): string {
  switch (badge) {
    case 'unpaid':
      return 'Unpaid';
    case 'link_sent':
      return 'Link sent';
    case 'paid_online':
      return 'Paid online';
    case 'upi_sent':
      return 'UPI sent';
    case 'paid_to_shop':
      return 'Paid to shop';
    case 'cod':
    case 'cash_on_delivery':
      return 'Cash on delivery';
    case 'payment_initiated':
      return 'Payment initiated';
    default:
      return 'Unpaid';
  }
}

export function paymentBadgeVariant(badge: PaymentBadge): BadgeVariant {
  switch (badge) {
    case 'paid_online':
    case 'paid_to_shop':
      return 'success';
    case 'link_sent':
    case 'upi_sent':
      return 'info';
    case 'payment_initiated':
      return 'warning';
    default:
      return 'default';
  }
}

function paidOnlineStatus(status: string | undefined): boolean {
  return status === 'captured' || status === 'paid' || status === 'partially_refunded' || status === 'refunded';
}

/** Detail payload may use either the contract names or the nested payment summary. */
export function orderUpiSentAt(order: Order): string | null {
  return order.upiQrSentAt ?? order.payment?.upiSentAt ?? null;
}

export function orderCashCollectedAt(order: Order): string | null {
  return order.cashCollectedAt ?? order.payment?.collectedAt ?? null;
}

export function orderPaymentReference(order: Order): string | null {
  const value = order.paymentReference ?? order.payment?.reference;
  return value?.trim() ? value : null;
}

export function orderUpiPayeeName(order: Order): string | null {
  return order.payment?.upiPayeeName ?? null;
}

/** Prefer `paymentBadge`. Until the detail payload includes it, infer from payment summary and method. */
export function derivePaymentBadge(order: Order): PaymentBadge {
  if (isPaymentBadge(order.paymentBadge)) return order.paymentBadge;

  const payStatus = order.payment?.status;
  const method = (order.paymentMethod ?? '').toLowerCase();

  if (paidOnlineStatus(payStatus)) return 'paid_online';

  if (payStatus === 'cash_collected' || orderCashCollectedAt(order)) {
    if (method === 'cod' || method === 'cash') return 'cod';
    return 'paid_to_shop';
  }

  if (orderUpiSentAt(order) || payStatus === 'upi_pending') return 'upi_sent';

  if (order.payment?.paymentLinkUrl || payStatus === 'pending' || payStatus === 'link_pending') {
    return 'link_sent';
  }

  if (method === 'cod' || method === 'cash') return 'cod';
  if (method === 'vendor_collected') return 'paid_to_shop';

  if (order.paymentInitiatedAlert || order.hasPaymentInitiatedAlert) return 'payment_initiated';

  return 'unpaid';
}

export function isCashCollected(order: Order): boolean {
  if (orderCashCollectedAt(order)) return true;
  if (order.payment?.status === 'cash_collected') return true;
  return derivePaymentBadge(order) === 'paid_to_shop';
}

export function needsCollection(order: Order): boolean {
  if (order.status === 'cancelled' || order.status === 'delivered') return false;
  if (derivePaymentBadge(order) === 'paid_online') return false;
  if (isCashCollected(order)) return false;
  return true;
}

export function matchesPaymentFilter(order: Order, filter: PaymentFilter): boolean {
  if (filter === 'all') return true;
  const badge = derivePaymentBadge(order);
  if (filter === 'unpaid') return badge === 'unpaid' || badge === 'payment_initiated';
  if (filter === 'paid') return badge === 'paid_online' || badge === 'paid_to_shop';
  if (filter === 'cash') return isCashBadge(badge);
  return badge === filter;
}

export function orderNeedsAttention(order: Order): boolean {
  if (order.status === 'pending' || order.status === 'awaiting_payment') return true;
  if (derivePaymentBadge(order) === 'payment_initiated') return true;
  if (order.paymentInitiatedAlert || order.hasPaymentInitiatedAlert) return true;
  return false;
}

export interface FulfillmentStep {
  label: string;
  nextStatus: string;
}

export function detailFulfillmentStep(status: string): FulfillmentStep | null {
  switch (status) {
    case 'pending':
      return { label: 'Confirm order', nextStatus: 'confirmed' };
    case 'confirmed':
      return { label: 'Start preparing', nextStatus: 'preparing' };
    case 'preparing':
      return { label: 'Mark ready', nextStatus: 'ready' };
    case 'ready':
      return { label: 'Out for delivery', nextStatus: 'out_for_delivery' };
    case 'out_for_delivery':
      return { label: 'Mark delivered', nextStatus: 'delivered' };
    default:
      return null;
  }
}

export type ListNextStep =
  | { kind: 'collect'; label: 'Collect payment' }
  | { kind: 'status'; label: string; nextStatus: string };

export function listNextStep(order: Order): ListNextStep | null {
  if (order.status === 'cancelled' || order.status === 'delivered') return null;
  if (needsCollection(order)) return { kind: 'collect', label: 'Collect payment' };

  const step = detailFulfillmentStep(order.status);
  if (step) {
    return {
      kind: 'status',
      label: step.nextStatus === 'confirmed' ? 'Confirm' : step.label,
      nextStatus: step.nextStatus,
    };
  }

  if (order.status === 'awaiting_payment' && isValidStatusTransition(order.status, 'confirmed')) {
    return { kind: 'status', label: 'Confirm', nextStatus: 'confirmed' };
  }

  return null;
}

export function canCancelOrder(status: string): boolean {
  return isValidStatusTransition(status, 'cancelled');
}

/** Keep payment fields from the previous snapshot when a status response omits them. */
export function mergeOrder(prev: Order, next: Order): Order {
  return {
    ...prev,
    ...next,
    payment: next.payment !== undefined ? next.payment : prev.payment,
    paymentBadge: next.paymentBadge !== undefined ? next.paymentBadge : prev.paymentBadge,
    paymentInitiatedAlert:
      next.paymentInitiatedAlert !== undefined ? next.paymentInitiatedAlert : prev.paymentInitiatedAlert,
    upiQrSentAt: next.upiQrSentAt !== undefined ? next.upiQrSentAt : prev.upiQrSentAt,
    cashCollectedAt: next.cashCollectedAt !== undefined ? next.cashCollectedAt : prev.cashCollectedAt,
    paymentReference: next.paymentReference !== undefined ? next.paymentReference : prev.paymentReference,
    paymentMethod: next.paymentMethod !== undefined ? next.paymentMethod : prev.paymentMethod,
  };
}
