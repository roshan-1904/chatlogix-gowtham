import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CommitRequest, NormalizedProductDraft } from '../../routes/schemas/catalogImport.js';
import type { CommitSummary } from '../catalogCommitService.js';

// Verifies the orchestration-layer idempotency path in catalogImportService.commit:
//
//   - First call hits commitProducts and stamps the cached summary onto
//     CatalogImportJob.result.commitSummary (or commitSummaryWave2 for wave 2).
//   - Second call with the SAME idempotencyKey returns the cached summary
//     and `replayed: true` WITHOUT re-running commitProducts (no second DB
//     transaction, no double-write).
//   - A different idempotencyKey on the same job re-runs commitProducts.
//
// commitCatalogProducts itself is mocked so this test isolates the replay
// logic; the lower-level dry-run/transactional behavior has its own unit suite.

const findUnique = vi.fn();
const mergeJobResultMock = vi.fn();
const commitProductsMock = vi.fn();
const classifyRowMock = vi.fn(
  (_row: NormalizedProductDraft): { bucket: string; warnings: string[] } => ({
    bucket: 'auto_accept',
    warnings: []
  })
);

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    catalogImportJob: { findUnique: (...a: unknown[]) => findUnique(...a) }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../catalogImportAuditService.js', () => ({
  createJob: vi.fn(),
  setJobStatus: vi.fn(),
  recordTokenUsage: vi.fn(),
  mergeJobResult: (...a: unknown[]) => mergeJobResultMock(...a)
}));

vi.mock('../catalogCommitService.js', () => ({
  commit: (...a: unknown[]) => commitProductsMock(...a)
}));

vi.mock('../catalogNormalizationService.js', () => ({
  classifyRow: (row: NormalizedProductDraft) => classifyRowMock(row)
}));

vi.mock('../catalogExtractionService.js', () => ({ extract: vi.fn() }));
vi.mock('../fileIntakeService.js', () => ({
  assertKeyBelongsToVendor: vi.fn()
}));
vi.mock('../billingService.js', () => ({ recordCatalogImportSpend: vi.fn() }));
vi.mock('../catalogImportEventBus.js', () => ({
  catalogImportEventBus: { emit: vi.fn() }
}));
vi.mock('../vendorAIConfigService.js', () => ({
  applyExtractedCatalogProfile: vi.fn().mockResolvedValue(undefined),
  applyGeneratedOnboardingAiConfigIfEmpty: vi.fn().mockResolvedValue(undefined),
  onboardingAiConfigFromProfile: () => ({}),
  hasOnboardingProfileFacts: () => false
}));

import { commit } from '../catalogImportService.js';

const VENDOR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const JOB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const KEY = `${VENDOR}:${JOB}`;

function makeDraft(over: Partial<NormalizedProductDraft> = {}): NormalizedProductDraft {
  return {
    rowId: 'r_1',
    name: 'Basmati Rice',
    sku: 'RICE001',
    basePrice: 15000,
    baseUnit: 'kg',
    baseQuantity: 1,
    isActive: true,
    keywords: [],
    overrideProtected: false,
    sourceMeta: {
      source: 'vision',
      confidence: 0.92,
      fieldConfidence: { name: 0.95, basePrice: 0.95, baseUnit: 0.9, baseQuantity: 0.9 },
      warnings: []
    },
    ...over
  };
}

function makeReq(over: Partial<CommitRequest> = {}): CommitRequest {
  return {
    jobId: JOB,
    approvedProducts: [makeDraft()],
    idempotencyKey: KEY,
    dryRun: false,
    wave: 1,
    ...over
  };
}

const baseSummary: CommitSummary = {
  createdCount: 1,
  updatedCount: 0,
  skippedCount: 0,
  failed: [],
  deferredCount: 0,
  dryRun: false,
  wave: 1,
  aiConfigApplied: false
};

describe('catalogImportService.commit — idempotency replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commitProductsMock.mockResolvedValue({ ...baseSummary });
    mergeJobResultMock.mockResolvedValue(undefined);
  });

  it('first call runs commitProducts and stamps commitSummary', async () => {
    findUnique.mockResolvedValue({
      id: JOB,
      vendorId: VENDOR,
      result: { normalizedProducts: [makeDraft()] }
    });
    const out = await commit(VENDOR, makeReq());
    expect(out.replayed).toBe(false);
    expect(out.summary.createdCount).toBe(1);
    expect(commitProductsMock).toHaveBeenCalledOnce();
    expect(mergeJobResultMock).toHaveBeenCalledOnce();
    const patch = mergeJobResultMock.mock.calls[0][1] as {
      commitSummary: { idempotencyKey: string };
    };
    expect(patch.commitSummary.idempotencyKey).toBe(KEY);
  });

  it('second call with the SAME idempotency key returns cached summary without re-running commitProducts', async () => {
    findUnique.mockResolvedValue({
      id: JOB,
      vendorId: VENDOR,
      result: {
        commitSummary: { idempotencyKey: KEY, summary: baseSummary }
      }
    });
    const out = await commit(VENDOR, makeReq());
    expect(out.replayed).toBe(true);
    expect(commitProductsMock).not.toHaveBeenCalled();
    expect(mergeJobResultMock).not.toHaveBeenCalled();
    expect(out.summary.createdCount).toBe(1);
  });

  it('different idempotency key on the same job triggers a real re-commit', async () => {
    findUnique.mockResolvedValue({
      id: JOB,
      vendorId: VENDOR,
      result: {
        commitSummary: { idempotencyKey: KEY, summary: baseSummary },
        normalizedProducts: [makeDraft()]
      }
    });
    const differentKey = `${VENDOR}:${JOB}:wave2`;
    const out = await commit(VENDOR, makeReq({ idempotencyKey: differentKey, wave: 2 }));
    expect(out.replayed).toBe(false);
    expect(commitProductsMock).toHaveBeenCalledOnce();
    // Wave 2 patch lands under commitSummaryWave2, not commitSummary.
    const patch = mergeJobResultMock.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.commitSummaryWave2).toBeDefined();
    expect(patch.commitSummary).toBeUndefined();
  });

  it('rejects when the job belongs to a different vendor', async () => {
    findUnique.mockResolvedValue({
      id: JOB,
      vendorId: 'someone-else',
      result: {}
    });
    await expect(commit(VENDOR, makeReq())).rejects.toThrow('job_not_found');
    expect(commitProductsMock).not.toHaveBeenCalled();
  });

  it('rejects when the job does not exist', async () => {
    findUnique.mockResolvedValue(null);
    await expect(commit(VENDOR, makeReq())).rejects.toThrow('job_not_found');
    expect(commitProductsMock).not.toHaveBeenCalled();
  });

  it('does NOT cache the summary when dryRun=true', async () => {
    findUnique.mockResolvedValue({
      id: JOB,
      vendorId: VENDOR,
      result: { normalizedProducts: [makeDraft()] }
    });
    commitProductsMock.mockResolvedValue({ ...baseSummary, dryRun: true });
    await commit(VENDOR, makeReq({ dryRun: true }));
    // Dry-run still calls commitProducts (so the UI gets a preview), but it
    // must not stamp commitSummary or a second real commit would short-circuit.
    expect(commitProductsMock).toHaveBeenCalledOnce();
    expect(mergeJobResultMock).not.toHaveBeenCalled();
  });

  it('two retries against the same job with distinct :retry: keys both execute (no replay)', async () => {
    // Regression for the retry-failed bug: original wave-1 used key
    // `${vendor}:${job}` and so did retry-failed — the replay short-circuit
    // would return the cached failure summary instead of retrying. Salting
    // the retry key fixes it; this test pins the contract.
    const cachedFail: CommitSummary = {
      ...baseSummary,
      createdCount: 0,
      failed: [{ rowId: 'r_1', reason: 'transient_db_error' }]
    };
    findUnique.mockResolvedValue({
      id: JOB,
      vendorId: VENDOR,
      result: {
        commitSummary: { idempotencyKey: KEY, summary: cachedFail },
        normalizedProducts: [makeDraft()]
      }
    });
    commitProductsMock.mockResolvedValue({ ...baseSummary, createdCount: 1 });

    const retry1 = await commit(VENDOR, makeReq({ idempotencyKey: `${KEY}:retry:r1` }));
    const retry2 = await commit(VENDOR, makeReq({ idempotencyKey: `${KEY}:retry:r2` }));

    expect(retry1.replayed).toBe(false);
    expect(retry2.replayed).toBe(false);
    expect(commitProductsMock).toHaveBeenCalledTimes(2);
    expect(retry1.summary.createdCount).toBe(1);
    expect(retry2.summary.createdCount).toBe(1);
  });

  it('Wave 1 commit computes deferred[] from rows that were not approved', async () => {
    const approved = makeDraft({ rowId: 'r_approved', name: 'Rice' });
    const skipped = makeDraft({ rowId: 'r_skipped', name: 'Idli Rice' });
    findUnique.mockResolvedValue({
      id: JOB,
      vendorId: VENDOR,
      result: { normalizedProducts: [approved, skipped] }
    });
    classifyRowMock.mockReturnValue({ bucket: 'review', warnings: ['needs_review'] });
    await commit(VENDOR, makeReq({ approvedProducts: [approved] }));
    const patch = mergeJobResultMock.mock.calls[0][1] as {
      deferred: Array<{ row: { rowId: string }; rowStatus: string }>;
      commitSummary: { summary: { deferredCount: number } };
    };
    expect(patch.deferred).toHaveLength(1);
    expect(patch.deferred[0].row.rowId).toBe('r_skipped');
    expect(patch.deferred[0].rowStatus).toBe('needs_review');
    expect(patch.commitSummary.summary.deferredCount).toBe(1);
  });
});
