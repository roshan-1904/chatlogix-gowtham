import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalyzeRequest } from '../../routes/schemas/catalogImport.js';
import type { MergedVendorProfile } from '../../lib/visionClient.js';

const extractMock = vi.fn();
const createJobMock = vi.fn();
const mergeJobResultMock = vi.fn();
const setJobStatusMock = vi.fn();
const recordTokenUsageMock = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: { catalogImportJob: { findUnique: vi.fn() } }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../catalogImportAuditService.js', () => ({
  createJob: (...a: unknown[]) => createJobMock(...a),
  setJobStatus: (...a: unknown[]) => setJobStatusMock(...a),
  recordTokenUsage: (...a: unknown[]) => recordTokenUsageMock(...a),
  mergeJobResult: (...a: unknown[]) => mergeJobResultMock(...a)
}));

vi.mock('../catalogCommitService.js', () => ({ commit: vi.fn() }));
vi.mock('../catalogNormalizationService.js', () => ({ classifyRow: vi.fn() }));
vi.mock('../catalogExtractionService.js', () => ({
  extract: (...a: unknown[]) => extractMock(...a)
}));
vi.mock('../fileIntakeService.js', () => ({
  assertKeyBelongsToVendor: vi.fn()
}));
vi.mock('../billingService.js', () => ({
  assertVendorWalletForAi: vi.fn().mockResolvedValue({ allowed: true })
}));
vi.mock('../pricing/pricingService.js', () => ({
  chargeVendor: vi.fn().mockResolvedValue({ outcome: 'skipped', deductedMilli: 0 }),
  InsufficientBalanceError: class InsufficientBalanceError extends Error {}
}));
vi.mock('../vendorAIConfigService.js', () => ({
  applyExtractedCatalogProfile: vi.fn().mockResolvedValue(undefined),
  applyGeneratedOnboardingAiConfigIfEmpty: vi.fn().mockResolvedValue(undefined),
  onboardingAiConfigFromProfile: () => ({}),
  hasOnboardingProfileFacts: () => false
}));
vi.mock('../catalogImportEventBus.js', () => ({
  catalogImportEventBus: { emit: vi.fn() }
}));

import { startAnalyze } from '../catalogImportService.js';

const VENDOR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const JOB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const emptyProfile: MergedVendorProfile = {
  businessName: { value: null, confidence: 0 },
  category: { value: null, confidence: 0 },
  address: { value: null, confidence: 0 },
  city: { value: null, confidence: 0 },
  hours: { value: null, confidence: 0 },
  deliveryNotes: { value: null, confidence: 0 },
  languageHint: { value: null, confidence: 0 }
};

describe('catalogImportService.startAnalyze — persist vendorProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createJobMock.mockResolvedValue({ id: JOB });
    setJobStatusMock.mockResolvedValue(undefined);
    recordTokenUsageMock.mockResolvedValue(undefined);
    mergeJobResultMock.mockResolvedValue(undefined);
  });

  it('writes merged vendorProfile onto CatalogImportJob.result', async () => {
    const vendorProfile: MergedVendorProfile = {
      ...emptyProfile,
      businessName: { value: 'Priya Home Bakery', confidence: 0.92 },
      address: { value: '12 Avinashi Road', confidence: 0.81 }
    };
    extractMock.mockResolvedValue({
      normalizedProducts: [],
      vendorProfile,
      warnings: [],
      tokenUsage: { totalPaise: 0, totalMilli: 0 },
      pageProgress: []
    });

    const req: AnalyzeRequest = {
      brochureImageKeys: ['imports/v/job/brochure.jpg'],
      importOptions: { currency: 'INR', allowUpdateExisting: false, autoGenerateAIConfig: true }
    };
    await startAnalyze(VENDOR, req);

    await vi.waitFor(() => {
      expect(mergeJobResultMock).toHaveBeenCalledOnce();
    });
    const patch = mergeJobResultMock.mock.calls[0][1] as { vendorProfile: MergedVendorProfile };
    expect(patch.vendorProfile.businessName.value).toBe('Priya Home Bakery');
    expect(patch.vendorProfile.address.value).toBe('12 Avinashi Road');
  });

  it('persists an empty vendorProfile for CSV-only analyze jobs', async () => {
    extractMock.mockResolvedValue({
      normalizedProducts: [],
      vendorProfile: emptyProfile,
      warnings: [],
      tokenUsage: { totalPaise: 0, totalMilli: 0 },
      pageProgress: []
    });

    const req: AnalyzeRequest = {
      brochureImageKeys: [],
      tabularFileKey: 'imports/v/job/prices.csv',
      importOptions: { currency: 'INR', allowUpdateExisting: false, autoGenerateAIConfig: true }
    };
    await startAnalyze(VENDOR, req);

    await vi.waitFor(() => {
      expect(mergeJobResultMock).toHaveBeenCalledOnce();
    });
    const patch = mergeJobResultMock.mock.calls[0][1] as { vendorProfile: MergedVendorProfile };
    expect(patch.vendorProfile).toEqual(emptyProfile);
  });
});
