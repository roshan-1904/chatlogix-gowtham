import { memo } from 'react';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { AudioPlayer } from './shared/AudioPlayer';
import { useAuthenticatedMedia } from './shared/useAuthenticatedMedia';

interface AudioBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function AudioBubbleComponent({ message, onJumpToMessage }: AudioBubbleProps) {
  const isCustomer = message.senderType === 'customer';
  const tone: 'light' | 'dark' = isCustomer ? 'dark' : 'light';
  const media = message.media ?? null;
  const isReady = media?.state === 'ready' && Boolean(media.mediaUrl);
  const { objectUrl, error } = useAuthenticatedMedia(isReady ? media?.mediaUrl : null);

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      {isReady && objectUrl && !error ? (
        <AudioPlayer src={objectUrl} durationSec={media?.durationSec} tone={tone} />
      ) : (
        <MediaPlaceholder state={error ? 'failed' : media?.state ?? 'pending'} icon="audio" />
      )}
    </MessageShell>
  );
}

export const AudioBubble = memo(AudioBubbleComponent);
