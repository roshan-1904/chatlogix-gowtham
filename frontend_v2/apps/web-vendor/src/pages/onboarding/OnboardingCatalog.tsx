import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@chatlogix/auth';
import { Button } from '@chatlogix/ui';
import { OnboardingLayout } from '../../components/onboarding/OnboardingLayout';
import { OnboardingActionSkeleton } from '../../components/onboarding/OnboardingSkeleton';
import { OnboardingGuideChatPreview } from '../../components/onboarding/OnboardingGuidePanel';
import { OnboardingExtractProgress } from '../../components/onboarding/OnboardingExtractProgress';
import { OnboardingProductEditor } from '../../components/onboarding/OnboardingProductEditor';
import { onboardingCopy } from '../../components/onboarding/onboardingCopy';
import { mapOnboardingError } from '../../components/onboarding/mapOnboardingError';
import { UploadDropzone, type UploadedKey } from '../../components/catalogImport/UploadDropzone';
import { useCatalogImportAutosave } from '../../hooks/useCatalogImportAutosave';
import { fetchOnboardingProfile, fetchTrialWallet, patchOnboarding, pathAfterCatalog } from '../../lib/onboarding';
import { analyze, commit, getJob, streamJob } from '../../lib/catalogImport';
import {
  committableProducts,
  createManualProductDraft,
  limitDemoProducts,
  ONBOARDING_DEMO_PRODUCT_LIMIT,
  repairInflatedCatalogPrices,
} from '../../lib/productDraft';
import type { CatalogImportJob, NormalizedProductDraft, PageProgress } from '../../types/catalogImport';

type ExtractedShopFacts = NonNullable<CatalogImportJob['result']>['vendorProfile'];

function ShopFactsBanner({ profile }: { profile?: ExtractedShopFacts }) {
  if (!profile) return null;
  const bits = [
    profile.businessName?.value,
    profile.address?.value,
    profile.city?.value,
    profile.hours?.value,
    profile.deliveryNotes?.value,
  ].filter((bit): bit is string => Boolean(bit && bit.trim()));
  if (bits.length === 0) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-sm font-medium text-gray-900">From your catalog</p>
      <p className="mt-1 text-sm text-gray-700">{bits.join(' · ')}</p>
      <p className="mt-1 text-xs text-gray-500">Correct products below. Shop details can be edited on the next screens.</p>
    </div>
  );
}

function CatalogUploadFields({
  jobId,
  disabled,
  busy,
  walletOk,
  uploads,
  onUploaded,
  onAnalyze,
  continueLabel,
}: {
  jobId: string;
  disabled: boolean;
  busy: boolean;
  walletOk: boolean;
  uploads: UploadedKey[];
  onUploaded: (entry: UploadedKey) => void;
  onAnalyze: () => void;
  continueLabel: string;
}) {
  return (
    <>
      <UploadDropzone
        jobId={jobId}
        maxImages={ONBOARDING_DEMO_PRODUCT_LIMIT}
        disabled={disabled}
        onUploaded={onUploaded}
        variant="split"
        takePhotoLabel={onboardingCopy.step2.takePhoto}
        uploadFileLabel={onboardingCopy.step2.uploadFile}
        exampleHint={onboardingCopy.step2.uploadExample}
      />
      {uploads.length > 0 && (
        <Button
          onClick={onAnalyze}
          disabled={busy || !walletOk}
          className="mt-4 w-full"
          isLoading={busy}
        >
          {continueLabel}
        </Button>
      )}
    </>
  );
}

function draftsFromJob(job: CatalogImportJob): NormalizedProductDraft[] {
  return repairInflatedCatalogPrices(
    limitDemoProducts(job.result?.draftEdits ?? job.result?.normalizedProducts ?? [])
  );
}

function catalogJobIdFromProfile(
  data: Record<string, unknown> | null | undefined
): string | undefined {
  const id = data?.catalogJobId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

type Phase = 'upload' | 'reading' | 'review';

export function OnboardingCatalog() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const copy = onboardingCopy.step2;

  const [phase, setPhase] = useState<Phase>('upload');
  const [uploadJobId] = useState(() => crypto.randomUUID());
  const [importJobId, setImportJobId] = useState<string | undefined>();
  const [uploads, setUploads] = useState<UploadedKey[]>([]);
  const [progress, setProgress] = useState<PageProgress[]>([]);
  const [drafts, setDrafts] = useState<NormalizedProductDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [walletOk, setWalletOk] = useState(true);
  const [alreadyCommitted, setAlreadyCommitted] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [shopFacts, setShopFacts] = useState<ExtractedShopFacts>();
  const [sourceUploads, setSourceUploads] = useState<UploadedKey[]>([]);

  const vendorId = user?.vendorId;
  const imageKeys = useMemo(
    () => uploads.filter((u) => u.kind === 'image').map((u) => u.key),
    [uploads]
  );
  const tabularKey = uploads.find((u) => u.kind === 'tabular')?.key;

  useCatalogImportAutosave(phase === 'review' ? importJobId : undefined, drafts);

  const enterReview = useCallback((job: CatalogImportJob) => {
    setImportJobId(job.id);
    setDrafts(draftsFromJob(job));
    setProgress(job.result?.pageProgress ?? []);
    setShopFacts(job.result?.vendorProfile);
    setAlreadyCommitted(Boolean(job.result?.commitSummary));
    setPhase('review');
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [profile, wallet] = await Promise.all([fetchOnboardingProfile(), fetchTrialWallet()]);
        setWalletOk(wallet.balancePaise > 0);
        const savedId = catalogJobIdFromProfile(profile.onboardingData);
        if (!savedId) return;
        const job = await getJob(savedId);
        if (job.status === 'ready' || job.status === 'failed') {
          enterReview(job);
        } else if (job.status === 'processing' || job.status === 'queued') {
          setImportJobId(job.id);
          setProgress(job.result?.pageProgress ?? []);
          setPhase('reading');
        }
      } catch {
        // Stay on upload if the saved job cannot be loaded.
      } finally {
        setHydrating(false);
      }
    })();
  }, [enterReview]);

  useEffect(() => {
    if (phase !== 'reading' || !importJobId) return;
    return streamJob(importJobId, {
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
              error: data.error as string | undefined,
            };
            if (idx >= 0) next[idx] = { ...next[idx], ...entry };
            else next.push(entry);
            return next.sort((a, b) => a.pageIndex - b.pageIndex);
          });
        }
      },
      onTerminal: (type) => {
        if (type === 'job.failed') {
          toast.error('We could not read that file. Add items by hand, or try another photo.');
        }
        void getJob(importJobId)
          .then(enterReview)
          .catch((err: Error) => toast.error(mapOnboardingError(err)));
      },
    });
  }, [phase, importJobId, enterReview]);

  const handleAnalyze = async () => {
    const wallet = await fetchTrialWallet();
    setWalletOk(wallet.balancePaise > 0);
    if (wallet.balancePaise <= 0) {
      toast.error('Your trial balance is empty. You can skip and add products later.');
      return;
    }
    if (!uploads.length) {
      toast.error('Please upload a file first, or skip for now.');
      return;
    }
    setBusy(true);
    try {
      const started = await analyze({
        brochureImageKeys: imageKeys,
        tabularFileKey: tabularKey,
        importOptions: {
          currency: 'INR',
          autoGenerateAIConfig: true,
          maxProducts: ONBOARDING_DEMO_PRODUCT_LIMIT,
        },
      });
      setImportJobId(started.jobId);
      setProgress([]);
      setSourceUploads(uploads);
      setUploads([]);
      await patchOnboarding({
        step: 1,
        data: { catalogJobId: started.jobId, skipped: false },
        advance: false,
      });
      setPhase('reading');
    } catch (err) {
      toast.error(mapOnboardingError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAddByHand = () => {
    const next = [
      createManualProductDraft(),
      createManualProductDraft(),
      createManualProductDraft(),
    ];
    setDrafts(next);
    setPhase('review');
  };

  const handleSkip = async () => {
    try {
      await patchOnboarding({ step: 1, data: { skipped: true }, advance: true });
      const profile = await fetchOnboardingProfile();
      navigate(pathAfterCatalog(profile));
    } catch (err) {
      toast.error(mapOnboardingError(err));
    }
  };

  const handleSave = async () => {
    if (!vendorId || !importJobId) {
      toast.error('Please sign in again, then save your products.');
      return;
    }
    const approved = committableProducts(drafts).map((row) => ({
      ...row,
      name: row.name.trim(),
      baseUnit: row.baseUnit.trim(),
      description: row.description?.trim() || undefined,
    }));
    if (approved.length === 0) {
      toast.error('Add at least one product with a name, or skip for now.');
      return;
    }
    setBusy(true);
    try {
      const idempotencyKey = alreadyCommitted
        ? `${vendorId}:${importJobId}:retry:${crypto.randomUUID()}`
        : `${vendorId}:${importJobId}`;
      const summary = await commit({
        jobId: importJobId,
        approvedProducts: approved,
        idempotencyKey,
        dryRun: false,
        wave: 1,
      });
      await patchOnboarding({
        step: 1,
        data: {
          catalogJobId: importJobId,
          skipped: false,
          productCount: summary.createdCount + summary.updatedCount,
        },
        advance: true,
      });
      toast.success(
        `Saved ${summary.createdCount + summary.updatedCount} product${
          summary.createdCount + summary.updatedCount === 1 ? '' : 's'
        }`
      );
      const profile = await fetchOnboardingProfile();
      navigate(pathAfterCatalog(profile));
    } catch (err) {
      toast.error(mapOnboardingError(err));
    } finally {
      setBusy(false);
    }
  };

  const showUpload = phase !== 'reading';
  const hasProducts = drafts.length > 0;
  const reviewing = phase === 'review' && hasProducts;

  const guide = reviewing ? copy.reviewGuide : copy.guide;
  const catalogPreview = (
    <OnboardingGuideChatPreview
      chatName={copy.guide.preview.chatName}
      status={copy.guide.preview.status}
      customerText={copy.guide.preview.customerText}
      assistantText={copy.guide.preview.assistantText}
    />
  );

  if (hydrating) {
    return (
      <OnboardingLayout step={1} guide={copy.guide} guideVisual={catalogPreview}>
        <OnboardingActionSkeleton rows={2} />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      step={1}
      guide={guide}
      guideVisual={reviewing ? undefined : catalogPreview}
      splitEven={reviewing}
    >
      {showUpload && (
        <div className={reviewing ? 'mb-6' : 'mb-8'}>
          {phase === 'review' && !hasProducts ? (
            <p className="mb-3 text-sm text-gray-600">{copy.foundNone}</p>
          ) : null}
          {!walletOk && (
            <p className="mb-4 text-sm text-amber-800">
              Trial balance is used up. Skip and submit for approval.
            </p>
          )}
          {reviewing ? (
            <details className="rounded-xl border border-gray-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
                {copy.tryAnother}
              </summary>
              <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                <CatalogUploadFields
                  jobId={uploadJobId}
                  disabled={!walletOk || busy}
                  busy={busy}
                  walletOk={walletOk}
                  uploads={uploads}
                  onUploaded={(entry) => setUploads((prev) => [...prev, entry])}
                  onAnalyze={() => void handleAnalyze()}
                  continueLabel={copy.continueUpload}
                />
              </div>
            </details>
          ) : (
            <CatalogUploadFields
              jobId={uploadJobId}
              disabled={!walletOk || busy}
              busy={busy}
              walletOk={walletOk}
              uploads={uploads}
              onUploaded={(entry) => setUploads((prev) => [...prev, entry])}
              onAnalyze={() => void handleAnalyze()}
              continueLabel={copy.continueUpload}
            />
          )}
        </div>
      )}

      {phase === 'reading' && (
        <div className="space-y-6">
          <OnboardingExtractProgress progress={progress} />
          <p className="text-center text-sm text-gray-500">{copy.skipNote}</p>
          <button
            type="button"
            onClick={() => void handleSkip()}
            className="w-full text-center text-sm text-gray-500 hover:text-gray-800"
          >
            {copy.skip}
          </button>
        </div>
      )}

      {phase !== 'reading' && (
        <div className="space-y-6">
          {hasProducts ? (
            <>
              {sourceUploads.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {sourceUploads.map((u) => (
                    <li
                      key={u.key}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1.5"
                    >
                      {u.kind === 'image' && u.previewUrl ? (
                        <img src={u.previewUrl} alt="" className="h-12 w-12 rounded-md object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 text-[10px] font-medium text-gray-600">
                          {u.file.name.split('.').pop()?.toUpperCase() ?? 'FILE'}
                        </div>
                      )}
                      <span className="max-w-[8rem] truncate pr-2 text-xs text-gray-600">{u.file.name}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ShopFactsBanner profile={shopFacts} />
              <p className="text-sm text-gray-500">
                {drafts.length} items · {copy.found}
              </p>
              <OnboardingProductEditor drafts={drafts} onChange={setDrafts} disabled={busy} />
              <Button className="w-full" onClick={() => void handleSave()} isLoading={busy} disabled={busy}>
                {copy.save}
              </Button>
            </>
          ) : phase === 'review' ? (
            <div className="space-y-3">
              <Button className="w-full" onClick={handleAddByHand} disabled={busy}>
                {copy.addByHand}
              </Button>
              <p className="text-center text-sm text-amber-800">{copy.skipWarning}</p>
              <button
                type="button"
                onClick={() => void handleSkip()}
                disabled={busy}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50"
              >
                {copy.skip}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleSkip()}
              disabled={busy}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-800 disabled:opacity-50"
            >
              {copy.skip}
            </button>
          )}
        </div>
      )}
    </OnboardingLayout>
  );
}
