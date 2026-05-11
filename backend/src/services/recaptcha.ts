import fetch from 'node-fetch';
import { env } from '../config/env.js';
import {
  createValidationError,
  CustomError,
  ErrorType,
  ErrorSeverity
} from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

const VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

export interface RecaptchaVerificationResult {
  success: boolean;
  score?: number;
  action?: string;
  challengeTs?: string;
  hostname?: string;
  errorCodes?: string[];
}

export async function verifyRecaptcha(
  token: string,
  remoteIp?: string
): Promise<RecaptchaVerificationResult> {
  if (!token) {
    throw createValidationError('reCAPTCHA token is required', 'recaptchaToken');
  }

  if (!env.RECAPTCHA_SECRET_KEY) {
    logger.warn('RECAPTCHA_SECRET_KEY not set; skipping verification (only suitable for development).');
    return { success: true };
  }

  const params = new URLSearchParams({
    secret: env.RECAPTCHA_SECRET_KEY,
    response: token
  });

  if (remoteIp) {
    params.append('remoteip', remoteIp);
  }

  const response = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  });

  if (!response.ok) {
    throw new CustomError(
      'Failed to verify reCAPTCHA token',
      response.status,
      ErrorType.EXTERNAL_API,
      ErrorSeverity.MEDIUM,
      true,
      { status: response.status }
    );
  }

  const result = (await response.json()) as RecaptchaVerificationResult;

  if (!result.success) {
    logger.warn(
      {
        errorCodes: result.errorCodes,
        score: result.score,
        action: result.action
      },
      'reCAPTCHA verification failed'
    );
    throw new CustomError(
      'reCAPTCHA verification failed',
      400,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM,
      true,
      { errorCodes: result.errorCodes }
    );
  }

  return result;
}


