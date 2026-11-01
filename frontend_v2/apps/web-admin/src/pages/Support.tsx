import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, Button, Badge, Input } from '@chatlogix/ui';
import {
  listCases,
  getStatusBadgeVariant,
  getStatusLabel,
  type StaffCase,
  type StaffCaseStatus,
  type CaseListResponse,
} from '../lib/support';

export function Support() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<'open' | 'waiting' | 'resolved' | 'all'>('open');
  const [searchTerm, setSearchTerm] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<CaseListResponse>({
    queryKey: ['support-cases', statusFilter, searchTerm],
    queryFn: () =>
      listCases({
        status: statusFilter,
        search: searchTerm || undefined,
        limit: 50,
      }),
  });

  const isPendingMigration = data?.status === 'pending_migration' || data?.supported === false;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Support Cases</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Staff follow-up on shops. Shop owners do not see this list.
          </p>
        </div>
        <div>
          <Link to="/support/new">
            <Button
              variant="primary"
              aria-label="Create a new support case"
              className="shadow-sm"
            >
              + New Case
            </Button>
          </Link>
        </div>
      </div>

      {/* Pending Migration Banner */}
      {isPendingMigration && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm flex items-start gap-3 shadow-sm">
          <span className="text-xl">⚠️</span>
          <div className="flex-1">
            <h4 className="font-semibold text-amber-950">
              Database Migration Pending — Staff Case Persistence
            </h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              The <code>StaffCase</code>, <code>StaffCaseNote</code>, and <code>StaffAuditLog</code> tables
              require operator schema migration approval (Decision 3). All operations will fail closed or run in
              non-destructive mode until approved.
            </p>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <Card className="p-4 border border-gray-200/80 shadow-sm bg-white">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-gray-100/80 rounded-lg self-start">
            {(['open', 'waiting', 'resolved', 'all'] as const).map((tab) => {
              const active = statusFilter === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    active
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="w-full md:w-72">
            <Input
              type="search"
              placeholder="Search by subject or shop..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs py-1.5"
            />
          </div>
        </div>
      </Card>

      {/* Cases Table */}
      <Card className="p-0 overflow-hidden border border-gray-200/80 shadow-sm bg-white">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-500 space-y-3">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-primary-500 border-t-transparent"></div>
            <p>Loading support cases…</p>
          </div>
        ) : isError ? (
          <div className="p-12 text-center text-sm text-red-600 space-y-3">
            <p className="font-semibold">Could not load support cases.</p>
            <Button variant="ghost" size="sm" onClick={() => void refetch()} className="border border-gray-300">
              Try Again
            </Button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-16 text-center text-sm text-gray-500 space-y-3">
            <span className="text-3xl block">🎫</span>
            <p className="font-semibold text-gray-800 text-base">
              {searchTerm
                ? 'No matching support cases found'
                : `No ${statusFilter === 'all' ? '' : statusFilter} cases`}
            </p>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              {searchTerm
                ? 'Try adjusting your search criteria or filter status.'
                : 'Click "New Case" above to document a vendor follow-up or incident.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/75 border-b border-gray-200 text-xs font-semibold uppercase text-gray-600 tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Subject</th>
                  <th className="px-6 py-3.5">Shop</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Updated</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((row: StaffCase) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/support/${row.id}`)}
                    className="hover:bg-gray-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 font-semibold text-gray-900 max-w-md truncate group-hover:text-primary-600">
                      {row.subject}
                    </td>
                    <td className="px-6 py-4 text-gray-700 whitespace-nowrap font-medium">
                      {row.vendor?.businessName || row.vendorId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={getStatusBadgeVariant(row.status as StaffCaseStatus)}>
                        {getStatusLabel(row.status as StaffCaseStatus)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(row.updatedAt).toLocaleDateString([], {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap text-xs">
                      <span className="text-primary-600 font-semibold group-hover:underline">
                        View Details &rarr;
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
