import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../utils/redis.js';

/**
 * Rate limiting middleware for settings endpoints
 * Limits to 10 requests per minute per vendor
 * Uses Redis store if available, falls back to in-memory store
 */
export const settingsRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  store: (() => {
    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        return new RedisStore({
          sendCommand: (command: string, ...args: (string | number)[]): Promise<any> => {
            return redisClient.call(command, ...args);
          },
          prefix: 'rate_limit:settings:',
        });
      } catch (error) {
        console.warn('Failed to initialize RedisStore for settings rate limit, falling back to in-memory store:', error);
        return undefined;
      }
    }
    return undefined; // Use default in-memory store
  })(),
  keyGenerator: (req) => {
    // Use vendorId if available, otherwise use IP address
    const vendorId = (req as any).user?.vendorId;
    return vendorId ? `vendor:${vendorId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
  },
  handler: (req, res) => {
    const resetTime = (req as any).rateLimit?.resetTime || Date.now() + 60000;
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((resetTime - Date.now()) / 1000),
    });
  },
  skip: (req) => {
    // Skip rate limiting for admin users (optional - adjust based on requirements)
    const isAdmin = (req as any).user?.roles?.includes('admin');
    return isAdmin === true;
  },
});

