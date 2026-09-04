import { memo } from 'react';
import {
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
