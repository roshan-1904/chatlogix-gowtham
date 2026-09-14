import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button } from '@chatlogix/ui';
import { useCustomerQueries } from '../hooks/queries/useCustomerQueries';

const STATUS_FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'answered', label: 'Answered' },
  { value: 'needs_catalog_fix', label: 'Catalog fix' },
  { value: 'promoted_to_faq', label: 'Saved as FAQ' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

function statusBadge(status: string) {
  if (status === 'open') return <Badge variant="warning">Open</Badge>;
  if (status === 'answered') return <Badge variant="info">Answered</Badge>;
  if (status === 'promoted_to_faq') return <Badge variant="success">FAQ</Badge>;
  if (status === 'needs_catalog_fix') return <Badge>Catalog</Badge>;
  return <Badge variant="secondary">{status.replace(/_/g, ' ')}</Badge>;
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.max(0, Math.floor(ms / 3_600_000));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function Queries() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('open');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const { queries, loading, error, total } = useCustomerQueries({
    status,
    category: category || undefined,
    search: search || undefined,
  });

  return (
    <div className="p-1 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Queries</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-1">
          Questions the WhatsApp AI could not answer from your catalog or FAQs. Reply once, then save it for the next customer.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        >
          <option value="">All categories</option>
          <option value="product">Product</option>
          <option value="policy">Policy</option>
          <option value="other">Other</option>
        </select>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search English question"
          className="w-full sm:max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
        <p className="text-xs text-gray-500 sm:ml-auto">{total} shown</p>
      </div>

      {error && (
        <div className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 bg-gray-200 animate-pulse rounded" />
          ))}
        </div>
      ) : queries.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No queries in this filter.</p>
          <p className="text-xs mt-1">When the AI has to check with you, the question lands here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Question</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Seen</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {queries.map((query) => (
                <tr key={query.id} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="font-medium">{query.customerName || query.customerPhone}</div>
                    {query.customerName && <div className="text-xs text-gray-500">{query.customerPhone}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void navigate(`/queries/${query.id}`)}
                      className="font-medium text-gray-900 hover:text-primary-500 text-left"
                    >
                      {query.questionEn}
                    </button>
                    {query.questionOriginal !== query.questionEn && (
                      <p className="text-xs text-gray-500 mt-0.5">{query.questionOriginal}</p>
                    )}
                    {query.hitCount > 1 && (
                      <p className="text-xs text-primary-500 mt-0.5">Asked {query.hitCount} times</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm capitalize text-gray-600">{query.category}</td>
                  <td className="px-4 py-3">{statusBadge(query.status)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatAge(query.lastSeenAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => void navigate(`/queries/${query.id}`)}>
                        Open
                      </Button>
                      <Link
                        to={`/conversations?conversationId=${query.conversationId}&queryId=${query.id}`}
                        className="inline-flex items-center px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
                      >
                        Chat
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
