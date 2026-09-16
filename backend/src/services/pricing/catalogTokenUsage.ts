/**
 * Backward-compatible reader for `CatalogImportJob.tokenUsage`.
 *
 * That JSON is persisted verbatim from `catalogExtractionService`'s
 * `TokenUsageSummary`, which was written in **paise** before the millirupee
 * cutover. Renaming the keys would have orphaned every existing row, so the
 * summary now carries an additive unrounded `totalMilli` alongside the
 * original `totalPaise`, and this reader prefers whichever is present.
 *
 * Lives under `services/pricing/` rather than in catalogExtractionService so
 * billingService can read it without dragging the vision/S3 extraction
 * dependency tree into the conversation Lambda.
 */

import { paiseToMilli } from '../../utils/money.js';

export function tokenUsageTotalMilli(tokenUsage: unknown): number {
  if (!tokenUsage || typeof tokenUsage !== 'object') return 0;
  const usage = tokenUsage as { totalMilli?: unknown; totalPaise?: unknown };

  if (typeof usage.totalMilli === 'number' && Number.isFinite(usage.totalMilli)) {
    return usage.totalMilli > 0 ? usage.totalMilli : 0;
  }
  if (typeof usage.totalPaise === 'number' && Number.isFinite(usage.totalPaise)) {
    return usage.totalPaise > 0 ? paiseToMilli(usage.totalPaise) : 0;
  }
  return 0;
}
