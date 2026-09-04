import { memo, type MutableRefObject } from 'react';
import type { MessageGroup as Group } from './utils/messageGrouping';
import { MessageBubble } from './MessageBubble';

interface MessageGroupProps {
  group: Group;
  messageRefs?: MutableRefObject<Map<string, HTMLElement>>;
  onJumpToMessage?: (messageId: string) => void;
}

function MessageGroupComponent({ group, messageRefs, onJumpToMessage }: MessageGroupProps) {
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
          className="transition-shadow duration-300"
        >
          <MessageBubble message={msg} onJumpToMessage={onJumpToMessage} />
        </div>
      ))}
    </div>
  );
}

export const MessageGroup = memo(MessageGroupComponent);
