import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Button } from '@chatlogix/ui';
import { formatWalletAmount } from '../lib/money';
import {
  getPlatformUsage,
  getLast7DaysPreset,
  getThisMonthPreset,
  exportPlatformUsageCsv,
  triggerBlobDownload,
  calculateUsageMargin,
  type PlatformUsageResponse,
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
  return Math.round(diffMs / 86400000) + 1; // inclusive count of calendar days
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

export function Usage() {
  const defaultPreset = useMemo(() => getLast7DaysPreset(), []);

  const [preset, setPreset] = useState<'last7' | 'thisMonth' | 'custom'>('last7');
  const [fromInput, setFromInput] = useState<string>(defaultPreset.from);
  const [toInput, setToInput] = useState<string>(defaultPreset.to);

  // Active query parameters sent to the server
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string }>(defaultPreset);
  const [page, setPage] = useState<number>(1);
  const limit = 25;

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Validation error state for custom date inputs
  const validationError = useMemo<string | null>(() => {
    if (!fromInput || !toInput) {
      return 'Please enter both start and end dates.';
    }
    const f = parseDateInput(fromInput);
    const t = parseDateInput(toInput);
    if (!f || !t) {
      return 'Invalid date format (use YYYY-MM-DD).';
    }
    if (f.getTime() > t.getTime()) {
      return 'Start date cannot be after end date.';
    }
    const days = calculateDaySpan(fromInput, toInput);
    if (days !== null && days > 31) {
      return 'Date range cannot exceed 31 calendar days.';
    }
    return null;
  }, [fromInput, toInput]);

  const handleSelectPreset = (newPreset: 'last7' | 'thisMonth') => {
    const range = newPreset === 'last7' ? getLast7DaysPreset() : getThisMonthPreset();
    setPreset(newPreset);
    setFromInput(range.from);
    setToInput(range.to);
    setAppliedRange(range);
    setPage(1);
    setExportError(null);
  };

  const handleApplyCustomDates = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (validationError) return;
    setPreset('custom');
    setAppliedRange({ from: fromInput, to: toInput });
    setPage(1);
    setExportError(null);
  };

  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const { filename, blob } = await exportPlatformUsageCsv({
        from: appliedRange.from,
        to: appliedRange.to,
      });
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Could not export usage CSV.');
    } finally {
      setIsExporting(false);
    }
  };

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<PlatformUsageResponse, Error>({
    queryKey: ['admin-platform-usage', appliedRange.from, appliedRange.to, page, limit],
    queryFn: () => getPlatformUsage({ from: appliedRange.from, to: appliedRange.to, page, limit }),
    staleTime: 60 * 1000,
  });

  const totals = data?.totals;
  const margin = useMemo(
    () => calculateUsageMargin(totals?.chargedMilli, totals?.openAiCostMilli, totals?.hasIncompleteCost),
    [totals?.chargedMilli, totals?.openAiCostMilli, totals?.hasIncompleteCost]
  );
  const isRangeEmpty =
    !isLoading &&
    !isError &&
    data &&
    totals?.chargedMilli === 0 &&
    data.byVendor.length === 0 &&
    data.bySource.length === 0;

  return (
    <div className="space-y-6">
      {/* 1. Title + Subtitle + Export Button */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#072349] sm:text-3xl">Usage</h1>
          <p className="mt-1 text-sm text-gray-500">
            Wallet charges and what they cost us. Amounts are in rupees.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            id="export-usage-csv-btn"
            variant="secondary"
            size="sm"
            onClick={() => {
              void handleExportCsv();
            }}
            disabled={isExporting || isLoading}
            aria-label="Export platform usage data as CSV"
            className="inline-flex items-center gap-1.5 text-xs font-medium"
          >
            {isExporting ? (
              <>
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"
                  aria-hidden="true"
                />
                Exporting…
              </>
            ) : (
              <>
                <svg
                  className="h-3.5 w-3.5 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Export CSV
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Export Error Alert */}
      {exportError && (
        <div
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center justify-between"
          role="alert"
        >
          <span>⚠️ {exportError}</span>
          <button
            type="button"
            onClick={() => setExportError(null)}
            className="text-red-500 hover:text-red-700 font-bold ml-2"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Date-range controls */}
      <Card className="p-4 sm:p-5">
        <form onSubmit={handleApplyCustomDates}>
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Date range
            </legend>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* Presets */}
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  id="preset-last-7-days"
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
                  id="preset-this-month"
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

              {/* Custom date inputs */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="usage-from-date" className="text-xs text-gray-600 font-medium">
                    From:
                  </label>
                  <input
                    type="date"
                    id="usage-from-date"
                    value={fromInput}
                    onChange={(e) => {
                      setFromInput(e.target.value);
                      setPreset('custom');
                    }}
                    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <label htmlFor="usage-to-date" className="text-xs text-gray-600 font-medium">
                    To:
                  </label>
                  <input
                    type="date"
                    id="usage-to-date"
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

            {/* Validation warning */}
            {validationError ? (
              <p className="mt-2 text-xs font-medium text-amber-700" role="alert">
                ⚠️ {validationError}
              </p>
            ) : null}

            {/* Active range info */}
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
          <p className="text-sm text-gray-500">Loading usage…</p>
        </Card>
      )}

      {/* Error state */}
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Could not load usage.</p>
              <p className="mt-0.5 text-xs text-red-600">
                {error instanceof Error ? error.message : 'An unexpected error occurred while fetching usage data.'}
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

      {/* Data display */}
      {!isLoading && !isError && data && (
        <>
          {/* Empty State Banner if no charges */}
          {isRangeEmpty && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
              No charges in this range.
            </div>
          )}

          {/* 3. KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5" aria-label="Charged to shops">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Charged to shops
              </h3>
              <p className="mt-2 text-3xl font-bold text-[#072349]">
                {formatWalletAmount(totals?.chargedMilli)}
              </p>
              <p className="mt-1 text-xs text-gray-500">billed to shops</p>
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
              <p className="mt-1 text-xs text-gray-500">our AI provider cost</p>
            </Card>

            <Card
              className="p-5"
              aria-label={`Margin %: ${margin.formatted} (${margin.caption}, not vendor markup)`}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Margin %
              </h3>
              <p className="mt-2 text-3xl font-bold text-[#072349]">
                {margin.formatted}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {margin.caption}
              </p>
            </Card>

            <Card className="p-5" aria-label="Trial credit granted">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Trial credit granted
              </h3>
              <p className="mt-2 text-3xl font-bold text-[#072349]">
                {formatWalletAmount(totals?.trialGrantedMilli)}
              </p>
              <p className="mt-1 text-xs text-gray-500">onboarding grants</p>
            </Card>
          </div>

          {/* 4. Meta absorbed card */}
          <Card className="p-5 border-l-4 border-l-sky-500 bg-sky-50/20">
            <h3 className="text-sm font-semibold text-[#072349]">Meta cost we absorb</h3>
            <div className="mt-2 space-y-1 text-sm text-gray-700">
              <p>
                {data.meta.conversationCount === 0 ? (
                  'No conversations started in this range.'
                ) : (
                  <>
                    <span className="font-semibold text-[#072349]">
                      {data.meta.conversationCount.toLocaleString('en-IN')}
                    </span>{' '}
                    conversations in this range.
                  </>
                )}
              </p>
              <p>
                Charged to shops for Meta:{' '}
                <span className="font-semibold text-emerald-700">
                  {formatWalletAmount(data.meta.chargedToVendorsForMetaMilli)}
                </span>
              </p>
              <p className="text-xs text-gray-500">
                Meta&apos;s own bill is not stored. ChatLogix absorbs it.
              </p>
            </div>
          </Card>

          {/* 5. Source breakdown table */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-[#072349]">Source breakdown</h2>
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Source breakdown</caption>
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th scope="col" className="px-5 py-3">
                        Source
                      </th>
                      <th scope="col" className="px-5 py-3 text-right">
                        Charged
                      </th>
                      <th scope="col" className="px-5 py-3 text-right">
                        Charges
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {data.bySource.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-5 py-6 text-center text-xs text-gray-400">
                          No source breakdown available for this range.
                        </td>
                      </tr>
                    ) : (
                      data.bySource.map((row) => (
                        <tr key={row.source} className="hover:bg-gray-50/50">
                          <td className="px-5 py-3 font-medium text-gray-900">
                            {row.label || row.source}
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900">
                            {formatWalletAmount(row.chargedMilli)}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">
                            {row.count.toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* 6. Shop usage table */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#072349]">Shops</h2>
                <p className="text-xs text-gray-500">
                  Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.totalVendors} total)
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  id="export-shops-csv-btn"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    void handleExportCsv();
                  }}
                  disabled={isExporting || isLoading}
                  aria-label="Export all matching shops usage data as CSV"
                  className="inline-flex items-center gap-1.5 text-xs font-medium"
                >
                  {isExporting ? 'Exporting…' : 'Export CSV'}
                </Button>
                <span className="text-xs text-gray-400">sort: Charged ↓</span>
              </div>
            </div>

            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Usage by shop</caption>
                  <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th scope="col" className="px-5 py-3">
                        Shop
                      </th>
                      <th scope="col" className="px-5 py-3 text-right">
                        Charged
                      </th>
                      <th scope="col" className="px-5 py-3 text-right">
                        Charges
                      </th>
                      <th scope="col" className="px-5 py-3">
                        Top source
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {data.byVendor.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-5 py-6 text-center text-xs text-gray-400">
                          No shops with charges in this range.
                        </td>
                      </tr>
                    ) : (
                      data.byVendor.map((vendor) => (
                        <tr key={vendor.vendorId} className="hover:bg-gray-50/50">
                          <td className="px-5 py-3">
                            <Link
                              to={`/usage/${vendor.vendorId}?from=${appliedRange.from}&to=${appliedRange.to}`}
                              className="font-medium text-primary-600 hover:text-primary-800 hover:underline flex items-center gap-1"
                            >
                              <span>{vendor.businessName || 'Unnamed Shop'}</span>
                              <span aria-hidden="true">&rarr;</span>
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-gray-900">
                            {formatWalletAmount(vendor.chargedMilli)}
                          </td>
                          <td className="px-5 py-3 text-right text-gray-600">
                            {vendor.count.toLocaleString('en-IN')}
                          </td>
                          <td className="px-5 py-3 text-gray-600">
                            {vendor.topSource}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {data.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-3">
                  <div className="text-xs text-gray-500">
                    Showing {(data.pagination.page - 1) * limit + 1} to{' '}
                    {Math.min(data.pagination.page * limit, data.pagination.totalVendors)} of{' '}
                    {data.pagination.totalVendors} shops
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={data.pagination.page <= 1 || isFetching}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-xs font-medium text-gray-700">
                      {data.pagination.page} / {data.pagination.totalPages}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={data.pagination.page >= data.pagination.totalPages || isFetching}
                      onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* 7. Billing footer link */}
          <div className="border-t border-gray-200 pt-4 text-xs text-gray-500">
            Edit fees, trial grant, and the exchange rate.{' '}
            <Link to="/billing" className="font-medium text-primary-600 hover:underline">
              &rarr; /billing
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
