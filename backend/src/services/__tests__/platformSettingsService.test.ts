import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const findUnique = vi.fn();
const upsert = vi.fn();
const historyCreate = vi.fn();
const transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
  fn({
    platformSettings: { upsert: (...args: unknown[]) => upsert(...args) },
    fxRateHistory: { create: (...args: unknown[]) => historyCreate(...args) }
  })
);

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    platformSettings: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args)
    },
    $transaction: (...args: [(tx: unknown) => Promise<unknown>]) => transaction(...args)
  }
}));

const getCached = vi.fn();
const setCached = vi.fn();

vi.mock('../../utils/redis.js', () => ({
  getCached: (...args: unknown[]) => getCached(...args),
  setCached: (...args: unknown[]) => setCached(...args),
  deleteCached: vi.fn(),
  getRedisClient: () => null
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../../config/env.js', () => ({
  env: {
    USD_TO_INR_RATE: '83',
    CATALOG_IMPORT_DAILY_MILLI_CAP: '50000',
    CATALOG_ENHANCE_DAILY_MILLI_CAP: '30000'
  },
  numericEnv: {
    trialGrantMilli: 50000,
    trialExpiryDays: 30,
    platformFeePerTurnMilli: 0,
    platformFeeOutboundMediaMilli: 0
  },
  walletEnv: {
    paymentProvider: 'mock',
    minTopUpMilli: 100000,
    maxTopUpMilli: 50000000,
    presetsMilli: [500000, 1000000, 2000000, 5000000],
    mockTopUpEnabled: true
  }
}));

import {
  clearPlatformSettingsCache,
  computeEffectiveUsdToInrRate,
  DEFAULT_GST_TCS_BPS,
  DEFAULT_TDS_194O_BPS,
  DEFAULT_TDS_194O_NO_PAN_BPS,
  ensurePlatformSettings,
  envFallbackSettings,
  getMemoryCacheAgeMs,
  getPlatformSettings,
  isSaneUsdInrRate,
  milliEnvToPaise,
  parseFrankfurterUsdInr,
  refreshUsdInrRate,
  seedPlatformSettingsMemory,
  updatePlatformSettings
} from '../platformSettingsService.js';
import { usdToMilliFloat } from '../../utils/money.js';

function dbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'default',
    usdToInrRate: 83,
    usdToInrSource: 'fallback',
    usdToInrFetchedAt: null,
    usdToInrOverride: null,
    platformFeePerTurnPaise: 0,
    platformFeeOutboundMediaPaise: 0,
    trialGrantPaise: 5000,
    trialExpiryDays: 30,
    catalogImportDailyPaiseCap: 5000,
    catalogEnhanceDailyPaiseCap: 3000,
    minWalletTopUpPaise: 10000,
    maxWalletTopUpPaise: 5_000_000,
    walletTopUpPresetsPaise: [50000, 100000, 200000, 500000],
    mockWalletTopUpEnabled: true,
    gstTcsBps: DEFAULT_GST_TCS_BPS,
    tds194oBps: DEFAULT_TDS_194O_BPS,
    tds194oNoPanBps: DEFAULT_TDS_194O_NO_PAN_BPS,
    updatedAt: new Date('2026-09-16T00:00:00.000Z'),
    updatedBy: null,
    ...overrides
  };
}

describe('order settlement tax defaults (05 D2)', () => {
  it('env fallback matches documented bps defaults', () => {
    const settings = envFallbackSettings();
    expect(settings.gstTcsBps).toBe(DEFAULT_GST_TCS_BPS);
    expect(settings.tds194oBps).toBe(DEFAULT_TDS_194O_BPS);
    expect(settings.tds194oNoPanBps).toBe(DEFAULT_TDS_194O_NO_PAN_BPS);
    expect(DEFAULT_GST_TCS_BPS).toBe(50);
    expect(DEFAULT_TDS_194O_BPS).toBe(10);
    expect(DEFAULT_TDS_194O_NO_PAN_BPS).toBe(500);
  });
});

describe('Frankfurter parse + sanity', () => {
  it('accepts a finite in-range INR rate', () => {
    expect(parseFrankfurterUsdInr({ rates: { INR: 83.4521 } })).toEqual({
      ok: true,
      rate: 83.4521
    });
  });

  it('rejects a missing rate', () => {
    expect(parseFrankfurterUsdInr({ rates: {} })).toEqual({
      ok: false,
      reason: 'invalid_payload'
    });
    expect(parseFrankfurterUsdInr(null)).toEqual({ ok: false, reason: 'invalid_payload' });
  });

  it('rejects out-of-range rates', () => {
    expect(parseFrankfurterUsdInr({ rates: { INR: 49.99 } })).toEqual({
      ok: false,
      reason: 'out_of_range'
    });
    expect(parseFrankfurterUsdInr({ rates: { INR: 150.01 } })).toEqual({
      ok: false,
      reason: 'out_of_range'
    });
  });

  it('clamps sanity to 50..150 inclusive', () => {
    expect(isSaneUsdInrRate(50)).toBe(true);
    expect(isSaneUsdInrRate(150)).toBe(true);
    expect(isSaneUsdInrRate(49.999)).toBe(false);
    expect(isSaneUsdInrRate(Number.NaN)).toBe(false);
  });
});

describe('effective FX', () => {
  it('lets override win over the live rate', () => {
    expect(computeEffectiveUsdToInrRate(83, 91.5)).toBe(91.5);
    expect(computeEffectiveUsdToInrRate(83, null)).toBe(83);
  });

  it('usdToMilliFloat uses memory effective rate, then env', () => {
    seedPlatformSettingsMemory({ usdToInrRate: 83, usdToInrOverride: 100 });
    expect(usdToMilliFloat(1)).toBe(100_000);
    expect(usdToMilliFloat(1, 90)).toBe(90_000);
    clearPlatformSettingsCache();
    expect(usdToMilliFloat(1)).toBe(83_000);
  });
});

describe('ensurePlatformSettings cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPlatformSettingsCache();
    getCached.mockResolvedValue(null);
    setCached.mockResolvedValue(undefined);
    findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    clearPlatformSettingsCache();
  });

  it('serves memory when younger than 60s and skips Redis/DB', async () => {
    seedPlatformSettingsMemory({ usdToInrRate: 90, usdToInrOverride: null });
    const result = await ensurePlatformSettings();
    expect(result.effectiveUsdToInrRate).toBe(90);
    expect(getCached).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('falls through a Redis miss to DB', async () => {
    getCached.mockResolvedValue(null);
    findUnique.mockResolvedValue(dbRow({ usdToInrRate: 84.2, usdToInrSource: 'frankfurter' }));
    const result = await ensurePlatformSettings();
    expect(result.usdToInrRate).toBe(84.2);
    expect(result.usdToInrSource).toBe('frankfurter');
    expect(setCached).toHaveBeenCalledWith(
      'platform:settings',
      expect.objectContaining({ usdToInrRate: 84.2 }),
      86_400
    );
  });

  it('falls through Redis and DB miss to env defaults (milli ÷ 10)', async () => {
    const result = await ensurePlatformSettings();
    expect(result.usdToInrRate).toBe(83);
    expect(result.usdToInrSource).toBe('fallback');
    expect(result.trialGrantPaise).toBe(5000);
    expect(result.catalogImportDailyPaiseCap).toBe(5000);
    expect(result.catalogEnhanceDailyPaiseCap).toBe(3000);
    expect(result.minWalletTopUpPaise).toBe(10000);
    expect(milliEnvToPaise(50_000)).toBe(5000);
  });

  it('hydrates a Redis hit and skips DB', async () => {
    getCached.mockResolvedValue({
      ...envFallbackSettings(),
      usdToInrRate: 88,
      usdToInrOverride: 92,
      effectiveUsdToInrRate: 88
    });
    const result = await ensurePlatformSettings();
    expect(result.effectiveUsdToInrRate).toBe(92);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('updatePlatformSettings cache invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPlatformSettingsCache();
    setCached.mockResolvedValue(undefined);
  });

  it('writes Redis and drops the in-memory copy', async () => {
    seedPlatformSettingsMemory({ trialGrantPaise: 5000 });
    expect(getMemoryCacheAgeMs()).not.toBeNull();
    upsert.mockResolvedValue(dbRow({ trialGrantPaise: 8000, updatedBy: 'admin-1' }));

    const result = await updatePlatformSettings({ trialGrantPaise: 8000 }, 'admin-1');

    expect(result.trialGrantPaise).toBe(8000);
    expect(setCached).toHaveBeenCalledWith(
      'platform:settings',
      expect.objectContaining({ trialGrantPaise: 8000 }),
      86_400
    );
    expect(getMemoryCacheAgeMs()).toBeNull();
    expect(getPlatformSettings().trialGrantPaise).toBe(5000);
  });
});

describe('refreshUsdInrRate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPlatformSettingsCache();
    getCached.mockResolvedValue(null);
    setCached.mockResolvedValue(undefined);
    findUnique.mockResolvedValue(dbRow());
    upsert.mockResolvedValue(dbRow({ usdToInrRate: 84.1, usdToInrSource: 'frankfurter' }));
    historyCreate.mockResolvedValue({ id: 'hist-1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearPlatformSettingsCache();
  });

  it('upserts settings and writes history on a sane fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ rates: { INR: 84.1 } })
      })
    );

    const result = await refreshUsdInrRate();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rate).toBe(84.1);
    expect(historyCreate).toHaveBeenCalled();
    expect(setCached).toHaveBeenCalled();
    expect(getMemoryCacheAgeMs()).toBeNull();
  });

  it('leaves yesterday\'s DB value when the rate is insane', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ rates: { INR: 12 } })
      })
    );
    findUnique.mockResolvedValue(dbRow({ usdToInrRate: 83.2 }));

    const result = await refreshUsdInrRate();
    expect(result).toMatchObject({ ok: false, reason: 'out_of_range' });
    expect(result.settings.usdToInrRate).toBe(83.2);
    expect(upsert).not.toHaveBeenCalled();
    expect(historyCreate).not.toHaveBeenCalled();
  });
});
