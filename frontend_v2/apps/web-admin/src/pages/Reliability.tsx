import { useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Badge } from '@chatlogix/ui';
import {
  getApiErrorStats,
  getFailedMessages,
  getPausedConversations,
  getWalletBlocks,
  getStuckOrders,
  getOrderAlerts,
  formatPaiseToRupees,
  formatUptime,
  formatTimestamp,
  getTopErrorCode,
  type FailedMessage,
  type PausedConversation,
  type StuckOrder,
  type OrderAlert,
} from '../lib/reliability';

type QueueTab = 'failed' | 'paused' | 'wallet' | 'orders';
type TimeRange = '24h' | '7d' | '30d';

function calculateRangeDates(range: TimeRange): { from: string; to: string } {
  const now = new Date();
  const msInHour = 60 * 60 * 1000;
  let offsetMs = 24 * msInHour;
  if (range === '7d') offsetMs = 7 * 24 * msInHour;
  if (range === '30d') offsetMs = 30 * 24 * msInHour;

  return {
    from: new Date(now.getTime() - offsetMs).toISOString(),
    to: now.toISOString(),
  };
}

export function Reliability() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeQueueParam = searchParams.get('queue') as QueueTab | null;
  const initialQueue: QueueTab =
    activeQueueParam && ['failed', 'paused', 'wallet', 'orders'].includes(activeQueueParam)
      ? activeQueueParam
      : 'failed';

  const [activeTab, setActiveTab] = useState<QueueTab>(initialQueue);
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [vendorFilter, setVendorFilter] = useState<string>(searchParams.get('vendorId') || '');

  const rangeDates = useMemo(() => calculateRangeDates(timeRange), [timeRange]);

  const updateTab = (tab: QueueTab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('queue', tab);
      return next;
    });
  };

  // 1. API Error stats (polled every 30s)
  const {
    data: errorStats,
    isLoading: errorStatsLoading,
    isError: errorStatsError,
  } = useQuery({
    queryKey: ['apiErrorStats'],
    queryFn: getApiErrorStats,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // 2. Failed replies query
  const {
    data: failedData,
    isLoading: failedLoading,
    isError: failedError,
    refetch: refetchFailed,
  } = useQuery({
    queryKey: ['reliability-failed', rangeDates.from, rangeDates.to, vendorFilter],
    queryFn: () =>
      getFailedMessages({
        from: rangeDates.from,
        to: rangeDates.to,
        vendorId: vendorFilter || undefined,
        limit: 50,
      }),
    enabled: activeTab === 'failed',
  });

  // 3. Paused AI query
  const {
    data: pausedData,
    isLoading: pausedLoading,
    isError: pausedError,
    refetch: refetchPaused,
  } = useQuery({
    queryKey: ['reliability-paused', vendorFilter],
    queryFn: () =>
      getPausedConversations({
        vendorId: vendorFilter || undefined,
        limit: 50,
      }),
    enabled: activeTab === 'paused',
  });

  // 4. Wallet blocks query
  const {
    isLoading: walletLoading,
    isError: walletError,
  } = useQuery({
    queryKey: ['reliability-wallet', rangeDates.from, rangeDates.to, vendorFilter],
    queryFn: () =>
      getWalletBlocks({
        from: rangeDates.from,
        to: rangeDates.to,
        vendorId: vendorFilter || undefined,
        limit: 50,
      }),
    enabled: activeTab === 'wallet',
  });

  // 5. Stuck orders query
  const {
    data: stuckData,
    isLoading: stuckLoading,
    isError: stuckError,
    refetch: refetchStuck,
  } = useQuery({
    queryKey: ['reliability-stuck', vendorFilter],
    queryFn: () =>
      getStuckOrders({
        vendorId: vendorFilter || undefined,
        limit: 50,
      }),
    enabled: activeTab === 'orders',
  });

  // 6. Order alerts query
  const {
    data: alertsData,
    isLoading: alertsLoading,
    isError: alertsError,
  } = useQuery({
    queryKey: ['reliability-alerts', vendorFilter],
    queryFn: () =>
      getOrderAlerts({
        vendorId: vendorFilter || undefined,
        limit: 50,
      }),
    enabled: activeTab === 'orders',
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reliability Triage Desk</h1>
        <p className="text-gray-500 mt-1">
          Customer-facing issues from our database. This is a read-only ops triage desk, not a log search tool.
        </p>
      </div>

      {/* Top Banner: API Process Errors (Read-Only) */}
      <Card className="bg-slate-50 border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold uppercase tracking-wider text-slate-700">
                API Process Error Summary
              </span>
              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
                Read-only
              </span>
            </div>
            {errorStatsLoading ? (
              <p className="text-sm text-slate-500">Loading API error metrics…</p>
            ) : errorStatsError || !errorStats ? (
              <p className="text-sm text-amber-700">Could not load the API error summary.</p>
            ) : (
              <div
                className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1"
                aria-live="polite"
              >
                <div>
                  <span className="text-xs text-slate-500 block">Total since restart</span>
                  <span className="text-lg font-bold text-slate-900">
                    {errorStats.totalErrors}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Current error rate</span>
                  <span className="text-lg font-bold text-slate-900">
                    {typeof errorStats.currentErrorRate === 'number'
                      ? `${errorStats.currentErrorRate.toFixed(2)} / min`
                      : '0.00 / min'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Process Uptime</span>
                  <span className="text-lg font-bold text-slate-900">
                    {formatUptime(errorStats.uptime)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Top Error Code</span>
                  <span className="text-sm font-semibold text-slate-800 truncate block">
                    {getTopErrorCode(errorStats.errorCounts)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1">
          <p>
            <strong>Note:</strong> These metrics reflect the Express API server process only and reset upon server restart.
          </p>
          <p>
            Production customer traffic, webhook processing, reply generation, and background sweeps run independently on five AWS Lambdas:
            <code className="mx-1 px-1 bg-slate-200 rounded text-slate-800">webhook-handler</code>,
            <code className="mx-1 px-1 bg-slate-200 rounded text-slate-800">incoming-response-generator</code>,
            <code className="mx-1 px-1 bg-slate-200 rounded text-slate-800">whatsapp-response-dispatcher</code>,
            <code className="mx-1 px-1 bg-slate-200 rounded text-slate-800">media-fetcher</code>, and
            <code className="mx-1 px-1 bg-slate-200 rounded text-slate-800">order-recovery</code>.
            Check AWS CloudWatch for Lambda-level error rates.
          </p>
        </div>
      </Card>

      {/* Queue Tabs Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-6">
          <button
            type="button"
            onClick={() => updateTab('failed')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'failed'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Failed replies
          </button>
          <button
            type="button"
            onClick={() => updateTab('paused')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'paused'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Paused AI
          </button>
          <button
            type="button"
            onClick={() => updateTab('wallet')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'wallet'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Wallet blocks
          </button>
          <button
            type="button"
            onClick={() => updateTab('orders')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'orders'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Stuck orders & Alerts
          </button>
        </nav>
      </div>

      {/* Common Filter Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="vendorSearch" className="text-xs font-semibold text-gray-600 uppercase">
            Vendor Filter:
          </label>
          <input
            id="vendorSearch"
            type="text"
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            placeholder="Filter by vendor ID…"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {vendorFilter && (
            <button
              type="button"
              onClick={() => setVendorFilter('')}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear
            </button>
          )}
        </div>

        {(activeTab === 'failed' || activeTab === 'wallet') && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600 uppercase">Time Range:</span>
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-gray-50">
              <button
                type="button"
                onClick={() => setTimeRange('24h')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  timeRange === '24h'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Last 24h
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('7d')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  timeRange === '7d'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Last 7d
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('30d')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  timeRange === '30d'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Last 30d
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: Failed Replies */}
      {activeTab === 'failed' && (
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Failed Assistant Replies</h2>
              <p className="text-xs text-gray-500">
                Assistant outbound messages with <code>Message.status = &apos;failed&apos;</code> in the selected time range.
              </p>
            </div>
            <Button
              variant="ghost"
              className="border border-gray-300"
              size="sm"
              onClick={() => {
                void refetchFailed();
              }}
            >
              Refresh
            </Button>
          </div>

          {failedLoading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading failed replies…</div>
          ) : failedError ? (
            <div className="p-8 text-center text-sm text-red-600">Could not load failed replies.</div>
          ) : !failedData || failedData.items.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No failed replies in this range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-6 py-3">Time</th>
                    <th className="px-6 py-3">Shop</th>
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Preview</th>
                    <th className="px-6 py-3">Reason</th>
                    <th className="px-6 py-3">Sender</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {failedData.items.map((row: FailedMessage) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">
                        {formatTimestamp(row.timestamp)}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                        {row.businessName}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                        {row.customerPhone}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-gray-700 max-w-xs truncate" title={row.content}>
                        {row.content || '—'}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-rose-700 font-mono max-w-xs truncate" title={row.failureReason ?? 'No reason recorded'}>
                        {row.failureReason || 'No reason recorded'}
                      </td>
                      <td className="px-6 py-3.5 whitespace-nowrap">
                        <Badge variant="default">{row.senderType}</Badge>
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          <Link
                            to={`/support/new?vendorId=${encodeURIComponent(row.vendorId)}&conversationId=${encodeURIComponent(row.conversationId)}`}
                            className="text-xs text-primary-600 hover:text-primary-800 font-semibold"
                          >
                            Open case
                          </Link>
                          <span className="text-gray-300">|</span>
                          <Link
                            to={`/vendors`}
                            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                          >
                            Open shop
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 2: Paused AI */}
      {activeTab === 'paused' && (
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Paused AI Conversations</h2>
              <p className="text-xs text-gray-500">
                Active chats where <code>Conversation.aiPaused = true</code>. AI will not respond until resumed by the vendor in web-vendor.
              </p>
            </div>
            <Button
              variant="ghost"
              className="border border-gray-300"
              size="sm"
              onClick={() => {
                void refetchPaused();
              }}
            >
              Refresh
            </Button>
          </div>

          {pausedLoading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading paused chats…</div>
          ) : pausedError ? (
            <div className="p-8 text-center text-sm text-red-600">Could not load paused chats.</div>
          ) : !pausedData || pausedData.items.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No conversations are currently paused.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-6 py-3">Last Updated</th>
                    <th className="px-6 py-3">Shop</th>
                    <th className="px-6 py-3">Customer</th>
                    <th className="px-6 py-3">Status Note</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pausedData.items.map((row: PausedConversation) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">
                        {formatTimestamp(row.updatedAt)}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                        {row.businessName}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                        {row.customerPhone}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-amber-700">
                        {row.hint}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <Link
                          to={`/vendors`}
                          className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                        >
                          Open shop
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: Wallet Blocks */}
      {activeTab === 'wallet' && (
        <div className="space-y-4">
          <Card className="bg-amber-50 border-amber-200 p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <h3 className="text-sm font-semibold text-amber-900">
                  WalletBlockEvent Persistence Pending Schema Migration (Decision 2 Option A)
                </h3>
                <p className="text-xs text-amber-800 mt-1">
                  Per <code>docs/admin-portal/DECISIONS.md</code> Decision #2 (Locked), wallet-empty turns are blocked before LLM execution without failing the message.
                  Durable event logging into a dedicated <code>WalletBlockEvent</code> table is scheduled for the schema migration slice.
                  To avoid misleading zero counts, this queue will become active once the database table and pipeline writer ship.
                </p>
                <div className="mt-2 text-xs text-amber-900 font-medium">
                  Vendors with insufficient balance remain visible on the <Link to="/vendors" className="underline font-semibold">Vendors</Link> page and <Link to="/usage" className="underline font-semibold">Usage</Link> platform drill-down.
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-base font-semibold text-gray-900">Wallet-Blocked Turns</h2>
              <p className="text-xs text-gray-500">
                Lists turns where insufficient wallet balance prevented AI reply generation.
              </p>
            </div>

            {walletLoading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading wallet blocks…</div>
            ) : walletError ? (
              <div className="p-8 text-center text-sm text-red-600">Could not load wallet blocks.</div>
            ) : (
              <div className="p-8 text-center text-sm text-gray-500">
                No persisted block events in this range (pending table migration).
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: Stuck Orders & Order Alerts */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Sub-table 1: Stuck Orders */}
          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Stuck Pending Orders (&gt;24 Hours)</h2>
                <p className="text-xs text-gray-500">
                  Orders in <code>pending</code> or <code>confirmed</code> status whose last update was more than 24 hours ago.
                </p>
              </div>
              <Button
                variant="ghost"
                className="border border-gray-300"
                size="sm"
                onClick={() => {
                  void refetchStuck();
                }}
              >
                Refresh
              </Button>
            </div>

            {stuckLoading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading stuck orders…</div>
            ) : stuckError ? (
              <div className="p-8 text-center text-sm text-red-600">Could not load stuck orders.</div>
            ) : !stuckData || stuckData.items.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No orders are currently stuck in pending or confirmed status.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600">
                    <tr>
                      <th className="px-6 py-3">Order #</th>
                      <th className="px-6 py-3">Shop</th>
                      <th className="px-6 py-3">Customer</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Total Amount</th>
                      <th className="px-6 py-3">Still Since</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {stuckData.items.map((row: StuckOrder) => (
                      <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3.5 font-mono text-xs font-medium text-gray-900 whitespace-nowrap">
                          {row.orderNumber}
                        </td>
                        <td className="px-6 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                          {row.businessName}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                          {row.customerPhone}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          <Badge variant="warning">{row.status}</Badge>
                        </td>
                        <td className="px-6 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                          {formatPaiseToRupees(row.totalAmountPaise)}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">
                          {formatTimestamp(row.updatedAt)}
                        </td>
                        <td className="px-6 py-3.5 text-right whitespace-nowrap">
                          <Link
                            to={`/vendors`}
                            className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                          >
                            Open shop
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Sub-table 2: Unresolved Order Alerts */}
          <Card className="p-0 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h2 className="text-base font-semibold text-gray-900">Open Order Alerts</h2>
              <p className="text-xs text-gray-500">
                Active alerts from <code>OrderAlert WHERE resolved = false</code>.
              </p>
            </div>

            {alertsLoading ? (
              <div className="p-8 text-center text-sm text-gray-500">Loading order alerts…</div>
            ) : alertsError ? (
              <div className="p-8 text-center text-sm text-red-600">Could not load order alerts.</div>
            ) : !alertsData || alertsData.items.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No open order alerts.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600">
                    <tr>
                      <th className="px-6 py-3">Severity</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Order #</th>
                      <th className="px-6 py-3">Shop</th>
                      <th className="px-6 py-3">Message</th>
                      <th className="px-6 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {alertsData.items.map((alert: OrderAlert) => (
                      <tr key={alert.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          <Badge
                            variant={
                              alert.severity === 'high' || alert.severity === 'critical'
                                ? 'warning'
                                : 'default'
                            }
                          >
                            {alert.severity}
                          </Badge>
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs text-gray-700 whitespace-nowrap">
                          {alert.type}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-xs font-medium text-gray-900 whitespace-nowrap">
                          {alert.orderNumber}
                        </td>
                        <td className="px-6 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                          {alert.businessName}
                        </td>
                        <td className="px-6 py-3.5 text-xs text-gray-800">
                          {alert.message}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap text-xs text-gray-500">
                          {formatTimestamp(alert.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
