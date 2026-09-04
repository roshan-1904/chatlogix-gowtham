import { memo } from 'react';
import {
  dualLanguageDisplay,
  splitEmojiAndText,
  standaloneEmojiClass,
  standaloneEmojiCount,
} from '../../utils/messageText';

interface MessageTextProps {
  readonly text: string;
  readonly className?: string;
}

function MessageTextComponent({ text, className = '' }: MessageTextProps) {
  const standaloneCount = standaloneEmojiCount(text);
  const parts = splitEmojiAndText(text);

  if (parts.length === 0) return null;

  if (standaloneCount > 0) {
    return (
      <span className={`${standaloneEmojiClass(standaloneCount)} ${className}`.trim()}>
        {parts
          .filter((part) => part.type === 'emoji')
          .map((part, index) => (
            <span key={`${part.value}-${index}`} className="inline-block leading-[1.2]">
              {part.value}
            </span>
          ))}
      </span>
    );
  }

  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.type === 'emoji' ? (
          <span key={`${part.value}-${index}`} className="chat-emoji">
            {part.value}
          </span>
        ) : (
          <span key={`t-${index}`}>{part.value}</span>
        ),
      )}
    </span>
  );
}

export const MessageText = memo(MessageTextComponent);

interface DualLanguageMessageTextProps {
  readonly original: string;
  readonly contentEn?: string | null;
  readonly className?: string;
}

function DualLanguageMessageTextComponent({
  original,
  contentEn,
  className = '',
}: DualLanguageMessageTextProps) {
  const display = dualLanguageDisplay(original, contentEn);

  if (!display.dual) {
    return <MessageText text={display.text} className={className} />;
  }

  return (
    <span className="block">
      <MessageText text={display.english} className={className} />
      <span className="mt-0.5 block text-[12px] leading-[1.4] text-[#667781]">
        <MessageText text={display.original} />
      </span>
    </span>
  );
}

export const DualLanguageMessageText = memo(DualLanguageMessageTextComponent);
