import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface LightboxProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly mediaUrl: string;
  readonly mimeType?: string | null;
  readonly filename?: string | null;
}

function LightboxComponent({ open, onClose, mediaUrl, mimeType, filename }: LightboxProps) {
  const { t } = useTranslation('conversations');

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const isVideo = (mimeType ?? '').startsWith('video/');

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label={t('lightbox.close')}
        className="absolute top-4 right-4 text-white text-2xl leading-none w-9 h-9 rounded-full bg-white/10 hover:bg-white/20"
        onClick={onClose}
      >
        ×
      </button>
      <div
        className="max-w-[95vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={mediaUrl}
            controls
            autoPlay
            className="max-w-[95vw] max-h-[90vh] rounded shadow-lg"
          >
            <track kind="captions" />
          </video>
        ) : (
          <img
            src={mediaUrl}
            alt={filename ?? ''}
            className="max-w-[95vw] max-h-[90vh] rounded shadow-lg object-contain"
          />
        )}
      </div>
    </div>
  );
}

export const Lightbox = memo(LightboxComponent);
