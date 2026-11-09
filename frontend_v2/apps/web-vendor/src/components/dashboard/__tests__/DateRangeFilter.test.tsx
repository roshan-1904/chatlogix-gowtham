import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import toast from 'react-hot-toast';
import { DateRangeFilter } from '../DateRangeFilter';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DateRangeFilter (P2.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all presets in dropdown', () => {
    const handleChange = vi.fn();
    render(<DateRangeFilter preset="thisMonth" onDateRangeChange={handleChange} />);

    const select = screen.getByLabelText(/Date range preset/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'This Month' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Custom Range' })).toBeInTheDocument();
  });

  it('triggers onDateRangeChange when non-custom preset is selected', () => {
    const handleChange = vi.fn();
    render(<DateRangeFilter preset="thisMonth" onDateRangeChange={handleChange} />);

    const select = screen.getByLabelText(/Date range preset/i);
    fireEvent.change(select, { target: { value: 'thisWeek' } });

    expect(handleChange).toHaveBeenCalledWith('thisWeek');
  });

  it('displays native date pickers when custom preset is active', () => {
    const handleChange = vi.fn();
    render(
      <DateRangeFilter
        preset="custom"
        startDate="2026-10-01"
        endDate="2026-10-20"
        onDateRangeChange={handleChange}
      />
    );

    expect(screen.getByLabelText(/Start date/i)).toHaveValue('2026-10-01');
    expect(screen.getByLabelText(/End date/i)).toHaveValue('2026-10-20');
    expect(screen.getByRole('button', { name: /Apply custom date range/i })).toBeInTheDocument();
  });

  it('applies custom date range when valid dates are submitted', () => {
    const handleChange = vi.fn();
    render(
      <DateRangeFilter
        preset="custom"
        startDate="2026-10-01"
        endDate="2026-10-20"
        onDateRangeChange={handleChange}
      />
    );

    const startInput = screen.getByLabelText(/Start date/i);
    const endInput = screen.getByLabelText(/End date/i);
    const applyBtn = screen.getByRole('button', { name: /Apply custom date range/i });

    fireEvent.change(startInput, { target: { value: '2026-10-05' } });
    fireEvent.change(endInput, { target: { value: '2026-10-25' } });
    fireEvent.click(applyBtn);

    expect(handleChange).toHaveBeenCalledWith('custom', '2026-10-05', '2026-10-25');
    expect(toast.success).toHaveBeenCalledWith('Custom date range applied');
  });

  it('shows error toast when start date is after end date', () => {
    const handleChange = vi.fn();
    render(
      <DateRangeFilter
        preset="custom"
        startDate="2026-10-25"
        endDate="2026-10-05"
        onDateRangeChange={handleChange}
      />
    );

    const applyBtn = screen.getByRole('button', { name: /Apply custom date range/i });
    fireEvent.click(applyBtn);

    expect(toast.error).toHaveBeenCalledWith('Start date must be before or equal to end date.');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('shows error toast when custom date range exceeds 90 days', () => {
    const handleChange = vi.fn();
    render(
      <DateRangeFilter
        preset="custom"
        startDate="2026-01-01"
        endDate="2026-06-01"
        onDateRangeChange={handleChange}
      />
    );

    const applyBtn = screen.getByRole('button', { name: /Apply custom date range/i });
    fireEvent.click(applyBtn);

    expect(toast.error).toHaveBeenCalledWith('Custom date range cannot exceed 90 days.');
    expect(handleChange).not.toHaveBeenCalled();
  });
});

