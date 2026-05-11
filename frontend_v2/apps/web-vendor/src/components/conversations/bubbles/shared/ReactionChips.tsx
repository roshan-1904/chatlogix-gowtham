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
      className={`flex flex-wrap gap-1 mt-1 ${align === 'end' ? 'justify-end' : 'justify-start'}`}
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
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/95 border border-gray-200 shadow-sm text-xs leading-none transition-transform duration-150 ease-out hover:scale-105"
          >
            <span aria-hidden>{group.emoji}</span>
            {group.count > 1 ? (
              <span className="text-gray-700 text-[11px] font-medium">{group.count}</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

export const ReactionChips = memo(ReactionChipsComponent);
