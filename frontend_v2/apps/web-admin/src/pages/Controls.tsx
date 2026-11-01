import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Input, Button } from '@chatlogix/ui';
import {
  listAuditLogs,
  getComputedAlerts,
  getTrialClocks,
  formatAuditAction,
  type StaffAuditLogEntry,
  type ComputedAlert,
  type TrialClockRow,
} from '../lib/controls';

export function Controls() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Active tab: 'audit' | 'alerts' | 'trials'
  const activeTab = searchParams.get('tab') || 'audit';

  // Audit filters
  const [actionFilter, setActionFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Trials filter
  const [trialFilter, setTrialFilter] = useState<'next7' | 'past' | 'all'>('next7');

  // 1. Audit Query
  const {
    data: auditData,
    isLoading: auditLoading,
    isError: auditError,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ['controls-audit', actionFilter, searchTerm],
    queryFn: () =>
      listAuditLogs({
        action: actionFilter,
        search: searchTerm || undefined,
        limit: 50,
      }),
    enabled: activeTab === 'audit',
  });

  // 2. Computed Alerts Query
  const {
    data: alertsData,
    isLoading: alertsLoading,
    isError: alertsError,
    refetch: refetchAlerts,
  } = useQuery({
    queryKey: ['controls-alerts'],
    queryFn: getComputedAlerts,
    enabled: activeTab === 'alerts',
  });

  // 3. Trials Query
  const {
    data: trialsData,
    isLoading: trialsLoading,
    isError: trialsError,
  } = useQuery({
    queryKey: ['controls-trials', trialFilter],
    queryFn: () => getTrialClocks(trialFilter),
    enabled: activeTab === 'trials',
  });

  const handleTabChange = (tab: 'audit' | 'alerts' | 'trials') => {
    setSearchParams({ tab });
  };

  const isAuditPendingMigration =
    auditData?.status === 'pending_migration' || auditData?.supported === false;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Title & Navigation */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Platform Controls</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Accountability audit logs, platform-wide attention alerts, and trial clock visibility.
        </p>

        {/* Subnav Tabs */}
        <div className="flex items-center gap-2 mt-4 border-b border-gray-200">
          <button
            type="button"
            onClick={() => handleTabChange('audit')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'audit'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Staff Audit Log
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('alerts')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'alerts'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <span>Computed Alerts</span>
            {alertsData && alertsData.count > 0 && (
              <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-full">
                {alertsData.count}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('trials')}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'trials'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            Trial Clocks
          </button>
        </div>
      </div>

      {/* TAB 1: AUDIT LOG VIEWER */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          {/* Pending Migration Banner */}
          {isAuditPendingMigration && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-start gap-3 shadow-2xs">
              <span className="text-xl">⚠️</span>
              <div className="flex-1">
                <h4 className="font-semibold text-amber-950">
                  StaffAuditLog Persistence Pending Migration
                </h4>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Persistent <code>StaffAuditLog</code> table requires schema migration approval (Decision 3).
                  Staff actions in the current session are buffered in memory and displayed below.
                </p>
              </div>
            </div>
          )}

          {/* Filters Bar */}
          <Card className="p-4 border border-gray-200/80 shadow-sm bg-white">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-600">
                  Action:
                </label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="all">All Actions</option>
                  <option value="wallet_credited">Wallet Credited</option>
                  <option value="markup_changed">Markup Changed</option>
                  <option value="conversation_read">Transcript Read</option>
                  <option value="settings_changed">Settings Changed</option>
                  <option value="feature_flag_changed">Flag Changed</option>
                  <option value="whatsapp_mapped">WhatsApp Mapped</option>
                  <option value="case_opened">Case Opened</option>
                  <option value="case_status_changed">Case Status Changed</option>
                  <option value="shop_viewed">Shop Inspected</option>
                  <option value="fx_refreshed">FX Refreshed</option>
                </select>
              </div>

              <div className="w-full md:w-72">
                <Input
                  type="search"
                  placeholder="Search staff or summary..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-xs py-1.5"
                />
              </div>
            </div>
          </Card>

          {/* Audit Table */}
          <Card className="p-0 overflow-hidden border border-gray-200/80 shadow-sm bg-white">
            {auditLoading ? (
              <div className="p-12 text-center text-sm text-gray-500 space-y-3">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent"></div>
                <p>Loading audit log…</p>
              </div>
            ) : auditError ? (
              <div className="p-12 text-center text-sm text-red-600 space-y-3">
                <p className="font-semibold">Could not load audit log.</p>
                <Button variant="ghost" size="sm" onClick={() => void refetchAudit()} className="border border-gray-300">
                  Retry
                </Button>
              </div>
            ) : !auditData || auditData.items.length === 0 ? (
              <div className="p-16 text-center text-sm text-gray-400 space-y-2">
                <span className="text-3xl block">📜</span>
                <p className="font-semibold text-gray-700 text-base">No staff actions recorded yet.</p>
                <p className="text-xs text-gray-400">
                  Staff actions (wallet adjustments, markup changes, transcript reads) will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" aria-label="Staff audit log">
                  <caption className="sr-only">Staff audit log</caption>
                  <thead className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600 tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Time</th>
                      <th className="px-6 py-3.5">Staff</th>
                      <th className="px-6 py-3.5">Action</th>
                      <th className="px-6 py-3.5">Shop / Scope</th>
                      <th className="px-6 py-3.5">Summary</th>
                      <th className="px-6 py-3.5 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditData.items.map((row: StaffAuditLogEntry) => {
                      const actionInfo = formatAuditAction(row.action);
                      const isExpanded = expandedLogId === row.id;

                      return (
                        <tr key={row.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(row.createdAt).toLocaleDateString([], {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs font-semibold text-gray-800 whitespace-nowrap">
                            {row.actorId}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge variant={actionInfo.variant}>
                              {actionInfo.label}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-gray-900 whitespace-nowrap">
                            {row.vendorId ? (
                              <Link to={`/vendors`} className="text-primary-600 hover:underline">
                                {row.vendorId.slice(0, 12)}…
                              </Link>
                            ) : (
                              <span className="text-gray-500 italic">Platform</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-700 max-w-md">
                            <p className="line-clamp-2 leading-relaxed">{row.summary}</p>
                            {isExpanded && row.metadata && (
                              <div className="mt-2 p-2.5 bg-gray-50 rounded border border-gray-200 text-[11px] font-mono text-gray-700">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(row.metadata, null, 2)}
                                </pre>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap text-xs">
                            {row.metadata ? (
                              <button
                                type="button"
                                onClick={() => setExpandedLogId(isExpanded ? null : row.id)}
                                className="text-primary-600 hover:underline font-semibold"
                              >
                                {isExpanded ? 'Hide' : 'Inspect'}
                              </button>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: COMPUTED ALERTS */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-600 flex items-start justify-between">
            <div>
              <h4 className="font-bold text-gray-900">Phase 1: Real-Time Evaluated Alerts</h4>
              <p className="mt-0.5 leading-relaxed text-gray-500">
                Alerts are computed on-demand from current database state (low wallet, &ge;3 failing replies, dropped WhatsApp, or stale FX).
                Alerts clear naturally once the underlying condition is resolved.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refetchAlerts()}
              className="border border-gray-300 ml-4 shrink-0 text-xs"
            >
              Re-evaluate Now
            </Button>
          </div>

          {alertsLoading ? (
            <Card className="p-12 text-center text-sm text-gray-500">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent mb-2"></div>
              <p>Evaluating alerts…</p>
            </Card>
          ) : alertsError ? (
            <Card className="p-12 text-center text-sm text-red-600">
              <p className="font-semibold">Could not evaluate alerts.</p>
            </Card>
          ) : !alertsData || alertsData.alerts.length === 0 ? (
            <Card className="p-16 text-center text-sm text-gray-500">
              <span className="text-3xl block mb-2">✅</span>
              <p className="font-semibold text-gray-800 text-base">All systems operational</p>
              <p className="text-xs text-gray-400 mt-1">
                No low wallets, message reply bursts, dropped WhatsApp lines, or stale FX rates detected.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {alertsData.alerts.map((alert: ComputedAlert) => {
                const isError = alert.severity === 'error';
                return (
                  <Card
                    key={alert.id}
                    className={`p-5 border shadow-sm transition-all ${
                      isError
                        ? 'bg-rose-50/40 border-rose-200'
                        : 'bg-amber-50/40 border-amber-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {alert.type === 'low_wallet'
                            ? '💰'
                            : alert.type === 'failing_replies'
                            ? '🚨'
                            : alert.type === 'whatsapp_dropped'
                            ? '📵'
                            : '📈'}
                        </span>
                        <h3 className="text-sm font-bold text-gray-900">
                          {alert.businessName || 'Platform'}
                        </h3>
                      </div>
                      <Badge variant={isError ? 'warning' : 'default'} className="uppercase text-[10px]">
                        {alert.type.replace(/_/g, ' ')}
                      </Badge>
                    </div>

                    <p className="text-xs text-gray-700 mb-4 leading-relaxed font-medium">
                      {alert.summary}
                    </p>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-200/60">
                      <span className="text-[10px] text-gray-400">
                        Evaluated {new Date(alert.evaluatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Link to={alert.targetLink}>
                        <Button variant="primary" size="sm" className="text-xs py-1">
                          Investigate &rarr;
                        </Button>
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TRIAL CLOCKS */}
      {activeTab === 'trials' && (
        <div className="space-y-4">
          <Card className="p-4 border border-gray-200/80 shadow-sm bg-white">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-600">
                  Filter Window:
                </span>
                <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-lg">
                  {(['next7', 'past', 'all'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setTrialFilter(mode)}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        trialFilter === mode
                          ? 'bg-white text-gray-900 shadow-2xs'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {mode === 'next7' ? 'Next 7 Days' : mode === 'past' ? 'Past Expiry' : 'All Trials'}
                    </button>
                  ))}
                </div>
              </div>

              <Link
                to="/billing"
                className="text-xs font-semibold text-primary-600 hover:underline inline-flex items-center gap-1"
              >
                Change trial grant for new shops &rarr;
              </Link>
            </div>
          </Card>

          {/* Trials Table */}
          <Card className="p-0 overflow-hidden border border-gray-200/80 shadow-sm bg-white">
            {trialsLoading ? (
              <div className="p-12 text-center text-sm text-gray-500">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent mb-2"></div>
                <p>Loading trial clocks…</p>
              </div>
            ) : trialsError ? (
              <div className="p-12 text-center text-sm text-red-600">
                <p className="font-semibold">Could not load trial clocks.</p>
              </div>
            ) : !trialsData || trialsData.items.length === 0 ? (
              <div className="p-16 text-center text-sm text-gray-400 space-y-2">
                <span className="text-3xl block">⏳</span>
                <p className="font-semibold text-gray-800 text-base">No shops matching trial filter</p>
                <p className="text-xs text-gray-400">
                  No shops found with expiration dates in the selected window.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600 tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">Shop</th>
                      <th className="px-6 py-3.5">Registration</th>
                      <th className="px-6 py-3.5">Trial Grant</th>
                      <th className="px-6 py-3.5">Current Balance</th>
                      <th className="px-6 py-3.5">Expires</th>
                      <th className="px-6 py-3.5">Policy Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {trialsData.items.map((row: TrialClockRow) => {
                      const grantRupees = (row.trialGrantedMilli / 1000).toFixed(2);
                      const balanceRupees = (row.walletBalanceMilli / 1000).toFixed(2);

                      return (
                        <tr key={row.vendorId} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-6 py-4 font-semibold text-gray-900 whitespace-nowrap">
                            <Link to={`/vendors`} className="text-primary-600 hover:underline">
                              {row.businessName}
                            </Link>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Badge
                              variant={row.registrationStatus === 'approved' ? 'success' : 'warning'}
                            >
                              {row.registrationStatus}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs text-gray-700 whitespace-nowrap">
                            ₹{grantRupees}
                          </td>
                          <td className="px-6 py-4 font-mono text-xs font-bold text-gray-900 whitespace-nowrap">
                            ₹{balanceRupees}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(row.trialExpiresAt).toLocaleDateString([], {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-600 max-w-sm">
                            <span className="italic block leading-relaxed">{row.caption}</span>
                          </td>
                        </tr>
                      );
                    })}
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
