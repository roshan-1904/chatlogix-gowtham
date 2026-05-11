import { formatCurrency } from '@chatlogix/utils';

/**
 * Format order amount (stored in rupees) to currency string
 */
export function formatOrderAmount(amountInRupees: number): string {
  return formatCurrency(amountInRupees, 'INR');
}

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

