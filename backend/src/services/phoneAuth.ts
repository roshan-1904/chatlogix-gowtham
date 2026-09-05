import crypto from 'node:crypto';
import { env } from '../config/env.js';
import {
  createValidationError,
  createExternalAPIError,
  createRateLimitError,
  ErrorType,
  ErrorSeverity,
  CustomError
} from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import {
  getSendCodeRetryAfterSeconds,
  recordSendCodeSent
} from '../utils/sendCodeRateLimit.js';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const OTP_EXPIRY_MS = 2 * 60 * 1000;
const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
const DEV_OTP = '123456';
/** Suggested wait when Firebase returns TOO_MANY_ATTEMPTS_TRY_LATER */
const FIREBASE_TOO_MANY_ATTEMPTS_RETRY_SECONDS = 900;
const DEV_OTP_FALLBACK_AFTER_FAILURES = 2;

interface OtpSession {
  phoneNumber: string;
  otp: string;
  expiresAt: number;
  attempts: number;
}

const otpSessions = new Map<string, OtpSession>();
const firebaseSendFailures = new Map<string, number>();

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
  if (upper.includes('TOO_MANY_ATTEMPTS')) {
    return 'Too many verification attempts for this phone number. Please wait about 15 minutes before requesting another SMS code.';
  }
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
  const upper = message.toUpperCase();

  if (statusCode === 429) {
    throw createRateLimitError(
      humanizeFirebaseAuthError(message),
      upper.includes('TOO_MANY_ATTEMPTS')
        ? FIREBASE_TOO_MANY_ATTEMPTS_RETRY_SECONDS
        : 60,
      env.NODE_ENV !== 'production' ? { firebaseError: message } : {}
    );
  }

  const errorType =
    statusCode === 400
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

async function assertSendCodeRateLimit(phoneNumber: string): Promise<void> {
  const retryAfter = await getSendCodeRetryAfterSeconds(phoneNumber);
  if (retryAfter > 0) {
    throw createRateLimitError(
      `Please wait ${retryAfter} seconds before requesting another verification code.`,
      retryAfter,
      { source: 'send_code_cooldown' }
    );
  }
}

function createDevOtpSession(normalizedPhone: string): { sessionInfo: string; delivery: 'dev' } {
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

function maybeUseDevOtpFallback(
  normalizedPhone: string,
  err: unknown
): { sessionInfo: string; delivery: 'dev' } | null {
  if (!allowDevOtp() || !(err instanceof CustomError)) {
    return null;
  }

  const failures = (firebaseSendFailures.get(normalizedPhone) ?? 0) + 1;
  firebaseSendFailures.set(normalizedPhone, failures);

  if (failures < DEV_OTP_FALLBACK_AFTER_FAILURES) {
    return null;
  }

  logger.warn(
    { phoneNumber: normalizedPhone, failures, firebaseError: err.context?.firebaseError ?? err.message },
    'Firebase send-code failed repeatedly; using dev OTP fallback'
  );
  firebaseSendFailures.delete(normalizedPhone);
  return createDevOtpSession(normalizedPhone);
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
  await assertSendCodeRateLimit(normalizedPhone);

  if (isFirebasePhoneAuth()) {
    if (!recaptchaToken) {
      throw createValidationError('reCAPTCHA token is required', 'recaptchaToken');
    }

    try {
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
      firebaseSendFailures.delete(normalizedPhone);
      await recordSendCodeSent(normalizedPhone);
      logger.info({ phoneNumber: normalizedPhone }, 'Firebase OTP sent');
      return { sessionInfo: data.sessionInfo, delivery: 'firebase' };
    } catch (err) {
      const fallback = maybeUseDevOtpFallback(normalizedPhone, err);
      if (fallback) {
        await recordSendCodeSent(normalizedPhone);
        return fallback;
      }
      throw err;
    }
  }

  if (!allowDevOtp()) {
    throw new CustomError(
      'Phone authentication is not configured',
      503,
      ErrorType.SYSTEM,
      ErrorSeverity.HIGH
    );
  }

  await recordSendCodeSent(normalizedPhone);
  return createDevOtpSession(normalizedPhone);
}

function verifyDevOtpSession(
  sessionInfo: string,
  code: string
): {
  userId: string;
  phoneNumber: string;
  isNewUser: boolean;
} {
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

  if (otpSessions.has(sessionInfo)) {
    return verifyDevOtpSession(sessionInfo, code);
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

  return verifyDevOtpSession(sessionInfo, code);
}
