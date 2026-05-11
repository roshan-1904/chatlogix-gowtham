// Utility Functions
// Date formatting, currency, phone formatting, validation, etc.

export const formatDate = (date: Date | string, format: 'short' | 'long' = 'short'): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (format === 'long') {
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatCurrency = (amount: number, currency: string = 'INR'): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
  }).format(amount);
};

export const formatPhone = (phone: string): string => {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Format as +91 12345 67890 if it's an Indian number
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  
  // Format as +1 234 567 8900 for other numbers
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  
  // Default: just add + if not present
  return phone.startsWith('+') ? phone : `+${phone}`;
};

/**
 * Normalizes a phone number to E.164 format (removes all spaces and non-digit characters except +)
 * Example: "+91 97906 90170" -> "+919790690170"
 */
export const normalizePhoneToE164 = (phone: string): string => {
  // Remove all spaces and keep only + and digits
  const normalized = phone.replace(/\s+/g, '').trim();
  
  // Ensure it starts with +
  if (!normalized.startsWith('+')) {
    // If it doesn't start with +, add it
    const digits = normalized.replace(/\D/g, '');
    return `+${digits}`;
  }
  
  return normalized;
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePhone = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

