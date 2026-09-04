import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageReactionGroup } from '../../types';

interface ReactionChipsProps {
  readonly reactions?: MessageReactionGroup[];
  readonly align: 'start' | 'end';
}

function ReactionChipsComponent({ reactions, align }: ReactionChipsProps) {
  const { t } = useTranslation('conversations');
  if (!reactions || reactions.length === 0) return null;

  return (
    <div
      className={`relative z-[1] flex flex-wrap gap-1 -mt-2.5 mb-1 px-1 ${
        align === 'end' ? 'justify-end' : 'justify-start'
      }`}
    >
      {reactions.map((group) => {
        const tooltip =
          group.count === 1
            ? t('reactions.tooltipSingle', { name: group.reactorIds[0] ?? '', emoji: group.emoji })
            : t('reactions.tooltipMultiple', {
                names: group.reactorIds.slice(0, 3).join(', '),
                emoji: group.emoji
              });
        return (
          <span
            key={group.emoji}
            title={tooltip}
            className={
              group.count > 1
                ? 'inline-flex h-7 w-auto items-center justify-center gap-1 rounded-full border border-black/10 bg-white px-2 shadow-[0_1px_2px_rgba(11,20,26,0.18)] transition-transform duration-150 ease-out hover:scale-105'
                : 'inline-flex h-7 w-7 aspect-square items-center justify-center rounded-full border border-black/10 bg-white shadow-[0_1px_2px_rgba(11,20,26,0.18)] transition-transform duration-150 ease-out hover:scale-105'
            }
          >
            <span aria-hidden className="reaction-emoji">
              {group.emoji}
            </span>
            {group.count > 1 ? (
              <span className="min-w-[0.75rem] text-center text-[11px] font-medium leading-none text-gray-700">
                {group.count}
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export const ReactionChips = memo(ReactionChipsComponent);
