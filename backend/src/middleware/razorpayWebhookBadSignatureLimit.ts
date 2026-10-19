import type { Request, Response } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';

const WINDOW_MS = 60_000;
const MAX_BAD_SIGNATURES = 120;

const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? '127.0.0.1');
}

/**
 * Slows floods of invalid signatures on the Razorpay webhook path only.
 * Valid signatures never touch this counter.
 */
export function respondIfBadSignatureRateLimited(req: Request, res: Response): boolean {
  const key = clientKey(req);
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count > MAX_BAD_SIGNATURES) {
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many invalid webhook signatures.'
    });
    return true;
  }
  return false;
}

/** Test helper */
export function resetBadSignatureRateLimitForTests(): void {
  buckets.clear();
}
