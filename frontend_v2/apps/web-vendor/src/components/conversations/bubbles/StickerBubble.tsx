import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { useAuthenticatedMedia } from './shared/useAuthenticatedMedia';

interface StickerBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function StickerBubbleComponent({ message, onJumpToMessage }: StickerBubbleProps) {
  const { t } = useTranslation('conversations');
  const media = message.media ?? null;
  const isReady = media?.state === 'ready' && Boolean(media.mediaUrl);
  const { objectUrl, error } = useAuthenticatedMedia(isReady ? media?.mediaUrl : null);

  return (
    <MessageShell
      message={message}
      chromeless={isReady && Boolean(objectUrl) && !error}
      wide
      onJumpToMessage={onJumpToMessage}
    >
      {isReady && objectUrl && !error ? (
        <img
          src={objectUrl}
          alt={t('sticker.label')}
          className="w-32 h-32 object-contain"
          loading="lazy"
        />
      ) : (
        <MediaPlaceholder state={error ? 'failed' : media?.state ?? 'pending'} icon="sticker" />
      )}
    </MessageShell>
  );
}

export const StickerBubble = memo(StickerBubbleComponent);
