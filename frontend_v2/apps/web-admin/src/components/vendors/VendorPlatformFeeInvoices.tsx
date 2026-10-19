import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@chatlogix/ui';
import { formatPaiseAsRupees } from '../../lib/money';
import {
  issueVendorPlatformFeeInvoice,
  listVendorPlatformFeeInvoices,
  type VendorPlatformFeeInvoiceRow,
} from '../../lib/vendors';

interface VendorPlatformFeeInvoicesProps {
  vendorId: string;
}

function previousIstMonthKey(): string {
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
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function VendorPlatformFeeInvoices({ vendorId }: VendorPlatformFeeInvoicesProps) {
  const queryClient = useQueryClient();
  const [monthKey, setMonthKey] = useState(previousIstMonthKey());

  const invoicesQuery = useQuery({
    queryKey: ['admin-vendor-platform-fee-invoices', vendorId],
    queryFn: () => listVendorPlatformFeeInvoices(vendorId),
  });

  const issueMutation = useMutation({
    mutationFn: () => issueVendorPlatformFeeInvoice(vendorId, monthKey),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ['admin-vendor-platform-fee-invoices', vendorId] }),
  });

  const invoices: VendorPlatformFeeInvoiceRow[] = invoicesQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[#072349]">Platform fee invoices</h3>
        <p className="mt-0.5 text-sm text-gray-500">
          Monthly tax invoice for ChatLogix order-payment fees (Route). Vendors download PDFs from their portal.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="text-gray-600">Issue for month</span>
          <input
            type="month"
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
          />
        </label>
        <Button type="button" size="sm" disabled={issueMutation.isPending} onClick={() => issueMutation.mutate()}>
          {issueMutation.isPending ? 'Issuing…' : 'Issue invoice'}
        </Button>
      </div>
      {issueMutation.isError && (
        <p className="text-sm text-red-600">
          {issueMutation.error instanceof Error ? issueMutation.error.message : 'Could not issue invoice'}
        </p>
      )}

      {invoicesQuery.isLoading && <p className="text-sm text-gray-500">Loading invoices…</p>}
      {!invoicesQuery.isLoading && invoices.length === 0 && (
        <p className="text-sm text-gray-500">No invoices issued yet.</p>
      )}
      {invoices.length > 0 && (
        <ul className="divide-y divide-gray-100 text-sm">
          {invoices.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="font-medium text-gray-800">
                  {inv.invoiceDisplay ?? inv.invoiceNumber} · {inv.monthKey}
                </p>
                <p className="text-xs text-gray-500">
                  {inv.paymentCount} payment(s) · issued {new Date(inv.issuedAt).toLocaleDateString('en-IN')}
                </p>
              </div>
              <span className="font-medium text-[#072349]">{formatPaiseAsRupees(inv.platformFeePaise)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
