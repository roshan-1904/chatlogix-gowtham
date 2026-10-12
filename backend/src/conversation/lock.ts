import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

/** Matches deployed `chatlogix-incoming-response-generator` Lambda timeout (300s). */
export const DEFAULT_LOCK_TTL_MS = 300_000;

function isContention(error: unknown): error is LockContentionError {
  return error instanceof LockContentionError;
}

/**
 * Lock store is down — distinct from LockContentionError so callers and
 * metrics can tell the two apart. No `cause` property: this project targets
 * ES2021 (Error.cause is ES2022), and the underlying error is already logged
 * at the throw site below.
 */
export class LockUnavailableError extends Error {
  constructor(conversationId: string) {
    super(`Lock unavailable: lock store unreachable (conversation ${conversationId})`);
    this.name = 'LockUnavailableError';
  }
}

/** Another invocation already holds the lock — a normal, expected retry case, not an infra failure. */
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
 * Fail-closed conversation lock. Two Lambdas must never mutate the same
 * pending order concurrently, so a database error here must not silently
 * proceed as if no lock were needed. The row lives in Postgres (not Redis)
 * so this still works with ElastiCache removed. An expired row can be taken
 * over; a live row is contention.
 */
export async function acquireLock(conversationId: string, ttlMs: number = DEFAULT_LOCK_TTL_MS): Promise<LockHandle> {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs);

  try {
    const rows = await prisma.$queryRaw<Array<{ token: string }>>`
      INSERT INTO "ConversationLock" ("conversationId", "token", "expiresAt")
      VALUES (${conversationId}, ${token}, ${expiresAt})
      ON CONFLICT ("conversationId") DO UPDATE
      SET "token" = EXCLUDED."token",
          "expiresAt" = EXCLUDED."expiresAt"
      WHERE "ConversationLock"."expiresAt" < NOW()
      RETURNING "token"
    `;

    const held = rows[0]?.token;
    if (held !== token) {
      throw new LockContentionError(conversationId);
    }

    return { token };
  } catch (error) {
    if (isContention(error)) throw error;
    logger.error({ err: error, conversationId }, 'Lock acquisition failed: database error');
    throw new LockUnavailableError(conversationId);
  }
}

/**
 * No-op on a token mismatch (this call no longer holds the current lock,
 * e.g. its TTL already lapsed and a different invocation acquired it) or if
 * the database is unreachable — a release failure must never mask the
 * caller's actual pipeline result. The row's expiresAt is the real safety
 * net either way.
 */
export async function releaseLock(conversationId: string, token: string): Promise<void> {
  try {
    await prisma.$executeRaw`
      DELETE FROM "ConversationLock"
      WHERE "conversationId" = ${conversationId}
        AND "token" = ${token}
    `;
  } catch (error) {
    logger.warn({ err: error, conversationId }, 'Lock release failed (will self-expire via expiresAt)');
  }
}
