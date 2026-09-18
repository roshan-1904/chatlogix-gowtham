import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatPhone, truncateMessage } from '../../lib/format';
import { InsightBadge } from '../conversations/InsightBadge';
import type { DashboardStats } from '../../types/dashboard';

interface RecentConversationsWidgetProps {
  readonly conversations: DashboardStats['conversations']['recentActivity'];
  readonly conversionRateLabel?: string;
}

function getInitials(nameOrPhone: string): string {
  const parts = nameOrPhone.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatTimeAgo(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getOrderBadgeKind(status?: string): 'placed-order' | 'order-ready' | 'order-delivered' | 'payment-pending' {
  switch (status?.toLowerCase()) {
    case 'ready':
      return 'order-ready';
    case 'delivered':
      return 'order-delivered';
    case 'pending':
      return 'payment-pending';
    default:
      return 'placed-order';
  }
}

export function RecentConversationsWidget({
  conversations,
  conversionRateLabel,
}: RecentConversationsWidgetProps) {
  const navigate = useNavigate();

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => a.minutesSinceLastMessage - b.minutesSinceLastMessage);
  }, [conversations]);

  if (sortedConversations.length === 0) {
    return null;
  }

  const rows = sortedConversations.slice(0, 5);

  return (
    <div className="space-y-2">
      {conversionRateLabel && (
        <p className="text-xs text-gray-500">{conversionRateLabel}</p>
      )}
      <div className="space-y-1.5" role="list" aria-label="Recent conversations list">
        {rows.map((conv) => {
          const displayName = conv.customerName || formatPhone(conv.customerPhone);
          const secondaryText = conv.customerName ? formatPhone(conv.customerPhone) : '';

          return (
            <button
              key={conv.id}
              type="button"
              className="flex w-full items-start gap-2 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/30 sm:gap-3 sm:p-2.5"
              onClick={() => navigate(`/conversations?conversationId=${conv.id}`)}
              role="listitem"
              aria-label={`Conversation with ${displayName}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary-500/15 text-[10px] font-semibold text-primary-500 sm:h-10 sm:w-10">
                {getInitials(displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-gray-900 sm:text-sm">{displayName}</span>
                  <span className="shrink-0 text-[10px] text-gray-500 sm:text-xs">
                    {formatTimeAgo(conv.minutesSinceLastMessage)}
                  </span>
                </div>
                {secondaryText && (
                  <p className="truncate text-[10px] text-gray-500 sm:text-xs">{secondaryText}</p>
                )}
                {conv.lastMessage && (
                  <p className="truncate text-[10px] text-gray-600 sm:text-xs">
                    {truncateMessage(conv.lastMessage, 50)}
                  </p>
                )}
                {conv.hasActiveOrder && conv.orderStatus && (
                  <div className="mt-1">
                    <InsightBadge kind={getOrderBadgeKind(conv.orderStatus)} label={conv.orderStatus} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
