import { memo, useState } from 'react';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { Lightbox } from './shared/Lightbox';

interface ImageBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function ImageBubbleComponent({ message, onJumpToMessage }: ImageBubbleProps) {
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
            className="block w-full overflow-hidden rounded-md focus:outline-none"
          >
            <img
              src={media.mediaUrl}
              alt={caption ?? ''}
              loading="lazy"
              style={
                media.width && media.height
                  ? { aspectRatio: `${media.width} / ${media.height}` }
                  : undefined
              }
              className="w-full max-h-80 object-cover"
            />
          </button>
        ) : (
          <MediaPlaceholder
            state={media?.state ?? 'pending'}
            width={media?.width}
            height={media?.height}
            icon="image"
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
          mimeType={media.mimeType}
          filename={media.filename}
        />
      ) : null}
    </>
  );
}

export const ImageBubble = memo(ImageBubbleComponent);
