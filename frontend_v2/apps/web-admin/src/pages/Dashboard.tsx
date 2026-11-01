import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card } from '@chatlogix/ui';
import { formatPaiseAsRupees } from '../lib/money';
import { getDashboardSummary } from '../lib/vendors';

export function Dashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-dashboard-summary'],
    queryFn: getDashboardSummary,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[#072349] sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Platform health, shop registration overview, and monthly order revenue.
        </p>
      </header>

      {isLoading && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-500">Loading shop counts…</p>
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load shop counts.{' '}
          {error instanceof Error ? error.message : ''}
        </div>
      )}

      {!isLoading && !isError && data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            className="p-5"
            aria-label={`Shops: ${data.totalVendors} all shops`}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Shops
            </h3>
            <p className="mt-2 text-3xl font-bold text-[#072349]">
              {data.totalVendors.toLocaleString('en-IN')}
            </p>
            <p className="mt-1 text-xs text-gray-500">all shops</p>
          </Card>

          <Card
            className="p-5"
            aria-label={`Approved: ${data.approvedVendors} approved`}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Approved
            </h3>
            <p className="mt-2 text-3xl font-bold text-[#072349]">
              {data.approvedVendors.toLocaleString('en-IN')}
            </p>
            <p className="mt-1 text-xs text-gray-500">approved</p>
          </Card>

          <Card
            className="p-5"
            aria-label={`Order revenue: ${formatPaiseAsRupees(data.orderRevenuePaiseMonth)} this month (IST)`}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Order revenue
            </h3>
            <p className="mt-2 text-3xl font-bold text-[#072349]">
              {formatPaiseAsRupees(data.orderRevenuePaiseMonth)}
            </p>
            <p className="mt-1 text-xs text-gray-500">this month (IST)</p>
          </Card>

          <Link
            to="/vendors?status=pending_approval"
            className="group block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label={`Waiting: ${data.pendingApproval} need decision`}
          >
            <Card className="h-full p-5 transition-colors group-hover:border-primary-400 group-hover:shadow-md">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Waiting
                </h3>
                <span className="text-xs font-medium text-primary-600 group-hover:underline">
                  View &rarr;
                </span>
              </div>
              <p className="mt-2 text-3xl font-bold text-[#072349]">
                {data.pendingApproval.toLocaleString('en-IN')}
              </p>
              <p className="mt-1 text-xs text-gray-500">need decision</p>
              <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] leading-relaxed text-gray-400">
                New shops are approved automatically until review is turned on.
              </p>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}


