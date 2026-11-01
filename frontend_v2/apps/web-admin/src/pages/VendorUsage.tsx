import { useState, useMemo, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Button } from '@chatlogix/ui';
import { formatWalletAmount } from '../lib/money';
import {
  getVendorUsage,
  getLast7DaysPreset,
  getThisMonthPreset,
  type VendorUsageResponse,
} from '../lib/usage';

function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateDaySpan(fromStr: string, toStr: string): number | null {
  const f = parseDateInput(fromStr);
  const t = parseDateInput(toStr);
  if (!f || !t) return null;
  const diffMs = t.getTime() - f.getTime();
  return Math.round(diffMs / 86400000) + 1;
}

function formatDateDisplay(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  const day = parts[2];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[monthIdx] || parts[1]} ${year}`;
}

function formatIstTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return isoString;
    // Format to HH:MM in IST (+05:30)
    const istMs = d.getTime() + 19800000;
    const istDate = new Date(istMs);
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

export function VendorUsage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const [searchParams] = useSearchParams();

  const defaultPreset = useMemo(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (fromParam && toParam && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) && /^\d{4}-\d{2}-\d{2}$/.test(toParam)) {
      return { from: fromParam, to: toParam };
    }
    return getLast7DaysPreset();
  }, [searchParams]);

  const [preset, setPreset] = useState<'last7' | 'thisMonth' | 'custom'>('custom');
  const [fromInput, setFromInput] = useState<string>(defaultPreset.from);
  const [toInput, setToInput] = useState<string>(defaultPreset.to);
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string }>(defaultPreset);
  const [selectedDay, setSelectedDay] = useState<string | undefined>(undefined);

  // Synchronize when search params change
  useEffect(() => {
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (fromParam && toParam) {
      setFromInput(fromParam);
      setToInput(toParam);
      setAppliedRange({ from: fromParam, to: toParam });
      setSelectedDay(undefined);
    }
  }, [searchParams]);

  const validationError = useMemo<string | null>(() => {
    if (!fromInput || !toInput) return 'Please enter both start and end dates.';
    const f = parseDateInput(fromInput);
    const t = parseDateInput(toInput);
    if (!f || !t) return 'Invalid date format (use YYYY-MM-DD).';
    if (f.getTime() > t.getTime()) return 'Start date cannot be after end date.';
    const days = calculateDaySpan(fromInput, toInput);
    if (days !== null && days > 31) return 'Date range cannot exceed 31 calendar days.';
    return null;
  }, [fromInput, toInput]);

  const handleSelectPreset = (newPreset: 'last7' | 'thisMonth') => {
    const range = newPreset === 'last7' ? getLast7DaysPreset() : getThisMonthPreset();
    setPreset(newPreset);
    setFromInput(range.from);
    setToInput(range.to);
    setAppliedRange(range);
    setSelectedDay(undefined);
  };

  const handleApplyCustomDates = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (validationError) return;
    setPreset('custom');
    setAppliedRange({ from: fromInput, to: toInput });
    setSelectedDay(undefined);
  };

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<VendorUsageResponse, Error>({
    queryKey: ['admin-vendor-usage', vendorId, appliedRange.from, appliedRange.to, selectedDay],
    queryFn: () => {
      if (!vendorId) throw new Error('Vendor ID is required');
      return getVendorUsage({
        vendorId,
        from: appliedRange.from,
        to: appliedRange.to,
        day: selectedDay,
      });
    },
    enabled: !!vendorId,
    staleTime: 60 * 1000,
  });

  const totals = data?.totals;
  const is404 = isError && (error.message.includes('404') || error.message.includes('not_found'));

  return (
    <div className="space-y-6">
      {/* Navigation header */}
      <div>
        <Link
          to={`/usage?from=${appliedRange.from}&to=${appliedRange.to}`}
          className="text-xs font-medium text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-1"
        >
          <span>&larr;</span>
          <span>All shops</span>
        </Link>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#072349] sm:text-3xl">
              {data?.businessName || (isLoading ? 'Loading shop…' : 'Shop Usage')}
            </h1>
            <p className="mt-0.5 text-xs text-gray-500">
              Vendor ID:{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[11px] text-gray-600">
                {vendorId}
              </code>{' '}
              &bull;{' '}
              <Link
                to={`/vendors`}
                className="text-primary-600 hover:underline"
              >
                View in Vendors &rarr;
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Date range controls */}
      <Card className="p-4 sm:p-5">
        <form onSubmit={handleApplyCustomDates}>
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Date range
            </legend>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => handleSelectPreset('last7')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    preset === 'last7'
                      ? 'bg-white text-[#072349] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Last 7 days
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectPreset('thisMonth')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    preset === 'thisMonth'
                      ? 'bg-white text-[#072349] shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  This month
                </button>
              </div>

              <span className="text-xs text-gray-400">or</span>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="vendor-usage-from" className="text-xs text-gray-600 font-medium">
                    From:
                  </label>
                  <input
                    type="date"
                    id="vendor-usage-from"
                    value={fromInput}
                    onChange={(e) => {
                      setFromInput(e.target.value);
                      setPreset('custom');
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <label htmlFor="vendor-usage-to" className="text-xs text-gray-600 font-medium">
                    To:
                  </label>
                  <input
                    type="date"
                    id="vendor-usage-to"
                    value={toInput}
                    onChange={(e) => {
                      setToInput(e.target.value);
                      setPreset('custom');
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <Button
                  type="submit"
                  variant="secondary"
                  size="sm"
                  disabled={!!validationError || isFetching}
                  className="text-xs"
                >
                  Apply
                </Button>
              </div>
            </div>

            {validationError ? (
              <p className="mt-2 text-xs font-medium text-amber-700" role="alert">
                ⚠️ {validationError}
              </p>
            ) : null}

            <p className="mt-2 text-xs text-gray-500">
              Active range:{' '}
              <span className="font-medium text-gray-700">
                {formatDateDisplay(appliedRange.from)} – {formatDateDisplay(appliedRange.to)}
              </span>{' '}
              (IST)
            </p>
          </fieldset>
        </form>
      </Card>

      {/* Loading state */}
      {isLoading && (
        <Card className="p-6 text-center">
          <p className="text-sm text-gray-500">Loading shop usage…</p>
        </Card>
      )}

      {/* Missing shop / 404 state */}
      {is404 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm font-semibold text-amber-900">No shop has that id.</p>
          <p className="mt-1 text-xs text-amber-700">
            The requested vendor could not be found or has been removed.
          </p>
          <div className="mt-4">
            <Link
              to="/usage"
              className="inline-flex items-center text-xs font-medium text-primary-700 hover:underline"
            >
              &larr; Back to Usage
            </Link>
          </div>
        </div>
      )}

      {/* General Error state */}
      {isError && !is404 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Could not load shop usage.</p>
              <p className="mt-0.5 text-xs text-red-600">
                {error instanceof Error ? error.message : 'An unexpected error occurred.'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                void refetch();
              }}
              className="self-start sm:self-center"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Success data state */}
      {!isLoading && !isError && data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="p-5" aria-label="Charged">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Charged
              </h3>
              <p className="mt-2 text-3xl font-bold text-[#072349]">
                {formatWalletAmount(totals?.chargedMilli)}
              </p>
              <p className="mt-1 text-xs text-gray-500">total wallet charges</p>
            </Card>

            <Card className="p-5" aria-label="OpenAI cost">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                OpenAI cost
              </h3>
              <p className="mt-2 text-3xl font-bold text-[#072349]">
                {totals?.openAiCostMilli !== null && totals?.openAiCostMilli !== undefined
                  ? formatWalletAmount(totals.openAiCostMilli)
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                before markup
                {totals?.hasIncompleteCost && (
                  <span className="block text-amber-600 text-[11px] mt-0.5">
                    Note: Some charges missing legacy cost
                  </span>
                )}
              </p>
            </Card>
          </div>

          {/* Grid of Source breakdown and Day breakdown */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Source breakdown */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-[#072349]">By source</h2>
              <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">By source</caption>
                    <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <tr>
                        <th scope="col" className="px-5 py-3">Source</th>
                        <th scope="col" className="px-5 py-3 text-right">Charged</th>
                        <th scope="col" className="px-5 py-3 text-right">Charges</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {data.bySource.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-5 py-6 text-center text-xs text-gray-400">
                            No charges in this range.
                          </td>
                        </tr>
                      ) : (
                        data.bySource.map((s) => (
                          <tr key={s.source} className="hover:bg-gray-50/50">
                            <td className="px-5 py-3 font-medium text-gray-900">{s.label || s.source}</td>
                            <td className="px-5 py-3 text-right font-medium text-gray-900">
                              {formatWalletAmount(s.chargedMilli)}
                            </td>
                            <td className="px-5 py-3 text-right text-gray-600">{s.count.toLocaleString('en-IN')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Day breakdown */}
            <div className="space-y-3">
              <h2 className="text-lg font-bold text-[#072349]">By day</h2>
              <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">By day</caption>
                    <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      <tr>
                        <th scope="col" className="px-5 py-3">Date (IST)</th>
                        <th scope="col" className="px-5 py-3 text-right">Charged</th>
                        <th scope="col" className="px-5 py-3 text-right">Charges</th>
                        <th scope="col" className="px-5 py-3 text-center">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {data.byDay.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-5 py-6 text-center text-xs text-gray-400">
                            No daily breakdown in this range.
                          </td>
                        </tr>
                      ) : (
                        data.byDay.map((d) => {
                          const isCurrentSelected = data.selectedDay === d.day;
                          return (
                            <tr
                              key={d.day}
                              className={`transition-colors ${
                                isCurrentSelected ? 'bg-primary-50/60 font-semibold' : 'hover:bg-gray-50/50'
                              }`}
                            >
                              <td className="px-5 py-3 text-gray-900">
                                {formatDateDisplay(d.day)}
                              </td>
                              <td className="px-5 py-3 text-right text-gray-900">
                                {formatWalletAmount(d.chargedMilli)}
                              </td>
                              <td className="px-5 py-3 text-right text-gray-600">
                                {d.count.toLocaleString('en-IN')}
                              </td>
                              <td className="px-5 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setSelectedDay(d.day)}
                                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                                    isCurrentSelected
                                      ? 'bg-primary-600 text-white'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  {isCurrentSelected ? 'Selected' : 'View'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>

          {/* Charges on selected day inspector (max 100) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#072349]">
                Charges on {formatDateDisplay(data.selectedDay)}{' '}
                <span className="text-xs font-normal text-gray-400">(max 100)</span>
              </h2>
            </div>

            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Charges on selected day</caption>
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th scope="col" className="px-5 py-3">Time (IST)</th>
                      <th scope="col" className="px-5 py-3">Source</th>
                      <th scope="col" className="px-5 py-3 text-right">Charged</th>
                      <th scope="col" className="px-5 py-3 text-right">OpenAI cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {data.charges.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-6 text-center text-xs text-gray-400">
                          No charges recorded on this day.
                        </td>
                      </tr>
                    ) : (
                      data.charges.map((charge) => (
                        <tr key={charge.id} className="hover:bg-gray-50/50">
                          <td className="px-5 py-3 font-mono text-xs text-gray-700">
                            {formatIstTime(charge.time)}
                          </td>
                          <td className="px-5 py-3 text-gray-900">
                            {charge.sourceLabel || charge.source}
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900">
                            {formatWalletAmount(charge.chargedMilli)}
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-700">
                            {charge.openAiCostMilli !== null && charge.openAiCostMilli !== undefined
                              ? formatWalletAmount(charge.openAiCostMilli)
                              : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
