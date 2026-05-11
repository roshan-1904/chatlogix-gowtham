interface Props {
  readonly imageCount: number;
  readonly hasTabular: boolean;
}

// Rough per-image averages from production: ~1800 prompt + ~800 completion
// tokens on gpt-4.1 vision = ~₹0.8 per image. Enrichment adds ~₹0.1 per batch.
const ESTIMATE_PER_IMAGE_PAISE = 80;
const TABULAR_FLAT_PAISE = 15;

export function CostEstimateBanner({ imageCount, hasTabular }: Readonly<Props>) {
  const estPaise = imageCount * ESTIMATE_PER_IMAGE_PAISE + (hasTabular ? TABULAR_FLAT_PAISE : 0);
  if (estPaise === 0) return null;
  const rupees = (estPaise / 100).toFixed(2);
  return (
    <div className="rounded-lg border border-primary-500/30 bg-primary-500/5 px-3 py-2 text-xs text-primary-500">
      Estimated spend for this extraction: about ₹{rupees}. Real charge is
      metered on actual tokens used.
    </div>
  );
}
