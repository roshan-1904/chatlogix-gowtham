import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import {
  CustomError,
  ErrorType,
  ErrorSeverity
} from '../middleware/errorHandler.js';

function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/i.exec(duration.trim());
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  return value * multipliers[unit];
}

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function refreshExpiresAt(): Date {
  const ttl = env.AUTH_REFRESH_TOKEN_EXPIRES_IN || '7d';
  return new Date(Date.now() + parseDurationToMs(ttl));
}

function unauthorized(message = 'Invalid or expired refresh token'): never {
  throw new CustomError(message, 401, ErrorType.AUTHENTICATION, ErrorSeverity.MEDIUM);
}

export async function createRefreshToken(
  userId: string,
  phoneNumber: string
): Promise<{
  rawToken: string;
  expiresAt: Date;
}> {
  const rawToken = generateRawToken();
  const expiresAt = refreshExpiresAt();

  await prisma.refreshToken.create({
    data: {
      userId,
      phoneNumber,
      tokenHash: hashToken(rawToken),
      expiresAt
    }
  });

  return { rawToken, expiresAt };
}

export async function validateRefreshToken(rawToken: string): Promise<{
  userId: string;
  tokenId: string;
  phoneNumber: string;
}> {
  if (!rawToken) {
    unauthorized();
  }

  const tokenHash = hashToken(rawToken);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash }
  });

  if (!record || record.revokedAt) {
    unauthorized();
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    unauthorized();
  }

  return {
    userId: record.userId,
    tokenId: record.id,
    phoneNumber: record.phoneNumber
  };
}

export async function rotateRefreshToken(
  oldRawToken: string,
  expectedUserId: string
): Promise<{ rawToken: string; expiresAt: Date; userId: string }> {
  const { userId, tokenId, phoneNumber } = await validateRefreshToken(oldRawToken);

  if (userId !== expectedUserId) {
    unauthorized();
  }

  await prisma.refreshToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date() }
  });

  const created = await createRefreshToken(userId, phoneNumber);
  return { ...created, userId };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  if (!rawToken) {
    return;
  }

  const tokenHash = hashToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}
