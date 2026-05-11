import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../../utils/redis.js', () => ({ getRedisClient: () => null }));
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock('../../services/billingService.js', () => ({
  getTodaysCatalogImportPaiseSpent: vi.fn()
}));
vi.mock('../../config/env.js', () => ({
  env: { CATALOG_IMPORT_DAILY_PAISE_CAP: '5000', REDIS_URL: undefined }
}));

import { enforceDailyPaiseCap } from '../catalogImportRateLimit.js';
import * as billing from '../../services/billingService.js';

function makeReqRes(vendorId?: string) {
  const req = { user: vendorId ? { vendorId } : undefined } as unknown as Request;
  const headers = new Map<string, string>();
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn((k: string, v: string) => {
      headers.set(k, v);
      return res;
    })
  } as unknown as Response;
  return { req, res, headers };
}

describe('enforceDailyPaiseCap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 403 when vendor context is missing', async () => {
    const { req, res } = makeReqRes(undefined);
    const next = vi.fn() as NextFunction;
    await enforceDailyPaiseCap(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through when spend is under the cap', async () => {
    vi.mocked(billing.getTodaysCatalogImportPaiseSpent).mockResolvedValue(1234);
    const { req, res } = makeReqRes('v1');
    const next = vi.fn() as NextFunction;
    await enforceDailyPaiseCap(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 429 with Retry-After when spend hits the cap', async () => {
    vi.mocked(billing.getTodaysCatalogImportPaiseSpent).mockResolvedValue(5000);
    const { req, res, headers } = makeReqRes('v1');
    const next = vi.fn() as NextFunction;
    await enforceDailyPaiseCap(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
    expect(headers.get('Retry-After')).toBeDefined();
    const retry = Number(headers.get('Retry-After'));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it('fails open when the billing query throws', async () => {
    vi.mocked(billing.getTodaysCatalogImportPaiseSpent).mockRejectedValue(new Error('redis down'));
    const { req, res } = makeReqRes('v1');
    const next = vi.fn() as NextFunction;
    await enforceDailyPaiseCap(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
