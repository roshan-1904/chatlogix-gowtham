import { useState, useEffect } from 'react';
import { Input, Button } from '@chatlogix/ui';
import { debounce } from '@chatlogix/utils';
import { DATE_PRESETS, SEARCH_DEBOUNCE_MS } from '../../utils/orderConstants';

interface OrderFiltersProps {
  statusFilter: string;
  dateRange: { start?: Date; end?: Date };
  searchQuery: string;
  onStatusFilterChange: (status: string) => void;
  onDateRangeChange: (range: { start?: Date; end?: Date }) => void;
  onSearchChange: (query: string) => void;
  onClearFilters: () => void;
}

export function OrderFilters({
  statusFilter,
  dateRange,
  searchQuery,
  onStatusFilterChange,
  onDateRangeChange,
  onSearchChange,
  onClearFilters,
}: OrderFiltersProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery);

  const debouncedSearch = debounce((query: string) => {
    onSearchChange(query);
  }, SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    debouncedSearch(localSearchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearchQuery]);

  const [activeDatePreset, setActiveDatePreset] = useState<string | null>(null);

  const handleDatePreset = (preset: string) => {
    const now = new Date();
    let start: Date | undefined;
    let end: Date | undefined = new Date();

    // Reset if clicking the same preset
    if (activeDatePreset === preset) {
      setActiveDatePreset(null);
      onDateRangeChange({});
      return;
    }

    switch (preset) {
      case DATE_PRESETS.TODAY:
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        break;
      case DATE_PRESETS.THIS_WEEK:
        start = new Date(now);
        start.setDate(now.getDate() - 7);
        break;
      case DATE_PRESETS.THIS_MONTH:
        start = new Date(now);
        start.setMonth(now.getMonth() - 1);
        break;
      default:
        start = undefined;
        end = undefined;
    }

    setActiveDatePreset(preset);
    onDateRangeChange({ start, end });
  };

  // Reset active preset when date range is cleared externally
  useEffect(() => {
    if (!dateRange.start && !dateRange.end) {
      setActiveDatePreset(null);
    }
  }, [dateRange]);

  const hasActiveFilters = statusFilter !== 'all' || localSearchQuery || dateRange.start || dateRange.end;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Search */}
      <div className="flex-1 min-w-[200px] max-w-xs">
        <Input
          type="text"
          value={localSearchQuery}
          onChange={(e) => setLocalSearchQuery(e.target.value)}
          placeholder="Search orders..."
          className="w-full h-9"
        />
      </div>

      {/* Status Filter */}
      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value)}
        className="h-9 px-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        aria-label="Filter by status"
      >
        <option value="all" className="text-gray-900">All Status</option>
        <option value="pending" className="text-gray-900">Pending</option>
        <option value="confirmed" className="text-gray-900">Confirmed</option>
        <option value="preparing" className="text-gray-900">Preparing</option>
        <option value="ready" className="text-gray-900">Ready</option>
        <option value="out_for_delivery" className="text-gray-900">Out for Delivery</option>
        <option value="delivered" className="text-gray-900">Delivered</option>
        <option value="cancelled" className="text-gray-900">Cancelled</option>
      </select>

      {/* Date Range */}
      <div className="flex gap-1">
        <Button
          variant={activeDatePreset === DATE_PRESETS.TODAY ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => handleDatePreset(DATE_PRESETS.TODAY)}
          className="h-9 px-3 text-xs"
        >
          Today
        </Button>
        <Button
          variant={activeDatePreset === DATE_PRESETS.THIS_WEEK ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => handleDatePreset(DATE_PRESETS.THIS_WEEK)}
          className="h-9 px-3 text-xs"
        >
          Week
        </Button>
        <Button
          variant={activeDatePreset === DATE_PRESETS.THIS_MONTH ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => handleDatePreset(DATE_PRESETS.THIS_MONTH)}
          className="h-9 px-3 text-xs"
        >
          Month
        </Button>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={onClearFilters} 
          className="h-9 px-3 text-xs"
        >
          Clear
        </Button>
      )}
    </div>
  );
}

