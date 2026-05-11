import { memo } from 'react';
import type { Message } from './types';
import { TextBubble } from './bubbles/TextBubble';
import { ImageBubble } from './bubbles/ImageBubble';
import { VideoBubble } from './bubbles/VideoBubble';
import { AudioBubble } from './bubbles/AudioBubble';
import { DocumentBubble } from './bubbles/DocumentBubble';
import { LocationBubble } from './bubbles/LocationBubble';
import { ContactBubble } from './bubbles/ContactBubble';
import { InteractiveBubble } from './bubbles/InteractiveBubble';
import { StickerBubble } from './bubbles/StickerBubble';

interface MessageBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function MessageBubbleComponent({ message, onJumpToMessage }: MessageBubbleProps) {
  switch (message.type) {
    case 'image':
      return <ImageBubble message={message} onJumpToMessage={onJumpToMessage} />;
    case 'video':
      return <VideoBubble message={message} onJumpToMessage={onJumpToMessage} />;
    case 'audio':
      return <AudioBubble message={message} onJumpToMessage={onJumpToMessage} />;
    case 'document':
      return <DocumentBubble message={message} onJumpToMessage={onJumpToMessage} />;
    case 'location':
      return <LocationBubble message={message} onJumpToMessage={onJumpToMessage} />;
    case 'contact':
      return <ContactBubble message={message} onJumpToMessage={onJumpToMessage} />;
    case 'interactive':
      return <InteractiveBubble message={message} onJumpToMessage={onJumpToMessage} />;
    case 'sticker':
      return <StickerBubble message={message} onJumpToMessage={onJumpToMessage} />;
    case 'text':
    default:
      return <TextBubble message={message} onJumpToMessage={onJumpToMessage} />;
  }
}

export const MessageBubble = memo(MessageBubbleComponent);
