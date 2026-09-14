import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request, Response, NextFunction } from 'express';
import { getRedisClient } from '../utils/redis.js';
import { env } from '../config/env.js';
import { getTodaysCatalogEnhancePaiseSpent } from '../services/billingService.js';
import { logger } from '../logger.js';

const disabled =
  env.CATALOG_ENHANCE_DISABLE_RATE_LIMIT === 'true' || env.NODE_ENV !== 'production';

const passthrough = Object.assign(
  (_req: Request, _res: Response, next: NextFunction) => next(),
  { resetKey: (_key: string) => {}, getKey: (_key: string) => undefined }
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
  const vendorId = (req as Request & { user?: { vendorId?: string } }).user?.vendorId;
  if (vendorId) return `vendor:${vendorId}`;
  return `ip:${ipKeyGenerator(req.ip ?? '')}`;
}

export const enhanceHourlyRateLimit: RateLimitRequestHandler = disabled
  ? passthrough
  : rateLimit({
      windowMs: 60 * 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      store: buildStore('rl:catalog-enhance:hour:'),
      keyGenerator: keyByVendor,
      handler: (_req, res) => {
        res.status(429).json({ error: 'RATE_LIMIT_EXCEEDED' });
      }
    });

export async function enforceEnhanceDailyPaiseCap(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (disabled) {
    next();
    return;
  }
  const vendorId = (req as Request & { user?: { vendorId?: string } }).user?.vendorId;
  if (!vendorId) {
    next();
    return;
  }
  const cap = Number.parseInt(env.CATALOG_ENHANCE_DAILY_PAISE_CAP, 10);
  if (!Number.isFinite(cap) || cap <= 0) {
    next();
    return;
  }
  try {
    const spent = await getTodaysCatalogEnhancePaiseSpent(vendorId);
    if (spent >= cap) {
      logger.warn({ vendorId, spent, cap }, 'catalog_enhance_daily_cap');
      res.status(429).json({ error: 'DAILY_SPEND_CAP' });
      return;
    }
  } catch (err) {
    logger.error({ err, vendorId }, 'catalog_enhance_daily_cap_check_failed');
  }
  next();
}
