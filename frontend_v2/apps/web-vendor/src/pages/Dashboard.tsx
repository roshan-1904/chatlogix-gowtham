import { lazy, Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWhatsAppStatus } from '../lib/whatsappConnect';
import { useAuth } from '@chatlogix/auth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@chatlogix/ui';
import { DashboardMetricTile } from '../components/dashboard/DashboardMetricTile';
import { WalletBalanceCard } from '../components/dashboard/WalletBalanceCard';
import { DashboardSkeleton } from '../components/dashboard/DashboardSkeleton';
import { DashboardErrorBoundary } from '../components/dashboard/DashboardErrorBoundary';
import { EmptyOrders, EmptyConversations } from '../components/dashboard/EmptyStates';
import { RecentConversationsWidget } from '../components/dashboard/RecentConversationsWidget';
import { RecentOrdersWidget } from '../components/dashboard/RecentOrdersWidget';
import { QuickActionsPanel } from '../components/dashboard/QuickActionsPanel';
import { DashboardCommandBar } from '../components/dashboard/DashboardCommandBar';
import { ConnectWhatsAppPromo } from '../components/dashboard/ConnectWhatsAppPromo';
import { NeedsAttentionPanel } from '../components/dashboard/NeedsAttentionPanel';
import { DashboardSectionCard } from '../components/dashboard/DashboardSectionCard';
import { buildNeedsAttentionItems } from '../components/dashboard/buildNeedsAttentionItems';
import { IconChat, IconOrders, IconRevenue, IconWallet } from '../components/dashboard/dashboardIcons';
import { useDashboardStats } from '../hooks/dashboard/useDashboardStats';
import { useVendorConfig } from '../hooks/useVendorConfig';
import { formatAmountWithSymbol, formatWalletAmount } from '../utils/currency';

const SpendBreakdownChart = lazy(() =>
  import('../components/dashboard/SpendBreakdownChart').then((m) => ({ default: m.SpendBreakdownChart }))
);
const SpendTrendChart = lazy(() =>
  import('../components/dashboard/SpendTrendChart').then((m) => ({ default: m.SpendTrendChart }))
);
const OrderStatusChart = lazy(() =>
  import('../components/dashboard/OrderStatusChart').then((m) => ({ default: m.OrderStatusChart }))
);

const ChartSkeleton = () => (
  <div className="flex h-[240px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 animate-pulse">
    <p className="text-sm text-gray-500">Loading chart…</p>
  </div>
);

function formatTimeAgo(date: Date | null): string {
  if (!date) return 'never';
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
  const { user } = useAuth();
  const vendorConfig = useVendorConfig();
  const whatsappQuery = useQuery({
    queryKey: ['whatsapp-status', user?.vendorId],
    queryFn: getWhatsAppStatus,
    enabled: !!user?.vendorId,
    staleTime: 60_000,
  });

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

  const isStale = useMemo(
    () => (lastUpdated ? Date.now() - lastUpdated.getTime() > 60000 : false),
    [lastUpdated]
  );

  const whatsappLive = whatsappQuery.data?.connectStatus === 'live';

  const formattedRevenueTotal = useMemo(
    () => (stats ? formatAmountWithSymbol(stats.revenue.total) : ''),
    [stats?.revenue.total]
  );
  const formattedRevenueToday = useMemo(
    () => (stats ? formatAmountWithSymbol(stats.revenue.today) : ''),
    [stats?.revenue.today]
  );

  const needsAttentionItems = useMemo(() => {
    if (!stats) return [];
    return buildNeedsAttentionItems({
      pendingOrders: stats.orders.pending,
      whatsappLive,
      lowBalanceWarning: stats.billing.lowBalanceWarning,
      aiPaused: stats.conversations.aiPaused,
    });
  }, [stats, whatsappLive]);

  const showAnalytics = useMemo(() => {
    if (!stats) return false;
    const spendTotal = stats.billing.breakdownBySource.reduce((sum, row) => sum + row.milli, 0);
    return spendTotal > 0 || stats.orders.statusBreakdown.length > 1;
  }, [stats]);

  const conversionRateLabel = useMemo(() => {
    if (!stats) return undefined;
    if (stats.conversations.total < 10) {
      return 'Conversion rate: — (need at least 10 conversations)';
    }
    return `Conversion rate: ${stats.conversations.conversionRate.toFixed(1)}% (${stats.conversations.withOrders} with orders)`;
  }, [stats]);

  const hideWalletAddMoney = needsAttentionItems.some((item) => item.id === 'low-wallet');

  if (isLoading && !stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-primary-500 sm:text-2xl">Dashboard</h1>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-primary-500 sm:text-2xl">Dashboard</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
          <Button onClick={() => void refetch()} variant="primary" className="mt-3">
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
      <main className="space-y-4 pb-6 sm:space-y-5" role="main" aria-label="Vendor dashboard">
        <DashboardCommandBar
          vendorName={vendorConfig.data?.businessName}
          dateRangePreset={dateRangePreset}
          startDate={startDate}
          endDate={endDate}
          onDateRangeChange={setDateRange}
          lastUpdatedLabel={formatTimeAgo(lastUpdated)}
          isStale={isStale}
          isRefreshing={isLoading}
          onRefresh={() => void refetch()}
        />

        {!whatsappLive && (
          <ConnectWhatsAppPromo showLowBalanceLink={stats.billing.lowBalanceWarning} />
        )}

        <section aria-label="Pulse metrics" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <DashboardMetricTile
            label="Pending orders"
            value={stats.orders.pending}
            subValue={`Today: ${stats.orders.today}`}
            icon={<IconOrders className="h-4 w-4" />}
            onClick={() => void navigate('/orders?status=pending')}
          />
          <DashboardMetricTile
            label="Revenue"
            value={formattedRevenueTotal}
            caption={`In period: ${stats.dateRange.label}`}
            subValue={`Today: ${formattedRevenueToday}`}
            trend={stats.revenue.trend?.direction}
            icon={<IconRevenue className="h-4 w-4" />}
            onClick={() => void navigate('/orders')}
          />
          <DashboardMetricTile
            label="Active conversations"
            value={stats.conversations.active}
            subValue={`Total: ${stats.conversations.total}`}
            icon={<IconChat className="h-4 w-4" />}
            onClick={() => void navigate('/conversations')}
          />
          <DashboardMetricTile
            label="Wallet"
            value={formatWalletAmount(stats.billing.balanceMilli)}
            subValue={stats.billing.lowBalanceWarning ? 'Balance is low' : undefined}
            highlight={stats.billing.lowBalanceWarning}
            icon={<IconWallet className="h-4 w-4" />}
            onClick={() => void navigate('/wallet')}
          />
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          <div className="space-y-4 lg:col-span-8">
            <NeedsAttentionPanel items={needsAttentionItems} />

            <DashboardSectionCard
              title="Recent conversations"
              subtitle="Latest customer chats"
              footerLabel="View all conversations"
              footerTo="/conversations"
            >
              {stats.conversations.recentActivity.length > 0 ? (
                <RecentConversationsWidget
                  conversations={stats.conversations.recentActivity}
                  conversionRateLabel={conversionRateLabel}
                />
              ) : (
                <EmptyConversations />
              )}
            </DashboardSectionCard>

            <DashboardSectionCard
              title="Recent orders"
              subtitle="Latest customer orders"
              footerLabel="View all orders"
              footerTo="/orders"
            >
              {stats.recentOrders.length > 0 ? <RecentOrdersWidget orders={stats.recentOrders} /> : <EmptyOrders />}
            </DashboardSectionCard>
          </div>

          <aside className="space-y-4 lg:col-span-4">
            <WalletBalanceCard
              balanceMilli={stats.billing.balanceMilli}
              spentThisMonthMilli={stats.billing.spend.thisMonth}
              lowBalanceWarning={stats.billing.lowBalanceWarning}
              billingCycleEnd={stats.billing.billingCycleEnd}
              hideAddMoney={hideWalletAddMoney}
            />
            <DashboardSectionCard title="Quick actions">
              <QuickActionsPanel billing={stats.billing} whatsappLive={whatsappLive} />
            </DashboardSectionCard>
          </aside>
        </div>

        {showAnalytics && (
          <DashboardSectionCard
            title="Usage and orders"
            subtitle="Wallet spend and order mix for the selected period"
          >
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold text-gray-600">What you spent on</h3>
                <Suspense fallback={<ChartSkeleton />}>
                  <div className="h-[240px]">
                    <SpendBreakdownChart breakdownBySource={stats.billing.breakdownBySource} />
                  </div>
                </Suspense>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold text-gray-600">Spend per day</h3>
                <Suspense fallback={<ChartSkeleton />}>
                  <div className="h-[240px]">
                    <SpendTrendChart
                      dailySpend={stats.billing.dailySpend}
                      averagePerDayMilli={stats.billing.averagePerDayMilli}
                      projectedMonthlySpendMilli={stats.billing.projectedMonthlySpendMilli}
                    />
                  </div>
                </Suspense>
              </div>
              {stats.orders.statusBreakdown.length > 1 && (
                <div className="lg:col-span-2">
                  <h3 className="mb-2 text-xs font-semibold text-gray-600">Orders by status</h3>
                  <Suspense fallback={<ChartSkeleton />}>
                    <div className="h-[240px]">
                      <OrderStatusChart statusBreakdown={stats.orders.statusBreakdown} />
                    </div>
                  </Suspense>
                </div>
              )}
            </div>
          </DashboardSectionCard>
        )}

        {error && (
          <div role="alert" aria-live="polite" className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-xs text-yellow-800 sm:text-sm">{error} — showing cached data</p>
            <Button onClick={() => void refetch()} variant="ghost" size="sm" className="mt-2">
              Retry
            </Button>
          </div>
        )}
      </main>
    </DashboardErrorBoundary>
  );
}
