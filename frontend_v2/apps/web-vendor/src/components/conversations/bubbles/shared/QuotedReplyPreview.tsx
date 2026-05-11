import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageReplyPreview } from '../../types';

interface QuotedReplyPreviewProps {
  readonly replyTo?: MessageReplyPreview | null;
  readonly tone: 'light' | 'dark';
  readonly onJumpTo?: (messageId: string) => void;
}

function QuotedReplyPreviewComponent({ replyTo, tone, onJumpTo }: QuotedReplyPreviewProps) {
  const { t } = useTranslation('conversations');

  if (!replyTo) return null;

  const isMissing = !replyTo.id;
  const accentClass = tone === 'dark' ? 'border-blue-300' : 'border-blue-500';
  const bgClass = tone === 'dark' ? 'bg-blue-400/30 text-blue-50' : 'bg-gray-50 text-gray-700';
  const senderLabel = replyTo.senderType === 'customer' ? 'customer' : 'you';

  const handleClick = () => {
    if (isMissing || !onJumpTo) return;
    onJumpTo(replyTo.id);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isMissing || !onJumpTo}
      className={`block w-full text-left mb-1 rounded-md border-l-4 ${accentClass} ${bgClass} px-2 py-1 text-xs ${
        isMissing || !onJumpTo ? 'cursor-default' : 'cursor-pointer hover:brightness-95'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide opacity-80">
        {t('reply.previewLabel', { sender: senderLabel })}
      </div>
      <div className="truncate">
        {isMissing ? t('reply.missing') : replyTo.contentPreview || t('reply.missing')}
      </div>
    </button>
  );
}

export const QuotedReplyPreview = memo(QuotedReplyPreviewComponent);
