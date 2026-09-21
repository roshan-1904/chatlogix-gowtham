import { executeFirebaseRecaptcha as executeRecaptcha } from '@chatlogix/auth';
import { getApiUrl } from './env';

/**
 * App-local wrapper — supplies the vendor API base URL to the shared reCAPTCHA helper.
 */
export async function executeFirebaseRecaptcha(): Promise<string> {
  return executeRecaptcha(getApiUrl());
}
