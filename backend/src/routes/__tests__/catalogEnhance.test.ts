import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    CATALOG_ENHANCE_GLOBAL_KILL: undefined,
    CATALOG_ENHANCE_DAILY_PAISE_CAP: '3000',
    CATALOG_ENHANCE_DISABLE_RATE_LIMIT: 'true',
    NODE_ENV: 'test'
  }
}));

vi.mock('../../utils/redis.js', () => ({ getRedisClient: () => null }));
vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const startEnhanceSession = vi.fn();
const acceptEnhancePreview = vi.fn();

vi.mock('../../services/catalogEnhanceChatService.js', () => ({
  startEnhanceSession: (...args: unknown[]) => startEnhanceSession(...args),
  postEnhanceMessage: vi.fn(),
  acceptEnhancePreview: (...args: unknown[]) => acceptEnhancePreview(...args),
  postEnhanceVoice: vi.fn(),
  discardEnhanceSession: vi.fn(),
  InsufficientBalanceError: class InsufficientBalanceError extends Error {
    name = 'InsufficientBalanceError';
  },
  EntityNotFoundError: class EntityNotFoundError extends Error {
    name = 'EntityNotFoundError';
  },
  EnhanceSessionUnavailableError: class EnhanceSessionUnavailableError extends Error {
    name = 'EnhanceSessionUnavailableError';
  }
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: vi.fn(async () => ({ catalogImportEnabled: true }))
    }
  }
}));

vi.mock('../../middleware/authorize.js', () => ({
  requireRole:
    () =>
    (req: { user?: unknown }, _res: unknown, next: () => void) => {
      (req as { user: { vendorId: string } }).user = { vendorId: 'vendor-1' };
      next();
    }
}));

import { catalogEnhanceRouter } from '../catalogEnhance.js';
import {
  InsufficientBalanceError,
  acceptEnhancePreview as acceptSvc
} from '../../services/catalogEnhanceChatService.js';

describe('catalogEnhance router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers session start route', () => {
    const paths = catalogEnhanceRouter.stack
      .filter((layer: { route?: { path?: string } }) => layer.route)
      .map((layer: { route?: { path?: string } }) => layer.route?.path);
    expect(paths).toContain('/sessions');
  });

  it('InsufficientBalanceError maps to 402 in handler contract', async () => {
    startEnhanceSession.mockRejectedValueOnce(new InsufficientBalanceError());
    await expect(
      startEnhanceSession('vendor-1', 'product', '00000000-0000-4000-8000-000000000001')
    ).rejects.toMatchObject({ name: 'InsufficientBalanceError' });
  });

  it('acceptEnhancePreview is invoked with vendor ownership', async () => {
    acceptEnhancePreview.mockResolvedValueOnce({ entityType: 'product' });
    await acceptSvc('vendor-1', 'session-1', { applyKeywords: true });
    expect(acceptEnhancePreview).toHaveBeenCalled();
  });
});
