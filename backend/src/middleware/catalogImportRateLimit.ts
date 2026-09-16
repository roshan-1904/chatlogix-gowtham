import rateLimit, {
  ipKeyGenerator,
  type RateLimitRequestHandler
} from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../utils/redis.js';
import { env } from '../config/env.js';
import {
  assertVendorWalletForAi,
  getTodaysCatalogImportMilliSpent
} from '../services/billingService.js';
import { logger } from '../logger.js';
import { ensurePlatformSettings, getPlatformSettings } from '../services/platformSettingsService.js';
import { paiseToMilli } from '../utils/money.js';

const isCatalogImportRateLimitDisabled =
  env.CATALOG_IMPORT_DISABLE_RATE_LIMIT === 'true' || env.NODE_ENV !== 'production';
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

// /analyze: 1 per hour per vendor in production. Skipped in local/dev so
// onboarding retries are not blocked. Daily millirupee cap still applies.
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
 * Two independent spend guards on the same middleware, because both `/analyze`
 * and `/fast-photo` need both:
 *
 * 1. Wallet balance — catalog import had no pre-flight gate at all, so an
 *    empty wallet still bought a full vision pass. Fails closed (402).
 * 2. Daily millirupee cap — sums actual OpenAI spend today for this vendor and
 *    blocks at PlatformSettings.catalogImportDailyPaiseCap (as milli), with Retry-After = seconds
 *    until IST midnight. Fails open on infra hiccup.
 */
export async function enforceDailyMilliCap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const vendorId = (req as any).user?.vendorId as string | undefined;
  if (!vendorId) {
    res.status(403).json({ error: 'vendor_context_missing' });
    return;
  }

  const wallet = await assertVendorWalletForAi(vendorId);
  if (!wallet.allowed) {
    res.status(402).json({
      error: wallet.reason === 'trial_expired' ? 'TRIAL_EXPIRED' : 'INSUFFICIENT_BALANCE',
      message: 'Not enough wallet balance to run a catalog import. Please top up and try again.'
    });
    return;
  }

  try {
    await ensurePlatformSettings();
    const spent = await getTodaysCatalogImportMilliSpent(vendorId);
    const cap = paiseToMilli(getPlatformSettings().catalogImportDailyPaiseCap);
    if (Number.isFinite(cap) && spent >= cap) {
      const msUntilMidnightIST = msToNextISTMidnight();
      res
        .status(429)
        .setHeader('Retry-After', Math.ceil(msUntilMidnightIST / 1000).toString())
        .json({
          error: 'QUOTA_EXCEEDED',
          message: `Daily AI spend cap reached (${spent} of ${cap} millirupees).`,
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
