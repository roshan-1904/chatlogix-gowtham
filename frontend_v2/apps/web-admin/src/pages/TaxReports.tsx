import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card } from '@chatlogix/ui';
import { formatPaiseAsRupees } from '../lib/money';
import { closeTaxReportMonth, getMonthlyTaxReports } from '../lib/taxReports';

function previousIstMonth(): string {
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

function TotalsGrid({ totals }: { totals: { netTaxableValuePaise: number; netGstTcsPaise: number; netTdsPaise: number; paymentCount: number } }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs uppercase tracking-wide text-gray-500">Payments</dt>
        <dd className="font-semibold text-[#072349]">{totals.paymentCount}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-gray-500">Net taxable</dt>
        <dd className="font-semibold text-[#072349]">{formatPaiseAsRupees(totals.netTaxableValuePaise)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-gray-500">Net TCS (GST)</dt>
        <dd className="font-semibold text-[#072349]">{formatPaiseAsRupees(totals.netGstTcsPaise)}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase tracking-wide text-gray-500">Net TDS 194-O</dt>
        <dd className="font-semibold text-[#072349]">{formatPaiseAsRupees(totals.netTdsPaise)}</dd>
      </div>
    </dl>
  );
}

export function TaxReports() {
  const queryClient = useQueryClient();
  const defaultMonth = useMemo(() => previousIstMonth(), []);
  const [yearMonth, setYearMonth] = useState(defaultMonth);

  const reportsQuery = useQuery({
    queryKey: ['admin-tax-reports', yearMonth],
    queryFn: () => getMonthlyTaxReports(yearMonth),
  });

  const closeMutation = useMutation({
    mutationFn: () => closeTaxReportMonth(yearMonth),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-tax-reports', yearMonth] }),
  });

  const data = reportsQuery.data;
  const closed = data?.close.closed ?? false;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[#072349] sm:text-3xl">Tax reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          Monthly GSTR-8 (TCS) and 194-O TDS from captured order payments. Amounts are in rupees.
        </p>
      </header>

      <Card className="flex flex-wrap items-end justify-between gap-4 p-5">
        <label className="text-sm">
          <span className="font-medium text-gray-700">Report month (IST)</span>
          <input
            type="month"
            className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {closed ? (
            <Badge variant="success">Closed</Badge>
          ) : (
            <Badge variant="default">Open</Badge>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={closed || closeMutation.isPending}
            onClick={() => closeMutation.mutate()}
          >
            {closeMutation.isPending ? 'Closing…' : 'Close month'}
          </Button>
        </div>
      </Card>

      {reportsQuery.isLoading && <p className="text-sm text-gray-500">Loading tax reports…</p>}
      {reportsQuery.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Could not load reports for {yearMonth}.
        </div>
      )}

      {data && (
        <>
          {data.close.closedAt && (
            <p className="text-xs text-gray-500">
              Closed {new Date(data.close.closedAt).toLocaleString('en-IN')}
              {data.close.adjustmentCount > 0
                ? ` · ${data.close.adjustmentCount} withheld-tax refund adjustment(s) posted`
                : ''}
            </p>
          )}

          <Card className="space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-[#072349]">GSTR-8 — Table 3 (TCS)</h2>
              <p className="mt-0.5 text-sm text-gray-500">Per-supplier GSTIN totals for marketplace TCS filing.</p>
            </div>
            <TotalsGrid totals={data.gstr8.totals} />
            {data.gstr8.table3.length === 0 ? (
              <p className="text-sm text-gray-500">No captured payments this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Supplier</th>
                      <th className="py-2 pr-4 font-medium">GSTIN</th>
                      <th className="py-2 pr-4 font-medium text-right">Taxable value</th>
                      <th className="py-2 font-medium text-right">TCS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.gstr8.table3.map((row) => (
                      <tr key={row.vendorId}>
                        <td className="py-2.5 pr-4 font-medium text-gray-800">{row.supplierName}</td>
                        <td className="py-2.5 pr-4 text-gray-600">{row.supplierGstin}</td>
                        <td className="py-2.5 pr-4 text-right">{formatPaiseAsRupees(row.taxableValuePaise)}</td>
                        <td className="py-2.5 text-right">{formatPaiseAsRupees(row.tcsTotalPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold text-[#072349]">194-O TDS (e-commerce)</h2>
              <p className="mt-0.5 text-sm text-gray-500">Per-vendor PAN and gross sales for TDS reporting.</p>
            </div>
            <TotalsGrid totals={data.tds194o.totals} />
            {data.tds194o.suppliers.length === 0 ? (
              <p className="text-sm text-gray-500">No captured payments this month.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Supplier</th>
                      <th className="py-2 pr-4 font-medium">PAN</th>
                      <th className="py-2 pr-4 font-medium text-right">Gross sales</th>
                      <th className="py-2 font-medium text-right">TDS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.tds194o.suppliers.map((row) => (
                      <tr key={row.vendorId}>
                        <td className="py-2.5 pr-4 font-medium text-gray-800">{row.supplierName}</td>
                        <td className="py-2.5 pr-4 text-gray-600">{row.supplierPan ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-right">{formatPaiseAsRupees(row.grossSalesPaise)}</td>
                        <td className="py-2.5 text-right">{formatPaiseAsRupees(row.tdsPaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
