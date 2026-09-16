/**
 * Wallet money is in millirupees (1 rupee = 1000). Order and revenue money is
 * in paise (1 rupee = 100) — the two units are 10x apart, so keep them apart.
 *
 * Platform billing settings (`/billing`) use paise on the wire. Convert with
 * `paiseToRupees` / `rupeesToPaise` and never pass those amounts through
 * `formatWalletAmount`.
 */
export const MILLI_PER_RUPEE = 1000;
export const PAISE_PER_RUPEE = 100;

/**
 * Format wallet money for display. A single AI reply can cost well under one
 * paisa, so a non-zero amount that would round away to ₹0.00 gets three decimals.
 */
export function formatWalletAmount(amountInMilli: number | undefined | null): string {
  if (amountInMilli === undefined || amountInMilli === null || Number.isNaN(amountInMilli)) {
    return '₹0.00';
  }
  const rupees = amountInMilli / MILLI_PER_RUPEE;
  const digits = rupees !== 0 && Math.abs(rupees) < 0.01 ? 3 : 2;
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/**
 * Convert paise from the platform-settings API into rupees for display/edit.
 */
export function paiseToRupees(paise: number): number {
  return Number((paise / PAISE_PER_RUPEE).toFixed(2));
}

/**
 * Convert a rupee amount typed in the admin UI into integer paise for PATCH.
 * Rounds to the nearest paise so `47.50 * 100` cannot become `4750.000000000001`.
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(Number((rupees * PAISE_PER_RUPEE).toFixed(2)));
}

/** Input value in rupees: whole numbers stay unpadded (`50`), fractions get two decimals. */
export function paiseToRupeeInput(paise: number): string {
  const rupees = paiseToRupees(paise);
  return Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
}

/**
 * Parse a rupee amount the admin typed. Returns null when empty, negative, or not a number.
 */
export function parseRupeeInput(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Format platform-settings money (paise) as rupees. Never print the raw paise integer. */
export function formatPaiseAsRupees(paise: number | undefined | null): string {
  if (paise === undefined || paise === null || Number.isNaN(paise)) {
    return '₹0.00';
  }
  const rupees = paiseToRupees(paise);
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Dimensionless INR-per-USD rate, e.g. `₹83.4521 / USD`. */
export function formatUsdInrRate(rate: number | undefined | null): string {
  if (rate === undefined || rate === null || !Number.isFinite(rate)) {
    return '—';
  }
  return `₹${rate.toFixed(4)} / USD`;
}
