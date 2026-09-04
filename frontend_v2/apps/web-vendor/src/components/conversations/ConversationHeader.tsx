import { formatPhone } from '../../lib/format';
import { useTranslation } from 'react-i18next';
import type { Conversation } from './types';
import { getAvatarClasses, getInitials } from './utils/avatar';

interface ConversationHeaderProps {
  conversation: Conversation;
  onToggleAIPause: () => void;
}

export function ConversationHeader({
  conversation,
  onToggleAIPause,
}: ConversationHeaderProps) {
  const { t } = useTranslation('conversations');
  const displayName =
    conversation.customerName || formatPhone(conversation.customer.phone);
  const seed = conversation.customerName || conversation.customer.phone;

  return (
    <div className="flex items-center justify-between border-b border-[#d1d7db] bg-[#f0f2f5] px-3 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold shadow-sm ${getAvatarClasses(seed)}`}
        >
          {getInitials(displayName)}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold text-[#111b21]">{displayName}</span>
          <span className="truncate text-xs text-[#667781]">
            {conversation.aiPaused ? t('header.aiOff') : t('header.aiOn')}
            <span className="mx-1.5 text-[#d1d7db]">·</span>
            {formatPhone(conversation.customer.phone)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleAIPause}
        className={`ml-3 flex-shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
          conversation.aiPaused
            ? 'bg-[#25D366] text-white hover:bg-[#1da851]'
            : 'bg-white text-[#111b21] ring-1 ring-[#d1d7db] hover:bg-[#f5f6f6]'
        }`}
      >
        {conversation.aiPaused ? t('header.startAutoReply') : t('header.stopAutoReply')}
      </button>
    </div>
  );
}
