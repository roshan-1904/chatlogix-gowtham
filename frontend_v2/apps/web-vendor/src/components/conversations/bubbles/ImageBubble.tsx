import { memo } from 'react';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { useAuthenticatedMedia } from './shared/useAuthenticatedMedia';
import { useMediaGallery } from '../MediaGalleryContext';

interface ImageBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function ImageBubbleComponent({ message, onJumpToMessage }: ImageBubbleProps) {
  const media = message.media ?? null;
  const isReady = media?.state === 'ready' && Boolean(media.mediaUrl);
  const caption = media?.caption ?? message.content;
  const { openGallery } = useMediaGallery();
  const { objectUrl, error } = useAuthenticatedMedia(isReady ? media?.mediaUrl : null);

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      {isReady && objectUrl && !error ? (
        <button
          type="button"
          onClick={() => openGallery(message.id)}
          className="block w-full overflow-hidden rounded-md focus:outline-none"
        >
          <img
            src={objectUrl}
            alt={caption ?? ''}
            loading="lazy"
            style={
              media?.width && media?.height
                ? { aspectRatio: `${media.width} / ${media.height}` }
                : undefined
            }
            className="w-full max-h-80 object-cover"
          />
        </button>
      ) : (
        <MediaPlaceholder
          state={error ? 'failed' : media?.state ?? 'pending'}
          width={media?.width}
          height={media?.height}
          icon="image"
        />
      )}
      {caption ? (
        <div className="mt-1 whitespace-pre-wrap break-words">{caption}</div>
      ) : null}
    </MessageShell>
  );
}

export const ImageBubble = memo(ImageBubbleComponent);
