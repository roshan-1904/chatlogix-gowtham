import { formatPhone } from '../../lib/format';
import type { Conversation } from './types';

interface ConversationHeaderProps {
  conversation: Conversation;
  onToggleAIPause: () => void;
}

export function ConversationHeader({
  conversation,
  onToggleAIPause,
}: ConversationHeaderProps) {
  const displayName =
    conversation.customerName || formatPhone(conversation.customer.phone);

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="h-9 w-9 rounded-full bg-blue-500 flex items-center justify-center text-xs font-semibold text-white shadow-sm">
          {displayName
            .split(' ')
            .map((p) => p[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900 truncate">{displayName}</span>
          <span className="text-xs text-gray-500 truncate">
            {formatPhone(conversation.customer.phone)}
          </span>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={onToggleAIPause}
          className={`ml-1 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
            conversation.aiPaused
              ? 'bg-green-500 hover:bg-green-400 text-white'
              : 'bg-yellow-400 hover:bg-yellow-300 text-gray-900'
          }`}
        >
          {conversation.aiPaused ? 'Start Auto-Reply' : 'Stop Auto-Reply'}        </button>
      </div>
    </div>
  );
}

