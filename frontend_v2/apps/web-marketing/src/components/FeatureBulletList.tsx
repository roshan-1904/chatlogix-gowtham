import type { ComponentType } from 'react';

export interface FeatureBullet {
  id: string;
  title: string;
  body: string;
}

interface FeatureBulletListProps {
  items: readonly FeatureBullet[];
  iconById: Record<string, { Icon: ComponentType<{ className?: string }>; wrap: string }>;
  compact?: boolean;
}

export function FeatureBulletList({ items, iconById, compact = false }: FeatureBulletListProps) {
  return (
    <ul className={compact ? 'space-y-2.5' : 'space-y-4'}>
      {items.map((bullet) => {
        const config = iconById[bullet.id];
        if (!config) return null;
        const { Icon, wrap } = config;
        return (
          <li key={bullet.id} className="flex gap-2.5">
            <span
              className={`mt-0.5 flex shrink-0 items-center justify-center rounded-lg ${wrap} ${
                compact ? 'h-8 w-8' : 'h-10 w-10 rounded-xl'
              }`}
            >
              <Icon className={compact ? 'h-4 w-4 shrink-0' : 'h-5 w-5 shrink-0'} />
            </span>
            <div className="min-w-0">
              <p className={`font-semibold text-primary-500 ${compact ? 'text-[13px] sm:text-[14px]' : 'text-sm'}`}>
                {bullet.title}
              </p>
              <p className={`leading-snug text-slate-600 ${compact ? 'mt-0.5 text-[12px] sm:text-[13px]' : 'mt-0.5 text-sm'}`}>
                {bullet.body}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
