import { Button } from '@chatlogix/ui';
import type { DateRangePreset } from '../../types/dashboard';

interface DateRangeFilterProps {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  onDateRangeChange: (preset: DateRangePreset, startDate?: string, endDate?: string) => void;
}

export function DateRangeFilter({
  preset,
  startDate,
  endDate,
  onDateRangeChange,
}: DateRangeFilterProps) {
  const presets: Array<{ value: DateRangePreset; label: string }> = [
    { value: 'thisWeek', label: 'This Week' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'last3Months', label: 'Last 3 Months' },
    { value: 'last6Months', label: 'Last 6 Months' },
    { value: 'thisFinancialYear', label: 'This Financial Year' },
    { value: 'custom', label: 'Custom Range' }
  ];

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPreset = e.target.value as DateRangePreset;
    if (newPreset === 'custom') {
      // Open custom date picker modal
      // For now, keep existing dates if set
      onDateRangeChange(newPreset, startDate, endDate);
    } else {
      onDateRangeChange(newPreset);
    }
  };

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Date range filter">
      <label htmlFor="date-range-preset" className="sr-only">
        Select date range preset
      </label>
      <select
        id="date-range-preset"
        value={preset}
        onChange={handlePresetChange}
        className="min-w-[180px] px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        aria-label="Date range preset"
      >
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {preset === 'custom' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // TODO: Open custom date range picker modal
            // Implementation would use a date picker library
            alert('Custom date picker coming soon');
          }}
          aria-label="Open custom date range picker"
        >
          Select dates
        </Button>
      )}
    </div>
  );
}

