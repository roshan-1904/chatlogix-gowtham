import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@chatlogix/ui';
import { getJob } from '../lib/catalogImport';
import { useCatalogImportEnabled, useVendorConfig } from '../hooks/useVendorConfig';
import { TestMessageConsole } from '../components/catalogImport/TestMessageConsole';
import type { CatalogImportJob } from '../types/catalogImport';

export function CatalogImportGoLive() {
  const { jobId } = useParams<{ jobId: string }>();
  const enabled = useCatalogImportEnabled();
  const { data: vendor } = useVendorConfig();
  const navigate = useNavigate();
  const [job, setJob] = useState<CatalogImportJob | null>(null);

  useEffect(() => {
    if (!jobId) return;
    getJob(jobId).then(setJob).catch(() => setJob(null));
  }, [jobId]);

  if (enabled === false) {
    return <div className="p-6 text-sm text-gray-600">Smart Import isn&apos;t enabled.</div>;
  }

  const summary = job?.result?.commitSummary?.summary;
  const deferredCount = (job?.result?.deferred ?? []).length;
  const totalCommitted = summary ? summary.createdCount + summary.updatedCount : 0;

  return (
    <div className="space-y-4 p-1 sm:p-2">
      <header>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">You&apos;re live</h1>
        <p className="text-xs text-gray-500 sm:text-sm">
          {totalCommitted > 0
            ? `${totalCommitted} products are in your catalog. Here's what to do next.`
            : 'Walk through the setup so customers can start chatting with your bot.'}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-800">Next steps</h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-700">
            <ChecklistItem
              done={(vendor?.walletBalance ?? 0) > 0}
              title="Top up wallet"
              hint="Credits pay for each customer message the AI handles."
              to="/settings"
              toLabel="Open billing"
            />
            <ChecklistItem
              done={!!summary}
              title="Products committed"
              hint={`${totalCommitted} now live${deferredCount > 0 ? `, ${deferredCount} waiting in review` : ''}.`}
              to="/catalog"
              toLabel="Open catalog"
            />
            <ChecklistItem
              done={false}
              title="Share your WhatsApp number"
              hint="Send the wa.me link or QR to a test customer and place a sample order."
              to="/settings"
              toLabel="Get link & QR"
            />
          </ul>
        </section>

        <TestMessageConsole />
      </div>

      {deferredCount > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {deferredCount} low-confidence product{deferredCount === 1 ? '' : 's'} are
          waiting for review. They won&apos;t sell until you finish them.
          <div className="mt-2">
            <Button variant="secondary" size="sm" onClick={() => navigate(`/catalog/import?jobId=${jobId}`)}>
              Review now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface ItemProps {
  readonly done: boolean;
  readonly title: string;
  readonly hint: string;
  readonly to: string;
  readonly toLabel: string;
}

function ChecklistItem({ done, title, hint, to, toLabel }: Readonly<ItemProps>) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
          done ? 'bg-primary-500 text-white' : 'border border-gray-300 text-gray-400'
        }`}
      >
        {done ? '✓' : ''}
      </span>
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
      <Link to={to} className="text-xs font-medium text-primary-500 hover:underline">
        {toLabel}
      </Link>
    </li>
  );
}
