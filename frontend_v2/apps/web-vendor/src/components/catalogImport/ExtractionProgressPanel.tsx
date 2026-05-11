import { Badge } from '@chatlogix/ui';
import type { PageProgress } from '../../types/catalogImport';

interface Props {
  readonly progress: PageProgress[];
  readonly firstProductMs?: number;
}

function statusVariant(s: PageProgress['status']): 'default' | 'info' | 'success' | 'warning' {
  switch (s) {
    case 'queued': return 'default';
    case 'running': return 'info';
    case 'done': return 'success';
    case 'failed': return 'warning';
  }
}

export function ExtractionProgressPanel({ progress, firstProductMs }: Readonly<Props>) {
  const done = progress.filter((p) => p.status === 'done').length;
  const failed = progress.filter((p) => p.status === 'failed').length;
  const totalRows = progress.reduce((acc, p) => acc + (p.rowsExtracted ?? 0), 0);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-gray-700">Extracting products</h3>
        <span className="text-xs text-gray-500">
          {done}/{progress.length} pages done
          {failed > 0 ? ` · ${failed} failed` : ''}
          {` · ${totalRows} rows`}
        </span>
      </div>
      {firstProductMs !== undefined && (
        <p className="mt-1 text-xs text-primary-500">
          First product ready in {(firstProductMs / 1000).toFixed(1)}s
        </p>
      )}
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {progress.map((p) => (
          <li key={p.pageIndex} className="flex items-center justify-between rounded-lg border border-gray-100 px-2 py-1 text-xs">
            <span className="truncate text-gray-700">Page {p.pageIndex + 1}</span>
            <Badge variant={statusVariant(p.status)}>
              {p.status === 'done' ? `${p.rowsExtracted ?? 0}` : p.status}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
