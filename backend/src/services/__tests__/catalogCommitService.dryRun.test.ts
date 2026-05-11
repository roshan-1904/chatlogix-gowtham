import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CommitRequest, NormalizedProductDraft } from '../../routes/schemas/catalogImport.js';

// Mock the Prisma module BEFORE importing the service. We capture every call
// the commit service makes against `tx.product.*` so we can assert the dry-run
// path never *writes* anything, even though it walks the full classification
// + lookup flow and produces the same summary as a real commit would.

const productCreate = vi.fn();
const productUpdate = vi.fn();
const productFindUnique = vi.fn();
const catalogImportJobFindFirst = vi.fn();
const txQueryRaw = vi.fn();

const txStub = {
  $queryRaw: (...args: unknown[]) => txQueryRaw(...args),
  product: {
    findUnique: (...args: unknown[]) => productFindUnique(...args),
    create: (...args: unknown[]) => productCreate(...args),
    update: (...args: unknown[]) => productUpdate(...args)
  },
  catalogImportJob: {
    findFirst: (...args: unknown[]) => catalogImportJobFindFirst(...args)
  }
};

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    $transaction: async (fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub)
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const applyAIPromptsMock = vi.fn();
vi.mock('../vendorAIConfigService.js', () => ({
  applyAIPrompts: (...args: unknown[]) => applyAIPromptsMock(...args)
}));

import { commit } from '../catalogCommitService.js';

function makeDraft(over: Partial<NormalizedProductDraft> = {}): NormalizedProductDraft {
  return {
    rowId: 'r_1',
    name: 'Basmati Rice',
    sku: 'RICE001',
    description: 'Long-grain',
    basePrice: 15000,
    baseUnit: 'kg',
    baseQuantity: 1,
    isActive: true,
    keywords: ['rice'],
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
    jobId: '11111111-1111-1111-1111-111111111111',
    approvedProducts: [makeDraft()],
    idempotencyKey:
      '22222222-2222-2222-2222-222222222222:11111111-1111-1111-1111-111111111111',
    dryRun: false,
    wave: 1,
    ...over
  };
}

describe('catalogCommitService.commit — dryRun savepoint behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    txQueryRaw.mockResolvedValue(undefined);
    catalogImportJobFindFirst.mockResolvedValue(null);
    productFindUnique.mockResolvedValue(null);
    productCreate.mockResolvedValue({ id: 'p_new' });
    productUpdate.mockResolvedValue({ id: 'p_existing' });
    applyAIPromptsMock.mockResolvedValue(undefined);
  });

  it('does NOT call product.create or product.update when dryRun=true', async () => {
    const summary = await commit('vendor_1', makeReq({ dryRun: true }));
    // Lookup happens (we still need to know if it would be create vs update),
    // but no writes hit the DB.
    expect(productFindUnique).toHaveBeenCalledOnce();
    expect(productCreate).not.toHaveBeenCalled();
    expect(productUpdate).not.toHaveBeenCalled();
    // The summary still reports the would-be counts so the UI can preview.
    expect(summary.dryRun).toBe(true);
    expect(summary.createdCount).toBe(1);
  });

  it('skips applyAIConfig on dry run', async () => {
    await commit('vendor_1', makeReq({ dryRun: true }), {
      personality: 'friendly'
    });
    expect(applyAIPromptsMock).not.toHaveBeenCalled();
  });

  it('on real commit (dryRun=false), product.create is called for new rows; audit is stamped by the orchestrator, not this service', async () => {
    const summary = await commit('vendor_1', makeReq({ dryRun: false }));
    expect(productCreate).toHaveBeenCalledOnce();
    expect(productUpdate).not.toHaveBeenCalled();
    // catalogImportService.commit() owns the audit-merge call. This service
    // returns the bare summary so the orchestrator can wrap it with the
    // idempotencyKey + deferred[] in a single Prisma write.
    expect(summary.createdCount).toBe(1);
    expect(summary.dryRun).toBe(false);
  });

  it('updates existing product when found, instead of creating', async () => {
    productFindUnique.mockResolvedValueOnce({ id: 'p_existing', updatedAt: new Date(0) });
    const summary = await commit('vendor_1', makeReq({ dryRun: false }));
    expect(productUpdate).toHaveBeenCalledOnce();
    expect(productCreate).not.toHaveBeenCalled();
    expect(summary.updatedCount).toBe(1);
    expect(summary.createdCount).toBe(0);
  });

  it('respects re-import protection: skips overwrite when product was edited after the prior import', async () => {
    const priorImport = new Date('2026-04-01T00:00:00.000Z');
    catalogImportJobFindFirst.mockResolvedValue({ createdAt: priorImport });
    // Existing row was edited AFTER the prior import — manual override.
    productFindUnique.mockResolvedValue({
      id: 'p_existing',
      updatedAt: new Date('2026-04-10T00:00:00.000Z')
    });
    const summary = await commit('vendor_1', makeReq({ dryRun: false }));
    expect(productUpdate).not.toHaveBeenCalled();
    expect(productCreate).not.toHaveBeenCalled();
    expect(summary.skippedCount).toBe(1);
    expect(summary.updatedCount).toBe(0);
  });

  it('overrideProtected=true bypasses re-import protection', async () => {
    const priorImport = new Date('2026-04-01T00:00:00.000Z');
    catalogImportJobFindFirst.mockResolvedValue({ createdAt: priorImport });
    productFindUnique.mockResolvedValue({
      id: 'p_existing',
      updatedAt: new Date('2026-04-10T00:00:00.000Z')
    });
    const draft = makeDraft({ overrideProtected: true });
    const summary = await commit(
      'vendor_1',
      makeReq({ dryRun: false, approvedProducts: [draft] })
    );
    expect(productUpdate).toHaveBeenCalledOnce();
    expect(summary.updatedCount).toBe(1);
  });

  it('forces isActive=false for needs_pricing rows even when draft says active', async () => {
    const draft = makeDraft({
      basePrice: null,
      isActive: true,
      sourceMeta: {
        source: 'vision',
        confidence: 0.9,
        fieldConfidence: { name: 0.95, basePrice: 0, baseUnit: 0.9, baseQuantity: 0.9 },
        warnings: []
      }
    });
    await commit('vendor_1', makeReq({ dryRun: false, approvedProducts: [draft] }));
    expect(productCreate).toHaveBeenCalledOnce();
    const arg = productCreate.mock.calls[0][0] as { data: { isActive: boolean } };
    expect(arg.data.isActive).toBe(false);
  });

  it('drops blocked rows from commit and counts them as skipped', async () => {
    const good = makeDraft();
    const blocked = makeDraft({ rowId: 'r_blocked', name: '' });
    const summary = await commit(
      'vendor_1',
      makeReq({ dryRun: false, approvedProducts: [good, blocked] })
    );
    // Only the good row is looked up + created.
    expect(productFindUnique).toHaveBeenCalledOnce();
    expect(productCreate).toHaveBeenCalledOnce();
    expect(summary.skippedCount).toBe(1);
    expect(summary.createdCount).toBe(1);
  });

  it('Wave 2 commit returns a summary with wave=2 (orchestrator routes it under commitSummaryWave2)', async () => {
    const summary = await commit(
      'vendor_1',
      makeReq({
        dryRun: false,
        wave: 2,
        idempotencyKey:
          '22222222-2222-2222-2222-222222222222:11111111-1111-1111-1111-111111111111:wave2'
      })
    );
    expect(summary.wave).toBe(2);
    expect(summary.createdCount).toBe(1);
  });
});
