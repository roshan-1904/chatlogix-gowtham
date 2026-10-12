import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryRaw = vi.fn();
const executeRaw = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => queryRaw(strings, ...values),
    $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => executeRaw(strings, ...values)
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import {
  acquireLock,
  releaseLock,
  LockUnavailableError,
  LockContentionError,
  DEFAULT_LOCK_TTL_MS
} from '../lock.js';

const CONVERSATION_ID = 'conv-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('acquireLock', () => {
  it('throws LockUnavailableError (fails closed) when the database statement errors, never proceeds without a lock', async () => {
    queryRaw.mockRejectedValue(new Error('ECONNRESET'));

    await expect(acquireLock(CONVERSATION_ID)).rejects.toThrow(LockUnavailableError);
  });

  it('throws LockContentionError when a live lock row is already held', async () => {
    queryRaw.mockResolvedValue([]);

    await expect(acquireLock(CONVERSATION_ID)).rejects.toThrow(LockContentionError);
  });

  it('uses DEFAULT_LOCK_TTL_MS (300s) when ttlMs is omitted', async () => {
    queryRaw.mockImplementation(async (_strings: TemplateStringsArray, _conversationId: string, token: string) => [{ token }]);

    await acquireLock(CONVERSATION_ID);

    expect(DEFAULT_LOCK_TTL_MS).toBe(300_000);
    const expiresAt = queryRaw.mock.calls[0][3] as Date;
    const ttl = expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(299_000);
    expect(ttl).toBeLessThan(301_000);
  });

  it('returns a token when the insert wins', async () => {
    queryRaw.mockImplementation(async (_strings: TemplateStringsArray, _conversationId: string, token: string) => [{ token }]);

    const handle = await acquireLock(CONVERSATION_ID, 60_000);

    expect(handle.token).toEqual(expect.any(String));
    const sql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(sql).toContain('ON CONFLICT');
    expect(queryRaw.mock.calls[0][1]).toBe(CONVERSATION_ID);
    expect(queryRaw.mock.calls[0][2]).toBe(handle.token);
    const expiresAt = queryRaw.mock.calls[0][3] as Date;
    const ttl = expiresAt.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(59_000);
    expect(ttl).toBeLessThan(61_000);
  });

  it('two concurrent acquire attempts on the same conversation: only the first succeeds', async () => {
    let held: string | null = null;
    queryRaw.mockImplementation(async (_strings: TemplateStringsArray, _conversationId: string, token: string) => {
      if (held) return [];
      held = token;
      return [{ token }];
    });

    const first = await acquireLock(CONVERSATION_ID);
    expect(first.token).toBeDefined();
    await expect(acquireLock(CONVERSATION_ID)).rejects.toThrow(LockContentionError);
  });
});

describe('releaseLock', () => {
  it('deletes only the row whose token matches', async () => {
    executeRaw.mockResolvedValue(1);

    await releaseLock(CONVERSATION_ID, 'my-token');

    const sql = (executeRaw.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(sql).toContain('DELETE FROM "ConversationLock"');
    expect(sql).toContain('"token"');
    expect(executeRaw.mock.calls[0][1]).toBe(CONVERSATION_ID);
    expect(executeRaw.mock.calls[0][2]).toBe('my-token');
  });

  it('does not throw when the delete errors', async () => {
    executeRaw.mockRejectedValue(new Error('down'));
    await expect(releaseLock(CONVERSATION_ID, 'my-token')).resolves.toBeUndefined();
  });
});
