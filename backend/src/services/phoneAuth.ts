import crypto from 'node:crypto';
import { createValidationError, ErrorType, ErrorSeverity, CustomError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const OTP_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes

// Hardcoded OTP for testing (in production, this would be randomly generated)
const HARDCODED_OTP = '123456';

interface OtpSession {
  phoneNumber: string;
  otp: string;
  expiresAt: number;
  attempts: number;
}

// In-memory store for OTP sessions
const otpSessions = new Map<string, OtpSession>();

// Clean up expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of otpSessions.entries()) {
    if (session.expiresAt < now) {
      otpSessions.delete(sessionId);
    }
  }
}, 60 * 1000); // Clean up every minute

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

function generateOtp(): string {
  // For now, use hardcoded OTP. In production, generate random:
  // return Math.floor(100000 + Math.random() * 900000).toString();
  return HARDCODED_OTP;
}

function generateSessionId(phoneNumber: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString('hex');
  return crypto.createHash('sha256').update(`${phoneNumber}:${timestamp}:${random}`).digest('hex');
}

export async function sendVerificationCode(
  phoneNumber: string
): Promise<{ sessionInfo: string }> {
  const normalizedPhone = assertPhoneNumber(phoneNumber);

  // Generate OTP
  const otp = generateOtp();
  
  // Create session
  const sessionId = generateSessionId(normalizedPhone);
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  otpSessions.set(sessionId, {
    phoneNumber: normalizedPhone,
    otp,
    expiresAt,
    attempts: 0
  });

  logger.info(
    {
      phoneNumber: normalizedPhone,
      sessionId,
      otp // Log OTP for development (remove in production)
    },
    'OTP generated (hardcoded)'
  );

  // In a real implementation, you would send SMS here
  // For now, we just log it
  console.log(`[OTP] Phone: ${normalizedPhone}, Code: ${otp}`);

  return { sessionInfo: sessionId };
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

  const session = otpSessions.get(sessionInfo);
  
  if (!session) {
    throw new CustomError(
      'Invalid or expired session',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  // Check if session expired
  if (Date.now() > session.expiresAt) {
    otpSessions.delete(sessionInfo);
    throw new CustomError(
      'Verification code has expired',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  // Check attempt limit
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

  // Verify OTP
  if (code.trim() !== session.otp) {
    throw new CustomError(
      'Invalid verification code',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  // OTP verified successfully - clean up session
  otpSessions.delete(sessionInfo);

  // Use phone number as userId (or generate a hash)
  const userId = crypto.createHash('sha256').update(session.phoneNumber).digest('hex').substring(0, 16);

  logger.info(
    {
      phoneNumber: session.phoneNumber,
      userId
    },
    'OTP verified successfully'
  );

  // For now, always treat as existing user (you can add user lookup logic here)
  return {
    userId,
    phoneNumber: session.phoneNumber,
    isNewUser: false
  };
}
