import { memo } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('conversations');
  const isCustomer = message.senderType === 'customer';
  const tone: 'light' | 'dark' = isCustomer ? 'dark' : 'light';
  const media = message.media ?? null;
  const isReady = media?.state === 'ready' && Boolean(media.mediaUrl);
  const { objectUrl, error } = useAuthenticatedMedia(isReady ? media?.mediaUrl : null);
  // Whisper transcription can fail (quota, config, garbled audio) independently
  // of the S3 fetch that flips media.state to 'ready' — always show the player
  // so the vendor can fall back to the original audio if the transcript below
  // it looks wrong or is missing entirely.
  const transcript = message.content.trim();
  const transcriptTone = isCustomer ? 'text-gray-700' : 'text-blue-50';
  const labelTone = isCustomer ? 'text-gray-500' : 'text-blue-100';

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      {isReady && objectUrl && !error ? (
        <AudioPlayer src={objectUrl} durationSec={media?.durationSec} tone={tone} />
      ) : (
        <MediaPlaceholder state={error ? 'failed' : media?.state ?? 'pending'} icon="audio" />
      )}
      {transcript ? (
        <div className="mt-2">
          <div className={`text-[10px] uppercase tracking-wide ${labelTone}`}>
            {t('audio.transcriptLabel')}
          </div>
          <div className={`whitespace-pre-wrap break-words ${transcriptTone}`}>{transcript}</div>
        </div>
      ) : null}
    </MessageShell>
  );
}

export const AudioBubble = memo(AudioBubbleComponent);
