/** 1 USD ≈ 83 INR — same rate as catalogExtractionService. */
export const USD_TO_PAISE = 83 * 100;

export function usdToPaise(costUsd: number): number {
  return Math.round(costUsd * USD_TO_PAISE);
}

/** Vendor-facing AI features bill at markup × pass-through API cost (default 2×). */
export function vendorAiChargePaise(costUsd: number, markupMultiplier = 2): number {
  if (costUsd <= 0) return 0;
  return Math.round(usdToPaise(costUsd) * markupMultiplier);
}

export function formatRupee(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
