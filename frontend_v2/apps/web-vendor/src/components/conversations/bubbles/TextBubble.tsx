import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMessageTime } from '../../../lib/format';
import type { Message } from '../types';
import { StatusTick } from './shared/StatusTick';
import { ReactionChips } from './shared/ReactionChips';
import { QuotedReplyPreview } from './shared/QuotedReplyPreview';
import { MessageText } from './shared/MessageText';
import { standaloneEmojiCount } from '../utils/messageText';
import {
  bubbleAlignClass,
  bubbleCornerClass,
  bubbleMetaClass,
  bubbleShadowClass,
  bubbleSurfaceClass,
  getBubbleVariant,
  isAiSender,
} from './shared/bubbleChrome';

interface TextBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function stripHtml(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function TextBubbleComponent({ message, onJumpToMessage }: TextBubbleProps) {
  const { t } = useTranslation('conversations');
  const variant = getBubbleVariant(message.senderType);
  const isIncoming = variant === 'incoming';
  const isAi = isAiSender(message.senderType);
  const textRef = useRef<HTMLDivElement>(null);
  const [showTimestampInline, setShowTimestampInline] = useState<boolean>(false);

  const checkIfSingleLine = useCallback(() => {
    if (!textRef.current) return;

    const textElement = textRef.current;
    requestAnimationFrame(() => {
      if (!textRef.current) return;
      const textHeight = textElement.scrollHeight;
      const styles = window.getComputedStyle(textElement);
      const lineHeight =
        parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) * 1.5;
      setShowTimestampInline(textHeight <= lineHeight * 1.5);
    });
  }, []);

  useEffect(() => {
    checkIfSingleLine();
  }, [checkIfSingleLine, message.content]);

  useEffect(() => {
    const handleResize = () => checkIfSingleLine();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkIfSingleLine]);

  const content = stripHtml(message.content);
  const timestamp = formatMessageTime(message.timestamp);

  const isPending =
    !isIncoming && (message.status === 'pending' || message.status === 'processing');

  const hasReply = Boolean(message.replyTo);
  const emojiOnly = standaloneEmojiCount(content) > 0;
  const useInline = !hasReply && !emojiOnly && showTimestampInline;
  const metaClass = bubbleMetaClass();

  const timestampRow = (
    <span className={`text-[11px] shrink-0 inline-flex items-center gap-1 ${metaClass}`}>
      {isPending ? <span className="italic">{t('status.sending')}</span> : null}
      <span>{timestamp}</span>
      {!isIncoming ? (
        <StatusTick status={message.status} failureReason={message.failureReason} />
      ) : null}
    </span>
  );

  return (
    <div className={`flex flex-col ${bubbleAlignClass(variant)}`}>
      {isAi ? (
        <span className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-[#072349]/55">
          {t('sender.ai')}
        </span>
      ) : null}
      <div
        className={`chat-bubble relative max-w-[16rem] sm:max-w-xs lg:max-w-md px-2.5 pt-1.5 rounded-2xl ${bubbleShadowClass()} text-[14.2px] leading-[1.55] ${bubbleSurfaceClass(variant)} ${bubbleCornerClass(variant)} ${
          emojiOnly ? 'pb-1.5' : useInline ? 'pb-1.5' : 'pb-5'
        }`}
      >
        {hasReply ? (
          <QuotedReplyPreview
            replyTo={message.replyTo}
            variant={variant}
            onJumpTo={onJumpToMessage}
          />
        ) : null}

        {emojiOnly ? (
          <div className="flex items-end gap-1.5">
            <span className="min-w-min max-w-full overflow-visible">
              <MessageText text={content} />
            </span>
            {timestampRow}
          </div>
        ) : useInline ? (
          <span className="inline-flex items-end flex-wrap gap-x-1.5">
            <span className="whitespace-pre-wrap break-words">
              <MessageText text={content} />
            </span>
            {timestampRow}
          </span>
        ) : (
          <>
            <div ref={textRef} className="whitespace-pre-wrap break-words">
              <MessageText text={content} />
            </div>
            <span className="absolute bottom-1 right-2">{timestampRow}</span>
          </>
        )}
      </div>
      <ReactionChips reactions={message.reactions} align={isIncoming ? 'start' : 'end'} />
    </div>
  );
}

export const TextBubble = memo(TextBubbleComponent);
