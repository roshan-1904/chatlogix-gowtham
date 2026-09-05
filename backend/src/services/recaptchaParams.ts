import { env } from '../config/env.js';
import { createExternalAPIError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';

export interface RecaptchaParams {
  recaptchaSiteKey: string;
  recaptchaStoken: string;
}

export async function fetchRecaptchaParams(): Promise<RecaptchaParams> {
  const key = env.FIREBASE_API_KEY;
  if (!key) {
    throw createExternalAPIError(
      'Firebase is not configured',
      'firebase',
      'recaptchaParams'
    );
  }

  let response: Response;
  try {
    response = await fetch(`${IDENTITY_TOOLKIT}/recaptchaParams?key=${encodeURIComponent(key)}`);
  } catch (err) {
    logger.error({ err }, 'Failed to reach Firebase recaptchaParams');
    throw createExternalAPIError(
      'Could not load reCAPTCHA configuration',
      'firebase',
      'recaptchaParams'
    );
  }

  const data = (await response.json()) as Partial<RecaptchaParams> & {
    error?: { message?: string };
  };

  if (!response.ok || !data.recaptchaSiteKey || !data.recaptchaStoken) {
    logger.error(
      { status: response.status, message: data.error?.message },
      'Firebase recaptchaParams error'
    );
    throw createExternalAPIError(
      'Could not load reCAPTCHA configuration from Firebase',
      'firebase',
      'recaptchaParams'
    );
  }

  return {
    recaptchaSiteKey: data.recaptchaSiteKey,
    recaptchaStoken: data.recaptchaStoken
  };
}
