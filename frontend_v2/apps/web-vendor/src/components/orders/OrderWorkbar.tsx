import { useEffect, useRef, useState } from 'react';
import { Input } from '@chatlogix/ui';
import { debounce } from '@chatlogix/utils';
import { IconChevronDown } from '../icons';
import { DATE_PRESETS, SEARCH_DEBOUNCE_MS, SORT_OPTIONS } from '../../utils/orderConstants';
import type { PaymentFilter } from '../../utils/orderPayment';

const STATUS_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'All statuses' },
  { id: 'pending', label: 'Pending' },
  { id: 'awaiting_payment', label: 'Awaiting payment' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
  { id: 'out_for_delivery', label: 'Out for delivery' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

const PAYMENT_OPTIONS: Array<{ id: PaymentFilter; label: string }> = [
  { id: 'all', label: 'All payments' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'link_sent', label: 'Link sent' },
  { id: 'upi_sent', label: 'UPI sent' },
  { id: 'paid', label: 'Paid' },
  { id: 'cash', label: 'Cash' },
];

const SORT_CHOICES: Array<{ id: string; label: string }> = [
  { id: SORT_OPTIONS.NEWEST_FIRST, label: 'Newest' },
  { id: SORT_OPTIONS.OLDEST_FIRST, label: 'Oldest' },
  { id: SORT_OPTIONS.AMOUNT_HIGH_TO_LOW, label: 'Amount high–low' },
  { id: SORT_OPTIONS.AMOUNT_LOW_TO_HIGH, label: 'Amount low–high' },
];

interface OrderWorkbarProps {
  searchQuery: string;
  statusFilter: string;
  paymentFilter: PaymentFilter;
  datePreset: string | null;
  sortBy: string;
  viewMode: 'table' | 'card';
  onSearchChange: (query: string) => void;
  onStatusFilterChange: (status: string) => void;
  onPaymentFilterChange: (filter: PaymentFilter) => void;
  onDatePresetChange: (preset: string | null) => void;
  onSortChange: (sort: string) => void;
  onViewModeChange: (mode: 'table' | 'card') => void;
  onClearFilters: () => void;
}

function rangeLabel(options: Array<{ id: string; label: string }>, id: string, fallback: string): string {
  return options.find((option) => option.id === id)?.label ?? fallback;
}

export function OrderWorkbar({
  searchQuery,
  statusFilter,
  paymentFilter,
  datePreset,
  sortBy,
  viewMode,
  onSearchChange,
  onStatusFilterChange,
  onPaymentFilterChange,
  onDatePresetChange,
  onSortChange,
  onViewModeChange,
  onClearFilters,
}: OrderWorkbarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [openMenu, setOpenMenu] = useState<'status' | 'payment' | 'sort' | null>(null);

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const run = debounce((query: string) => {
      onSearchChange(query);
    }, SEARCH_DEBOUNCE_MS);
    run(localSearch);
    // The debounced callback is recreated each render; search text is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearch]);

  const filtersActive =
    statusFilter !== 'all' ||
    paymentFilter !== 'all' ||
    !!datePreset ||
    localSearch.trim().length > 0;

  const statusLabel = statusFilter === 'all' ? 'Status' : rangeLabel(STATUS_OPTIONS, statusFilter, 'Status');
  const paymentLabel = paymentFilter === 'all' ? 'Payment' : rangeLabel(PAYMENT_OPTIONS, paymentFilter, 'Payment');
  const sortLabel = rangeLabel(SORT_CHOICES, sortBy, 'Sort');

  return (
    <div className="relative z-20 mb-4 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <div className="w-full min-w-0 sm:w-56 lg:w-64 lg:flex-none">
          <Input
            type="search"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            placeholder="Search orders"
            aria-label="Search orders"
            className="h-9 w-full px-3 py-1.5"
          />
        </div>
        <FilterMenu
          label={statusLabel}
          open={openMenu === 'status'}
          onToggle={() => setOpenMenu((current) => (current === 'status' ? null : 'status'))}
          onClose={() => setOpenMenu(null)}
          options={STATUS_OPTIONS}
          value={statusFilter}
          onSelect={(id) => {
            onStatusFilterChange(id);
            setOpenMenu(null);
          }}
        />
        <FilterMenu
          label={paymentLabel}
          open={openMenu === 'payment'}
          onToggle={() => setOpenMenu((current) => (current === 'payment' ? null : 'payment'))}
          onClose={() => setOpenMenu(null)}
          options={PAYMENT_OPTIONS}
          value={paymentFilter}
          onSelect={(id) => {
            onPaymentFilterChange(id as PaymentFilter);
            setOpenMenu(null);
          }}
        />
        <div className="inline-flex w-fit shrink-0 rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Date range">
          {(
            [
              [DATE_PRESETS.TODAY, 'Today'],
              [DATE_PRESETS.THIS_WEEK, 'Week'],
              [DATE_PRESETS.THIS_MONTH, 'Month'],
            ] as const
          ).map(([id, label]) => {
            const selected = datePreset === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => onDatePresetChange(selected ? null : id)}
                className={`h-8 rounded-md border px-3 text-xs font-medium ${
                  selected
                    ? 'border-primary-500 bg-white text-primary-500'
                    : 'border-transparent bg-white text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <FilterMenu
          label={sortLabel}
          open={openMenu === 'sort'}
          onToggle={() => setOpenMenu((current) => (current === 'sort' ? null : 'sort'))}
          onClose={() => setOpenMenu(null)}
          options={SORT_CHOICES}
          value={sortBy}
          menuLabel="Sort orders"
          align="right"
          onSelect={(id) => {
            onSortChange(id);
            setOpenMenu(null);
          }}
        />
        <div className="inline-flex shrink-0 rounded-lg border border-gray-200 bg-white p-0.5" role="group" aria-label="Order layout">
          <button
            type="button"
            aria-label="Table view"
            aria-pressed={viewMode === 'table'}
            onClick={() => onViewModeChange('table')}
            className={`flex h-8 w-8 items-center justify-center rounded-md ${
              viewMode === 'table' ? 'text-primary-500' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <TableIcon />
          </button>
          <button
            type="button"
            aria-label="Card view"
            aria-pressed={viewMode === 'card'}
            onClick={() => onViewModeChange('card')}
            className={`flex h-8 w-8 items-center justify-center rounded-md ${
              viewMode === 'card' ? 'text-primary-500' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <CardsIcon />
          </button>
        </div>
        {filtersActive && (
          <button
            type="button"
            onClick={onClearFilters}
            className="h-8 shrink-0 px-2 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function FilterMenu({
  label,
  open,
  onToggle,
  onClose,
  options,
  value,
  onSelect,
  menuLabel,
  align = 'left',
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  options: Array<{ id: string; label: string }>;
  value: string;
  onSelect: (id: string) => void;
  menuLabel?: string;
  align?: 'left' | 'right';
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel ?? label}
        onClick={onToggle}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50"
      >
        {label}
        <IconChevronDown className="h-4 w-4 text-gray-500" />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-30 mt-1 min-w-[11rem] rounded-lg border border-gray-200 bg-white py-1 shadow-sm ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === value}
              onClick={() => onSelect(option.id)}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                option.id === value ? 'font-medium text-primary-500' : 'text-gray-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TableIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CardsIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}
