import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMessageTime } from '../../../lib/format';
import type { Message } from '../types';
import { StatusTick } from './shared/StatusTick';
import { ReactionChips } from './shared/ReactionChips';
import { QuotedReplyPreview } from './shared/QuotedReplyPreview';
import {
  bubbleAlignClass,
  bubbleCornerClass,
  bubbleMetaClass,
  bubbleShadowClass,
  bubbleSurfaceClass,
  getBubbleVariant,
  isAiSender,
} from './shared/bubbleChrome';

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
  /**
   * Tight padding around media so photos/videos sit flush to the bubble edge.
   */
  readonly flush?: boolean;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function MessageShellComponent({
  message,
  children,
  chromeless = false,
  wide = false,
  flush = false,
  onJumpToMessage,
}: MessageShellProps) {
  const { t } = useTranslation('conversations');
  const variant = getBubbleVariant(message.senderType);
  const isIncoming = variant === 'incoming';
  const isAi = isAiSender(message.senderType);
  const align = bubbleAlignClass(variant);
  const widthClass = wide ? 'max-w-[17.5rem] sm:max-w-sm lg:max-w-md' : 'max-w-[16rem] sm:max-w-xs lg:max-w-md';
  const padding = chromeless ? '' : flush ? 'p-[3px]' : 'px-2.5 pt-1.5 pb-1';
  const background = chromeless
    ? ''
    : `${bubbleSurfaceClass(variant)} ${bubbleCornerClass(variant)} ${bubbleShadowClass()}`;

  const isPending = message.status === 'pending' || message.status === 'processing';
  const timestamp = formatMessageTime(message.timestamp);

  return (
    <div className={`flex flex-col ${align}`}>
      {isAi ? (
        <span className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[#072349]/55">
          {t('sender.ai')}
        </span>
      ) : null}
      <div className={`chat-bubble relative ${widthClass} ${padding} ${background} text-[14.2px] leading-[1.55]`}>
        {message.replyTo ? (
          <div className={flush ? 'px-1.5 pt-1' : ''}>
            <QuotedReplyPreview
              replyTo={message.replyTo}
              variant={variant}
              onJumpTo={onJumpToMessage}
            />
          </div>
        ) : null}
        {children}
        {!chromeless ? (
          <div
            className={`flex items-center gap-1 justify-end text-[11px] leading-none ${
              flush ? 'px-1.5 pb-1 pt-0.5' : 'mt-0.5'
            } ${bubbleMetaClass()}`}
          >
            {isPending && !isIncoming ? (
              <span className="italic opacity-80">…</span>
            ) : null}
            <span>{timestamp}</span>
            {!isIncoming ? (
              <StatusTick status={message.status} failureReason={message.failureReason} />
            ) : null}
          </div>
        ) : null}
      </div>
      <ReactionChips reactions={message.reactions} align={isIncoming ? 'start' : 'end'} />
    </div>
  );
}

export const MessageShell = memo(MessageShellComponent);
