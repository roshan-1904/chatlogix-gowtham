import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@chatlogix/ui';
import type { DateRangePreset } from '../../types/dashboard';

interface DateRangeFilterProps {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  onDateRangeChange: (preset: DateRangePreset, startDate?: string, endDate?: string) => void;
}

const MAX_CUSTOM_RANGE_DAYS = 90;

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
    { value: 'custom', label: 'Custom Range' },
  ];

  const [customStart, setCustomStart] = useState(startDate || '');
  const [customEnd, setCustomEnd] = useState(endDate || '');

  // Keep internal state in sync with props
  useEffect(() => {
    if (startDate) setCustomStart(startDate);
    if (endDate) setCustomEnd(endDate);
  }, [startDate, endDate]);

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newPreset = e.target.value as DateRangePreset;
    if (newPreset === 'custom') {
      // Default to last 30 days if custom dates not already provided
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const defaultStart = startDate || thirtyDaysAgo.toISOString().split('T')[0];
      const defaultEnd = endDate || today.toISOString().split('T')[0];
      setCustomStart(defaultStart);
      setCustomEnd(defaultEnd);
      onDateRangeChange('custom', defaultStart, defaultEnd);
    } else {
      onDateRangeChange(newPreset);
    }
  };

  const handleApplyCustomRange = () => {
    if (!customStart || !customEnd) {
      toast.error('Please specify both start and end dates.');
      return;
    }

    const start = new Date(customStart);
    const end = new Date(customEnd);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      toast.error('Please enter valid dates.');
      return;
    }

    if (start > end) {
      toast.error('Start date must be before or equal to end date.');
      return;
    }

    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_CUSTOM_RANGE_DAYS) {
      toast.error(`Custom date range cannot exceed ${MAX_CUSTOM_RANGE_DAYS} days.`);
      return;
    }

    onDateRangeChange('custom', customStart, customEnd);
    toast.success('Custom date range applied');
  };

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range filter">
      <label htmlFor="date-range-preset" className="sr-only">
        Select date range preset
      </label>
      <select
        id="date-range-preset"
        value={preset}
        onChange={handlePresetChange}
        className="min-w-[160px] px-3 py-1.5 border border-gray-300 rounded-lg bg-white text-xs sm:text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        aria-label="Date range preset"
      >
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>

      {preset === 'custom' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1">
            <label htmlFor="custom-start-date" className="text-xs text-gray-500 font-medium">
              From:
            </label>
            <input
              id="custom-start-date"
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500"
              aria-label="Start date"
            />
          </div>

          <div className="flex items-center gap-1">
            <label htmlFor="custom-end-date" className="text-xs text-gray-500 font-medium">
              To:
            </label>
            <input
              id="custom-end-date"
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500"
              aria-label="End date"
            />
          </div>

          <Button
            size="sm"
            onClick={handleApplyCustomRange}
            className="px-2.5 py-1 text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-md shadow-2xs"
            aria-label="Apply custom date range"
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
