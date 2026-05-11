import { useMemo } from 'react';
import { Card } from '@chatlogix/ui';
import { useNavigate } from 'react-router-dom';
import { formatPhone, truncateMessage } from '../../lib/format';
import { InsightBadge } from '../conversations/InsightBadge';
import type { DashboardStats } from '../../types/dashboard';

interface RecentConversationsWidgetProps {
  readonly conversations: DashboardStats['conversations']['recentActivity'];
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

export function RecentConversationsWidget({ conversations }: RecentConversationsWidgetProps) {
  const navigate = useNavigate();

  // Sort conversations by minutesSinceLastMessage (most recent first)
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      return a.minutesSinceLastMessage - b.minutesSinceLastMessage;
    });
  }, [conversations]);

  if (sortedConversations.length === 0) {
    return null;
  }

  return (
    <Card className="p-3 sm:p-4 flex flex-col w-full">
      <h3 className="text-sm sm:text-base font-semibold text-[#072349] mb-2 sm:mb-3 flex-shrink-0">Recent Conversations</h3>
      <div 
        className="overflow-y-auto pr-1 sm:pr-2 space-y-1.5 sm:space-y-2 conversation-scrollbar"
        style={{ height: 'min(390px, calc(100vh - 400px))', maxHeight: '390px' }}
        role="list"
        aria-label="Recent conversations list"
      >
        {sortedConversations.slice(0, 10).map((conv) => {
          const displayName = conv.customerName || formatPhone(conv.customerPhone);
          const secondaryText = conv.customerName ? formatPhone(conv.customerPhone) : '';
          
          const handleClick = () => navigate(`/conversations?conversationId=${conv.id}`);

          return (
            <button
              key={conv.id}
              type="button"
              className="w-full text-left flex items-start space-x-2 sm:space-x-3 p-2 sm:p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-all duration-200 border border-transparent hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#072349] focus:ring-offset-1"
              onClick={handleClick}
              role="listitem"
              aria-label={`Conversation with ${displayName}${conv.hasActiveOrder ? `, active order status: ${conv.orderStatus}` : ''}. Last message: ${conv.lastMessage || 'none'}. ${formatTimeAgo(conv.minutesSinceLastMessage)}`}
            >
              <div className="flex-shrink-0">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-green-200 flex items-center justify-center text-[10px] sm:text-xs font-semibold text-green-900">
                  {getInitials(displayName)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs sm:text-sm font-semibold text-gray-900 truncate">
                      {displayName}
                    </span>
                    {secondaryText && (
                      <span className="text-[10px] sm:text-xs text-gray-500 truncate">
                        {secondaryText}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap ml-1 sm:ml-2">
                    {formatTimeAgo(conv.minutesSinceLastMessage)}
                  </span>
                </div>
                {conv.lastMessage && (
                  <p className="text-[10px] sm:text-xs text-gray-600 truncate mb-0.5 sm:mb-1">
                    {truncateMessage(conv.lastMessage, 50)}
                  </p>
                )}
                {conv.hasActiveOrder && conv.orderStatus && (
                  <div className="flex items-center mt-0.5 sm:mt-1">
                    <InsightBadge kind={getOrderBadgeKind(conv.orderStatus)} label={conv.orderStatus} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

