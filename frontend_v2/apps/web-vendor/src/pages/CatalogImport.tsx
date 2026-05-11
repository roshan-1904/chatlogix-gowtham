import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@chatlogix/auth';
import { Button } from '@chatlogix/ui';
import { UploadDropzone, type UploadedKey } from '../components/catalogImport/UploadDropzone';
import { ExtractionProgressPanel } from '../components/catalogImport/ExtractionProgressPanel';
import { ReviewGrid } from '../components/catalogImport/ReviewGrid';
import { MicroInterview } from '../components/catalogImport/MicroInterview';
import { CommitDrawer } from '../components/catalogImport/CommitDrawer';
import { CostEstimateBanner } from '../components/catalogImport/CostEstimateBanner';
import { useCatalogImportAutosave } from '../hooks/useCatalogImportAutosave';
import { useCatalogImportEnabled } from '../hooks/useVendorConfig';
import {
  analyze,
  commit,
  getJob,
  streamJob
} from '../lib/catalogImport';
import type {
  AIConfigSections,
  CommitSummary,
  NormalizedProductDraft,
  PageProgress
} from '../types/catalogImport';

type Phase = 'idle' | 'uploading' | 'analyzing' | 'reviewing' | 'committing' | 'done';

function newJobId(): string {
  return crypto.randomUUID();
}

export function CatalogImport() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const vendorId = user?.vendorId;
  const enabled = useCatalogImportEnabled();
  const [params, setParams] = useSearchParams();
  const urlJobId = params.get('jobId') ?? undefined;

  const [jobId, setJobId] = useState<string>(() => urlJobId ?? newJobId());
  const [phase, setPhase] = useState<Phase>(urlJobId ? 'analyzing' : 'idle');
  const [uploads, setUploads] = useState<UploadedKey[]>([]);
  const [progress, setProgress] = useState<PageProgress[]>([]);
  const [drafts, setDrafts] = useState<NormalizedProductDraft[]>([]);
  const [aiConfig, setAiConfig] = useState<AIConfigSections>({});
  const [applyAI, setApplyAI] = useState(true);
  const [firstProductMs, setFirstProductMs] = useState<number | undefined>();
  const [summary, setSummary] = useState<CommitSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const analyzeStart = useRef<number | null>(null);

  useCatalogImportAutosave(phase === 'reviewing' ? jobId : undefined, drafts);

  const imageKeys = useMemo(
    () => uploads.filter((u) => u.kind === 'image').map((u) => u.key),
    [uploads]
  );
  const tabularKey = uploads.find((u) => u.kind === 'tabular')?.key;

  useEffect(() => {
    if (!urlJobId) return;
    void (async () => {
      try {
        const job = await getJob(urlJobId);
        const rows = job.result?.draftEdits ?? job.result?.normalizedProducts ?? [];
        setDrafts(rows);
        setProgress(job.result?.pageProgress ?? []);
        if (job.status === 'ready') setPhase('reviewing');
        else if (job.status === 'processing' || job.status === 'queued') setPhase('analyzing');
        else if (job.status === 'failed') toast.error(job.error ?? 'Analyze failed');
      } catch (err) {
        toast.error((err as Error).message);
      }
    })();
  }, [urlJobId]);

  useEffect(() => {
    if (phase !== 'analyzing') return;
    const close = streamJob(jobId, {
      onEvent: (type, data) => {
        if (type === 'page.started' || type === 'page.completed' || type === 'page.failed') {
          setProgress((prev) => {
            const next = [...prev];
            const idx = next.findIndex((p) => p.pageIndex === (data.pageIndex as number));
            const entry: PageProgress = {
              pageIndex: data.pageIndex as number,
              key: (data.key as string) ?? '',
              status: type === 'page.started' ? 'running' : type === 'page.completed' ? 'done' : 'failed',
              rowsExtracted: data.rowsExtracted as number | undefined,
              error: data.error as string | undefined
            };
            if (idx >= 0) next[idx] = { ...next[idx], ...entry };
            else next.push(entry);
            return next.sort((a, b) => a.pageIndex - b.pageIndex);
          });
          if (type === 'page.completed' && firstProductMs === undefined && analyzeStart.current) {
            setFirstProductMs(Date.now() - analyzeStart.current);
          }
        }
      },
      onTerminal: (type) => {
        if (type === 'job.failed') {
          toast.error('Extraction failed');
          setPhase('idle');
          return;
        }
        void getJob(jobId)
          .then((job) => {
            setDrafts(job.result?.draftEdits ?? job.result?.normalizedProducts ?? []);
            setProgress(job.result?.pageProgress ?? []);
            setPhase('reviewing');
          })
          .catch((err: Error) => toast.error(err.message));
      },
      onError: (err) => {
        console.warn('stream error', err);
      }
    });
    return close;
  }, [phase, jobId, firstProductMs]);

  const startAnalyze = useCallback(async () => {
    if (imageKeys.length === 0 && !tabularKey) {
      toast.error('Upload at least one image or file first.');
      return;
    }
    setBusy(true);
    try {
      analyzeStart.current = Date.now();
      setFirstProductMs(undefined);
      const started = await analyze({
        brochureImageKeys: imageKeys,
        tabularFileKey: tabularKey,
        importOptions: { currency: 'INR', autoGenerateAIConfig: true }
      });
      // Backend owns the canonical job id; use it for stream/getJob lookups.
      setJobId(started.jobId);
      setParams({ jobId: started.jobId });
      setPhase('analyzing');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [imageKeys, tabularKey, jobId, setParams]);

  const runCommit = useCallback(
    async (dryRun: boolean) => {
      if (!vendorId) {
        toast.error('Missing vendor context. Please sign in again.');
        return;
      }
      setBusy(true);
      setPhase('committing');
      try {
        const approved = drafts.filter(
          (d) => d.name && d.baseUnit && d.baseQuantity > 0
        );
        const payload = {
          jobId,
          approvedProducts: approved,
          applyAIConfig: applyAI ? aiConfig : undefined,
          idempotencyKey: `${vendorId}:${jobId}`,
          dryRun,
          wave: 1 as const
        };
        const out = await commit(payload);
        setSummary(out);
        if (!dryRun) {
          toast.success(`Committed ${out.createdCount + out.updatedCount} products`);
          setPhase('done');
          setTimeout(() => navigate(`/catalog/import/${jobId}/go-live`), 600);
        } else {
          toast.success('Dry-run preview ready');
          setPhase('reviewing');
        }
      } catch (err) {
        toast.error((err as Error).message);
        setPhase('reviewing');
      } finally {
        setBusy(false);
      }
    },
    [drafts, jobId, applyAI, aiConfig, navigate, vendorId]
  );

  if (enabled === false) {
    return (
      <div className="p-6 text-sm text-gray-600">
        Smart Import isn&apos;t enabled for your vendor account yet. Contact support to
        turn it on.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-1 sm:p-2">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Smart Import</h1>
          <p className="text-xs text-gray-500 sm:text-sm">
            Upload a brochure, CSV, or Excel. AI turns it into a ready catalog.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/catalog')}>
          Back to catalog
        </Button>
      </header>

      {(phase === 'idle' || phase === 'uploading') && (
        <div className="space-y-3">
          <CostEstimateBanner imageCount={imageKeys.length} hasTabular={!!tabularKey} />
          <UploadDropzone
            jobId={jobId}
            disabled={busy}
            onUploaded={(entry) => {
              setUploads((u) => [...u, entry]);
              setPhase('uploading');
            }}
          />
          {uploads.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
              <span className="text-gray-700">
                {imageKeys.length} image{imageKeys.length === 1 ? '' : 's'}
                {tabularKey ? ' + 1 tabular file' : ''} uploaded
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setUploads([]);
                    setJobId(newJobId());
                    setPhase('idle');
                  }}
                  disabled={busy}
                >
                  Reset
                </Button>
                <Button onClick={startAnalyze} disabled={busy}>
                  {busy ? 'Starting…' : 'Analyze'}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'analyzing' && (
        <ExtractionProgressPanel progress={progress} firstProductMs={firstProductMs} />
      )}

      {(phase === 'reviewing' || phase === 'committing' || phase === 'done') && (
        <div className="space-y-4">
          {progress.length > 0 && (
            <ExtractionProgressPanel progress={progress} firstProductMs={firstProductMs} />
          )}

          <ReviewGrid drafts={drafts} onChange={setDrafts} />

          <MicroInterview initial={aiConfig} onChange={setAiConfig} />

          <label className="flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={applyAI}
              onChange={(e) => setApplyAI(e.target.checked)}
            />
            Apply these answers to the AI on commit
          </label>

          <CommitDrawer
            summary={summary}
            onDryRun={() => runCommit(true)}
            onCommit={() => runCommit(false)}
            isBusy={busy}
            canCommit={drafts.length > 0}
          />
        </div>
      )}
    </div>
  );
}
