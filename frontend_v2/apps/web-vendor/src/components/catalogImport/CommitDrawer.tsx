import { Button } from '@chatlogix/ui';
import type { CommitSummary } from '../../types/catalogImport';

interface Props {
  readonly summary: CommitSummary | null;
  readonly onCommit: () => void;
  readonly onDryRun: () => void;
  readonly isBusy: boolean;
  readonly canCommit: boolean;
}

export function CommitDrawer({ summary, onCommit, onDryRun, isBusy, canCommit }: Readonly<Props>) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Commit to catalog</h3>
      <p className="mt-1 text-xs text-gray-500">
        Dry-run previews what will change without touching the database. Commit
        writes products; rows without price commit as inactive.
      </p>

      {summary && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Stat label="Created" value={summary.createdCount} />
          <Stat label="Updated" value={summary.updatedCount} />
          <Stat label="Skipped" value={summary.skippedCount} />
          <Stat label="Deferred" value={summary.deferredCount} />
          <Stat label="Failed" value={summary.failed.length} />
          <Stat label="Dry run" value={summary.dryRun ? 'yes' : 'no'} />
          <Stat label="Wave" value={summary.wave} />
          <Stat label="AI config" value={summary.aiConfigApplied ? 'applied' : '—'} />
        </dl>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onDryRun} disabled={isBusy || !canCommit}>
          Dry run
        </Button>
        <Button variant="primary" size="md" onClick={onCommit} disabled={isBusy || !canCommit}>
          {isBusy ? 'Committing…' : 'Commit & go live'}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-800">{value}</div>
    </div>
  );
}
