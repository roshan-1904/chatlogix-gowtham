import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, type BadgeVariant } from '@chatlogix/ui';
import { formatWalletAmount } from '../lib/money';
import { listVendors, type AdminVendorListRow } from '../lib/vendors';
import { VendorDetailPanel } from '../components/vendors/VendorDetailPanel';

export const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
] as const;

export type StatusFilterValue = (typeof STATUS_OPTIONS)[number]['value'];

export function getRegistrationBadge(status: string | null | undefined): {
  label: string;
  variant: BadgeVariant;
  className?: string;
} {
  switch (status) {
    case 'approved':
      return { label: 'Approved', variant: 'success' };
    case 'pending_approval':
      return { label: 'Pending Approval', variant: 'warning' };
    case 'rejected':
      return { label: 'Rejected', variant: 'default', className: 'bg-red-50 text-red-700 border border-red-200' };
    case 'onboarding':
      return { label: 'Onboarding', variant: 'info' };
    default:
      return { label: status?.trim() ? status : 'Not set', variant: 'default' };
  }
}

function matches(
  vendor: AdminVendorListRow,
  query: string,
  statusFilter: StatusFilterValue
): boolean {
  if (statusFilter !== 'all') {
    if ((vendor.registrationStatus ?? '') !== statusFilter) {
      return false;
    }
  }

  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [vendor.businessName, vendor.phone, vendor.email]
    .filter((field): field is string => typeof field === 'string')
    .some((field) => field.toLowerCase().includes(needle));
}

export function Vendors() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const rawStatus = searchParams.get('status');
  const statusFilter: StatusFilterValue = STATUS_OPTIONS.some((o) => o.value === rawStatus)
    ? (rawStatus as StatusFilterValue)
    : 'all';

  const handleStatusChange = (newStatus: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (newStatus === 'all') {
          next.delete('status');
        } else {
          next.set('status', newStatus);
        }
        return next;
      },
      { replace: true }
    );
  };

  const vendorsQuery = useQuery({ queryKey: ['admin-vendors'], queryFn: listVendors });
  const vendors = useMemo(() => vendorsQuery.data ?? [], [vendorsQuery.data]);

  const visible = useMemo(
    () => vendors.filter((v) => matches(v, search, statusFilter)),
    [vendors, search, statusFilter]
  );

  // Keep a vendor selected as the list loads or the search narrows.
  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((v) => v.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  const selected = visible.find((v) => v.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-[#072349] sm:text-3xl">Vendors</h1>
        <p className="mt-1 text-sm text-gray-500">
          AI wallet, order-payment settlement (Route), markup, and platform-fee invoices per shop.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full max-w-sm">
          <label htmlFor="vendor-search" className="sr-only">
            Search shops
          </label>
          <input
            id="vendor-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by shop, phone, or email"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30"
          />
        </div>

        <div className="w-full sm:w-auto">
          <label htmlFor="vendor-status-filter" className="sr-only">
            Registration status
          </label>
          <select
            id="vendor-status-filter"
            value={statusFilter}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 sm:w-auto"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {vendorsQuery.isLoading && <p className="text-sm text-gray-500">Loading vendors…</p>}

      {vendorsQuery.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load vendors.{' '}
          {vendorsQuery.error instanceof Error ? vendorsQuery.error.message : ''}
        </div>
      )}

      {!vendorsQuery.isLoading && !vendorsQuery.isError && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5 xl:col-span-4">
            <Card className="p-0 overflow-hidden">
              {visible.length === 0 ? (
                <p className="p-5 text-sm text-gray-500">
                  {vendors.length === 0
                    ? 'No vendors yet.'
                    : 'No vendor matches that search or status.'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visible.map((vendor) => {
                    const isSelected = vendor.id === selectedId;
                    const badge = getRegistrationBadge(vendor.registrationStatus);
                    return (
                      <li key={vendor.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(vendor.id)}
                          aria-current={isSelected ? 'true' : undefined}
                          className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
                            isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {vendor.businessName}
                            </p>
                            <p className="truncate text-xs text-gray-500">
                              {vendor.phone || vendor.email || '—'}
                            </p>
                            <div className="mt-1">
                              <Badge variant={badge.variant} className={badge.className}>
                                {badge.label}
                              </Badge>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold text-[#072349]">
                              {formatWalletAmount(vendor.walletBalanceMilli)}
                            </p>
                            <p className="text-xs text-gray-400">{vendor.markupPercent}% markup</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="lg:col-span-7 xl:col-span-8">
            {selected ? (
              <VendorDetailPanel key={selected.id} vendor={selected} />
            ) : (
              <Card className="p-5">
                <p className="text-sm text-gray-500">Pick a vendor to see their wallet and markup.</p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
