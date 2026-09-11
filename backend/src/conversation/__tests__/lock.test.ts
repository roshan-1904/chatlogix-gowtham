import { describe, it, expect, vi, beforeEach } from 'vitest';

const getRedisClientMock = vi.fn();
vi.mock('../../utils/redis.js', () => ({
  getRedisClient: () => getRedisClientMock()
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
  it('§26 test 14: throws LockUnavailableError (fails closed) when Redis is unreachable, never proceeds without a lock', async () => {
    getRedisClientMock.mockReturnValue(null);

    await expect(acquireLock(CONVERSATION_ID)).rejects.toThrow(LockUnavailableError);
  });

  it('throws LockUnavailableError when the SET command itself errors, not just when the client is missing', async () => {
    getRedisClientMock.mockReturnValue({ set: vi.fn().mockRejectedValue(new Error('ECONNRESET')) });

    await expect(acquireLock(CONVERSATION_ID)).rejects.toThrow(LockUnavailableError);
  });

  it('§26 test 15: throws LockContentionError (not LockUnavailableError) when Redis is reachable but the key is already held', async () => {
    getRedisClientMock.mockReturnValue({ set: vi.fn().mockResolvedValue(null) }); // SET NX returns null when the key exists

    await expect(acquireLock(CONVERSATION_ID)).rejects.toThrow(LockContentionError);
  });

  it('uses DEFAULT_LOCK_TTL_MS (300s) when ttlMs is omitted', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    getRedisClientMock.mockReturnValue({ set });

    await acquireLock(CONVERSATION_ID);

    expect(DEFAULT_LOCK_TTL_MS).toBe(300_000);
    expect(set).toHaveBeenCalledWith('lock:conv:conv-1', expect.any(String), 'PX', 300_000, 'NX');
  });

  it('returns a token and calls SET with NX+PX when the lock is free', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    getRedisClientMock.mockReturnValue({ set });

    const handle = await acquireLock(CONVERSATION_ID, 60_000);

    expect(handle.token).toEqual(expect.any(String));
    expect(set).toHaveBeenCalledWith('lock:conv:conv-1', handle.token, 'PX', 60_000, 'NX');
  });

  it('two concurrent acquire attempts on the same conversation: only the first succeeds (§26 test 15)', async () => {
    // Simulate a real Redis NX: the first SET wins, the second sees the key already set.
    let held: string | null = null;
    const set = vi.fn(async (_key: string, value: string) => {
      if (held) return null;
      held = value;
      return 'OK';
    });
    getRedisClientMock.mockReturnValue({ set });

    const first = await acquireLock(CONVERSATION_ID);
    expect(first.token).toBeDefined();
    await expect(acquireLock(CONVERSATION_ID)).rejects.toThrow(LockContentionError);
  });
});

describe('releaseLock', () => {
  it('releases via the token-checked script (does not blindly DEL)', async () => {
    const evalMock = vi.fn().mockResolvedValue(1);
    getRedisClientMock.mockReturnValue({ eval: evalMock });

    await releaseLock(CONVERSATION_ID, 'my-token');

    expect(evalMock).toHaveBeenCalledWith(expect.stringContaining('redis.call("GET"'), 1, 'lock:conv:conv-1', 'my-token');
  });

  it('does not throw when Redis is unavailable', async () => {
    getRedisClientMock.mockReturnValue(null);
    await expect(releaseLock(CONVERSATION_ID, 'my-token')).resolves.toBeUndefined();
  });

  it('does not throw when the eval call itself errors', async () => {
    getRedisClientMock.mockReturnValue({ eval: vi.fn().mockRejectedValue(new Error('down')) });
    await expect(releaseLock(CONVERSATION_ID, 'my-token')).resolves.toBeUndefined();
  });
});
