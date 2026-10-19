import type { BadgeVariant } from '@chatlogix/ui';

// Status badge colors
export const statusColors: Record<string, BadgeVariant> = {
  pending: 'warning',      // Yellow
  awaiting_payment: 'warning',
  confirmed: 'info',       // Blue
  preparing: 'warning',    // Orange/Yellow
  ready: 'info',           // Blue
  out_for_delivery: 'info', // Blue
  delivered: 'success',    // Green
  cancelled: 'default'     // Gray
};

// Status labels for display
export const statusLabels: Record<string, string> = {
  pending: 'Pending',
  awaiting_payment: 'Awaiting Payment',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

// Valid status transitions
export const validStatusTransitions: Record<string, string[]> = {
  pending: ['confirmed', 'awaiting_payment', 'cancelled'],
  awaiting_payment: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
  delivered: [], // Terminal state
  cancelled: [] // Terminal state
};

// Check if status transition is valid
export function isValidStatusTransition(from: string, to: string): boolean {
  return validStatusTransitions[from]?.includes(to) ?? false;
}

// Pagination
export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Search debounce
export const SEARCH_DEBOUNCE_MS = 300;

// Date presets
export const DATE_PRESETS = {
  TODAY: 'today',
  THIS_WEEK: 'this_week',
  THIS_MONTH: 'this_month',
  CUSTOM: 'custom'
};

// Sort options
export const SORT_OPTIONS = {
  NEWEST_FIRST: 'newest',
  OLDEST_FIRST: 'oldest',
  AMOUNT_HIGH_TO_LOW: 'amount_desc',
  AMOUNT_LOW_TO_HIGH: 'amount_asc'
};

// Currency formatting
export const CURRENCY_CODE = 'INR';
export const CURRENCY_SYMBOL = '₹';

// Default view for order list
export const DEFAULT_ORDER_VIEW = 'table'; // 'table' | 'card'
export const ORDER_VIEW_STORAGE_KEY = 'orderListViewPreference';

