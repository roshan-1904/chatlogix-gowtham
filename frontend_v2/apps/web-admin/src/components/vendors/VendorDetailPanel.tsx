import { useQuery } from '@tanstack/react-query';
import { Badge, Card } from '@chatlogix/ui';
import { formatWalletAmount } from '../../lib/money';
import {
  getVendorConfig,
  getVendorWalletTransactions,
  type AdminVendorListRow,
  type AdminWalletTransaction,
} from '../../lib/vendors';
import { MarkupEditor } from './MarkupEditor';

interface VendorDetailPanelProps {
  vendor: AdminVendorListRow;
}

function transactionLabel(tx: AdminWalletTransaction): string {
  const source = tx.metadata?.source;
  if (typeof source === 'string' && source.trim()) {
    return source.replace(/_/g, ' ');
  }
  if (tx.transactionType === 'recharge') return 'money added';
  if (tx.transactionType === 'refund') return 'refund';
  return 'usage';
}

export function VendorDetailPanel({ vendor }: VendorDetailPanelProps) {
  const configQuery = useQuery({
    queryKey: ['admin-vendor', vendor.id],
    queryFn: () => getVendorConfig(vendor.id),
  });

  const transactionsQuery = useQuery({
    queryKey: ['admin-vendor', vendor.id, 'wallet-transactions'],
    queryFn: () => getVendorWalletTransactions(vendor.id, 50),
  });

  const balanceMilli = configQuery.data?.walletBalanceMilli ?? vendor.walletBalanceMilli;
  const markupPercent = configQuery.data?.markupPercent ?? vendor.markupPercent;
  const transactions = transactionsQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-[#072349]">{vendor.businessName}</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {vendor.phone || 'No phone'}
              {vendor.email ? ` · ${vendor.email}` : ''}
            </p>
          </div>
          <Badge variant={vendor.subscriptionStatus === 'active' ? 'success' : 'default'}>
            {vendor.subscriptionStatus || 'unknown'}
          </Badge>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Wallet balance
            </dt>
            <dd className="mt-1 text-2xl font-bold text-[#072349]">{formatWalletAmount(balanceMilli)}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Markup</dt>
            <dd className="mt-1 text-2xl font-bold text-[#072349]">{markupPercent}%</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5">
        <MarkupEditor vendorId={vendor.id} markupPercent={markupPercent} />
      </Card>

      <Card className="p-5">
        <h3 className="text-base font-semibold text-[#072349]">Recent wallet activity</h3>
        {transactionsQuery.isLoading && <p className="mt-3 text-sm text-gray-500">Loading activity…</p>}
        {transactionsQuery.isError && (
          <p className="mt-3 text-sm text-red-600">Could not load wallet activity.</p>
        )}
        {!transactionsQuery.isLoading && !transactionsQuery.isError && transactions.length === 0 && (
          <p className="mt-3 text-sm text-gray-500">Nothing here yet.</p>
        )}
        {transactions.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100">
            {transactions.map((tx) => (
              <li key={tx.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <span className="font-medium capitalize text-gray-800">{transactionLabel(tx)}</span>
                  <p className="text-xs text-gray-500">
                    {new Date(tx.transactionDate).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={
                      tx.transactionType === 'deduction' ? 'text-red-600' : 'text-[#1a9e4b]'
                    }
                  >
                    {tx.transactionType === 'deduction' ? '−' : '+'}
                    {formatWalletAmount(tx.amountMilli)}
                  </span>
                  <p className="text-xs text-gray-400">
                    Balance {formatWalletAmount(tx.balanceAfterMilli)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
