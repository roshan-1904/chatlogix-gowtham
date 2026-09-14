import { memo, type MutableRefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from './types';
import type { MessageGroup as Group } from './utils/messageGrouping';
import { MessageBubble } from './MessageBubble';

interface MessageGroupProps {
  group: Group;
  messageRefs?: MutableRefObject<Map<string, HTMLElement>>;
  onJumpToMessage?: (messageId: string) => void;
  onReplyToMessage?: (message: Message) => void;
}

function MessageGroupComponent({ group, messageRefs, onJumpToMessage, onReplyToMessage }: MessageGroupProps) {
  const { t } = useTranslation('conversations');
  const isCustomer = group.senderType === 'customer';

  return (
    <div className={`flex flex-col space-y-1 ${isCustomer ? 'items-start' : 'items-end'}`}>
      {group.messages.map((msg) => (
        <div
          key={msg.id}
          ref={(el) => {
            if (!messageRefs) return;
            if (el) {
              messageRefs.current.set(msg.id, el);
            } else {
              messageRefs.current.delete(msg.id);
            }
          }}
          className="group/msg relative flex max-w-full items-center gap-1 transition-shadow duration-300"
        >
          {isCustomer && onReplyToMessage ? (
            <button
              type="button"
              onClick={() => onReplyToMessage(msg)}
              className="order-2 shrink-0 rounded-full p-1.5 text-[#54656f] opacity-60 transition-opacity hover:bg-black/5 hover:opacity-100 group-hover/msg:opacity-100 focus:opacity-100"
              aria-label={t('reply.action')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
              </svg>
            </button>
          ) : null}
          <MessageBubble message={msg} onJumpToMessage={onJumpToMessage} />
        </div>
      ))}
    </div>
  );
}

export const MessageGroup = memo(MessageGroupComponent);
