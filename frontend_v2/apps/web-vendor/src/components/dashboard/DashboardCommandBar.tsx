import { Button, Badge } from '@chatlogix/ui';
import { DateRangeFilter } from './DateRangeFilter';
import { IconRefresh } from './dashboardIcons';
import type { DateRangePreset } from '../../types/dashboard';

interface DashboardCommandBarProps {
  vendorName?: string;
  dateRangePreset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  onDateRangeChange: (preset: DateRangePreset, startDate?: string, endDate?: string) => void;
  lastUpdatedLabel: string;
  isStale: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function DashboardCommandBar({
  vendorName,
  dateRangePreset,
  startDate,
  endDate,
  onDateRangeChange,
  lastUpdatedLabel,
  isStale,
  isRefreshing,
  onRefresh,
}: DashboardCommandBarProps) {
  return (
    <header className="flex flex-col gap-3 sm:gap-4">
      <div>
        <h1 className="text-xl font-bold text-primary-500 sm:text-2xl">Dashboard</h1>
        <p className="text-xs text-gray-500 sm:text-sm">
          {vendorName ? `Welcome back, ${vendorName}` : 'Operations overview for your shop'}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <DateRangeFilter
          preset={dateRangePreset}
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={onDateRangeChange}
        />
        <div className="flex flex-wrap items-center gap-2">
          {isStale && (
            <Badge variant="warning" className="text-[10px] sm:text-xs">Data may be stale</Badge>
          )}
          <span className="text-xs text-gray-500 whitespace-nowrap">Updated {lastUpdatedLabel}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            isLoading={isRefreshing}
            className="text-xs sm:text-sm"
            aria-label="Refresh dashboard data"
          >
            <IconRefresh className="mr-1.5 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>
    </header>
  );
}
