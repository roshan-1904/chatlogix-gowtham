import type { Conversation } from '../types';

export type InsightKind =
  | 'new-customer'
  | 'regular-customer'
  | 'returning-customer'
  | 'placed-order'
  | 'order-ready'
  | 'order-delivered'
  | 'order-inquiry'
  | 'no-order-yet'
  | 'active-now'
  | 'recently-active'
  | 'waiting-response'
  | 'needs-follow-up'
  | 'inactive'
  | 'high-value'
  | 'bulk-order'
  | 'inquiring'
  | 'price-inquiry'
  | 'custom-request'
  | 'ai-paused'
  | 'payment-pending'
  | 'urgent-delivery'
  | 'special-occasion';

export interface ConversationBadge {
  kind: InsightKind;
  label: string;
  priority: number;
}

/**
 * Pure function to calculate up to 2 insight badges for a conversation.
 * Uses only optional insight fields on Conversation so it is safe when
 * the backend has not rolled them out yet.
 */
export function calculateConversationBadges(
  conversation: Conversation,
): ConversationBadge[] {
  const badges: ConversationBadge[] = [];

  const {
    status,
    orderCount,
    totalSpent,
    hasActiveOrder,
    activeOrderStatus,
    lastMessageSender,
    minutesSinceLastMessage,
    aiPaused,
  } = conversation;

  // Order status badges (highest priority)
  if (hasActiveOrder) {
    badges.push({
      kind: 'placed-order',
      label: 'Placed Order',
      priority: 1,
    });
    if (activeOrderStatus === 'ready') {
      badges.push({
        kind: 'order-ready',
        label: 'Order Ready',
        priority: 1,
      });
    }
  } else if (orderCount && orderCount > 0) {
    badges.push({
      kind: 'no-order-yet',
      label: 'No Order Yet',
      priority: 2,
    });
  }

  if (status === 'delivered') {
    badges.push({
      kind: 'order-delivered',
      label: 'Order Delivered',
      priority: 1,
    });
  }

  // Customer type badges
  if (!orderCount || orderCount === 0) {
    badges.push({
      kind: 'new-customer',
      label: 'New Customer',
      priority: 2,
    });
  } else if (orderCount >= 2 && orderCount <= 5) {
    badges.push({
      kind: 'regular-customer',
      label: 'Regular Customer',
      priority: 3,
    });
  } else if (orderCount > 5) {
    badges.push({
      kind: 'returning-customer',
      label: 'Returning Customer',
      priority: 3,
    });
  }

  // Activity badges
  if (typeof minutesSinceLastMessage === 'number') {
    if (minutesSinceLastMessage <= 5) {
      badges.push({
        kind: 'active-now',
        label: 'Active Now',
        priority: 4,
      });
    } else if (minutesSinceLastMessage <= 60) {
      badges.push({
        kind: 'recently-active',
        label: 'Recently Active',
        priority: 4,
      });
    } else if (minutesSinceLastMessage >= 60 * 24 && hasActiveOrder) {
      badges.push({
        kind: 'needs-follow-up',
        label: 'Needs Follow-up',
        priority: 4,
      });
    } else if (minutesSinceLastMessage >= 60 * 24 * 7) {
      badges.push({
        kind: 'inactive',
        label: 'Inactive',
        priority: 5,
      });
    }
  }

  if (lastMessageSender === 'customer') {
    badges.push({
      kind: 'waiting-response',
      label: 'Waiting Response',
      priority: 4,
    });
  }

  // Value badges
  if (typeof totalSpent === 'number' && totalSpent > 5000 * 100) {
    badges.push({
      kind: 'high-value',
      label: 'High Value',
      priority: 6,
    });
  }

  // Special flags
  if (aiPaused) {
    badges.push({
      kind: 'ai-paused',
      label: 'AI Paused',
      priority: 5,
    });
  }

  // Sort by priority and take the top 2 unique kinds
  const deduped = new Map<InsightKind, ConversationBadge>();
  for (const badge of badges.sort((a, b) => a.priority - b.priority)) {
    if (!deduped.has(badge.kind)) {
      deduped.set(badge.kind, badge);
    }
  }

  return Array.from(deduped.values()).slice(0, 2);
}


