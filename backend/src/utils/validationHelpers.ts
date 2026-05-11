/**
 * Validation Helper Functions
 * Reusable validation utilities for data validation
 */

/**
 * Validate customer name format
 */
export function validateCustomerName(name: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Customer name is required' };
  }
  
  const trimmed = name.trim();
  
  if (trimmed.length < 2) {
    return { isValid: false, error: 'Customer name must be at least 2 characters' };
  }
  
  if (trimmed.length > 100) {
    return { isValid: false, error: 'Customer name must be less than 100 characters' };
  }
  
  return { isValid: true };
}

/**
 * Validate delivery address format
 */
export function validateDeliveryAddress(address: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!address || typeof address !== 'string') {
    return { isValid: false, error: 'Delivery address is required' };
  }
  
  const trimmed = address.trim();
  
  if (trimmed.length < 10) {
    return { isValid: false, error: 'Delivery address must be at least 10 characters' };
  }
  
  if (trimmed.length > 500) {
    return { isValid: false, error: 'Delivery address must be less than 500 characters' };
  }
  
  return { isValid: true };
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber(phone: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, error: 'Phone number is required' };
  }
  
  // Basic phone validation (10-15 digits, may include + and spaces)
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  const phoneRegex = /^\+?[1-9]\d{9,14}$/;
  
  if (!phoneRegex.test(cleaned)) {
    return { isValid: false, error: 'Invalid phone number format' };
  }
  
  return { isValid: true };
}

/**
 * Validate email format
 */
export function validateEmail(email: string | null | undefined): {
  isValid: boolean;
  error?: string;
} {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    return { isValid: false, error: 'Invalid email format' };
  }
  
  return { isValid: true };
}


