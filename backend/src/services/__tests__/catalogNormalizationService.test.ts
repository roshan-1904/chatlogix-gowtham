import { describe, it, expect } from 'vitest';
import {
  canonicalUnit,
  classifyRow,
  coercePricePaise,
  fuseRows,
  inBatchDedup,
  scoreRowConfidence,
  tabularRowToDraft,
  visionRowToDraft,
  catalogPaiseLookInflated,
  repairInflatedDraftPrices
} from '../catalogNormalizationService.js';
import type { NormalizedProductDraft } from '../../routes/schemas/catalogImport.js';
import type { ExtractedProductRow } from '../../lib/visionClient.js';

function fc<T>(value: T, confidence = 0.9): { value: T; confidence: number } {
  return { value, confidence };
}

function makeVisionRow(overrides: Partial<ExtractedProductRow> = {}): ExtractedProductRow {
  return {
    name: fc('Basmati Rice'),
    sku: fc('RICE001'),
    description: fc('Long-grain'),
    basePrice: fc(150),
    baseUnit: fc('kg'),
    baseQuantity: fc(1),
    keywords: fc(['rice', 'basmati']),
    ...overrides
  } as ExtractedProductRow;
}

function makeDraft(over: Partial<NormalizedProductDraft> = {}): NormalizedProductDraft {
  return {
    rowId: 'r_1',
    name: 'Basmati Rice',
    sku: 'RICE001',
    description: undefined,
    basePrice: 15000,
    baseUnit: 'kg',
    baseQuantity: 1,
    isActive: true,
    keywords: [],
    overrideProtected: false,
    sourceMeta: {
      source: 'vision',
      confidence: 0.9,
      fieldConfidence: {
        name: 0.95,
        basePrice: 0.9,
        baseUnit: 0.95,
        baseQuantity: 0.95
      },
      warnings: []
    },
    ...over
  };
}

describe('canonicalUnit', () => {
  it('maps synonyms to canonical', () => {
    expect(canonicalUnit('Pcs')).toEqual({ unit: 'piece', known: true });
    expect(canonicalUnit('Kgs')).toEqual({ unit: 'kg', known: true });
    expect(canonicalUnit('Ltr')).toEqual({ unit: 'litre', known: true });
    expect(canonicalUnit('PKT')).toEqual({ unit: 'packet', known: true });
  });

  it('returns lowercase as unknown when not in map', () => {
    const out = canonicalUnit('Bundle');
    expect(out.unit).toBe('bundle');
    expect(out.known).toBe(false);
  });

  it('defaults to piece on empty input', () => {
    expect(canonicalUnit(undefined)).toEqual({ unit: 'piece', known: false });
    expect(canonicalUnit('')).toEqual({ unit: 'piece', known: false });
  });
});

describe('coercePricePaise', () => {
  it('converts rupees-style strings', () => {
    expect(coercePricePaise('₹150')).toBe(15000);
    expect(coercePricePaise('Rs. 250/-')).toBe(25000);
    expect(coercePricePaise('1,200')).toBe(120000);
    expect(coercePricePaise('99.50')).toBe(9950);
  });

  it('treats numbers as rupees by default', () => {
    expect(coercePricePaise(150)).toBe(15000);
    expect(coercePricePaise(99.5)).toBe(9950);
  });

  it('keeps vision integers that are already paise', () => {
    expect(coercePricePaise(15000, { integerUnit: 'paise' })).toBe(15000);
    expect(coercePricePaise(18000, { integerUnit: 'paise' })).toBe(18000);
  });

  it('promotes small vision integers as rupees when the model skipped paise', () => {
    expect(coercePricePaise(150, { integerUnit: 'paise' })).toBe(15000);
    expect(coercePricePaise(99.5, { integerUnit: 'paise' })).toBe(9950);
  });

  it('returns null for unusable values', () => {
    expect(coercePricePaise(undefined)).toBeNull();
    expect(coercePricePaise(null)).toBeNull();
    expect(coercePricePaise('abc')).toBeNull();
    expect(coercePricePaise('')).toBeNull();
  });
});

describe('scoreRowConfidence', () => {
  it('penalizes missing price and unknown unit', () => {
    const fc = { name: 0.95, basePrice: 0.95, baseUnit: 0.95, baseQuantity: 0.95 };
    const full = scoreRowConfidence(fc, { hasPrice: true, unitKnown: true });
    const noPrice = scoreRowConfidence(fc, { hasPrice: false, unitKnown: true });
    const badUnit = scoreRowConfidence(fc, { hasPrice: true, unitKnown: false });
    expect(noPrice).toBeLessThan(full);
    expect(badUnit).toBeLessThan(full);
    expect(full).toBeGreaterThan(0.9);
  });

  it('returns 0 when no field has confidence', () => {
    expect(scoreRowConfidence({}, { hasPrice: true, unitKnown: true })).toBe(0);
  });
});

describe('visionRowToDraft', () => {
  it('produces deterministic rowIds for the same name+sku', () => {
    const a = visionRowToDraft(makeVisionRow());
    const b = visionRowToDraft(makeVisionRow());
    expect(a.rowId).toBe(b.rowId);
  });

  it('cleans and title-cases the name', () => {
    const draft = visionRowToDraft(makeVisionRow({ name: fc('  basmati   rice  ') }));
    expect(draft.name).toBe('Basmati Rice');
  });

  it('flips isActive=false when price is missing', () => {
    const draft = visionRowToDraft(makeVisionRow({ basePrice: fc(null) }));
    expect(draft.basePrice).toBeNull();
    expect(draft.isActive).toBe(false);
  });

  it('does not multiply vision paise a second time', () => {
    const draft = visionRowToDraft(makeVisionRow({ basePrice: fc(18000) }));
    expect(draft.basePrice).toBe(18000);
  });

  it('promotes small vision rupee amounts to paise', () => {
    expect(visionRowToDraft(makeVisionRow()).basePrice).toBe(15000);
  });

  it('penalizes unknown unit confidence', () => {
    const known = visionRowToDraft(makeVisionRow({ baseUnit: fc('kg', 0.9) }));
    const unknown = visionRowToDraft(makeVisionRow({ baseUnit: fc('bundle', 0.9) }));
    expect(unknown.sourceMeta.fieldConfidence.baseUnit).toBeLessThan(
      known.sourceMeta.fieldConfidence.baseUnit
    );
  });
});

describe('catalogPaiseLookInflated / repairInflatedDraftPrices', () => {
  it('detects a catalog that was multiplied by 100 twice', () => {
    expect(catalogPaiseLookInflated([1_800_000, 2_300_000, 3_500_000])).toBe(true);
  });

  it('leaves ordinary paise catalogs alone', () => {
    expect(catalogPaiseLookInflated([18000, 23000, 35000])).toBe(false);
    expect(catalogPaiseLookInflated([15000])).toBe(false);
  });

  it('divides inflated draft prices by 100', () => {
    const repaired = repairInflatedDraftPrices([
      makeDraft({ basePrice: 1_800_000 }),
      makeDraft({ name: 'Gummies', basePrice: 2_300_000 })
    ]);
    expect(repaired[0].basePrice).toBe(18000);
    expect(repaired[1].basePrice).toBe(23000);
  });
});

describe('tabularRowToDraft', () => {
  it('parses common header variants', () => {
    const draft = tabularRowToDraft({
      raw: { Name: 'Basmati Rice', SKU: 'rice001', Price: '₹150', Unit: 'kg', Qty: '1' },
      source: 'csv',
      rowIndex: 0
    });
    expect(draft).not.toBeNull();
    expect(draft!.name).toBe('Basmati Rice');
    expect(draft!.sku).toBe('RICE001');
    expect(draft!.basePrice).toBe(15000);
    expect(draft!.baseUnit).toBe('kg');
  });

  it('returns null when there is no name', () => {
    const draft = tabularRowToDraft({ raw: { SKU: 'X' }, source: 'csv', rowIndex: 0 });
    expect(draft).toBeNull();
  });
});

describe('fuseRows', () => {
  it('prefers tabular price when vision price-confidence is lower', () => {
    const visionDraft = makeDraft({
      basePrice: 9999,
      sourceMeta: {
        ...makeDraft().sourceMeta,
        fieldConfidence: { ...makeDraft().sourceMeta.fieldConfidence, basePrice: 0.4 }
      }
    });
    const tabularDraft = makeDraft({
      basePrice: 15000,
      sourceMeta: {
        ...makeDraft().sourceMeta,
        source: 'csv',
        fieldConfidence: { ...makeDraft().sourceMeta.fieldConfidence, basePrice: 0.95 }
      }
    });
    const fused = fuseRows([visionDraft], [tabularDraft]);
    expect(fused).toHaveLength(1);
    expect(fused[0].basePrice).toBe(15000);
  });

  it('keeps tabular-only rows that have no vision match', () => {
    const visionDraft = makeDraft({ name: 'Basmati Rice' });
    const tabularDraft = makeDraft({ name: 'Idli Rice', sku: 'IDLI001' });
    const fused = fuseRows([visionDraft], [tabularDraft]);
    expect(fused).toHaveLength(2);
  });
});

describe('inBatchDedup', () => {
  it('collapses duplicates by name+sku, keeping higher confidence', () => {
    const a = makeDraft({ rowId: 'r_a', sourceMeta: { ...makeDraft().sourceMeta, confidence: 0.6 } });
    const b = makeDraft({ rowId: 'r_b', sourceMeta: { ...makeDraft().sourceMeta, confidence: 0.92 } });
    const out = inBatchDedup([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].sourceMeta.confidence).toBe(0.92);
  });

  it('treats different sku as distinct rows', () => {
    const a = makeDraft({ sku: 'A' });
    const b = makeDraft({ sku: 'B' });
    expect(inBatchDedup([a, b])).toHaveLength(2);
  });
});

describe('classifyRow', () => {
  it('auto-accepts when row conf ≥ 0.88 and no field < 0.75 (excluding price)', () => {
    const row = makeDraft({
      sourceMeta: {
        source: 'vision',
        confidence: 0.9,
        fieldConfidence: { name: 0.95, basePrice: 0.95, baseUnit: 0.9, baseQuantity: 0.9 },
        warnings: []
      }
    });
    expect(classifyRow(row).bucket).toBe('auto_accept');
  });

  it('downgrades to review when a non-price field is below 0.75', () => {
    const row = makeDraft({
      sourceMeta: {
        source: 'vision',
        confidence: 0.9,
        fieldConfidence: { name: 0.6, basePrice: 0.95, baseUnit: 0.9, baseQuantity: 0.9 },
        warnings: []
      }
    });
    expect(classifyRow(row).bucket).toBe('review');
  });

  it('marks rows missing price as needs_pricing regardless of overall confidence', () => {
    const row = makeDraft({
      basePrice: null,
      sourceMeta: {
        source: 'vision',
        confidence: 0.95,
        fieldConfidence: { name: 0.95, basePrice: 0, baseUnit: 0.9, baseQuantity: 0.9 },
        warnings: []
      }
    });
    const out = classifyRow(row);
    expect(out.bucket).toBe('needs_pricing');
    expect(out.warnings).toContain('needs_pricing');
  });

  it('blocks rows missing required fields', () => {
    const row = makeDraft({ name: '' });
    expect(classifyRow(row).bucket).toBe('blocked');
  });
});
