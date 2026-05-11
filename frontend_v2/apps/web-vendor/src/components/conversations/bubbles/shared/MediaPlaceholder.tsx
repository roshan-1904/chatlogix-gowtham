import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaFetchState } from '../../types';

interface MediaPlaceholderProps {
  readonly state: MediaFetchState;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly icon?: 'image' | 'video' | 'audio' | 'document' | 'sticker';
}

function MediaPlaceholderComponent({ state, width, height, icon = 'image' }: MediaPlaceholderProps) {
  const { t } = useTranslation('conversations');

  const message =
    state === 'failed'
      ? t('media.failed')
      : state === 'expired'
      ? t('media.expired')
      : t('media.loading');

  const aspect =
    width && height && width > 0 && height > 0
      ? { aspectRatio: `${width} / ${height}` }
      : { minHeight: '120px' };

  const iconChar =
    icon === 'video'
      ? '🎬'
      : icon === 'audio'
      ? '🎵'
      : icon === 'document'
      ? '📄'
      : icon === 'sticker'
      ? '🩹'
      : '🖼️';

  const isError = state === 'failed' || state === 'expired';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      style={aspect}
      className={`flex flex-col items-center justify-center w-full max-w-[260px] rounded-md border ${
        isError ? 'bg-gray-200 border-gray-300 text-gray-600' : 'bg-gray-100 border-gray-200 text-gray-500 animate-pulse'
      }`}
    >
      <span className="text-2xl" aria-hidden>
        {iconChar}
      </span>
      <span className="mt-1 text-xs px-2 text-center">{message}</span>
    </div>
  );
}

export const MediaPlaceholder = memo(MediaPlaceholderComponent);
