/**
 * Two money units live in this app and they are not interchangeable:
 *
 * - Order, product, and catalog money is in **paise** (1 rupee = 100).
 *   Use `formatAmountWithSymbol`.
 * - Wallet money — balance, top-ups, and what the AI costs — is in
 *   **millirupees** (1 rupee = 1000). Use `formatWalletAmount`.
 *
 * Passing one unit to the other formatter is off by 10x, so keep them apart.
 */

/** Wallet money only. 1 rupee = 1000 millirupees. */
export const MILLI_PER_RUPEE = 1000;

/**
 * Format amount with currency symbol
 * Amount is expected to be in paise (backend format)
 * Converts paise to rupees for display
 */
export function formatAmountWithSymbol(amountInPaise: number | undefined | null): string {
  // Handle undefined, null, or invalid values
  if (amountInPaise === undefined || amountInPaise === null || isNaN(amountInPaise)) {
    return '₹0.00';
  }
  // Convert paise to rupees (divide by 100)
  const amountInRupees = amountInPaise / 100;
  return `₹${amountInRupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format wallet money (millirupees) for display.
 * A single AI reply can cost well under one paisa, so a non-zero amount that
 * would round away to ₹0.00 is shown with three decimals instead.
 */
export function formatWalletAmount(amountInMilli: number | undefined | null): string {
  if (amountInMilli === undefined || amountInMilli === null || isNaN(amountInMilli)) {
    return '₹0.00';
  }
  const amountInRupees = amountInMilli / MILLI_PER_RUPEE;
  const digits = amountInRupees !== 0 && Math.abs(amountInRupees) < 0.01 ? 3 : 2;
  return `₹${amountInRupees.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })}`;
}

/** Wallet money rounded to whole rupees, for compact chrome like "₹87 left". */
export function formatWalletRupees(amountInMilli: number | undefined | null): string {
  if (amountInMilli === undefined || amountInMilli === null || isNaN(amountInMilli)) {
    return '₹0';
  }
  return `₹${Math.round(amountInMilli / MILLI_PER_RUPEE).toLocaleString('en-IN')}`;
}

/** Parse a rupee amount typed by a vendor into wallet millirupees. */
export function rupeesToMilli(rupees: number): number {
  return Math.round(rupees * MILLI_PER_RUPEE);
}
