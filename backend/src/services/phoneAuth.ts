import crypto from 'node:crypto';
import { env } from '../config/env.js';
import {
  createValidationError,
  createExternalAPIError,
  ErrorType,
  ErrorSeverity,
  CustomError
} from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const OTP_EXPIRY_MS = 2 * 60 * 1000;
const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
const DEV_OTP = '123456';

interface OtpSession {
  phoneNumber: string;
  otp: string;
  expiresAt: number;
  attempts: number;
}

const otpSessions = new Map<string, OtpSession>();

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of otpSessions.entries()) {
    if (session.expiresAt < now) otpSessions.delete(sessionId);
  }
}, 60 * 1000).unref?.();

function isFirebasePhoneAuth(): boolean {
  return Boolean(env.FIREBASE_API_KEY);
}

function assertPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) {
    throw createValidationError('Phone number is required', 'phoneNumber');
  }
  const normalized = phoneNumber.trim();
  if (!PHONE_REGEX.test(normalized)) {
    throw createValidationError('Phone number must be in E.164 format (+123456789)', 'phoneNumber', phoneNumber);
  }
  return normalized;
}

function allowDevOtp(): boolean {
  if (env.NODE_ENV === 'production') return false;
  return env.AUTH_ALLOW_DEV_OTP !== 'false';
}

function generateSessionId(phoneNumber: string): string {
  return crypto.createHash('sha256')
    .update(`${phoneNumber}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`)
    .digest('hex');
}

interface IdentityToolkitResponse {
  error?: { message?: string; status?: string };
  sessionInfo?: string;
  localId?: string;
  phoneNumber?: string;
  isNewUser?: boolean;
}

function mapFirebaseStatus(message: string): number {
  const upper = message.toUpperCase();
  if (upper.includes('TOO_MANY_ATTEMPTS')) return 429;
  if (
    upper.includes('INVALID_PHONE_NUMBER') ||
    upper.includes('MISSING_PHONE_NUMBER') ||
    upper.includes('CAPTCHA') ||
    upper.includes('RECAPTCHA')
  ) {
    return 400;
  }
  if (upper.includes('INVALID_CODE') || upper.includes('SESSION_EXPIRED')) return 401;
  return 502;
}

function humanizeFirebaseAuthError(message: string): string {
  const upper = message.toUpperCase();
  if (upper.includes('TOO_MANY_ATTEMPTS')) return 'Too many attempts. Please try again later.';
  if (upper.includes('INVALID_PHONE_NUMBER')) return 'Invalid phone number.';
  if (upper.includes('MISSING_PHONE_NUMBER')) return 'Phone number is required.';
  if (upper.includes('INVALID_CODE') || upper.includes('SESSION_EXPIRED')) {
    return 'Invalid or expired verification code.';
  }
  if (upper.includes('CAPTCHA') || upper.includes('RECAPTCHA') || upper.includes('SITE_MISMATCH') || upper.includes('HOSTNAME MATCH')) {
    return 'reCAPTCHA hostname mismatch. Use http://127.0.0.1:3000 (not localhost) and add 127.0.0.1 to Firebase Authorized domains, or add localhost if you use localhost:3000.';
  }
  if (upper.includes('BILLING_NOT_ENABLED')) {
    return 'Firebase billing is not enabled. Upgrade to the Blaze plan to send SMS to real phone numbers.';
  }
  if (upper.includes('OPERATION_NOT_ALLOWED')) {
    return 'Phone sign-in is disabled in Firebase. Enable Authentication → Sign-in method → Phone.';
  }
  if (upper.includes('API_KEY_INVALID') || upper.includes('API KEY NOT VALID')) {
    return 'Firebase API key is invalid. Check FIREBASE_API_KEY in backend/.env.';
  }
  if (upper.includes('INVALID_APP_CREDENTIAL')) {
    return 'Firebase rejected the app credential. For local dev use http://127.0.0.1:3000 (not localhost), add 127.0.0.1 to Authorized domains, and in Google Cloud → Credentials set the API key Application restrictions to None (server-side calls). Or disable FIREBASE_API_KEY locally and use dev OTP 123456.';
  }
  if (upper.includes('REFERER') || upper.includes('REFERRER') || upper.includes('REQUEST_DENIED')) {
    return 'Firebase API key is blocked for server-side use. In Google Cloud Console → Credentials, remove HTTP referrer restrictions from the key used as FIREBASE_API_KEY (or create a separate server key).';
  }
  return 'Could not send or verify the SMS code. Please try again.';
}

function throwMappedFirebaseError(message: string): never {
  const statusCode = mapFirebaseStatus(message);
  const errorType =
    statusCode === 429
      ? ErrorType.RATE_LIMIT
      : statusCode === 400
        ? ErrorType.VALIDATION
        : statusCode === 401
          ? ErrorType.AUTHENTICATION
          : ErrorType.EXTERNAL_API;

  throw new CustomError(
    humanizeFirebaseAuthError(message),
    statusCode,
    errorType,
    ErrorSeverity.MEDIUM,
    true,
    env.NODE_ENV !== 'production' ? { firebaseError: message } : {}
  );
}

async function firebasePost(path: string, body: Record<string, string>): Promise<IdentityToolkitResponse> {
  const key = env.FIREBASE_API_KEY;
  if (!key) {
    throw new CustomError(
      'Phone authentication is not configured',
      503,
      ErrorType.SYSTEM,
      ErrorSeverity.HIGH
    );
  }

  let response: Response;
  try {
    response = await fetch(`${IDENTITY_TOOLKIT}/${path}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    logger.error({ path, err }, 'Firebase Identity Toolkit request failed');
    throw createExternalAPIError(
      'Could not send or verify the SMS code. Please try again.',
      'firebase',
      path
    );
  }

  let data: IdentityToolkitResponse = {};
  try {
    data = (await response.json()) as IdentityToolkitResponse;
  } catch {
    if (!response.ok) {
      throwMappedFirebaseError('UNKNOWN');
    }
    throw createExternalAPIError(
      'Could not send or verify the SMS code. Please try again.',
      'firebase',
      path
    );
  }

  if (!response.ok) {
    const message = data.error?.message || 'Failed to contact Firebase phone auth';
    logger.error({ path, message, status: response.status, firebaseStatus: data.error?.status }, 'Firebase Identity Toolkit error');
    throwMappedFirebaseError(message);
  }

  return data;
}

/**
 * Send an SMS OTP.
 * When FIREBASE_API_KEY is set: Identity Toolkit (requires recaptchaToken).
 * Production without Firebase, or AUTH_ALLOW_DEV_OTP=false: 503.
 * Local/test: in-memory session with code 123456.
 */
export async function sendVerificationCode(
  phoneNumber: string,
  recaptchaToken?: string
): Promise<{ sessionInfo: string; delivery: 'firebase' | 'dev' }> {
  const normalizedPhone = assertPhoneNumber(phoneNumber);

  if (isFirebasePhoneAuth()) {
    if (!recaptchaToken) {
      throw createValidationError('reCAPTCHA token is required', 'recaptchaToken');
    }
    const data = await firebasePost('accounts:sendVerificationCode', {
      phoneNumber: normalizedPhone,
      recaptchaToken
    });
    if (!data.sessionInfo) {
      throw createExternalAPIError(
        'Could not send verification code. Please try again.',
        'firebase',
        'accounts:sendVerificationCode'
      );
    }
    logger.info({ phoneNumber: normalizedPhone }, 'Firebase OTP sent');
    return { sessionInfo: data.sessionInfo, delivery: 'firebase' };
  }

  if (!allowDevOtp()) {
    throw new CustomError(
      'Phone authentication is not configured',
      503,
      ErrorType.SYSTEM,
      ErrorSeverity.HIGH
    );
  }

  const sessionId = generateSessionId(normalizedPhone);
  otpSessions.set(sessionId, {
    phoneNumber: normalizedPhone,
    otp: DEV_OTP,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0
  });
  logger.warn({ phoneNumber: normalizedPhone, sessionId }, 'DEV OTP session created');
  return { sessionInfo: sessionId, delivery: 'dev' };
}

export async function verifyCode(
  sessionInfo: string,
  code: string
): Promise<{
  userId: string;
  phoneNumber: string;
  isNewUser: boolean;
}> {
  if (!sessionInfo) {
    throw createValidationError('sessionInfo is required', 'sessionInfo');
  }
  if (!code || code.trim().length < 4) {
    throw createValidationError('Invalid verification code', 'code');
  }

  if (isFirebasePhoneAuth()) {
    const data = await firebasePost('accounts:signInWithPhoneNumber', {
      sessionInfo,
      code: code.trim()
    });
    const phoneNumber = data.phoneNumber;
    const userId = data.localId;
    if (!phoneNumber || !userId) {
      throw createExternalAPIError(
        'Could not verify code. Please try again.',
        'firebase',
        'accounts:signInWithPhoneNumber'
      );
    }
    logger.info({ phoneNumber, userId }, 'Firebase OTP verified');
    return {
      userId,
      phoneNumber,
      isNewUser: Boolean(data.isNewUser)
    };
  }

  if (!allowDevOtp()) {
    throw new CustomError(
      'Phone authentication is not configured',
      503,
      ErrorType.SYSTEM,
      ErrorSeverity.HIGH
    );
  }

  const session = otpSessions.get(sessionInfo);
  if (!session) {
    throw new CustomError('Invalid or expired session', 401, ErrorType.AUTHENTICATION, ErrorSeverity.MEDIUM);
  }
  if (Date.now() > session.expiresAt) {
    otpSessions.delete(sessionInfo);
    throw new CustomError('Verification code has expired', 401, ErrorType.AUTHENTICATION, ErrorSeverity.MEDIUM);
  }
  if (session.attempts >= 5) {
    otpSessions.delete(sessionInfo);
    throw new CustomError(
      'Too many verification attempts. Please request a new code',
      429,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }
  session.attempts++;
  if (code.trim() !== session.otp) {
    throw new CustomError('Invalid verification code', 401, ErrorType.AUTHENTICATION, ErrorSeverity.MEDIUM);
  }
  otpSessions.delete(sessionInfo);
  const userId = crypto.createHash('sha256').update(session.phoneNumber).digest('hex').substring(0, 16);
  logger.info({ phoneNumber: session.phoneNumber, userId }, 'OTP verified successfully');
  return { userId, phoneNumber: session.phoneNumber, isNewUser: false };
}
