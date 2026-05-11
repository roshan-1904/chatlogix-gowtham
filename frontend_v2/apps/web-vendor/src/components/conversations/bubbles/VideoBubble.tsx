import { memo, useState } from 'react';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { Lightbox } from './shared/Lightbox';

interface VideoBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function VideoBubbleComponent({ message, onJumpToMessage }: VideoBubbleProps) {
  const [open, setOpen] = useState(false);
  const media = message.media ?? null;
  const isReady = media?.state === 'ready' && Boolean(media.mediaUrl);
  const caption = media?.caption ?? message.content;

  return (
    <>
      <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
        {isReady && media?.mediaUrl ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative block w-full overflow-hidden rounded-md focus:outline-none"
            aria-label="Play video"
          >
            <video
              src={media.mediaUrl}
              preload="metadata"
              muted
              playsInline
              className="w-full max-h-80 object-cover bg-black"
              style={
                media.width && media.height
                  ? { aspectRatio: `${media.width} / ${media.height}` }
                  : undefined
              }
            >
              <track kind="captions" />
            </video>
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex items-center justify-center w-12 h-12 rounded-full bg-black/55 text-white">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M7 5v14l12-7z" />
                </svg>
              </span>
            </span>
          </button>
        ) : (
          <MediaPlaceholder
            state={media?.state ?? 'pending'}
            width={media?.width}
            height={media?.height}
            icon="video"
          />
        )}
        {caption ? (
          <div className="mt-1 whitespace-pre-wrap break-words">{caption}</div>
        ) : null}
      </MessageShell>
      {isReady && media?.mediaUrl ? (
        <Lightbox
          open={open}
          onClose={() => setOpen(false)}
          mediaUrl={media.mediaUrl}
          mimeType={media.mimeType ?? 'video/mp4'}
          filename={media.filename}
        />
      ) : null}
    </>
  );
}

export const VideoBubble = memo(VideoBubbleComponent);
