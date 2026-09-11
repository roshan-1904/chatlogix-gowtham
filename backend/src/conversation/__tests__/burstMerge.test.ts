import { describe, it, expect, vi, beforeEach } from 'vitest';

const getRedisClientMock = vi.fn();
vi.mock('../../utils/redis.js', () => ({
  getRedisClient: () => getRedisClientMock()
}));

import { mergeSameBatch, mergeDebounced, stashForBurstMerge, drainBurstStash } from '../burstMerge.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('mergeSameBatch', () => {
  it('§26 test 12: concatenates same-batch records for the same vendor+customerPhone in chronological order', () => {
    const merged = mergeSameBatch([
      { vendorId: 'v1', customerPhone: '+91111', content: '2 brownies', timestamp: '2026-09-01T06:00:01.000Z' },
      { vendorId: 'v1', customerPhone: '+91111', content: 'hi', timestamp: '2026-09-01T06:00:00.000Z' }
    ]);

    expect(merged.get('v1:+91111')).toBe('hi\n2 brownies');
  });

  it('keeps different conversations (vendorId+customerPhone) in separate groups', () => {
    const merged = mergeSameBatch([
      { vendorId: 'v1', customerPhone: '+91111', content: 'a', timestamp: '2026-09-01T06:00:00.000Z' },
      { vendorId: 'v1', customerPhone: '+92222', content: 'b', timestamp: '2026-09-01T06:00:00.000Z' }
    ]);

    expect(merged.size).toBe(2);
    expect(merged.get('v1:+91111')).toBe('a');
    expect(merged.get('v1:+92222')).toBe('b');
  });

  it('returns a single-item group unchanged for a batch with no burst', () => {
    const merged = mergeSameBatch([{ vendorId: 'v1', customerPhone: '+91111', content: 'hi', timestamp: '2026-09-01T06:00:00.000Z' }]);
    expect(merged.get('v1:+91111')).toBe('hi');
  });
});

describe('stashForBurstMerge + drainBurstStash', () => {
  it('mergeDebounced returns the content unchanged when nothing is pending (rule 3: never waits)', async () => {
    const lrange = vi.fn().mockResolvedValue([]);
    getRedisClientMock.mockReturnValue({ lrange, del: vi.fn() });

    const result = await mergeDebounced('conv-1', 'hi');

    expect(result).toBe('hi');
  });

  it('mergeDebounced merges drained sibling content when present', async () => {
    const lrange = vi.fn().mockResolvedValue([
      JSON.stringify({ whatsappMessageId: 'wamid.2', content: '2 brownies' })
    ]);
    const del = vi.fn().mockResolvedValue(1);
    getRedisClientMock.mockReturnValue({ lrange, del });

    const result = await mergeDebounced('conv-1', 'hi');

    expect(result).toBe('hi\n2 brownies');
    expect(del).toHaveBeenCalledWith('burst:conv-1');
  });

  it('stashForBurstMerge RPUSHes JSON with a lock-aligned TTL', async () => {
    const rpush = vi.fn().mockResolvedValue(1);
    const pexpire = vi.fn().mockResolvedValue(1);
    getRedisClientMock.mockReturnValue({ rpush, pexpire });

    const ok = await stashForBurstMerge('conv-1', 'wamid.1', '2 brownies');

    expect(ok).toBe(true);
    expect(rpush).toHaveBeenCalledWith(
      'burst:conv-1',
      JSON.stringify({ whatsappMessageId: 'wamid.1', content: '2 brownies' })
    );
    expect(pexpire).toHaveBeenCalledWith('burst:conv-1', 300_000);
  });

  it('drainBurstStash parses and clears the list', async () => {
    const lrange = vi.fn().mockResolvedValue([
      JSON.stringify({ whatsappMessageId: 'wamid.1', content: 'a' }),
      JSON.stringify({ whatsappMessageId: 'wamid.2', content: 'b' })
    ]);
    const del = vi.fn().mockResolvedValue(1);
    getRedisClientMock.mockReturnValue({ lrange, del });

    const entries = await drainBurstStash('conv-1');

    expect(entries).toEqual([
      { whatsappMessageId: 'wamid.1', content: 'a' },
      { whatsappMessageId: 'wamid.2', content: 'b' }
    ]);
    expect(del).toHaveBeenCalledWith('burst:conv-1');
  });

  it('stashForBurstMerge returns false when Redis is unavailable', async () => {
    getRedisClientMock.mockReturnValue(null);

    await expect(stashForBurstMerge('conv-1', 'wamid.1', 'x')).resolves.toBe(false);
    await expect(mergeDebounced('conv-1', 'x')).resolves.toBe('x');
  });
});
