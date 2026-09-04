import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaFetchState } from '../../types';

interface MediaPlaceholderProps {
  readonly state: MediaFetchState;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly icon?: 'image' | 'video' | 'audio' | 'document' | 'sticker';
}

function PlaceholderIcon({ icon }: { icon: MediaPlaceholderProps['icon'] }) {
  const common = 'w-7 h-7';
  if (icon === 'video') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="6" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M17 10l4-2v8l-4-2V10z" fill="currentColor" />
      </svg>
    );
  }
  if (icon === 'audio') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z" />
      </svg>
    );
  }
  if (icon === 'document') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (icon === 'sticker') {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 14c1.2 1.4 2.5 2 4 2s2.8-.6 4-2" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="9.5" cy="10" r="1" fill="currentColor" />
        <circle cx="14.5" cy="10" r="1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="9" r="1.2" fill="currentColor" />
    </svg>
  );
}

function MediaPlaceholderComponent({
  state,
  width,
  height,
  icon = 'image',
}: MediaPlaceholderProps) {
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
      : { minHeight: '132px' };

  const isError = state === 'failed' || state === 'expired';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      style={aspect}
      className={`flex w-full min-w-[180px] flex-col items-center justify-center rounded-[10px] ${
        isError
          ? 'bg-[#f5f6f6] text-[#667781]'
          : 'bg-[#f5f6f6] text-[#8696a0] animate-pulse'
      }`}
    >
      <PlaceholderIcon icon={icon} />
      <span className="mt-2 px-3 text-center text-xs">{message}</span>
    </div>
  );
}

export const MediaPlaceholder = memo(MediaPlaceholderComponent);
