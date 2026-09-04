import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaGallery } from '../../MediaGalleryContext';
import { useAuthenticatedMedia } from './useAuthenticatedMedia';

/**
 * Shared full-screen media viewer, mounted once per conversation via
 * MediaGalleryProvider. Mirrors WhatsApp's chat media viewer: click any
 * image/video to open it, then page through every other image/video in the
 * conversation with the arrows, the keyboard, or swipe-equivalent buttons.
 */
function MediaGalleryComponent() {
  const { t } = useTranslation('conversations');
  const { items, activeIndex, close, next, prev } = useMediaGallery();
  const activeItem = activeIndex >= 0 ? items[activeIndex] : null;
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < items.length - 1;

  const { objectUrl, isLoading, error } = useAuthenticatedMedia(activeItem?.mediaUrl);

  useEffect(() => {
    if (!activeItem) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && hasPrev) prev();
      else if (e.key === 'ArrowRight' && hasNext) next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeItem, hasPrev, hasNext, close, prev, next]);

  if (!activeItem) return null;

  const isVideo = activeItem.type === 'video';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0b141a]/92 backdrop-blur-[2px]"
      onClick={close}
    >
      {items.length > 1 && (
        <div className="absolute top-4 left-4 text-white/80 text-sm tabular-nums select-none">
          {t('lightbox.counter', { current: activeIndex + 1, total: items.length })}
        </div>
      )}

      <div className="absolute top-4 right-4 flex items-center gap-2">
        {objectUrl && !error ? (
          <a
            href={objectUrl}
            download={activeItem.filename ?? undefined}
            onClick={(e) => e.stopPropagation()}
            aria-label={t('media.downloadFile')}
            className="flex items-center justify-center text-white text-lg leading-none w-9 h-9 rounded-full bg-white/10 hover:bg-white/20"
          >
            ⭳
          </a>
        ) : null}
        <button
          type="button"
          aria-label={t('lightbox.close')}
          className="flex items-center justify-center text-white text-2xl leading-none w-9 h-9 rounded-full bg-white/10 hover:bg-white/20"
          onClick={close}
        >
          ×
        </button>
      </div>

      {hasPrev && (
        <button
          type="button"
          aria-label={t('lightbox.previous')}
          className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 flex items-center justify-center text-white text-3xl leading-none w-11 h-11 rounded-full bg-white/10 hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            prev();
          }}
        >
          ‹
        </button>
      )}

      {hasNext && (
        <button
          type="button"
          aria-label={t('lightbox.next')}
          className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 flex items-center justify-center text-white text-3xl leading-none w-11 h-11 rounded-full bg-white/10 hover:bg-white/20"
          onClick={(e) => {
            e.stopPropagation();
            next();
          }}
        >
          ›
        </button>
      )}

      <div
        className="max-w-[95vw] max-h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {error ? (
          <div className="text-white/70 text-sm">{t('media.failed')}</div>
        ) : !objectUrl || isLoading ? (
          <div className="text-white/70 text-sm animate-pulse">{t('media.loading')}</div>
        ) : isVideo ? (
          <video
            key={objectUrl}
            src={objectUrl}
            controls
            autoPlay
            className="max-w-[95vw] max-h-[85vh] rounded shadow-lg"
          >
            <track kind="captions" />
          </video>
        ) : (
          <img
            key={objectUrl}
            src={objectUrl}
            alt={activeItem.filename ?? ''}
            className="max-w-[95vw] max-h-[85vh] rounded shadow-lg object-contain"
          />
        )}
      </div>

      {activeItem.caption ? (
        <div
          className="max-w-[90vw] mt-3 text-center text-white/90 text-sm whitespace-pre-wrap break-words"
          onClick={(e) => e.stopPropagation()}
        >
          {activeItem.caption}
        </div>
      ) : null}
    </div>
  );
}

export const MediaGallery = memo(MediaGalleryComponent);
