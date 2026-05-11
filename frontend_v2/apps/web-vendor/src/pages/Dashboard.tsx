import { lazy, Suspense, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@chatlogix/ui';
import { DashboardStatCard } from '../components/dashboard/DashboardStatCard';
import { CreditsCard } from '../components/dashboard/CreditsCard';
import { DateRangeFilter } from '../components/dashboard/DateRangeFilter';
import { DashboardSkeleton } from '../components/dashboard/DashboardSkeleton';
import { DashboardErrorBoundary } from '../components/dashboard/DashboardErrorBoundary';
import { EmptyOrders, EmptyConversations } from '../components/dashboard/EmptyStates';
import { RecentConversationsWidget } from '../components/dashboard/RecentConversationsWidget';
import { RecentOrdersWidget } from '../components/dashboard/RecentOrdersWidget';
import { QuickActionsPanel } from '../components/dashboard/QuickActionsPanel';
import { useDashboardStats } from '../hooks/dashboard/useDashboardStats';
import { formatAmountWithSymbol } from '../utils/currency';

// Lazy load chart components for better performance
const CreditsBreakdownChart = lazy(() => import('../components/dashboard/CreditsBreakdownChart').then(m => ({ default: m.CreditsBreakdownChart })));
const CreditsUsageTrendChart = lazy(() => import('../components/dashboard/CreditsUsageTrendChart').then(m => ({ default: m.CreditsUsageTrendChart })));
const OrderStatusChart = lazy(() => import('../components/dashboard/OrderStatusChart').then(m => ({ default: m.OrderStatusChart })));

// Chart loading fallback
const ChartSkeleton = () => (
  <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200 animate-pulse">
    <p className="text-sm text-gray-500">Loading chart...</p>
  </div>
);

function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Never';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function Dashboard() {
  const navigate = useNavigate();
  const {
    stats,
    isLoading,
    error,
    lastUpdated,
    refetch,
    dateRangePreset,
    startDate,
    endDate,
    setDateRange,
  } = useDashboardStats();

  // All hooks must be called before any conditional returns
  const isStale = useMemo(() => lastUpdated ? Date.now() - lastUpdated.getTime() > 60000 : false, [lastUpdated]);
  
  // Memoize formatted values to avoid recalculation on every render
  // Use optional chaining and provide defaults to handle undefined stats
  const formattedRevenueTotal = useMemo(() => stats ? formatAmountWithSymbol(stats.revenue.total) : '', [stats?.revenue.total]);
  const formattedRevenueToday = useMemo(() => stats ? formatAmountWithSymbol(stats.revenue.today) : '', [stats?.revenue.today]);
  const formattedRevenueThisMonth = useMemo(() => stats ? formatAmountWithSymbol(stats.revenue.thisMonth) : '', [stats?.revenue.thisMonth]);

  if (isLoading && !stats) {
    return (
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">Dashboard</h1>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 sm:mb-6">Dashboard</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <p className="text-sm sm:text-base text-red-800">{error}</p>
          <Button onClick={refetch} variant="primary" className="mt-3 sm:mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <DashboardErrorBoundary>
      <main className="space-y-3 sm:space-y-4 pb-4" role="main" aria-label="Vendor dashboard">
        {/* Header */}
        <header className="flex flex-col gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#072349] mb-0.5">Dashboard</h1>
            <p className="text-xs sm:text-sm text-gray-500">Overview of your business performance</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
            <DateRangeFilter
              preset={dateRangePreset}
              startDate={startDate}
              endDate={endDate}
              onDateRangeChange={setDateRange}
              dateRangeLabel={stats.dateRange.label}
            />
            <div className="flex flex-wrap items-center gap-2">
              {isStale && (
                <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded whitespace-nowrap">⚠️ Data may be stale</span>
              )}
              <span className="text-xs text-gray-500 whitespace-nowrap">
                Updated {formatTimeAgo(lastUpdated)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={refetch}
                isLoading={isLoading}
                className="text-xs sm:text-sm"
                aria-label="Refresh dashboard data"
              >
                <span aria-hidden="true">🔄</span> Refresh
              </Button>
            </div>
          </div>
        </header>

        {/* Top Metrics Cards */}
        <section aria-label="Key metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
          <DashboardStatCard
            label="Total Orders"
            value={stats.orders.total}
            subValue={`Today: ${stats.orders.today} • Pending: ${stats.orders.pending}`}
            trend={stats.orders.trend?.direction}
            onClick={() => navigate('/orders')}
          />
          <DashboardStatCard
            label="Revenue"
            value={formattedRevenueTotal}
            subValue={`Today: ${formattedRevenueToday} • This Month: ${formattedRevenueThisMonth}`}
            trend={stats.revenue.trend?.direction}
            onClick={() => navigate('/orders')}
          />
          <CreditsCard
            planCredits={stats.credits.planCredits}
            usedThisMonth={stats.credits.usedThisMonth}
            remainingThisMonth={stats.credits.remainingThisMonth}
            walletBalance={stats.credits.walletBalance}
            planName={stats.credits.planName}
            lowBalanceWarning={stats.credits.lowBalanceWarning}
            billingCycleEnd={stats.credits.billingCycleEnd}
          />
          <DashboardStatCard
            label="Products"
            value={stats.products.total}
            subValue={`Active: ${stats.products.active} • Out of Stock: ${stats.products.outOfStock}`}
            onClick={() => navigate('/catalog')}
          />
        </section>

        {/* Conversation Insights Section */}
        <section aria-label="Conversation insights" className="space-y-3">
          <div className="border-b border-gray-200 pb-2 sm:pb-3 pt-2">
            <h2 className="text-lg sm:text-xl font-semibold text-[#072349] mb-1">Conversation Insights</h2>
            <p className="text-xs text-gray-500">Track your customer engagement metrics</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* Left Side - 40% (2 columns out of 5) */}
            <div className="lg:col-span-2 space-y-2 sm:space-y-3">
              <DashboardStatCard
                label="Total Conversations"
                value={stats.conversations.total}
              />
              <DashboardStatCard
                label="Active Conversations"
                value={stats.conversations.active}
                subValue={`Today: ${stats.conversations.today}`}
              />
              <DashboardStatCard
                label="Conversion Rate"
                value={`${stats.conversations.conversionRate.toFixed(1)}%`}
                subValue={`${stats.conversations.withOrders} with orders`}
              />
            </div>

            {/* Right Side - 60% (3 columns out of 5) */}
            <div className="lg:col-span-3 flex flex-col">
              {stats.conversations.recentActivity.length > 0 ? (
                <RecentConversationsWidget conversations={stats.conversations.recentActivity} />
              ) : (
                <EmptyConversations />
              )}
            </div>
          </div>
        </section>

        {/* Credits Visualizations */}
        <section aria-label="Credits analytics" className="space-y-3">
          <div className="border-b border-gray-200 pb-2 sm:pb-3 pt-2">
            <h2 className="text-lg sm:text-xl font-semibold text-[#072349] mb-1">Credits Analytics</h2>
            <p className="text-xs text-gray-500">Credit usage breakdown and trends</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Credits Breakdown by Type</h3>
              <Suspense fallback={<ChartSkeleton />}>
                <CreditsBreakdownChart breakdown={stats.credits.breakdown} />
              </Suspense>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Usage Trend & Projection</h3>
              <Suspense fallback={<ChartSkeleton />}>
                <CreditsUsageTrendChart
                  usageTrends={stats.credits.usageTrends}
                  projectedMonthlyUsage={stats.credits.projectedMonthlyUsage}
                  planCredits={stats.credits.planCredits}
                />
              </Suspense>
            </div>
          </div>
        </section>

        {/* Order Status Chart */}
        {stats.orders.statusBreakdown.length > 0 && (
          <section aria-label="Order status distribution" className="space-y-3">
            <div className="border-b border-gray-200 pb-2 sm:pb-3 pt-2">
              <h2 className="text-lg sm:text-xl font-semibold text-[#072349] mb-1">Order Status Distribution</h2>
              <p className="text-xs text-gray-500">Orders by status within selected date range</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
              <Suspense fallback={<ChartSkeleton />}>
                <OrderStatusChart statusBreakdown={stats.orders.statusBreakdown} />
              </Suspense>
            </div>
          </section>
        )}

        {/* Recent Orders & Quick Actions */}
        <section aria-label="Recent orders and quick actions" className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
          {stats.recentOrders.length > 0 ? (
            <div className="lg:col-span-2 space-y-2">
              <div className="border-b border-gray-200 pb-2 sm:pb-3 pt-2">
                <h2 className="text-lg sm:text-xl font-semibold text-[#072349] mb-1">Recent Orders</h2>
                <p className="text-xs text-gray-500">Latest customer orders</p>
              </div>
              <RecentOrdersWidget orders={stats.recentOrders} />
            </div>
          ) : (
            <div className="lg:col-span-2">
              <div className="border-b border-gray-200 pb-2 sm:pb-3 pt-2 mb-2">
                <h2 className="text-lg sm:text-xl font-semibold text-[#072349] mb-1">Recent Orders</h2>
                <p className="text-xs text-gray-500">Latest customer orders</p>
              </div>
              <EmptyOrders />
            </div>
          )}
          <div className="space-y-2">
            <div className="border-b border-gray-200 pb-2 sm:pb-3 pt-2">
              <h2 className="text-lg sm:text-xl font-semibold text-[#072349] mb-1">Quick Actions</h2>
              <p className="text-xs text-gray-500">Common tasks and shortcuts</p>
            </div>
            <QuickActionsPanel credits={stats.credits} />
          </div>
        </section>

        {/* Error Banner */}
        {error && stats && (
          <div role="alert" aria-live="polite">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 sm:p-4">
            <p className="text-yellow-800 text-xs sm:text-sm">
              ⚠️ {error} - Showing cached data
            </p>
            <Button onClick={refetch} variant="ghost" size="sm" className="mt-2 text-xs sm:text-sm">
              Retry
            </Button>
          </div>
          </div>
        )}
      </main>
    </DashboardErrorBoundary>
  );
}
