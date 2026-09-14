import { Button } from '@chatlogix/ui';
import { useTranslation } from 'react-i18next';
import type { PendingReplyTarget } from './types';
import { vendorSnippet } from './utils/vendorDisplayText';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  disabled: boolean;
  error: string | null;
  replyTo?: PendingReplyTarget | null;
  onClearReply?: () => void;
}

export function MessageInput({
  value,
  onChange,
  onSend,
  onKeyPress,
  disabled,
  error,
  replyTo,
  onClearReply,
}: MessageInputProps) {
  const { t } = useTranslation('conversations');
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    onKeyPress(e as unknown as React.KeyboardEvent);
  };

  const replyPreview = replyTo
    ? vendorSnippet(replyTo.contentPreview, replyTo.contentEn) || t('reply.missing')
    : null;

  return (
    <div className="border-t border-[#d1d7db] bg-[#f0f2f5] px-3 py-2.5">
      {replyTo && replyPreview ? (
        <div className="mb-2 flex items-start gap-2 rounded-lg border-l-4 border-[#00a884] bg-white px-3 py-2 text-sm shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-[#00a884]">
              {t('reply.previewLabel', { sender: 'customer' })}
            </p>
            <p className="truncate text-[#111b21]">{replyPreview}</p>
          </div>
          {onClearReply ? (
            <button
              type="button"
              onClick={onClearReply}
              className="shrink-0 rounded p-1 text-[#667781] hover:bg-[#f0f2f5]"
              aria-label={t('reply.clear')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message"
          disabled={disabled}
          rows={1}
          className="max-h-24 flex-1 resize-none rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-[#111b21] shadow-sm placeholder:text-[#667781] focus:outline-none focus:ring-0 disabled:opacity-60"
        />
        <Button
          onClick={onSend}
          disabled={!value.trim() || disabled}
          aria-label="Send message"
          className={`flex h-11 w-11 items-center justify-center rounded-full p-0 ${
            value.trim()
              ? 'bg-[#00a884] text-white hover:bg-[#029a78]'
              : 'cursor-default bg-[#d1d7db] text-white'
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </Button>
      </div>
      {error ? <div className="mt-1 px-1 text-xs text-red-600">{error}</div> : null}
    </div>
  );
}
