import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseTabular } from '../catalogTabularParser.js';
import {
  classifyRow,
  inBatchDedup,
  tabularRowToDraft
} from '../catalogNormalizationService.js';

// Golden-dataset harness. Each case lives under
//   backend/test/fixtures/catalog-import/golden/cases/<id>/
// and exposes:
//   - manifest.json     (category, languageHint, description)
//   - expected.json     (target rows the pipeline should emit)
//   - input.csv | input.xlsx | pages/page_N.png + vision-recording.json
//
// This test runs only the cases that don't require live OpenAI calls
// (i.e. tabular-only fixtures). Vision-bearing fixtures plug into the same
// expected.json contract via a future `record:catalog-import-golden` script
// that captures vision responses keyed by sha256(imageBuffer).

interface ExpectedRow {
  name: string;
  sku?: string;
  basePrice?: number | null;
  baseUnit: string;
  baseQuantity: number;
  expectedBucket?: 'auto_accept' | 'review' | 'needs_pricing' | 'blocked';
}

interface CaseDef {
  id: string;
  dir: string;
  manifest: { category?: string; languageHint?: string };
  expected: ExpectedRow[];
}

function loadCases(): CaseDef[] {
  const root = resolve(__dirname, '../../../test/fixtures/catalog-import/golden/cases');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .map((id) => {
      const dir = join(root, id);
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'));
      const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf-8'));
      return { id, dir, manifest, expected };
    });
}

const tabularCases = loadCases().filter(
  (c) => existsSync(join(c.dir, 'input.csv')) || existsSync(join(c.dir, 'input.xlsx'))
);

describe('catalog import — golden dataset (tabular cases)', () => {
  if (tabularCases.length === 0) {
    it.skip('no tabular fixtures present yet — drop CSV/XLSX cases under test/fixtures/catalog-import/golden/cases/', () => {});
    return;
  }

  for (const c of tabularCases) {
    it(`${c.id}: extracted rows match expected.json`, async () => {
      const csvPath = join(c.dir, 'input.csv');
      const xlsxPath = join(c.dir, 'input.xlsx');
      const buffer = existsSync(csvPath) ? readFileSync(csvPath) : readFileSync(xlsxPath);
      const contentType = existsSync(csvPath)
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      const tabularRows = await parseTabular(buffer, contentType);
      const drafts = tabularRows.map(tabularRowToDraft).filter((d) => d != null);
      const deduped = inBatchDedup(drafts as any);

      // Catch silent row-loss before per-field assertions paper over it.
      expect(
        deduped.length,
        `expected ${c.expected.length} rows, got ${deduped.length}`
      ).toBe(c.expected.length);

      // Field-level comparison — order-independent, matched by normalized name.
      const byName = new Map(deduped.map((d) => [d.name.toLowerCase().trim(), d]));
      for (const want of c.expected) {
        const got = byName.get(want.name.toLowerCase().trim());
        expect(got, `missing row "${want.name}"`).toBeDefined();
        if (!got) continue;
        if (want.sku !== undefined) expect(got.sku).toBe(want.sku);
        if (want.basePrice !== undefined) expect(got.basePrice).toBe(want.basePrice);
        expect(got.baseUnit).toBe(want.baseUnit);
        expect(got.baseQuantity).toBe(want.baseQuantity);
        if (want.expectedBucket) {
          const { bucket } = classifyRow(got);
          expect(bucket, `bucket mismatch for "${want.name}"`).toBe(want.expectedBucket);
        }
      }
    });
  }

  it('aggregate auto-accept rate across fixtures with bucket assertions stays ≥ 70%', () => {
    // Only fixtures whose expected.json explicitly pins expectedBucket count
    // toward this target. Tabular-only fixtures (no descriptions / keywords
    // until enrichment) typically classify as `review` and don't pin a bucket.
    let total = 0;
    let autoAccept = 0;
    for (const c of tabularCases) {
      for (const row of c.expected) {
        if (!row.expectedBucket) continue;
        total += 1;
        if (row.expectedBucket === 'auto_accept') autoAccept += 1;
      }
    }
    if (total < 5) return; // dataset still warming up — defer the rate gate
    const rate = autoAccept / total;
    expect(
      rate,
      `auto-accept rate ${(rate * 100).toFixed(1)}% < 70% target`
    ).toBeGreaterThanOrEqual(0.7);
  });
});
