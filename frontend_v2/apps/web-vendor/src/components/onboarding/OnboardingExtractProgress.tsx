import type { PageProgress } from '../../types/catalogImport';
import { onboardingCopy } from './onboardingCopy';

interface Props {
  readonly progress: PageProgress[];
}

export function OnboardingExtractProgress({ progress }: Props) {
  const done = progress.filter((p) => p.status === 'done').length;
  const total = progress.length;
  const items = progress.reduce((sum, p) => sum + (p.rowsExtracted ?? 0), 0);
  const failed = progress.filter((p) => p.status === 'failed').length;
  const pct = total > 0 ? Math.max(8, Math.round((done / total) * 100)) : 18;

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-5">
      <p className="text-sm font-medium text-gray-900">{onboardingCopy.step2.reading}</p>
      <p className="mt-1 text-sm text-gray-500">
        {total > 0
          ? `${done} of ${total} photos done${items ? ` · ${items} items so far` : ''}${
              failed ? ` · ${failed} could not be read` : ''
            }`
          : onboardingCopy.step2.readingWait}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-primary-500 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
