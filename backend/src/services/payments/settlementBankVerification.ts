import crypto from 'node:crypto';
import { createValidationError } from '../../middleware/errorHandler.js';
import { logger } from '../../logger.js';
import { getRedisClient, setCached, getCached, deleteCached } from '../../utils/redis.js';

const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
const OTP_EXPIRY_SECONDS = 5 * 60;
const HARDCODED_OTP = '123456';
const MAX_ATTEMPTS = 5;

interface BankChangeOtpSession {
  vendorId: string;
  phoneNumber: string;
  otp: string;
  expiresAt: number;
  attempts: number;
}

const inMemorySessions = new Map<string, BankChangeOtpSession>();

function generateOtp(): string {
  return HARDCODED_OTP;
}

function sessionKey(sessionId: string): string {
  return `settlement:bank_change_otp:${sessionId}`;
}

function assertPhone(phone: string): string {
  const normalized = phone.trim();
  if (!PHONE_REGEX.test(normalized)) {
    throw createValidationError('Phone number must be in E.164 format', 'phoneNumber', normalized);
  }
  return normalized;
}

export async function sendSettlementBankChangeOtp(
  vendorId: string,
  registeredPhone: string
): Promise<{ sessionInfo: string }> {
  const phoneNumber = assertPhone(registeredPhone);
  const otp = generateOtp();
  const sessionId = crypto
    .createHash('sha256')
    .update(`${vendorId}:${phoneNumber}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`)
    .digest('hex');
  const session: BankChangeOtpSession = {
    vendorId,
    phoneNumber,
    otp,
    expiresAt: Date.now() + OTP_EXPIRY_SECONDS * 1000,
    attempts: 0
  };
  const redis = getRedisClient();
  if (redis) {
    try {
      await setCached(sessionKey(sessionId), session, OTP_EXPIRY_SECONDS);
    } catch {
      inMemorySessions.set(sessionId, session);
    }
  } else {
    inMemorySessions.set(sessionId, session);
  }
  logger.info({ vendorId, sessionId }, 'Settlement bank change OTP issued');
  console.log(`[Bank change OTP] Vendor: ${vendorId}, Code: ${otp}`);
  return { sessionInfo: sessionId };
}

export async function verifySettlementBankChangeOtp(
  sessionId: string,
  vendorId: string,
  otp: string
): Promise<void> {
  const redis = getRedisClient();
  let session: BankChangeOtpSession | null = null;
  if (redis) {
    try {
      session = await getCached<BankChangeOtpSession>(sessionKey(sessionId));
    } catch {
      session = inMemorySessions.get(sessionId) ?? null;
    }
  } else {
    session = inMemorySessions.get(sessionId) ?? null;
  }
  if (!session || session.vendorId !== vendorId) {
    throw createValidationError('Verification session expired or invalid', 'sessionInfo');
  }
  if (session.expiresAt < Date.now()) {
    throw createValidationError('Verification code expired', 'otp');
  }
  if (session.attempts >= MAX_ATTEMPTS) {
    throw createValidationError('Too many attempts', 'otp');
  }
  session.attempts += 1;
  if (session.otp !== otp.trim()) {
    throw createValidationError('Invalid verification code', 'otp');
  }
  if (redis) {
    try {
      await deleteCached(sessionKey(sessionId));
    } catch {
      inMemorySessions.delete(sessionId);
    }
  } else {
    inMemorySessions.delete(sessionId);
  }
}
