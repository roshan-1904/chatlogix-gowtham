import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { vendorSnippet } from '../../utils/vendorDisplayText';
import type { MessageReplyPreview } from '../../types';
import type { BubbleVariant } from './bubbleChrome';

interface QuotedReplyPreviewProps {
  readonly replyTo?: MessageReplyPreview | null;
  readonly variant: BubbleVariant;
  readonly onJumpTo?: (messageId: string) => void;
}

function QuotedReplyPreviewComponent({ replyTo, variant, onJumpTo }: QuotedReplyPreviewProps) {
  const { t } = useTranslation('conversations');

  if (!replyTo) return null;

  const isMissing = !replyTo.id;
  const isOutgoing = variant === 'outgoing';
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
      className={`block w-full text-left mb-1.5 rounded-md border-l-[3px] border-[#25D366] px-2 py-1 text-xs ${
        isOutgoing ? 'bg-[#cde9c9] text-[#111b21]' : 'bg-[#f5f6f6] text-[#111b21]'
      } ${isMissing || !onJumpTo ? 'cursor-default' : 'cursor-pointer hover:brightness-[0.97]'}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#00a884]">
        {t('reply.previewLabel', { sender: senderLabel })}
      </div>
      <div className="truncate text-[#3b4a54]">
        {isMissing
          ? t('reply.missing')
          : vendorSnippet(replyTo.contentPreview, replyTo.contentEn) || t('reply.missing')}
      </div>
    </button>
  );
}

export const QuotedReplyPreview = memo(QuotedReplyPreviewComponent);
