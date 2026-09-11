import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../utils/redis.js';
import { logger } from '../logger.js';

/** Matches deployed `chatlogix-incoming-response-generator` Lambda timeout (300s). */
export const DEFAULT_LOCK_TTL_MS = 300_000;

// Only delete if the value still matches our token -- without this, a slow
// invocation could delete a *different* invocation's lock after its own TTL
// already lapsed and someone else acquired the key in the meantime.
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

function lockKey(conversationId: string): string {
  return `lock:conv:${conversationId}`;
}

/**
 * Redis is down/unreachable — distinct from LockContentionError so
 * callers/metrics (§23's `LockUnavailable`) can tell the two apart. No
 * `cause` property: this project targets ES2021 (Error.cause is ES2022),
 * and the underlying error is already logged at the throw site below.
 */
export class LockUnavailableError extends Error {
  constructor(conversationId: string) {
    super(`Lock unavailable: Redis unreachable (conversation ${conversationId})`);
    this.name = 'LockUnavailableError';
  }
}

/** Another invocation already holds the lock — a normal, expected retry case (§23's `LockContention`), not an infra failure. */
export class LockContentionError extends Error {
  constructor(conversationId: string) {
    super(`Lock contention: conversation ${conversationId} is already locked`);
    this.name = 'LockContentionError';
  }
}

export interface LockHandle {
  token: string;
}

/**
 * Fail-closed conversation lock (I3, I4). Every other Redis call site in
 * this codebase (getRedisClient/getCached/setCached) degrades gracefully to
 * null/no-op on failure -- this one deliberately inverts that convention.
 * Two Lambdas must never mutate the same pending order concurrently, so a
 * Redis outage here must not silently proceed as if no lock were needed:
 * both "no client available" and a SET command error/timeout are treated as
 * failure and thrown, so the caller's SQS message retries instead of
 * writing without a lock held.
 */
export async function acquireLock(conversationId: string, ttlMs: number = DEFAULT_LOCK_TTL_MS): Promise<LockHandle> {
  const client = getRedisClient();
  if (!client) {
    throw new LockUnavailableError(conversationId);
  }

  const token = randomUUID();
  let result: 'OK' | null;
  try {
    result = await client.set(lockKey(conversationId), token, 'PX', ttlMs, 'NX');
  } catch (error) {
    logger.error({ err: error, conversationId }, 'Lock acquisition failed: Redis command error');
    throw new LockUnavailableError(conversationId);
  }

  if (result !== 'OK') {
    throw new LockContentionError(conversationId);
  }

  return { token };
}

/**
 * No-op on a token mismatch (this call no longer holds the current lock,
 * e.g. its TTL already lapsed and a different invocation acquired it) or if
 * Redis is unreachable -- a release failure must never mask the caller's
 * actual pipeline result. The lock's TTL is the real safety net either way.
 */
export async function releaseLock(conversationId: string, token: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;

  try {
    await client.eval(RELEASE_SCRIPT, 1, lockKey(conversationId), token);
  } catch (error) {
    logger.warn({ err: error, conversationId }, 'Lock release failed (will self-expire via TTL)');
  }
}
