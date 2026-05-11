import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// CATALOG_IMPORT_GLOBAL_KILL = 'true' must short-circuit every catalog-import
// route with a 404 before any vendor lookup or rate-limiter runs. We drive the
// assembled router stack with mock req/res and assert that *no* registered
// route handler is reached when the kill switch is on. Position-independent —
// a future maintainer adding `router.use(...)` above the kill switch would
// fail this test, instead of silently disabling the gate.

vi.mock('../../config/env.js', () => ({
  env: {
    CATALOG_IMPORT_GLOBAL_KILL: 'true',
    CATALOG_IMPORT_DAILY_PAISE_CAP: '5000',
    REDIS_URL: undefined,
    AUTH_JWT_SECRET: 'unused-in-test',
    AUTH_TOKEN_EXPIRES_IN: '1h'
  }
}));

vi.mock('../../utils/redis.js', () => ({ getRedisClient: () => null }));
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const reachedRoute = vi.fn();
vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: vi.fn(async () => {
        reachedRoute('vendor.findUnique');
        return { catalogImportEnabled: true };
      })
    },
    catalogImportJob: {
      findUnique: vi.fn(async () => {
        reachedRoute('job.findUnique');
        return null;
      }),
      findMany: vi.fn(async () => {
        reachedRoute('job.findMany');
        return [];
      })
    }
  }
}));
vi.mock('../../middleware/auth.js', () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireRole:
    () =>
    (_req: Request, _res: Response, next: NextFunction) =>
      next()
}));
vi.mock('../../services/billingService.js', () => ({
  getTodaysCatalogImportPaiseSpent: vi.fn().mockResolvedValue(0),
  recordCatalogImportSpend: vi.fn()
}));
vi.mock('../../services/tokenService.js', () => ({
  // Treat any token as valid in this test — we want to prove that even with a
  // valid identity, the kill switch still 404s before any handler runs.
  verifyAuthToken: () => ({
    userId: 'u_1',
    phoneNumber: '+1',
    roles: ['vendor'],
    vendorId: 'v_1'
  })
}));

import { catalogImportRouter } from '../catalogImport.js';

interface FakeRes {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (n: number) => FakeRes;
  json: (b: unknown) => FakeRes;
  setHeader: (k: string, v: string) => FakeRes;
  getHeader: (k: string) => string | undefined;
  end: () => FakeRes;
  write: () => boolean;
  flushHeaders: () => void;
  on: () => void;
}

function makeReq(method: string, url: string): Request {
  const headers: Record<string, string> = { authorization: 'Bearer fake-token' };
  return {
    method,
    url,
    originalUrl: `/api/catalog-import${url}`,
    baseUrl: '',
    path: url,
    headers,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    query: {},
    params: {},
    body: {},
    user: { id: 'u_1', vendorId: 'v_1', roles: ['vendor'] }
  } as unknown as Request;
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 0,
    body: undefined,
    headers: {},
    status(n) {
      this.statusCode = n;
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    getHeader(k) {
      return this.headers[k];
    },
    end() {
      return this;
    },
    write() {
      return true;
    },
    flushHeaders() {},
    on() {}
  };
  return res;
}

function runThrough(method: string, url: string): Promise<FakeRes> {
  return new Promise((resolve, reject) => {
    const req = makeReq(method, url);
    const res = makeRes();
    // Express router handle is callable as (req, res, done).
    (catalogImportRouter as unknown as {
      handle: (
        req: Request,
        res: FakeRes,
        done: (err?: unknown) => void
      ) => void;
    }).handle(req, res as unknown as Response & FakeRes, (err?: unknown) => {
      if (err) reject(err);
      else resolve(res);
    });
    // Some 404 paths terminate inside res.json without invoking done; resolve
    // on next tick once status is set.
    setImmediate(() => {
      if (res.statusCode > 0) resolve(res);
    });
  });
}

describe('catalog-import — global kill switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reachedRoute.mockClear();
  });

  it('404s GET /jobs without ever calling findMany', async () => {
    const res = await runThrough('GET', '/jobs');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect(reachedRoute).not.toHaveBeenCalled();
  });

  it('404s POST /commit without ever calling findUnique', async () => {
    const res = await runThrough('POST', '/commit');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect(reachedRoute).not.toHaveBeenCalled();
  });

  it('404s GET /:jobId/stream without invoking the SSE handler', async () => {
    const res = await runThrough('GET', '/abc-123/stream');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
    expect(reachedRoute).not.toHaveBeenCalled();
  });
});
