import { describe, it, expect, vi, beforeEach } from 'vitest';

const getRedisClientMock = vi.fn();
vi.mock('../../utils/redis.js', () => ({
  getRedisClient: () => getRedisClientMock()
}));

import { mergeSameBatch, mergeDebounced, stashForBurstMerge } from '../burstMerge.js';

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

describe('stashForBurstMerge + mergeDebounced', () => {
  it('mergeDebounced returns the content unchanged when nothing is pending (rule 3: never waits)', async () => {
    const get = vi.fn().mockResolvedValue(null);
    getRedisClientMock.mockReturnValue({ get, set: vi.fn(), del: vi.fn() });

    const result = await mergeDebounced('conv-1', 'hi');

    expect(result).toBe('hi');
  });

  it('mergeDebounced merges and clears a sibling invocation\'s stashed content when present', async () => {
    const get = vi.fn().mockResolvedValue('2 brownies');
    const del = vi.fn().mockResolvedValue(1);
    getRedisClientMock.mockReturnValue({ get, del, set: vi.fn() });

    const result = await mergeDebounced('conv-1', 'hi');

    expect(result).toBe('hi\n2 brownies');
    expect(del).toHaveBeenCalledWith('burst:conv-1');
  });

  it('stashForBurstMerge writes with a short TTL (the 400ms debounce cap)', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    getRedisClientMock.mockReturnValue({ set });

    await stashForBurstMerge('conv-1', '2 brownies');

    expect(set).toHaveBeenCalledWith('burst:conv-1', '2 brownies', 'PX', 400);
  });

  it('both are best-effort no-ops when Redis is unavailable (do not throw, do not block a normal SQS retry)', async () => {
    getRedisClientMock.mockReturnValue(null);

    await expect(stashForBurstMerge('conv-1', 'x')).resolves.toBeUndefined();
    await expect(mergeDebounced('conv-1', 'x')).resolves.toBe('x');
  });
});
