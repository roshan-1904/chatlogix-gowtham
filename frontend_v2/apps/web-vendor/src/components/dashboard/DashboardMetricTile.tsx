import { memo, type ReactNode } from 'react';
import { Card } from '@chatlogix/ui';

export interface DashboardMetricTileProps {
  label: string;
  value: string | number;
  subValue?: string;
  caption?: string;
  trend?: 'up' | 'down' | 'neutral' | null;
  icon?: ReactNode;
  onClick?: () => void;
  highlight?: boolean;
}

export const DashboardMetricTile = memo(function DashboardMetricTile({
  label,
  value,
  subValue,
  caption,
  trend,
  icon,
  onClick,
  highlight = false,
}: DashboardMetricTileProps) {
  const interactive = Boolean(onClick);

  const body = (
    <div
      className={`flex flex-col gap-1 ${interactive ? 'cursor-pointer' : ''}`}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={
        interactive
          ? `${label}: ${value}${subValue ? `. ${subValue}` : ''}. Click to view details`
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-xs">{label}</p>
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/5 text-primary-500">
            {icon}
          </span>
        )}
      </div>
      <p
        className={`text-xl font-bold leading-tight sm:text-2xl ${
          highlight ? 'text-secondary-500' : 'text-primary-500'
        }`}
        aria-label={`${label} value is ${value}`}
      >
        {value}
      </p>
      {caption && <p className="text-[10px] text-gray-500 sm:text-xs">{caption}</p>}
      {subValue && (
        <div className="space-y-0.5">
          {subValue.split(' • ').map((item, index) => (
            <p key={index} className="text-[10px] text-gray-500 sm:text-xs">{item}</p>
          ))}
        </div>
      )}
      {trend && trend !== 'neutral' && (
        <p
          className={`text-[10px] font-medium sm:text-xs ${
            trend === 'up' ? 'text-secondary-500' : 'text-red-500'
          }`}
          aria-label={`Trend is ${trend === 'up' ? 'up' : 'down'} compared to yesterday`}
        >
          {trend === 'up' ? 'Up' : 'Down'} vs yesterday
        </p>
      )}
    </div>
  );

  return (
    <Card
      className={`rounded-xl border-gray-200/80 p-3 shadow-sm sm:p-4 ${
        interactive ? 'transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-primary-500/30' : ''
      }`}
    >
      {body}
    </Card>
  );
});
