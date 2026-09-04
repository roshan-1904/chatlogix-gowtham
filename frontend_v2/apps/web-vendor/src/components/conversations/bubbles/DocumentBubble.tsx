import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../types';
import { MessageShell } from './MessageShell';
import { MediaPlaceholder } from './shared/MediaPlaceholder';
import { useAuthenticatedMedia } from './shared/useAuthenticatedMedia';

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
  const isCustomer = message.senderType === 'customer';
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
  const tone = isCustomer ? 'text-gray-700' : 'text-blue-50';

  return (
    <MessageShell message={message} wide onJumpToMessage={onJumpToMessage}>
      <a
        href={objectUrl}
        target="_blank"
        rel="noopener noreferrer"
        download={filename}
        className={`flex items-center gap-3 px-2 py-2 rounded-md ${
          isCustomer ? 'bg-white/60 hover:bg-white/80' : 'bg-white/15 hover:bg-white/25'
        }`}
      >
        <span
          aria-hidden
          className="flex items-center justify-center w-10 h-10 rounded-md bg-white/40 text-xl"
        >
          📄
        </span>
        <span className="flex flex-col min-w-0">
          <span className="truncate text-sm font-medium">{filename}</span>
          <span className={`text-[11px] ${tone}`}>
            {sizeLabel ? `${sizeLabel} · ` : ''}
            {t('media.downloadFile')}
          </span>
        </span>
      </a>
      {media?.caption ? (
        <div className="mt-1 whitespace-pre-wrap break-words">{media.caption}</div>
      ) : null}
    </MessageShell>
  );
}

export const DocumentBubble = memo(DocumentBubbleComponent);
