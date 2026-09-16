import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@chatlogix/ui';
import { formatWalletAmount } from '../lib/money';
import { listVendors, type AdminVendorListRow } from '../lib/vendors';
import { VendorDetailPanel } from '../components/vendors/VendorDetailPanel';

function matches(vendor: AdminVendorListRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [vendor.businessName, vendor.phone, vendor.email]
    .filter((field): field is string => typeof field === 'string')
    .some((field) => field.toLowerCase().includes(needle));
}

export function Vendors() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const vendorsQuery = useQuery({ queryKey: ['admin-vendors'], queryFn: listVendors });
  const vendors = useMemo(() => vendorsQuery.data ?? [], [vendorsQuery.data]);

  const visible = useMemo(() => vendors.filter((v) => matches(v, search)), [vendors, search]);

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
          Wallet balance, recent charges, and the markup each vendor pays.
        </p>
      </header>

      <div className="max-w-sm">
        <label htmlFor="vendor-search" className="sr-only">
          Search vendors
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
                  {vendors.length === 0 ? 'No vendors yet.' : 'No vendor matches that search.'}
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {visible.map((vendor) => {
                    const isSelected = vendor.id === selectedId;
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
