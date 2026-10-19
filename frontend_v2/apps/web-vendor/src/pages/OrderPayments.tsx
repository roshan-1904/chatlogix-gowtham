import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Badge, Button, Card } from '@chatlogix/ui';
import { useAuth } from '@chatlogix/auth';
import {
  downloadSettlementStatementCsv,
  formatSettlementMilli,
  getSettlementOverview,
  getSettlementStatement,
  payRefundShortfall,
  type SettlementTransferRow,
} from '../lib/settlement';
import {
  downloadPlatformFeeInvoicePdf,
  listPlatformFeeInvoices,
} from '../lib/platformFeeInvoices';
import { formatAmountWithSymbol } from '../utils/currency';

type TabId = 'overview' | 'statement' | 'transfers' | 'invoices';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Balances' },
  { id: 'statement', label: 'Statement' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'invoices', label: 'Fee invoices' },
];

function transferLabel(row: SettlementTransferRow): string {
  if (row.status === 'released') return 'Sent to your bank';
  if (row.kind === 'reserve') return 'Rolling reserve';
  if (row.status === 'on_hold') return 'On hold (payout delay)';
  return row.status.replace(/_/g, ' ');
}

function defaultStatementMonth(): { year: number; month: number } {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  let year = ist.getUTCFullYear();
  let month = ist.getUTCMonth() + 1;
  if (month === 1) {
    month = 12;
    year -= 1;
  } else {
    month -= 1;
  }
  return { year, month };
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OrderPayments() {
  const { user } = useAuth();
  const vendorId = user?.vendorId;
  const initialMonth = useMemo(() => defaultStatementMonth(), []);
  const [statementYear, setStatementYear] = useState(initialMonth.year);
  const [statementMonth, setStatementMonth] = useState(initialMonth.month);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [invoiceDownloading, setInvoiceDownloading] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['settlement-overview', vendorId],
    queryFn: () => getSettlementOverview(vendorId!),
    enabled: !!vendorId,
  });

  const position = query.data?.position;

  const statementQuery = useQuery({
    queryKey: ['settlement-statement', vendorId, statementYear, statementMonth],
    queryFn: () => getSettlementStatement(vendorId!, statementYear, statementMonth),
    enabled: !!vendorId && activeTab === 'statement',
  });

  const invoicesQuery = useQuery({
    queryKey: ['platform-fee-invoices', vendorId],
    queryFn: () => listPlatformFeeInvoices(vendorId!),
    enabled: !!vendorId && activeTab === 'invoices',
  });

  const onDownloadStatement = async () => {
    if (!vendorId) return;
    setDownloading(true);
    try {
      await downloadSettlementStatementCsv(vendorId, statementYear, statementMonth);
      toast.success('Statement downloaded');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const onPayShortfall = async (customerRefundId: string) => {
    try {
      await payRefundShortfall(customerRefundId);
      toast.success('Payment submitted — balance updates after confirmation.');
      void query.refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Payment failed');
    }
  };

  const onDownloadInvoice = async (invoiceId: string) => {
    if (!vendorId) return;
    setInvoiceDownloading(invoiceId);
    try {
      await downloadPlatformFeeInvoicePdf(vendorId, invoiceId);
      toast.success('Invoice downloaded');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setInvoiceDownloading(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-2 sm:p-0">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Order payments</h1>
          <p className="mt-1 text-sm text-gray-600 max-w-2xl">
            Money your customers pay for orders (Razorpay Route). This is <strong className="font-medium">not</strong> your
            AI wallet — message charges live under{' '}
            <Link to="/wallet" className="font-medium text-primary-500 underline-offset-2 hover:underline">
              Wallet
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/settings?tab=payments"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Payment collection setup
          </Link>
          <Link
            to="/wallet"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            AI wallet
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {query.isLoading && <p className="text-sm text-gray-500">Loading settlement…</p>}
      {query.isError && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Could not load settlement. If you have not opted into payment collection yet, complete setup in{' '}
          <Link to="/settings?tab=payments" className="font-medium underline">Settings</Link>.
        </Card>
      )}

      {activeTab === 'overview' && position && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="p-4 border-l-4 border-l-amber-400">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Waiting to release</p>
              <p className="mt-1 text-2xl font-bold text-[#072349]">{formatSettlementMilli(position.heldMilli)}</p>
              {position.nextReleaseAt && (
                <p className="mt-1 text-xs text-gray-500">
                  Next release {new Date(position.nextReleaseAt).toLocaleString('en-IN')}
                </p>
              )}
            </Card>
            <Card className="p-4 border-l-4 border-l-primary-400">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rolling reserve</p>
              <p className="mt-1 text-2xl font-bold text-[#072349]">{formatSettlementMilli(position.reserveMilli)}</p>
              <p className="mt-1 text-xs text-gray-500">Held back per platform policy</p>
            </Card>
            <Card className="p-4 border-l-4 border-l-secondary-500">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Paid out to bank</p>
              <p className="mt-1 text-2xl font-bold text-[#072349]">{formatSettlementMilli(position.releasedMilli)}</p>
            </Card>
            <Card className="p-4 sm:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Settlement ledger balance</p>
              <p className="mt-1 text-2xl font-bold text-[#072349]">{formatSettlementMilli(position.balanceMilli)}</p>
              <p className="mt-1 text-xs text-gray-500">Held + reserve + releasable amounts in your Route ledger</p>
            </Card>
            <Card className="p-4 border border-red-100 bg-red-50/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">You owe ChatLogix</p>
              <p className="mt-1 text-2xl font-bold text-red-800">{formatSettlementMilli(position.owedMilli)}</p>
              <p className="mt-1 text-xs text-red-700/80">Refunds or fees not yet covered</p>
            </Card>
          </div>

          {query.data?.awaitingFunding && query.data.awaitingFunding.length > 0 && (
            <Card className="p-5 space-y-3 border-amber-200 bg-amber-50/40">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">Action needed</h2>
                <Badge variant="default">Funding</Badge>
              </div>
              <p className="text-sm text-gray-600">
                A refund needs extra funds in your settlement ledger. Pay the shortfall to complete it.
              </p>
              {query.data.awaitingFunding.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3 text-sm"
                >
                  <span>
                    Shortfall <strong>{formatSettlementMilli(row.shortfallMilli)}</strong> for a customer refund
                  </span>
                  <Button type="button" size="sm" onClick={() => void onPayShortfall(row.id)}>
                    Pay shortfall
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {activeTab === 'statement' && (
        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Monthly statement</h2>
              <p className="text-sm text-gray-600 mt-1">
                Opening balance, collections, fees, releases, refunds, and closing balance (IST month).
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-500">
                Month
                <input
                  type="month"
                  className="mt-1 block rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  value={`${statementYear}-${String(statementMonth).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split('-').map(Number);
                    if (y && m) {
                      setStatementYear(y);
                      setStatementMonth(m);
                    }
                  }}
                />
              </label>
              <Button
                type="button"
                size="sm"
                disabled={downloading || !vendorId}
                onClick={() => void onDownloadStatement()}
              >
                {downloading ? 'Downloading…' : 'Download CSV'}
              </Button>
            </div>
          </div>
          {statementQuery.isLoading && <p className="text-sm text-gray-500">Loading statement…</p>}
          {statementQuery.isError && (
            <p className="text-sm text-red-600">Could not load statement for this month.</p>
          )}
          {statementQuery.data && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Opening</p>
                <p className="mt-1 font-semibold text-gray-900">
                  {formatSettlementMilli(statementQuery.data.openingBalanceMilli)}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Gross collected</p>
                <p className="mt-1 font-semibold text-gray-900">
                  {formatPaise(statementQuery.data.movements.grossCollectedPaise)}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Net to ledger</p>
                <p className="mt-1 font-semibold text-gray-900">
                  {formatSettlementMilli(statementQuery.data.movements.netCollectedMilli)}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Released</p>
                <p className="mt-1 font-semibold text-gray-900">
                  {formatSettlementMilli(statementQuery.data.movements.releasesMilli)}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Refunds</p>
                <p className="mt-1 font-semibold text-gray-900">
                  {formatSettlementMilli(statementQuery.data.movements.refundsMilli)}
                </p>
              </div>
              <div className="rounded-lg bg-primary-50/60 p-3 border border-primary-100">
                <p className="text-xs uppercase tracking-wide text-gray-500">Closing</p>
                <p className="mt-1 font-bold text-[#072349]">
                  {formatSettlementMilli(statementQuery.data.closingBalanceMilli)}
                </p>
              </div>
            </div>
          )}
          {statementQuery.data && !statementQuery.data.balances && (
            <p className="text-xs text-amber-700">This month’s figures did not reconcile — contact support.</p>
          )}
        </Card>
      )}

      {activeTab === 'transfers' && (
        <Card className="p-5">
          <h2 className="text-base font-semibold text-gray-900">Recent transfers</h2>
          <p className="mt-1 text-sm text-gray-600">Route payouts, reserves, and holds on your linked account.</p>
          {!query.data?.transfers?.length && (
            <p className="mt-4 text-sm text-gray-500">No transfers yet.</p>
          )}
          {query.data?.transfers && query.data.transfers.length > 0 && (
            <ul className="mt-4 divide-y divide-gray-100 text-sm">
              {query.data.transfers.map((row) => (
                <li key={row.id} className="py-3 flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-800">{transferLabel(row)}</p>
                    <p className="text-xs text-gray-500">
                      Eligible {new Date(row.eligibleAt).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <p className="font-semibold text-[#072349]">
                    {formatPaise(row.amountPaise - row.reversedPaise)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {activeTab === 'invoices' && (
        <Card className="p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Platform fee invoices</h2>
            <p className="mt-1 text-sm text-gray-600">
              Monthly GST invoices for ChatLogix fees on order payments. Issued by the ChatLogix team after each month
              closes.
            </p>
          </div>
          {invoicesQuery.isLoading && <p className="text-sm text-gray-500">Loading invoices…</p>}
          {invoicesQuery.isError && (
            <p className="text-sm text-red-600">Could not load invoices.</p>
          )}
          {!invoicesQuery.isLoading && invoicesQuery.data?.length === 0 && (
            <p className="text-sm text-gray-500">No invoices yet for your shop.</p>
          )}
          {invoicesQuery.data && invoicesQuery.data.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {invoicesQuery.data.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">
                      {inv.invoiceDisplay ?? inv.invoiceNumber}
                      <span className="ml-2 text-gray-500 font-normal">· {inv.monthKey}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {inv.paymentCount} payment(s) · {formatAmountWithSymbol(inv.platformFeePaise)} incl. GST
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={invoiceDownloading === inv.id}
                    onClick={() => void onDownloadInvoice(inv.id)}
                  >
                    {invoiceDownloading === inv.id ? 'Downloading…' : 'PDF'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
