import crypto from 'node:crypto';
import { getRedisClient } from './redis.js';

const COOLDOWN_SECONDS = 60;
const MAX_SENDS_PER_HOUR = 5;
const HOURLY_WINDOW_SECONDS = 3600;

const REDIS_PREFIX = 'auth:send_code:';

interface MemoryEntry {
  lastSentAt: number;
  hourlyCount: number;
  hourlyWindowStart: number;
}

const memoryStore = new Map<string, MemoryEntry>();

function phoneKey(phoneNumber: string): string {
  return crypto.createHash('sha256').update(phoneNumber).digest('hex');
}

function getMemoryEntry(key: string): MemoryEntry {
  const existing = memoryStore.get(key);
  if (existing) return existing;
  const entry: MemoryEntry = { lastSentAt: 0, hourlyCount: 0, hourlyWindowStart: Date.now() };
  memoryStore.set(key, entry);
  return entry;
}

function memoryRetryAfter(key: string, now: number): number {
  const entry = getMemoryEntry(key);

  if (now - entry.hourlyWindowStart >= HOURLY_WINDOW_SECONDS * 1000) {
    entry.hourlyCount = 0;
    entry.hourlyWindowStart = now;
  }

  const cooldownRemaining = Math.ceil(
    (entry.lastSentAt + COOLDOWN_SECONDS * 1000 - now) / 1000
  );
  if (cooldownRemaining > 0) {
    return cooldownRemaining;
  }

  if (entry.hourlyCount >= MAX_SENDS_PER_HOUR) {
    const windowRemaining = Math.ceil(
      (entry.hourlyWindowStart + HOURLY_WINDOW_SECONDS * 1000 - now) / 1000
    );
    return Math.max(windowRemaining, 1);
  }

  return 0;
}

function recordMemorySend(key: string, now: number): void {
  const entry = getMemoryEntry(key);
  if (now - entry.hourlyWindowStart >= HOURLY_WINDOW_SECONDS * 1000) {
    entry.hourlyCount = 0;
    entry.hourlyWindowStart = now;
  }
  entry.lastSentAt = now;
  entry.hourlyCount++;
}

async function redisRetryAfter(key: string, now: number): Promise<number | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const cooldownKey = `${REDIS_PREFIX}cooldown:${key}`;
    const ttl = await client.ttl(cooldownKey);
    if (ttl > 0) return ttl;

    const hourlyKey = `${REDIS_PREFIX}hourly:${key}`;
    const countRaw = await client.get(hourlyKey);
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
    if (count >= MAX_SENDS_PER_HOUR) {
      const hourlyTtl = await client.ttl(hourlyKey);
      return hourlyTtl > 0 ? hourlyTtl : HOURLY_WINDOW_SECONDS;
    }

    return 0;
  } catch {
    return null;
  }
}

async function recordRedisSend(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    const cooldownKey = `${REDIS_PREFIX}cooldown:${key}`;
    const hourlyKey = `${REDIS_PREFIX}hourly:${key}`;
    await client.set(cooldownKey, '1', 'EX', COOLDOWN_SECONDS);
    const count = await client.incr(hourlyKey);
    if (count === 1) {
      await client.expire(hourlyKey, HOURLY_WINDOW_SECONDS);
    }
  } catch {
    // Graceful degradation — in-memory path still applies on next check if needed
  }
}

/** Seconds until another send-code is allowed for this phone (0 = allowed now). */
export async function getSendCodeRetryAfterSeconds(phoneNumber: string): Promise<number> {
  const key = phoneKey(phoneNumber);
  const now = Date.now();

  const redisWait = await redisRetryAfter(key, now);
  if (redisWait !== null) {
    if (redisWait > 0) return redisWait;
    return memoryRetryAfter(key, now);
  }

  return memoryRetryAfter(key, now);
}

/** Record a successful send-code for rate-limit accounting. */
export async function recordSendCodeSent(phoneNumber: string): Promise<void> {
  const key = phoneKey(phoneNumber);
  const now = Date.now();
  recordMemorySend(key, now);
  await recordRedisSend(key);
}

export const sendCodeRateLimitConfig = {
  cooldownSeconds: COOLDOWN_SECONDS,
  maxSendsPerHour: MAX_SENDS_PER_HOUR
};
