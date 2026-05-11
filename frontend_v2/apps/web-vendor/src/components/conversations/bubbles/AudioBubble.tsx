import { memo } from 'react';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { AudioPlayer } from './shared/AudioPlayer';

interface AudioBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function AudioBubbleComponent({ message, onJumpToMessage }: AudioBubbleProps) {
  const isCustomer = message.senderType === 'customer';
  const tone: 'light' | 'dark' = isCustomer ? 'dark' : 'light';
  const media = message.media ?? null;
  const isReady = media?.state === 'ready' && Boolean(media.mediaUrl);

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      {isReady && media?.mediaUrl ? (
        <AudioPlayer src={media.mediaUrl} durationSec={media.durationSec} tone={tone} />
      ) : (
        <MediaPlaceholder state={media?.state ?? 'pending'} icon="audio" />
      )}
    </MessageShell>
  );
}

export const AudioBubble = memo(AudioBubbleComponent);
