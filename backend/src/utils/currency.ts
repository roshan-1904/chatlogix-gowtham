/**
 * Currency Formatting Utility
 * Handles conversion between paise (stored in DB) and rupees (display format)
 */

/**
 * Format amount in paise as Indian Rupee currency string
 * @param amountInPaise - Amount in paise (smallest currency unit)
 * @returns Formatted string like "₹1,234.56"
 */
export function formatCurrency(amountInPaise: number): string {
  const rupees = amountInPaise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

/**
 * Convert paise to rupees
 * @param paise - Amount in paise
 * @returns Amount in rupees
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Convert rupees to paise
 * @param rupees - Amount in rupees
 * @returns Amount in paise
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

