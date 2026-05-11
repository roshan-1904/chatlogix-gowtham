import { AuthApi } from '@chatlogix/auth';
import ReCAPTCHA from 'react-google-recaptcha';

const API_URL = import.meta.env.VITE_API_URL || 'https://chatlogix.in/api';
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

// Create a reCAPTCHA instance (will be initialized in the component)
let recaptchaRef: ReCAPTCHA | null = null;

export function setRecaptchaRef(ref: ReCAPTCHA | null) {
  recaptchaRef = ref;
}

export function getRecaptchaToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!recaptchaRef) {
      reject(new Error('reCAPTCHA not initialized'));
      return;
    }

    if (!RECAPTCHA_SITE_KEY) {
      reject(new Error('reCAPTCHA site key not configured'));
      return;
    }

    recaptchaRef.executeAsync()
      .then((token: string | null) => {
        if (token) {
          resolve(token);
        } else {
          reject(new Error('Failed to get reCAPTCHA token'));
        }
      })
      .catch(reject);
  });
}

export const authApi = new AuthApi({
  baseURL: API_URL,
  getRecaptchaToken,
});

