/**
 * Environment variable utilities
 * Ensures environment variables are properly loaded from .env files
 */

/**
 * Get reCAPTCHA site key from environment variables
 * Validates and provides helpful error messages in development
 */
export function getRecaptchaSiteKey(): string {
  const key = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

  // Development-time validation and warnings
  if (import.meta.env.DEV) {
    if (!key) {
      console.warn(
        '⚠️  reCAPTCHA Site Key is not configured!\n' +
        'Please create a .env.local file in frontend_v2/apps/web-vendor/ with:\n' +
        'VITE_RECAPTCHA_SITE_KEY=your-firebase-recaptcha-site-key\n\n' +
        'Get your key from: Firebase Console → Authentication → Settings → reCAPTCHA'
      );
    } else if (key.includes('your-') || key.includes('placeholder') || key.length < 20) {
      console.warn(
        '⚠️  reCAPTCHA Site Key appears to be a placeholder!\n' +
        'Current value:', key.substring(0, 20) + '...\n' +
        'Please update VITE_RECAPTCHA_SITE_KEY in your .env.local file with the actual key from Firebase Console.'
      );
    } else {
      console.log('✅ reCAPTCHA Site Key loaded:', key.substring(0, 10) + '...');
    }
  }

  // Production-time validation (silent, but ensures we have a valid key)
  if (import.meta.env.PROD && !key) {
    console.error(
      '❌ reCAPTCHA Site Key is missing in production build!\n' +
      'This will cause reCAPTCHA to fail. Ensure VITE_RECAPTCHA_SITE_KEY is set during build.'
    );
  }

  return key;
}

/**
 * Get API URL from environment variables
 */
export function getApiUrl(): string {
  return import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
}

/**
 * Get current environment
 */
export function getEnvironment(): 'development' | 'staging' | 'production' {
  const env = import.meta.env.VITE_ENVIRONMENT || import.meta.env.MODE || 'development';
  return env as 'development' | 'staging' | 'production';
}

/**
 * Validate that required environment variables are set
 * Useful for build-time checks
 */
export function validateEnv(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const recaptchaKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

  if (!recaptchaKey) {
    errors.push('VITE_RECAPTCHA_SITE_KEY is not set');
  } else if (recaptchaKey.includes('your-') || recaptchaKey.includes('placeholder')) {
    errors.push('VITE_RECAPTCHA_SITE_KEY appears to be a placeholder value');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

