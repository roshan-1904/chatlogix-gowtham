# Catalog Import — Golden Dataset

Each fixture is a directory under `cases/` holding:

- `manifest.json` — `{ category, languageHint?, description }`
- `pages/page_N.png` — input brochure page(s)
- `expected.json` — array of `NormalizedProductDraft` rows the extractor should produce, post-fusion + dedup
- `vision-recording.json` — recorded OpenAI vision responses keyed by `sha256(imageBuffer)` so the test runs deterministically without live API calls

## Adding a fixture

1. Drop brochure pages into `cases/<id>/pages/`.
2. Run `npm run record:catalog-import-golden -- <id>` (script wraps the live vision client and saves responses keyed by image hash).
3. Eyeball the generated `expected.json` against the brochure; correct any rows that the LLM got wrong. The corrections are what the test pins to.
4. Commit the case directory.

## Target distribution

Per the plan: 5 restaurant, 3 grocery, 2 electronics. Restaurant cases should
include at least one menu with sections (starters / mains / drinks) and one
with prices in multiple columns (dine-in vs takeaway). Grocery cases should
include at least one CSV-paired brochure to exercise the fusion path.

## Calibration

`scripts/calibrate-auto-accept-threshold.ts` sweeps row-confidence thresholds
0.80–0.95 in 0.01 steps against this dataset and reports:

- auto-accept rate (target ≥ 70%)
- false-auto-accept rate (rows that auto-accepted but differ from `expected.json` — target ≤ 5%)

The output drives the threshold-tuning decision before GA.
