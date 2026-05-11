/**
 * Price conversion utilities
 * CRITICAL: Backend stores prices in paise (₹1 = 100 paise), frontend displays in rupees
 */

/**
 * Convert rupees to paise for API requests
 * CRITICAL: Proper rounding to avoid floating-point precision issues
 * @param rupees Price in rupees (e.g., 47.50)
 * @returns Price in paise (e.g., 4750)
 */
export function rupeesToPaise(rupees: number): number {
  // Round to avoid floating point issues (e.g., 47.50 * 100 = 4750.000000000001)
  return Math.round(Number((rupees * 100).toFixed(2)));
}

/**
 * Convert paise to rupees for display
 * CRITICAL: Ensure we don't lose precision
 * @param paise Price in paise (e.g., 4750)
 * @returns Price in rupees (e.g., 47.50)
 */
export function paiseToRupees(paise: number): number {
  // Ensure we don't lose precision
  return Number((paise / 100).toFixed(2));
}

/**
 * Format price for display
 * @param paise Price in paise
 * @returns Formatted string (e.g., "₹47.50")
 */
export function formatPrice(paise: number): string {
  const rupees = paiseToRupees(paise);
  return `₹${rupees.toFixed(2)}`;
}

/**
 * Format price without currency symbol
 * @param paise Price in paise
 * @returns Formatted string (e.g., "47.50")
 */
export function formatPriceNumber(paise: number): string {
  const rupees = paiseToRupees(paise);
  return rupees.toFixed(2);
}

