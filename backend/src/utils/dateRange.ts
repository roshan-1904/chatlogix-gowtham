/**
 * Date Range Utility
 * Handles date range calculations for dashboard filtering
 * Supports presets and custom ranges with Indian financial year support
 */

export type DateRangePreset = 'thisWeek' | 'thisMonth' | 'last3Months' | 'last6Months' | 'thisFinancialYear' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
  preset: DateRangePreset;
  label: string;
}

/**
 * Get date range based on preset and optional custom dates
 * @param preset - Date range preset
 * @param startDate - Optional start date string (YYYY-MM-DD) for custom range
 * @param endDate - Optional end date string (YYYY-MM-DD) for custom range
 * @returns DateRange object with start, end, preset, and label
 * @throws Error if custom range is missing dates or exceeds 1 year
 */
export function getDateRange(preset: DateRangePreset, startDate?: string, endDate?: string): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let start: Date;
  let end: Date = new Date(today);
  end.setHours(23, 59, 59, 999); // End of today
  
  switch (preset) {
    case 'thisWeek': {
      const dayOfWeek = today.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
      start = new Date(today);
      start.setDate(today.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    
    case 'thisMonth': {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    
    case 'last3Months': {
      start = new Date(today);
      start.setMonth(today.getMonth() - 3);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    
    case 'last6Months': {
      start = new Date(today);
      start.setMonth(today.getMonth() - 6);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    
    case 'thisFinancialYear': {
      const fyDates = getFinancialYearDates(today);
      start = fyDates.start;
      end = fyDates.end > today ? end : fyDates.end;
      break;
    }
    
    case 'custom': {
      if (!startDate || !endDate) {
        throw new Error('startDate and endDate required for custom range');
      }
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      // Validate: max 1 year range
      const maxEnd = new Date(start);
      maxEnd.setFullYear(maxEnd.getFullYear() + 1);
      if (end > maxEnd) {
        throw new Error('Date range cannot exceed 1 year');
      }
      break;
    }
    
    default:
      // Default to thisMonth
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
  }
  
  const label = formatDateRangeLabel(start, end, preset);
  
  return { start, end, preset, label };
}

/**
 * Get Indian financial year dates (April 1 - March 31)
 * @param date - Reference date
 * @returns Object with start and end dates of financial year
 */
function getFinancialYearDates(date: Date): { start: Date; end: Date } {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  let fyStart: Date;
  let fyEnd: Date;
  
  if (month >= 3) { // April (3) to December (11)
    fyStart = new Date(year, 3, 1); // April 1
    fyEnd = new Date(year + 1, 2, 31, 23, 59, 59, 999); // March 31 next year
  } else { // January (0) to March (2)
    fyStart = new Date(year - 1, 3, 1); // April 1 previous year
    fyEnd = new Date(year, 2, 31, 23, 59, 59, 999); // March 31 current year
  }
  
  return { start: fyStart, end: fyEnd };
}

/**
 * Format date range label for display
 * @param start - Start date
 * @param end - End date
 * @param preset - Date range preset
 * @returns Human-readable label string
 */
function formatDateRangeLabel(start: Date, end: Date, preset: DateRangePreset): string {
  if (preset === 'custom') {
    return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  
  const presetLabels: Record<DateRangePreset, string> = {
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    last3Months: 'Last 3 Months',
    last6Months: 'Last 6 Months',
    thisFinancialYear: 'This Financial Year',
    custom: formatDateRangeLabel(start, end, 'custom')
  };
  
  return presetLabels[preset] || 'This Month';
}

