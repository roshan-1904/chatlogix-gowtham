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
          className="group/msg relative flex max-w-full items-center gap-1.5 transition-shadow duration-300"
        >
          <MessageBubble message={msg} onJumpToMessage={onJumpToMessage} />
          {isCustomer && onReplyToMessage ? (
            <button
              type="button"
              onClick={() => onReplyToMessage(msg)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/80 text-[#54656f] shadow-sm ring-1 ring-black/5 transition hover:bg-white hover:text-[#072349] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25d366]"
              aria-label={t('reply.action')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
              </svg>
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export const MessageGroup = memo(MessageGroupComponent);
