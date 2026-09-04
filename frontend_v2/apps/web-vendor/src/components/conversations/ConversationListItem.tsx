import { memo, useMemo, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPhone, formatTime, truncateMessage } from '../../lib/format';
import type { Conversation, Message, MessageType } from './types';
import { calculateConversationBadges } from './utils/ConversationInsights';
import { InsightBadge } from './InsightBadge';
import { useAuthenticatedMedia } from './bubbles/shared/useAuthenticatedMedia';
import { getAvatarClasses, getInitials } from './utils/avatar';

interface ConversationListItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
}

function formatTimeAgo(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return '';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function listPreviewKey(type: MessageType): string | null {
  switch (type) {
    case 'image':
      return 'listPreview.photo';
    case 'audio':
      return 'listPreview.voiceMessage';
    case 'video':
      return 'listPreview.video';
    case 'document':
      return 'listPreview.document';
    case 'sticker':
      return 'listPreview.sticker';
    case 'contact':
      return 'listPreview.contact';
    case 'location':
      return 'listPreview.location';
    default:
      return null;
  }
}

function PreviewGlyph({ type }: { type: MessageType }) {
  if (type === 'audio') {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#667781]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z" />
      </svg>
    );
  }
  if (type === 'video') {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#667781]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M17 10.5V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-3.5l4 4v-11l-4 4z" />
      </svg>
    );
  }
  if (type === 'document') {
    return (
      <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#667781]" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 3h7l5 5v13H7V3z" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return null;
}

function LastMessagePreview({
  message,
  fromYou,
}: {
  message: Message;
  fromYou: boolean;
}) {
  const { t } = useTranslation('conversations');
  const mediaUrl =
    message.media?.state === 'ready' && message.media.mediaUrl
      ? message.media.mediaUrl
      : null;
  const wantsThumb =
    (message.type === 'image' || message.type === 'sticker') && Boolean(mediaUrl);
  const { objectUrl } = useAuthenticatedMedia(wantsThumb ? mediaUrl : null);

  const typeLabelKey = listPreviewKey(message.type);
  const caption = message.content.trim();
  const text = caption
    ? truncateMessage(caption, 42)
    : typeLabelKey
      ? t(typeLabelKey)
      : '';

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {fromYou ? (
        <span className="flex-shrink-0 text-[13px] text-[#667781]">{t('list.youPrefix')}:</span>
      ) : null}
      {message.type === 'image' || message.type === 'sticker' ? (
        objectUrl ? (
          <img
            src={objectUrl}
            alt=""
            className="h-5 w-5 flex-shrink-0 rounded object-cover bg-[#f0f2f5]"
          />
        ) : (
          <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#667781]" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )
      ) : (
        <PreviewGlyph type={message.type} />
      )}
      <p className="truncate text-[13px] text-[#667781]">{text}</p>
    </div>
  );
}

function getConversationTimestamp(conversation: Conversation): string {
  if (conversation.minutesSinceLastMessage !== null && conversation.minutesSinceLastMessage !== undefined) {
    return formatTimeAgo(conversation.minutesSinceLastMessage);
  }
  if (conversation.lastMessage?.timestamp) {
    return formatTime(conversation.lastMessage.timestamp);
  }
  return formatTime(conversation.updatedAt);
}

function ConversationListItemComponent({
  conversation,
  isSelected,
  onClick,
}: ConversationListItemProps) {
  const { t } = useTranslation('conversations');
  const displayName =
    conversation.customerName || formatPhone(conversation.customer.phone);
  const seed = conversation.customerName || conversation.customer.phone;

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

  const fromYou =
    conversation.lastMessageSender === 'vendor' || conversation.lastMessageSender === 'ai';

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      title={formatPhone(conversation.customer.phone)}
      className={`cursor-pointer border-b border-[#f0f2f5] px-3 py-2.5 transition-colors ${
        isSelected ? 'conversation-row-selected' : 'bg-white hover:bg-[#f5f6f6]'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold ${getAvatarClasses(seed)}`}
        >
          {getInitials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-medium text-[#111b21]">{displayName}</span>
            <span className="flex-shrink-0 text-[12px] text-[#667781]">
              {getConversationTimestamp(conversation)}
            </span>
          </div>
          <div className="mt-0.5 min-w-0">
            {conversation.lastMessage ? (
              <LastMessagePreview message={conversation.lastMessage} fromYou={fromYou} />
            ) : (
              <p className="truncate text-[13px] text-[#8696a0]">{t('list.noMessages')}</p>
            )}
          </div>
          {badges.length > 0 ? (
            <div className="mt-1 flex items-center gap-1">
              {badges.slice(0, 2).map((badge) => (
                <InsightBadge key={badge.kind} kind={badge.kind} label={badge.label} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const ConversationListItem = memo(ConversationListItemComponent);
