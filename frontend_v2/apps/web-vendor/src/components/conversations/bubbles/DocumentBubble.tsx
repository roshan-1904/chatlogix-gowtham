import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { useAuthenticatedMedia } from './shared/useAuthenticatedMedia';
import { innerCardClass } from './shared/bubbleChrome';
import { DualLanguageMessageText } from './shared/MessageText';

interface DocumentBubbleProps {
  readonly message: Message;
  readonly onJumpToMessage?: (messageId: string) => void;
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function DocumentBubbleComponent({ message, onJumpToMessage }: DocumentBubbleProps) {
  const { t } = useTranslation('conversations');
  const media = message.media ?? null;
  const isReady = media?.state === 'ready' && Boolean(media.mediaUrl);
  const { objectUrl, error } = useAuthenticatedMedia(isReady ? media?.mediaUrl : null);

  if (!isReady || !objectUrl || error) {
    return (
      <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
        <MediaPlaceholder state={error ? 'failed' : media?.state ?? 'pending'} icon="document" />
      </MessageShell>
    );
  }

  const filename = media?.filename ?? message.content ?? 'document';
  const sizeLabel = formatBytes(media?.fileSizeBytes);

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      <a
        href={objectUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={filename}
        className={`flex items-center gap-3 rounded-lg px-2 py-2 ${innerCardClass()} hover:bg-black/[0.07]`}
      >
        <span
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-md bg-[#00a884] text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{filename}</span>
          <span className="text-[11px] text-[#667781]">
            {sizeLabel ? `${sizeLabel} · ` : ''}
            {t('media.downloadFile')}
          </span>
        </span>
      </a>
      {media?.caption ? (
        <div className="mt-1.5 whitespace-pre-wrap break-words">
          <DualLanguageMessageText original={media.caption} contentEn={message.contentEn} />
        </div>
      ) : null}
    </MessageShell>
  );
}

export const DocumentBubble = memo(DocumentBubbleComponent);
