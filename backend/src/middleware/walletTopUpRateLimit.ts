import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../utils/redis.js';

/** Limits Checkout order minting per vendor (payments go-live §4.7). */
export const walletTopUpIntentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  store: (() => {
    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        return new RedisStore({
          sendCommand: (command: string, ...args: (string | number)[]) => {
            return redisClient.call(command, ...args) as ReturnType<typeof redisClient.call>;
          },
          prefix: 'rate_limit:wallet_topup_intent:'
        });
      } catch (error) {
        console.warn('Failed to initialize RedisStore for wallet top-up, using in-memory store:', error);
        return undefined;
      }
    }
    return undefined;
  })(),
  keyGenerator: (req) => {
    const vendorId = (req as { user?: { vendorId?: string } }).user?.vendorId;
    return vendorId ? `vendor:${vendorId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
  handler: (req, res) => {
    const resetTime = (req as { rateLimit?: { resetTime?: number } }).rateLimit?.resetTime || Date.now() + 60_000;
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many top-up attempts. Please try again later.',
      retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
    });
  }
});
