import { useEffect, useRef } from 'react';
import { patchDraft } from '../lib/catalogImport';
import type { NormalizedProductDraft } from '../types/catalogImport';

/**
 * Debounced autosave of in-progress draft edits so a refresh mid-review
 * restores the latest grid state. Server merges draftEdits into the job
 * result; next load reads draftEdits in preference to the original
 * normalizedProducts snapshot.
 */
export function useCatalogImportAutosave(
  jobId: string | undefined,
  draftEdits: NormalizedProductDraft[],
  debounceMs = 1000
) {
  const lastSerialized = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const serialized = JSON.stringify(draftEdits);
    if (serialized === lastSerialized.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await patchDraft(jobId, draftEdits);
        lastSerialized.current = serialized;
      } catch {
        // Swallow — autosave is best-effort; we'll retry on next keystroke.
      }
    }, debounceMs);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [jobId, draftEdits, debounceMs]);
}
