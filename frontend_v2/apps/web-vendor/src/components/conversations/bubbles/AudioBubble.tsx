import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { AudioPlayer } from './shared/AudioPlayer';
import { useAuthenticatedMedia } from './shared/useAuthenticatedMedia';
import { getBubbleVariant } from './shared/bubbleChrome';
import { DualLanguageMessageText } from './shared/MessageText';

interface AudioBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function AudioBubbleComponent({ message, onJumpToMessage }: AudioBubbleProps) {
  const { t } = useTranslation('conversations');
  const variant = getBubbleVariant(message.senderType);
  const media = message.media ?? null;
  const isReady = media?.state === 'ready' && Boolean(media.mediaUrl);
  const { objectUrl, error } = useAuthenticatedMedia(isReady ? media?.mediaUrl : null);
  const transcript = message.content.trim();

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      {isReady && objectUrl && !error ? (
        <AudioPlayer src={objectUrl} durationSec={media?.durationSec} variant={variant} />
      ) : (
        <MediaPlaceholder state={error ? 'failed' : media?.state ?? 'pending'} icon="audio" />
      )}
      {transcript ? (
        <div className="mt-2 border-t border-black/[0.06] pt-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#667781]">
            {t('audio.transcriptLabel')}
          </div>
          <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-[#3b4a54]">
            <DualLanguageMessageText original={transcript} contentEn={message.contentEn} />
          </div>
        </div>
      ) : null}
    </MessageShell>
  );
}

export const AudioBubble = memo(AudioBubbleComponent);
