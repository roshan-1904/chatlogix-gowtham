/**
 * Sweeps the auto-accept threshold against the catalog-import golden dataset
 * and reports auto-accept-rate vs false-auto-accept-rate at each step.
 *
 * Reads cases under `backend/test/fixtures/catalog-import/golden/cases/`.
 * Each case provides `expected.json`; we run the same drafts through the
 * normalization pipeline, then re-classify each row with a swept threshold
 * and compare to the expected bucket. The output drives the final threshold
 * tuning before GA.
 *
 * Usage:
 *   npx tsx scripts/calibrate-auto-accept-threshold.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { parseTabular } from '../src/services/catalogTabularParser.js';
import {
  inBatchDedup,
  tabularRowToDraft
} from '../src/services/catalogNormalizationService.js';
import type { NormalizedProductDraft } from '../src/routes/schemas/catalogImport.js';

interface ExpectedRow {
  name: string;
  basePrice?: number | null;
  expectedBucket?: 'auto_accept' | 'review' | 'needs_pricing' | 'blocked';
}

interface CaseResult {
  id: string;
  rows: Array<{ draft: NormalizedProductDraft; expectedBucket?: string }>;
}

async function loadCases(): Promise<CaseResult[]> {
  const root = resolve(__dirname, '../test/fixtures/catalog-import/golden/cases');
  if (!existsSync(root)) return [];
  const out: CaseResult[] = [];
  for (const id of readdirSync(root)) {
    const dir = join(root, id);
    if (!statSync(dir).isDirectory()) continue;
    const expected: ExpectedRow[] = JSON.parse(
      readFileSync(join(dir, 'expected.json'), 'utf-8')
    );
    let drafts: NormalizedProductDraft[] = [];
    const csvPath = join(dir, 'input.csv');
    const xlsxPath = join(dir, 'input.xlsx');
    if (existsSync(csvPath) || existsSync(xlsxPath)) {
      const buffer = existsSync(csvPath) ? readFileSync(csvPath) : readFileSync(xlsxPath);
      const ct = existsSync(csvPath)
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const rows = await parseTabular(buffer, ct);
      drafts = rows.map(tabularRowToDraft).filter((d): d is NormalizedProductDraft => d != null);
      drafts = inBatchDedup(drafts);
    }
    // Vision-bearing cases: future work — load `vision-recording.json` and
    // synthesize drafts from the recorded responses.

    const byName = new Map(drafts.map((d) => [d.name.toLowerCase().trim(), d]));
    const matched = expected
      .map((e) => {
        const d = byName.get(e.name.toLowerCase().trim());
        return d ? { draft: d, expectedBucket: e.expectedBucket } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
    out.push({ id, rows: matched });
  }
  return out;
}

function classifyAt(
  draft: NormalizedProductDraft,
  rowThreshold: number,
  fieldThreshold: number
): 'auto_accept' | 'review' | 'needs_pricing' | 'blocked' {
  if (!draft.name || !draft.baseUnit || !draft.baseQuantity) return 'blocked';
  const fieldConfs = Object.entries(draft.sourceMeta.fieldConfidence ?? {});
  const priceConf = draft.sourceMeta.fieldConfidence?.basePrice ?? 1;
  const hasPrice = draft.basePrice != null && draft.basePrice >= 0;
  if (!hasPrice || priceConf < fieldThreshold) return 'needs_pricing';
  const lowField = fieldConfs.some(([k, v]) => k !== 'basePrice' && v > 0 && v < fieldThreshold);
  const rowConf = draft.sourceMeta.confidence ?? 0;
  if (rowConf >= rowThreshold && !lowField) return 'auto_accept';
  return 'review';
}

async function main() {
  const cases = await loadCases();
  const allRows = cases.flatMap((c) => c.rows);
  const totalRows = allRows.length;
  const ratedRows = allRows.filter((r) => r.expectedBucket);

  console.log(`\nGolden dataset: ${cases.length} cases, ${totalRows} rows (${ratedRows.length} with expected bucket)\n`);
  if (ratedRows.length === 0) {
    console.log('No rows have expectedBucket set — calibration needs vision fixtures with pinned classifications.');
    return;
  }

  const FIELD_THRESHOLD = 0.75;
  console.log(`Field threshold (fixed): ${FIELD_THRESHOLD}`);
  console.log('Row threshold sweep 0.80 → 0.95:\n');
  console.log('row_thr | auto_rate | false_auto_rate | review_rate | needs_pricing_rate');
  console.log('--------|-----------|-----------------|-------------|-------------------');

  for (let rt = 0.8; rt <= 0.95 + 1e-9; rt += 0.01) {
    let auto = 0;
    let falseAuto = 0;
    let review = 0;
    let needsPricing = 0;
    for (const { draft, expectedBucket } of ratedRows) {
      const got = classifyAt(draft, rt, FIELD_THRESHOLD);
      if (got === 'auto_accept') auto += 1;
      if (got === 'auto_accept' && expectedBucket && expectedBucket !== 'auto_accept') {
        falseAuto += 1;
      }
      if (got === 'review') review += 1;
      if (got === 'needs_pricing') needsPricing += 1;
    }
    const n = ratedRows.length;
    const fmt = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(7);
    console.log(
      `${rt.toFixed(2)}   | ${fmt(auto / n)} | ${fmt(falseAuto / n)} | ${fmt(review / n)} | ${fmt(needsPricing / n)}`
    );
  }
  console.log('\nTarget: auto_rate ≥ 70%, false_auto_rate ≤ 5%. Pick the lowest row_thr that holds both.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
