import crypto from 'node:crypto';
import { createValidationError, ErrorType, ErrorSeverity, CustomError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { getRedisClient, setCached, getCached, deleteCached } from '../utils/redis.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_CODE_EXPIRY_SECONDS = 10 * 60; // 10 minutes

// Hardcoded code for testing (in production, this would be randomly generated)
const HARDCODED_CODE = '123456';

interface EmailVerificationSession {
  vendorId: string;
  newEmail: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

// Fallback in-memory store if Redis unavailable
const inMemorySessions = new Map<string, EmailVerificationSession>();

// Clean up expired sessions periodically (for in-memory fallback)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of inMemorySessions.entries()) {
    if (session.expiresAt < now) {
      inMemorySessions.delete(sessionId);
    }
  }
}, 60 * 1000); // Clean up every minute

function assertEmail(email: string): string {
  if (!email) {
    throw createValidationError('Email is required', 'email');
  }

  const normalized = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalized)) {
    throw createValidationError('Invalid email format', 'email', normalized);
  }

  return normalized;
}

function generateCode(): string {
  // For now, use hardcoded code. In production, generate random:
  // return Math.floor(100000 + Math.random() * 900000).toString();
  return HARDCODED_CODE;
}

function generateSessionId(vendorId: string, newEmail: string): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString('hex');
  return crypto.createHash('sha256').update(`${vendorId}:${newEmail}:${timestamp}:${random}`).digest('hex');
}

function getSessionKey(sessionId: string): string {
  return `settings:email_verification:${sessionId}`;
}

/**
 * Send email verification code for settings update
 * Stores verification session in Redis (with in-memory fallback)
 */
export async function sendEmailVerificationCode(
  vendorId: string,
  newEmail: string
): Promise<{ success: boolean; sessionInfo: string }> {
  if (!vendorId) {
    throw createValidationError('Vendor ID is required', 'vendorId');
  }

  const normalizedEmail = assertEmail(newEmail);

  // Generate verification code
  const code = generateCode();

  // Create session
  const sessionId = generateSessionId(vendorId, normalizedEmail);
  const expiresAt = Date.now() + (EMAIL_CODE_EXPIRY_SECONDS * 1000);

  const session: EmailVerificationSession = {
    vendorId,
    newEmail: normalizedEmail,
    code,
    expiresAt,
    attempts: 0
  };

  // Try Redis first, fallback to in-memory
  const redisClient = getRedisClient();
  if (redisClient) {
    try {
      await setCached(getSessionKey(sessionId), session, EMAIL_CODE_EXPIRY_SECONDS);
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
      newEmail: normalizedEmail,
      sessionId,
      code // Log code for development (remove in production)
    },
    'Email verification code generated for settings update'
  );

  // In a real implementation, you would send email here
  // For now, we just log it
  console.log(`[Settings Email Code] Vendor: ${vendorId}, New Email: ${normalizedEmail}, Code: ${code}`);

  return { success: true, sessionInfo: sessionId };
}

/**
 * Verify email change code
 * Returns success status if verification is successful
 */
export async function verifyEmailChange(
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
  let session: EmailVerificationSession | null = null;
  const redisClient = getRedisClient();
  
  if (redisClient) {
    try {
      session = await getCached<EmailVerificationSession>(getSessionKey(sessionInfo));
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

  // Verify code
  if (code.trim() !== session.code) {
    throw new CustomError(
      'Invalid verification code',
      401,
      ErrorType.AUTHENTICATION,
      ErrorSeverity.MEDIUM
    );
  }

  // Code verified successfully - clean up session
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
      newEmail: session.newEmail
    },
    'Email verification successful for settings update'
  );

  return { success: true };
}

