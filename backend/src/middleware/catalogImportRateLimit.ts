import rateLimit, {
  ipKeyGenerator,
  type RateLimitRequestHandler
} from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../utils/redis.js';
import { env } from '../config/env.js';
import { getTodaysCatalogImportPaiseSpent } from '../services/billingService.js';
import { logger } from '../logger.js';

const isCatalogImportRateLimitDisabled = env.CATALOG_IMPORT_DISABLE_RATE_LIMIT === 'true';
const passthroughRateLimit = Object.assign(
  (_req: Request, _res: Response, next: NextFunction) => next(),
  {
    resetKey: (_key: string) => {},
    getKey: (_key: string) => undefined
  }
) as RateLimitRequestHandler;

function buildStore(prefix: string) {
  const redisClient = getRedisClient();
  if (!redisClient) return undefined;
  try {
    return new RedisStore({
      sendCommand: (command: string, ...args: (string | number)[]): Promise<any> =>
        redisClient.call(command, ...args),
      prefix
    });
  } catch (err) {
    console.warn(`Failed to init RedisStore (${prefix}), using in-memory`, err);
    return undefined;
  }
}

function keyByVendor(req: Request): string {
  const vendorId = (req as any).user?.vendorId;
  if (vendorId) return `vendor:${vendorId}`;
  // ipKeyGenerator handles IPv6 normalization correctly so a single user can't
  // bypass limits by rotating through their /64.
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

function rateLimitHandler(req: Request, res: Response) {
  const resetTime = (req as any).rateLimit?.resetTime || Date.now() + 60_000;
  res.status(429).json({
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
    retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
  });
}

// /analyze: 1 per hour per vendor. Paired with the daily limiter below.
export const analyzeHourlyRateLimit: RateLimitRequestHandler = isCatalogImportRateLimitDisabled
  ? passthroughRateLimit
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 1,
      standardHeaders: true,
      legacyHeaders: false,
      store: buildStore('rl:catalog:analyze:hr:'),
      keyGenerator: keyByVendor,
      handler: rateLimitHandler
    });

export const analyzeDailyRateLimit: RateLimitRequestHandler = isCatalogImportRateLimitDisabled
  ? passthroughRateLimit
  : rateLimit({
      windowMs: 24 * 60 * 60 * 1000,
      max: 5,
      standardHeaders: true,
      legacyHeaders: false,
      store: buildStore('rl:catalog:analyze:day:'),
      keyGenerator: keyByVendor,
      handler: rateLimitHandler
    });

// Fast paths (photo / template / test-message): 20/hour per vendor.
export const fastPathRateLimit: RateLimitRequestHandler = isCatalogImportRateLimitDisabled
  ? passthroughRateLimit
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      store: buildStore('rl:catalog:fast:hr:'),
      keyGenerator: keyByVendor,
      handler: rateLimitHandler
    });

/**
 * Daily paise cap — independent of request counts. Sums actual OpenAI spend
 * today for this vendor and blocks when >= CATALOG_IMPORT_DAILY_PAISE_CAP.
 * Returns Retry-After = seconds until IST midnight.
 */
export async function enforceDailyPaiseCap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const vendorId = (req as any).user?.vendorId as string | undefined;
  if (!vendorId) {
    res.status(403).json({ error: 'vendor_context_missing' });
    return;
  }
  try {
    const spent = await getTodaysCatalogImportPaiseSpent(vendorId);
    const cap = Number(env.CATALOG_IMPORT_DAILY_PAISE_CAP);
    if (Number.isFinite(cap) && spent >= cap) {
      const msUntilMidnightIST = msToNextISTMidnight();
      res
        .status(429)
        .setHeader('Retry-After', Math.ceil(msUntilMidnightIST / 1000).toString())
        .json({
          error: 'QUOTA_EXCEEDED',
          message: `Daily AI spend cap reached (${spent} of ${cap} paise).`,
          retryAfter: Math.ceil(msUntilMidnightIST / 1000)
        });
      return;
    }
    next();
  } catch (err) {
    logger.error({ err, vendorId }, 'catalog_import_quota_check_failed');
    // Fail-open on infra hiccup — better than locking vendors out mid-import.
    next();
  }
}

function msToNextISTMidnight(): number {
  const now = new Date();
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const nextMidnightIST = new Date(istNow);
  nextMidnightIST.setUTCHours(24, 0, 0, 0);
  return nextMidnightIST.getTime() - istNow.getTime();
}
