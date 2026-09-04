import { memo } from 'react';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { useAuthenticatedMedia } from './shared/useAuthenticatedMedia';
import { useMediaGallery } from '../MediaGalleryContext';
import { MessageText } from './shared/MessageText';

interface VideoBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function VideoBubbleComponent({ message, onJumpToMessage }: VideoBubbleProps) {
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
          aria-label="Play video"
        >
          <video
            src={objectUrl}
            preload="metadata"
            muted
            playsInline
            className="w-full max-h-80 object-cover bg-black"
            style={
              media?.width && media?.height
                ? { aspectRatio: `${media.width} / ${media.height}` }
                : undefined
            }
          >
            <track kind="captions" />
          </video>
          <span className="absolute inset-0 flex items-center justify-center bg-black/15 group-hover:bg-black/25 transition-colors">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white ring-2 ring-white/80">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M7 5v14l12-7z" />
              </svg>
            </span>
          </span>
        </button>
      ) : (
        <MediaPlaceholder
          state={error ? 'failed' : media?.state ?? 'pending'}
          width={media?.width}
          height={media?.height}
          icon="video"
        />
      )}
      {caption ? (
        <div className="px-1.5 pt-1.5 whitespace-pre-wrap break-words text-[14.2px] leading-[1.55]">
          <MessageText text={caption} />
        </div>
      ) : null}
    </MessageShell>
  );
}

export const VideoBubble = memo(VideoBubbleComponent);
