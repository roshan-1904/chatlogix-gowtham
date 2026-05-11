import crypto from 'node:crypto';
import { createValidationError, ErrorType, ErrorSeverity, CustomError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { getRedisClient, setCached, getCached, deleteCached } from '../utils/redis.js';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const OTP_EXPIRY_SECONDS = 5 * 60; // 5 minutes

// Hardcoded OTP for testing (in production, this would be randomly generated)
const HARDCODED_OTP = '123456';

interface PhoneVerificationSession {
  vendorId: string;
  newPhoneNumber: string;
  otp: string;
  expiresAt: number;
  attempts: number;
}

// Fallback in-memory store if Redis unavailable
const inMemorySessions = new Map<string, PhoneVerificationSession>();

// Clean up expired sessions periodically (for in-memory fallback)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of inMemorySessions.entries()) {
    if (session.expiresAt < now) {
      inMemorySessions.delete(sessionId);
    }
  }
}, 60 * 1000); // Clean up every minute

function assertPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) {
    throw createValidationError('Phone number is required', 'phoneNumber');
  }

  const normalized = phoneNumber.trim();
  if (!PHONE_REGEX.test(normalized)) {
    throw createValidationError('Phone number must be in E.164 format (+123456789)', 'phoneNumber', normalized);
  }

  return normalized;
}

function generateOtp(): string {
  // For now, use hardcoded OTP. In production, generate random:
  // return Math.floor(100000 + Math.random() * 900000).toString();
  return HARDCODED_OTP;
}

function generateSessionId(vendorId: string, newPhoneNumber: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString('hex');
  return crypto.createHash('sha256').update(`${vendorId}:${newPhoneNumber}:${timestamp}:${random}`).digest('hex');
}

function getSessionKey(sessionId: string): string {
  return `settings:phone_verification:${sessionId}`;
}

/**
 * Send phone verification code for settings update
 * Stores verification session in Redis (with in-memory fallback)
 */
export async function sendPhoneVerificationCode(
  vendorId: string,
  newPhoneNumber: string
): Promise<{ sessionInfo: string }> {
  if (!vendorId) {
    throw createValidationError('Vendor ID is required', 'vendorId');
  }

  const normalizedPhone = assertPhoneNumber(newPhoneNumber);

  // Generate OTP
  const otp = generateOtp();

  // Create session
  const sessionId = generateSessionId(vendorId, normalizedPhone);
  const expiresAt = Date.now() + (OTP_EXPIRY_SECONDS * 1000);

  const session: PhoneVerificationSession = {
    vendorId,
    newPhoneNumber: normalizedPhone,
    otp,
    expiresAt,
    attempts: 0
  };

  // Try Redis first, fallback to in-memory
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      await setCached(getSessionKey(sessionId), session, OTP_EXPIRY_SECONDS);
    } catch (error) {
      logger.warn({ error, sessionId }, 'Failed to store session in Redis, using in-memory fallback');
      inMemorySessions.set(sessionId, session);
    }
  } else {
    inMemorySessions.set(sessionId, session);
  }

  logger.info(
    {
      vendorId,
      newPhoneNumber: normalizedPhone,
      sessionId,
      otp // Log OTP for development (remove in production)
    },
    'Phone verification OTP generated for settings update'
  );

  // In a real implementation, you would send SMS here
  // For now, we just log it
  console.log(`[Settings OTP] Vendor: ${vendorId}, New Phone: ${normalizedPhone}, Code: ${otp}`);

  return { sessionInfo: sessionId };
}

/**
 * Verify phone change code
 * Returns success status if verification is successful
 */
export async function verifyPhoneChange(
  vendorId: string,
  sessionInfo: string,
  code: string
): Promise<{ success: boolean }> {
  if (!vendorId) {
    throw createValidationError('Vendor ID is required', 'vendorId');
  }

  if (!sessionInfo) {
    throw createValidationError('sessionInfo is required', 'sessionInfo');
  }

  if (!code || code.trim().length < 4) {
    throw createValidationError('Invalid verification code', 'code');
  }

  // Try Redis first, fallback to in-memory
  let session: PhoneVerificationSession | null = null;
  const redisClient = getRedisClient();
  
  if (redisClient) {
    try {
      session = await getCached<PhoneVerificationSession>(getSessionKey(sessionInfo));
    } catch (error) {
      logger.warn({ error, sessionInfo }, 'Failed to get session from Redis, checking in-memory');
      session = inMemorySessions.get(sessionInfo) || null;
    }
  } else {
    session = inMemorySessions.get(sessionInfo) || null;
  }

  if (!session) {
    throw new CustomError(
      'Invalid or expired session',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  // Verify vendor ID matches
  if (session.vendorId !== vendorId) {
    throw new CustomError(
      'Session does not match vendor',
      403,
      ErrorType.AUTHORIZATION,
      ErrorSeverity.MEDIUM
    );
  }

  // Check if session expired
  if (Date.now() > session.expiresAt) {
    // Clean up expired session
    if (redisClient) {
      try {
        await deleteCached(getSessionKey(sessionInfo));
      } catch (error) {
        logger.warn({ error, sessionInfo }, 'Failed to delete expired session from Redis');
      }
    }
    inMemorySessions.delete(sessionInfo);
    
    throw new CustomError(
      'Verification code has expired',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  // Check attempt limit
  if (session.attempts >= 5) {
    // Clean up session after too many attempts
    if (redisClient) {
      try {
        await deleteCached(getSessionKey(sessionInfo));
      } catch (error) {
        logger.warn({ error, sessionInfo }, 'Failed to delete session from Redis');
      }
    }
    inMemorySessions.delete(sessionInfo);
    
    throw new CustomError(
      'Too many verification attempts. Please request a new code',
      429,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  // Update attempts
  session.attempts++;

  // Save updated session
  if (redisClient) {
    try {
      const remainingSeconds = Math.floor((session.expiresAt - Date.now()) / 1000);
      if (remainingSeconds > 0) {
        await setCached(getSessionKey(sessionInfo), session, remainingSeconds);
      }
    } catch (error) {
      logger.warn({ error, sessionInfo }, 'Failed to update session in Redis');
      inMemorySessions.set(sessionInfo, session);
    }
  } else {
    inMemorySessions.set(sessionInfo, session);
  }

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
  if (redisClient) {
    try {
      await deleteCached(getSessionKey(sessionInfo));
    } catch (error) {
      logger.warn({ error, sessionInfo }, 'Failed to delete verified session from Redis');
    }
  }
  inMemorySessions.delete(sessionInfo);

  logger.info(
    {
      vendorId,
      newPhoneNumber: session.newPhoneNumber
    },
    'Phone verification successful for settings update'
  );

  return { success: true };
}

