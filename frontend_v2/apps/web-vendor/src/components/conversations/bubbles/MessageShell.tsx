import { memo, type ReactNode } from 'react';
import { formatMessageTime } from '../../../lib/format';
import type { Message } from '../types';
import { StatusTick } from './shared/StatusTick';
import { ReactionChips } from './shared/ReactionChips';
import { QuotedReplyPreview } from './shared/QuotedReplyPreview';

interface MessageShellProps {
  readonly message: Message;
  readonly children: ReactNode;
  /**
   * When true, the inner bubble has no padding and no background — used by sticker
   * (an image without chrome).
   */
  readonly chromeless?: boolean;
  /**
   * When true, the bubble grows with its content (used for media, location, contact,
   * etc.) instead of being constrained to a small text width.
   */
  readonly wide?: boolean;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function MessageShellComponent({
  message,
  children,
  chromeless = false,
  wide = false,
  onJumpToMessage
}: MessageShellProps) {
  const isCustomer = message.senderType === 'customer';
  const tone: 'light' | 'dark' = isCustomer ? 'dark' : 'light';
  const align = isCustomer ? 'items-start' : 'items-end';

  const bubbleBg = isCustomer ? 'bg-gray-200 text-gray-900' : 'bg-blue-500 text-white';
  const corners = isCustomer ? 'rounded-t-lg rounded-br-lg' : 'rounded-t-lg rounded-bl-lg';
  const widthClass = wide ? 'max-w-sm lg:max-w-lg' : 'max-w-xs lg:max-w-md';

  const padding = chromeless ? '' : 'px-3 pt-2 pb-2';
  const background = chromeless ? '' : `${bubbleBg} ${corners} shadow-sm`;

  const isPending = message.status === 'pending' || message.status === 'processing';
  const timestamp = formatMessageTime(message.timestamp);

  return (
    <div className={`flex flex-col ${align}`}>
      <div className={`relative ${widthClass} ${padding} ${background} text-sm leading-relaxed`}>
        {message.replyTo ? (
          <QuotedReplyPreview
            replyTo={message.replyTo}
            tone={tone}
            onJumpTo={onJumpToMessage}
          />
        ) : null}
        {children}
        {!chromeless ? (
          <div
            className={`mt-1 flex items-center gap-1 justify-end text-[10px] ${
              isCustomer ? 'text-gray-500' : 'text-blue-100'
            }`}
          >
            {isPending && message.senderType !== 'customer' ? (
              <span className="italic opacity-80">…</span>
            ) : null}
            <span>{timestamp}</span>
            {message.senderType !== 'customer' ? (
              <StatusTick
                status={message.status}
                failureReason={message.failureReason}
                tone={tone}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <ReactionChips
        reactions={message.reactions}
        align={isCustomer ? 'start' : 'end'}
      />
    </div>
  );
}

export const MessageShell = memo(MessageShellComponent);
