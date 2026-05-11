import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Message } from '../../types';

interface StatusTickProps {
  readonly status?: Message['status'];
  readonly failureReason?: string | null;
  readonly tone?: 'light' | 'dark';
}

function StatusTickComponent({ status, failureReason, tone = 'light' }: StatusTickProps) {
  const { t } = useTranslation('conversations');

  if (!status || status === 'pending' || status === 'processing') return null;

  const baseColor = tone === 'light' ? 'text-blue-100' : 'text-gray-500';

  if (status === 'failed') {
    const tooltip = failureReason
      ? t('status.failedTooltip', { reason: failureReason })
      : t('status.failed');
    return (
      <span
        role="img"
        aria-label={tooltip}
        title={tooltip}
        className="inline-flex items-center text-red-400"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="16.5" r="1" fill="currentColor" />
        </svg>
      </span>
    );
  }

  // sent: single tick, delivered: double tick, read: double blue tick
  if (status === 'sent') {
    return (
      <span aria-label={t('status.sent')} title={t('status.sent')} className={baseColor}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  const isRead = status === 'read';
  const colorClass = isRead ? 'text-sky-300' : baseColor;
  const label = isRead ? t('status.read') : t('status.delivered');
  return (
    <span aria-label={label} title={label} className={colorClass}>
      <svg width="16" height="14" viewBox="0 0 28 24" fill="none" aria-hidden>
        <path d="M3 13l4 4 9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 13l4 4 10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export const StatusTick = memo(StatusTickComponent);
