import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: { REDIS_URL: undefined }
}));

vi.mock('../redis.js', () => ({
  getRedisClient: vi.fn().mockReturnValue(null)
}));

const {
  getSendCodeRetryAfterSeconds,
  recordSendCodeSent,
  sendCodeRateLimitConfig
} = await import('../sendCodeRateLimit.js');

describe('sendCodeRateLimit', () => {
  it('allows the first send immediately', async () => {
    expect(await getSendCodeRetryAfterSeconds('+919876543210')).toBe(0);
  });

  it('blocks a second send within the cooldown window', async () => {
    await recordSendCodeSent('+919876543210');
    const retryAfter = await getSendCodeRetryAfterSeconds('+919876543210');
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(sendCodeRateLimitConfig.cooldownSeconds);
  });
});
