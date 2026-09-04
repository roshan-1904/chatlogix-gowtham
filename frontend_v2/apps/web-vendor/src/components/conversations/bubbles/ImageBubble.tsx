import { memo } from 'react';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { useAuthenticatedMedia } from './shared/useAuthenticatedMedia';
import { useMediaGallery } from '../MediaGalleryContext';
import { DualLanguageMessageText } from './shared/MessageText';

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
    <MessageShell message={message} wide flush onJumpToMessage={onJumpToMessage}>
      {isReady && objectUrl && !error ? (
        <button
          type="button"
          onClick={() => openGallery(message.id)}
          className="group relative block w-full overflow-hidden rounded-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]"
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
          <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
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
        <div className="px-1.5 pt-1.5 whitespace-pre-wrap break-words text-[14.2px] leading-[1.55]">
          <DualLanguageMessageText original={caption} contentEn={message.contentEn} />
        </div>
      ) : null}
    </MessageShell>
  );
}

export const ImageBubble = memo(ImageBubbleComponent);
