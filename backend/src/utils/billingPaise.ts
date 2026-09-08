/** 1 USD ≈ 83 INR — same rate as catalogExtractionService. */
export const USD_TO_PAISE = 83 * 100;

export function usdToPaise(costUsd: number): number {
  return Math.round(costUsd * USD_TO_PAISE);
}

export function formatRupee(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}
