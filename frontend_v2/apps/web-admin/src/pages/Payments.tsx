import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@chatlogix/ui';
import { formatPaiseAsRupees, formatUsdInrRate } from '../lib/money';
import { getPlatformSettings } from '../lib/settings';

const LINK_CLASS =
  'mt-3 inline-flex text-sm font-medium text-primary-600 hover:text-primary-700 underline-offset-2 hover:underline';

export function Payments() {
  const settingsQuery = useQuery({
    queryKey: ['admin-platform-settings'],
    queryFn: getPlatformSettings,
  });

  const settings = settingsQuery.data;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[#072349] sm:text-3xl">Payments & settlement</h1>
        <p className="mt-1 text-sm text-gray-500">
          Order-money (Razorpay Route) is separate from the AI wallet. Configure platform fees here; manage per-vendor
          settlement on the Vendors page.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-base font-semibold text-[#072349]">Platform billing</h2>
          <p className="mt-1 text-sm text-gray-600">
            Wallet top-up limits, trial grant, catalog caps, and per-message platform fees (AI wallet charges).
          </p>
          {settings && !settingsQuery.isLoading && (
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-gray-500">Per AI turn</dt>
                <dd className="font-medium">{formatPaiseAsRupees(settings.platformFeePerTurnPaise)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Outbound media</dt>
                <dd className="font-medium">{formatPaiseAsRupees(settings.platformFeeOutboundMediaPaise)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Trial grant</dt>
                <dd className="font-medium">{formatPaiseAsRupees(settings.trialGrantPaise)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">USD / INR</dt>
                <dd className="font-medium">{formatUsdInrRate(settings.effectiveUsdToInrRate)}</dd>
              </div>
            </dl>
          )}
          <Link to="/billing" className={LINK_CLASS}>Edit platform settings →</Link>
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold text-[#072349]">Tax reports</h2>
          <p className="mt-1 text-sm text-gray-600">
            Monthly GSTR-8 TCS and 194-O TDS from captured customer payments. Close a month to post withheld-tax
            refund adjustments to vendor ledgers.
          </p>
          <Link to="/tax-reports" className={LINK_CLASS}>Open tax reports →</Link>
        </Card>

        <Card className="p-5 sm:col-span-2">
          <h2 className="text-base font-semibold text-[#072349]">Vendor settlement controls</h2>
          <p className="mt-1 text-sm text-gray-600">
            Freeze Route releases, set rolling reserve, and issue platform-fee invoices from each vendor&apos;s detail
            panel under <strong className="font-medium text-gray-800">Vendors</strong>.
          </p>
          <Link to="/vendors" className={LINK_CLASS}>Go to vendors →</Link>
        </Card>
      </div>
    </div>
  );
}
