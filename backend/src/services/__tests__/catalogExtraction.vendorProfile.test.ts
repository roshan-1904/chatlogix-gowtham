import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CostResult } from '../../utils/costCalculator.js';
import type { ExtractedVendorProfile } from '../../lib/visionClient.js';

const callVisionExtractionMock = vi.fn();
const fetchAndValidateMock = vi.fn();

vi.mock('../../lib/visionClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/visionClient.js')>();
  return {
    ...actual,
    callVisionExtraction: (...args: unknown[]) => callVisionExtractionMock(...args)
  };
});

vi.mock('../fileIntakeService.js', () => ({
  FileIntakeError: class FileIntakeError extends Error {
    constructor(public statusCode: number, public code: string, message: string) {
      super(message);
    }
  },
  fetchAndValidate: (...args: unknown[]) => fetchAndValidateMock(...args)
}));

const enrichKeywordsBatchMock = vi.fn(
  async (drafts: unknown[], _shop?: unknown) => ({ updated: drafts, costs: [] })
);

vi.mock('../catalogEnrichmentService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catalogEnrichmentService.js')>();
  return {
    ...actual,
    enrichKeywordsBatch: (drafts: unknown[], shop?: unknown) => enrichKeywordsBatchMock(drafts, shop)
  };
});

vi.mock('../catalogImportEventBus.js', () => ({
  catalogImportEventBus: { emit: vi.fn() }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { VisionResponseSchema } from '../../lib/visionClient.js';
import { BASE_EXTRACTION_PROMPT } from '../prompts/catalogExtraction/base.js';
import {
  completeVendorProfile,
  emptyVendorProfile,
  extract,
  inferCityFromAddress,
  mergeVendorProfiles
} from '../catalogExtractionService.js';

const FIXTURE_DIR = resolve(__dirname, '../../../test/fixtures/catalog-import/vendor-profile');
const CSV_PATH = resolve(
  __dirname,
  '../../../test/fixtures/catalog-import/golden/cases/sample_grocery_csv/input.csv'
);

const ZERO_COST: CostResult = {
  model: 'test',
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
  isEstimated: true
};

function loadFixture(name: string) {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), 'utf-8')) as unknown;
}

describe('VisionResponseSchema — vendorProfile', () => {
  it('parses a brochure header with shop name and address; extra phone is ignored', () => {
    const raw = loadFixture('brochure-header.json');
    const parsed = VisionResponseSchema.parse(raw);
    expect(parsed.vendorProfile?.businessName).toEqual({
      value: 'Priya Home Bakery',
      confidence: 0.92
    });
    expect(parsed.vendorProfile?.address).toEqual({
      value: '12 Avinashi Road',
      confidence: 0.81
    });
    expect(parsed.vendorProfile?.category?.value).toBe('Food');
    expect(parsed.vendorProfile).not.toHaveProperty('phone');
  });

  it('accepts products without vendorProfile', () => {
    const parsed = VisionResponseSchema.parse({
      products: [
        {
          name: { value: 'Rice', confidence: 0.9 },
          basePrice: { value: 15000, confidence: 0.9 },
          baseUnit: { value: 'kg', confidence: 0.9 },
          baseQuantity: { value: 1, confidence: 0.9 }
        }
      ]
    });
    expect(parsed.products).toHaveLength(1);
    expect(parsed.vendorProfile).toBeUndefined();
  });

  it('maps printed bakery category to Food and tamil language to ta', () => {
    const parsed = VisionResponseSchema.parse({
      products: [],
      vendorProfile: {
        category: { value: 'Bakery', confidence: 0.8 },
        languageHint: { value: 'Tamil', confidence: 0.7 }
      }
    });
    expect(parsed.vendorProfile?.category).toEqual({ value: 'Food', confidence: 0.8 });
    expect(parsed.vendorProfile?.languageHint).toEqual({ value: 'ta', confidence: 0.7 });
  });
});

describe('BASE_EXTRACTION_PROMPT — vendorProfile contract', () => {
  it('requires printed-only shop facts and forbids treating a printed phone as login', () => {
    expect(BASE_EXTRACTION_PROMPT).toContain('vendorProfile');
    expect(BASE_EXTRACTION_PROMPT).toMatch(/shop facts/i);
    expect(BASE_EXTRACTION_PROMPT).toMatch(/NOT the vendor's login phone/i);
    expect(BASE_EXTRACTION_PROMPT).toContain('Food, Retail, Services, Healthcare, Education, Other');
  });
});

describe('mergeVendorProfiles', () => {
  it('returns empty profile when no vision pages', () => {
    expect(mergeVendorProfiles([])).toEqual(emptyVendorProfile());
  });

  it('picks highest-confidence non-null per field across pages (name page 1, address page 2)', () => {
    const page1: ExtractedVendorProfile = {
      businessName: { value: 'Priya Home Bakery', confidence: 0.9 },
      city: { value: 'Coimbatore', confidence: 0.6 }
    };
    const page2: ExtractedVendorProfile = {
      businessName: { value: 'Priya Bakery', confidence: 0.7 },
      address: { value: '12 MG Road', confidence: 0.85 },
      city: { value: 'Chennai', confidence: 0.5 }
    };

    const merged = mergeVendorProfiles([page1, page2]);
    expect(merged.businessName).toEqual({ value: 'Priya Home Bakery', confidence: 0.9 });
    expect(merged.address).toEqual({ value: '12 MG Road', confidence: 0.85 });
    expect(merged.city).toEqual({ value: 'Coimbatore', confidence: 0.6 });
  });

  it('ignores null and blank values', () => {
    const merged = mergeVendorProfiles([
      {
        businessName: { value: null, confidence: 0.9 },
        category: { value: '   ', confidence: 0.8 }
      }
    ]);
    expect(merged.businessName.value).toBeNull();
    expect(merged.category.value).toBeNull();
  });

  it('maps category aliases while merging', () => {
    const merged = mergeVendorProfiles([
      { category: { value: 'Bakery', confidence: 0.7 } }
    ]);
    expect(merged.category).toEqual({ value: 'Food', confidence: 0.7 });
  });
});

describe('extract() — vendorProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchAndValidateMock.mockResolvedValue({
      buffer: Buffer.from('fake-image'),
      contentType: 'image/jpeg'
    });
  });

  it('brochure-style page returns header name and address on vendorProfile', async () => {
    const brochure = VisionResponseSchema.parse(loadFixture('brochure-header.json'));
    callVisionExtractionMock.mockResolvedValue({
      products: brochure.products,
      vendorProfile: brochure.vendorProfile,
      cost: ZERO_COST
    });

    const result = await extract({
      jobId: 'job-brochure',
      vendorId: 'vendor-1',
      imageKeys: ['imports/vendor-1/job/brochure.jpg']
    });

    expect(callVisionExtractionMock).toHaveBeenCalledOnce();
    expect(result.vendorProfile.businessName).toEqual({
      value: 'Priya Home Bakery',
      confidence: 0.92
    });
    expect(result.vendorProfile.address).toEqual({
      value: '12 Avinashi Road',
      confidence: 0.81
    });
    expect(result.vendorProfile.city.value).toBe('Coimbatore');
    expect(result.normalizedProducts.some((p) => /almond cookies/i.test(p.name))).toBe(true);
    expect(enrichKeywordsBatchMock).toHaveBeenCalled();
    const shop = enrichKeywordsBatchMock.mock.calls[0]?.[1] as
      | { city?: string; businessName?: string }
      | undefined;
    expect(shop?.city).toBe('Coimbatore');
    expect(shop?.businessName).toBe('Priya Home Bakery');
  });

  it('CSV-only jobs leave vendorProfile empty', async () => {
    fetchAndValidateMock.mockResolvedValue({
      buffer: readFileSync(CSV_PATH),
      contentType: 'text/csv'
    });

    const result = await extract({
      jobId: 'job-csv',
      vendorId: 'vendor-1',
      imageKeys: [],
      tabularFileKey: 'imports/vendor-1/job/prices.csv'
    });

    expect(callVisionExtractionMock).not.toHaveBeenCalled();
    expect(result.vendorProfile.businessName.value).toBeNull();
    expect(result.vendorProfile.address.value).toBeNull();
    expect(result.vendorProfile.category.value).toBe('Food');
    expect(result.normalizedProducts.length).toBeGreaterThan(0);
  });

  it('merges two brochure pages by highest-confidence non-null field', async () => {
    const page1 = VisionResponseSchema.parse(loadFixture('brochure-header.json'));
    const page2 = VisionResponseSchema.parse(loadFixture('brochure-page-2.json'));
    callVisionExtractionMock.mockImplementation(async (input: { pageIndex?: number }) => {
      const page = input.pageIndex === 1 ? page2 : page1;
      return { products: page.products, vendorProfile: page.vendorProfile, cost: ZERO_COST };
    });

    const result = await extract({
      jobId: 'job-pages',
      vendorId: 'vendor-1',
      imageKeys: ['page-1.jpg', 'page-2.jpg']
    });

    expect(callVisionExtractionMock).toHaveBeenCalledTimes(2);
    expect(result.vendorProfile.businessName).toEqual({
      value: 'Priya Home Bakery',
      confidence: 0.92
    });
    expect(result.vendorProfile.address).toEqual({
      value: '12 Avinashi Road, RS Puram',
      confidence: 0.9
    });
    expect(result.vendorProfile.hours).toEqual({
      value: 'Mon–Sat 10am–8pm',
      confidence: 0.88
    });
    expect(result.vendorProfile.city.value).toBe('Coimbatore');
    expect(result.vendorProfile.category.value).toBe('Food');
  });
});

describe('completeVendorProfile', () => {
  it('infers city from a trailing address segment', () => {
    expect(inferCityFromAddress('12 Avinashi Road, RS Puram, Coimbatore 641002')).toBe('Coimbatore');
  });

  it('sets Food category from bakery product names when vision left category empty', () => {
    const filled = completeVendorProfile(emptyVendorProfile(), [
      'Almond Cookies',
      'Chocolate Brownie',
      'Vanilla Cupcake'
    ]);
    expect(filled.category).toEqual({ value: 'Food', confidence: 0.65 });
  });
});
