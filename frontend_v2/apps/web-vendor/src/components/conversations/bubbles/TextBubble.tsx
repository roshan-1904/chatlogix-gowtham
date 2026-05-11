import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMessageTime } from '../../../lib/format';
import type { Message } from '../types';
import { StatusTick } from './shared/StatusTick';
import { ReactionChips } from './shared/ReactionChips';
import { QuotedReplyPreview } from './shared/QuotedReplyPreview';

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
  const isCustomer = message.senderType === 'customer';
  const tone: 'light' | 'dark' = isCustomer ? 'dark' : 'light';
  const textRef = useRef<HTMLDivElement>(null);
  const [showTimestampInline, setShowTimestampInline] = useState<boolean>(false);

  const alignment = isCustomer ? 'items-start' : 'items-end';
  const bubbleClasses = isCustomer
    ? 'bg-gray-200 text-gray-900'
    : 'bg-blue-500 text-white';

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
    !isCustomer && (message.status === 'pending' || message.status === 'processing');

  // When there's a quoted reply, force block layout for clarity.
  const hasReply = Boolean(message.replyTo);
  const useInline = !hasReply && showTimestampInline;

  return (
    <div className={`flex flex-col ${alignment}`}>
      <div
        className={`relative max-w-xs lg:max-w-md px-3 pt-2 rounded-lg shadow-sm text-sm leading-relaxed ${bubbleClasses} ${
          isCustomer ? 'rounded-t-lg rounded-br-lg' : 'rounded-t-lg rounded-bl-lg'
        } ${useInline ? 'pb-2' : 'pb-5'}`}
      >
        {hasReply ? (
          <QuotedReplyPreview
            replyTo={message.replyTo}
            tone={tone}
            onJumpTo={onJumpToMessage}
          />
        ) : null}

        {useInline ? (
          <span className="inline-flex items-baseline flex-wrap">
            <span className="whitespace-pre-wrap break-words">{content}</span>
            <span
              className={`text-[10px] ml-1.5 shrink-0 inline-flex items-center gap-1 ${
                isCustomer ? 'text-gray-500' : 'text-blue-100'
              }`}
            >
              {isPending ? <span className="italic">{t('status.sending')}</span> : null}
              <span>{timestamp}</span>
              {!isCustomer ? (
                <StatusTick
                  status={message.status}
                  failureReason={message.failureReason}
                  tone={tone}
                />
              ) : null}
            </span>
          </span>
        ) : (
          <>
            <div ref={textRef} className="whitespace-pre-wrap break-words">
              {content}
            </div>
            <span
              className={`absolute bottom-1 right-2 text-[10px] inline-flex items-center gap-1 ${
                isCustomer ? 'text-gray-500' : 'text-blue-100'
              }`}
            >
              {isPending ? <span className="italic">{t('status.sending')}</span> : null}
              <span>{timestamp}</span>
              {!isCustomer ? (
                <StatusTick
                  status={message.status}
                  failureReason={message.failureReason}
                  tone={tone}
                />
              ) : null}
            </span>
          </>
        )}
      </div>
      <ReactionChips reactions={message.reactions} align={isCustomer ? 'start' : 'end'} />
    </div>
  );
}

export const TextBubble = memo(TextBubbleComponent);
