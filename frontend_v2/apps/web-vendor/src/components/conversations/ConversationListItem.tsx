import { memo, useMemo, KeyboardEvent } from 'react';
import { formatPhone, formatTime, truncateMessage } from '../../lib/format';
import type { Conversation } from './types';
import { calculateConversationBadges } from './utils/ConversationInsights';
import { InsightBadge } from './InsightBadge';

interface ConversationListItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

function getInitials(nameOrPhone: string): string {
  const parts = nameOrPhone.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatTimeAgo(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return '';
  }
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

function getConversationTimestamp(conversation: Conversation): string {
  // Prefer minutesSinceLastMessage if available (most accurate)
  if (conversation.minutesSinceLastMessage !== null && conversation.minutesSinceLastMessage !== undefined) {
    return formatTimeAgo(conversation.minutesSinceLastMessage);
  }
  
  // Fallback to lastMessage timestamp if available
  if (conversation.lastMessage?.timestamp) {
    return formatTime(conversation.lastMessage.timestamp);
  }
  
  // Final fallback to updatedAt
  return formatTime(conversation.updatedAt);
}

function ConversationListItemComponent({
  conversation,
  isSelected,
  onClick,
}: ConversationListItemProps) {
  const displayName =
    conversation.customerName || formatPhone(conversation.customer.phone);

  const secondaryText = conversation.customerName
    ? formatPhone(conversation.customer.phone)
    : '';

  const badges = useMemo(
    () => calculateConversationBadges(conversation),
    [conversation],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={`px-4 py-3 border-b border-gray-100 cursor-pointer transition-colors ${
        isSelected ? 'bg-[#e5f3ef]' : 'hover:bg-gray-50 bg-white'
      }`}
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <div className="h-11 w-11 rounded-full bg-green-200 flex items-center justify-center text-xs font-semibold text-green-900">
            {getInitials(displayName)}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {displayName}
              </span>
              {secondaryText && (
                <span className="text-xs text-gray-500 truncate">
                  {secondaryText}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-500">
              {getConversationTimestamp(conversation)}
            </span>
          </div>
          <div className="flex items-center space-x-2 mb-1">
            {conversation.lastMessage && (
              <p className="text-sm text-gray-600 truncate">
                {truncateMessage(conversation.lastMessage.content, 40)}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center space-x-2">
              {conversation.aiPaused !== undefined && (
                <span
                  className={`text-[11px] font-medium ${
                    conversation.aiPaused
                      ? 'text-orange-600 bg-orange-50 px-2 py-0.5 rounded'
                      : 'text-green-600 bg-green-50 px-2 py-0.5 rounded'
                  }`}
                  title={conversation.aiPaused ? 'AI Auto-Reply Paused' : 'AI Auto-Reply Active'}
                >
                  {conversation.aiPaused ? '⏸ AI Paused' : '▶ AI Active'}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1">
              {badges.map((badge) => (
                <InsightBadge
                  key={badge.kind}
                  kind={badge.kind}
                  label={badge.label}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ConversationListItem = memo(ConversationListItemComponent);


