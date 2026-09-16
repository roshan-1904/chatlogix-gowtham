/**
 * Cached read path for the PlatformSettings singleton.
 *
 * 1. Process memory if younger than 60s
 * 2. Redis `platform:settings` (TTL 24h)
 * 3. Postgres `PlatformSettings` id=default
 * 4. Env defaults (milli knobs ÷ 10 → paise)
 *
 * Effective FX = usdToInrOverride ?? usdToInrRate. Live Frankfurter fetches
 * are rejected outside 50..150 so yesterday's DB rate stays in place.
 */

import type { PlatformSettings as PlatformSettingsRow, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { getCached, setCached } from '../utils/redis.js';
import { setUsdToInrMemoryRate } from '../utils/money.js';

export const PLATFORM_SETTINGS_ID = 'default';
export const PLATFORM_SETTINGS_REDIS_KEY = 'platform:settings';
export const MEMORY_TTL_MS = 60_000;
export const REDIS_TTL_SECONDS = 86_400;
export const FX_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const FX_SANITY_MIN = 50;
export const FX_SANITY_MAX = 150;
export const FRANKFURTER_USD_INR_URL = 'https://api.frankfurter.app/latest?from=USD&to=INR';

export type UsdToInrSource = 'frankfurter' | 'fallback';

export interface PlatformSettingsSnapshot {
  usdToInrRate: number;
  usdToInrSource: string;
  usdToInrFetchedAt: string | null;
  usdToInrOverride: number | null;
  effectiveUsdToInrRate: number;
  platformFeePerTurnPaise: number;
  platformFeeOutboundMediaPaise: number;
  trialGrantPaise: number;
  trialExpiryDays: number;
  catalogImportDailyPaiseCap: number;
  catalogEnhanceDailyPaiseCap: number;
  minWalletTopUpPaise: number;
  maxWalletTopUpPaise: number;
  walletTopUpPresetsPaise: number[];
  mockWalletTopUpEnabled: boolean;
  updatedAt: string;
  updatedBy: string | null;
}

export type PlatformSettingsPatch = {
  usdToInrOverride?: number | null;
  platformFeePerTurnPaise?: number;
  platformFeeOutboundMediaPaise?: number;
  trialGrantPaise?: number;
  trialExpiryDays?: number;
  catalogImportDailyPaiseCap?: number;
  catalogEnhanceDailyPaiseCap?: number;
  minWalletTopUpPaise?: number;
  maxWalletTopUpPaise?: number;
  walletTopUpPresetsPaise?: number[];
  mockWalletTopUpEnabled?: boolean;
};

export type FxRefreshFailureReason = 'fetch_failed' | 'invalid_payload' | 'out_of_range';

export type FxRefreshResult =
  | { ok: true; rate: number; settings: PlatformSettingsSnapshot }
  | { ok: false; reason: FxRefreshFailureReason; settings: PlatformSettingsSnapshot };

type MemoryEntry = {
  value: PlatformSettingsSnapshot;
  loadedAt: number;
};

let memory: MemoryEntry | null = null;

function finiteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Milli env → paise (÷10). Local so this module does not import money.ts helpers. */
export function milliEnvToPaise(milli: number): number {
  if (!Number.isFinite(milli)) return 0;
  return Math.round(milli / 10);
}

export function isSaneUsdInrRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= FX_SANITY_MIN && rate <= FX_SANITY_MAX;
}

export function computeEffectiveUsdToInrRate(
  usdToInrRate: number,
  usdToInrOverride: number | null
): number {
  if (usdToInrOverride != null && Number.isFinite(usdToInrOverride)) {
    return usdToInrOverride;
  }
  return usdToInrRate;
}

export function parseFrankfurterUsdInr(
  payload: unknown
): { ok: true; rate: number } | { ok: false; reason: 'invalid_payload' | 'out_of_range' } {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'invalid_payload' };
  }
  const raw = (payload as { rates?: { INR?: unknown } }).rates?.INR;
  const rate = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(rate)) {
    return { ok: false, reason: 'invalid_payload' };
  }
  if (!isSaneUsdInrRate(rate)) {
    return { ok: false, reason: 'out_of_range' };
  }
  return { ok: true, rate };
}

function decimalToNumber(value: unknown, fallback = 0): number {
  if (value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function decimalToNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parsePresets(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'number' ? item : Number(item)))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .map((n) => Math.round(n));
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function envString(key: string, fallback: string): string {
  const raw = (env as Record<string, string | undefined> | undefined)?.[key];
  return raw == null || raw === '' ? fallback : raw;
}

function parsePresetsMilli(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function envFallbackSettings(): PlatformSettingsSnapshot {
  const usdToInrRate = finiteNumber(envString('USD_TO_INR_RATE', '83'), 83);
  const snapshot: PlatformSettingsSnapshot = {
    usdToInrRate,
    usdToInrSource: 'fallback',
    usdToInrFetchedAt: null,
    usdToInrOverride: null,
    effectiveUsdToInrRate: usdToInrRate,
    platformFeePerTurnPaise: milliEnvToPaise(Number(envString('PLATFORM_FEE_PER_TURN_MILLI', '0'))),
    platformFeeOutboundMediaPaise: milliEnvToPaise(
      Number(envString('PLATFORM_FEE_OUTBOUND_MEDIA_MILLI', '0'))
    ),
    trialGrantPaise: milliEnvToPaise(Number(envString('TRIAL_GRANT_MILLI', '50000'))),
    trialExpiryDays: finiteNumber(Number(envString('TRIAL_EXPIRY_DAYS', '30')), 30),
    catalogImportDailyPaiseCap: milliEnvToPaise(
      Number(envString('CATALOG_IMPORT_DAILY_MILLI_CAP', '50000'))
    ),
    catalogEnhanceDailyPaiseCap: milliEnvToPaise(
      Number(envString('CATALOG_ENHANCE_DAILY_MILLI_CAP', '30000'))
    ),
    minWalletTopUpPaise: milliEnvToPaise(Number(envString('MIN_WALLET_TOPUP_MILLI', '100000'))),
    maxWalletTopUpPaise: milliEnvToPaise(Number(envString('MAX_WALLET_TOPUP_MILLI', '50000000'))),
    walletTopUpPresetsPaise: parsePresetsMilli(
      envString('WALLET_TOPUP_PRESETS_MILLI', '500000,1000000,2000000,5000000')
    ).map(milliEnvToPaise),
    mockWalletTopUpEnabled: envString('MOCK_WALLET_TOPUP_ENABLED', 'true') !== 'false',
    updatedAt: new Date(0).toISOString(),
    updatedBy: null
  };
  snapshot.effectiveUsdToInrRate = computeEffectiveUsdToInrRate(
    snapshot.usdToInrRate,
    snapshot.usdToInrOverride
  );
  return snapshot;
}

export function rowToSnapshot(row: PlatformSettingsRow): PlatformSettingsSnapshot {
  const usdToInrRate = decimalToNumber(row.usdToInrRate, 83);
  const usdToInrOverride = decimalToNumberOrNull(row.usdToInrOverride);
  return {
    usdToInrRate,
    usdToInrSource: row.usdToInrSource,
    usdToInrFetchedAt: toIso(row.usdToInrFetchedAt),
    usdToInrOverride,
    effectiveUsdToInrRate: computeEffectiveUsdToInrRate(usdToInrRate, usdToInrOverride),
    platformFeePerTurnPaise: row.platformFeePerTurnPaise,
    platformFeeOutboundMediaPaise: row.platformFeeOutboundMediaPaise,
    trialGrantPaise: row.trialGrantPaise,
    trialExpiryDays: row.trialExpiryDays,
    catalogImportDailyPaiseCap: row.catalogImportDailyPaiseCap,
    catalogEnhanceDailyPaiseCap: row.catalogEnhanceDailyPaiseCap,
    minWalletTopUpPaise: row.minWalletTopUpPaise,
    maxWalletTopUpPaise: row.maxWalletTopUpPaise,
    walletTopUpPresetsPaise: parsePresets(row.walletTopUpPresetsPaise),
    mockWalletTopUpEnabled: row.mockWalletTopUpEnabled,
    updatedAt: toIso(row.updatedAt) ?? new Date().toISOString(),
    updatedBy: row.updatedBy
  };
}

function isSnapshot(value: unknown): value is PlatformSettingsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.usdToInrRate === 'number' && typeof v.trialGrantPaise === 'number';
}

function hydrateSnapshot(value: PlatformSettingsSnapshot): PlatformSettingsSnapshot {
  return {
    ...value,
    effectiveUsdToInrRate: computeEffectiveUsdToInrRate(value.usdToInrRate, value.usdToInrOverride)
  };
}

function remember(snapshot: PlatformSettingsSnapshot): PlatformSettingsSnapshot {
  const value = hydrateSnapshot(snapshot);
  memory = { value, loadedAt: Date.now() };
  setUsdToInrMemoryRate(value.effectiveUsdToInrRate);
  return value;
}

function dropMemory(): void {
  memory = null;
  setUsdToInrMemoryRate(undefined);
}

async function writeRedisAndDropMemory(snapshot: PlatformSettingsSnapshot): Promise<void> {
  const value = hydrateSnapshot(snapshot);
  await setCached(PLATFORM_SETTINGS_REDIS_KEY, value, REDIS_TTL_SECONDS);
  dropMemory();
}

function envCreateData(): Prisma.PlatformSettingsCreateInput {
  const fallback = envFallbackSettings();
  return {
    id: PLATFORM_SETTINGS_ID,
    usdToInrRate: fallback.usdToInrRate,
    usdToInrSource: fallback.usdToInrSource,
    usdToInrFetchedAt: null,
    usdToInrOverride: null,
    platformFeePerTurnPaise: fallback.platformFeePerTurnPaise,
    platformFeeOutboundMediaPaise: fallback.platformFeeOutboundMediaPaise,
    trialGrantPaise: fallback.trialGrantPaise,
    trialExpiryDays: fallback.trialExpiryDays,
    catalogImportDailyPaiseCap: fallback.catalogImportDailyPaiseCap,
    catalogEnhanceDailyPaiseCap: fallback.catalogEnhanceDailyPaiseCap,
    minWalletTopUpPaise: fallback.minWalletTopUpPaise,
    maxWalletTopUpPaise: fallback.maxWalletTopUpPaise,
    walletTopUpPresetsPaise: fallback.walletTopUpPresetsPaise,
    mockWalletTopUpEnabled: fallback.mockWalletTopUpEnabled
  };
}

function memoryIfFresh(): PlatformSettingsSnapshot | null {
  if (!memory) return null;
  if (Date.now() - memory.loadedAt >= MEMORY_TTL_MS) return null;
  return memory.value;
}

/**
 * Sync reader. Returns fresh memory, last known memory, or env fallback.
 * Call `ensurePlatformSettings()` on async billing entry points first.
 */
export function getPlatformSettings(): PlatformSettingsSnapshot {
  if (memory) return memory.value;
  return envFallbackSettings();
}

export function getMemoryCacheAgeMs(): number | null {
  if (!memory) return null;
  return Date.now() - memory.loadedAt;
}

export function seedPlatformSettingsMemory(
  overrides: Partial<PlatformSettingsSnapshot> = {}
): PlatformSettingsSnapshot {
  const base = envFallbackSettings();
  return remember({
    ...base,
    ...overrides,
    effectiveUsdToInrRate: computeEffectiveUsdToInrRate(
      overrides.usdToInrRate ?? base.usdToInrRate,
      overrides.usdToInrOverride !== undefined ? overrides.usdToInrOverride : base.usdToInrOverride
    )
  });
}

export function clearPlatformSettingsCache(): void {
  dropMemory();
}

export async function ensurePlatformSettings(): Promise<PlatformSettingsSnapshot> {
  const fresh = memoryIfFresh();
  if (fresh) return fresh;

  const cached = await getCached<PlatformSettingsSnapshot>(PLATFORM_SETTINGS_REDIS_KEY);
  if (isSnapshot(cached)) {
    return remember(hydrateSnapshot(cached));
  }

  try {
    const row = await prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID }
    });
    if (row) {
      const snapshot = rowToSnapshot(row);
      await setCached(PLATFORM_SETTINGS_REDIS_KEY, snapshot, REDIS_TTL_SECONDS);
      return remember(snapshot);
    }
  } catch (err) {
    logger.warn({ err }, 'platform_settings_db_unavailable');
  }

  const fallback = envFallbackSettings();
  return remember(fallback);
}

function scalarPatch(
  patch: PlatformSettingsPatch,
  updatedBy?: string
): Prisma.PlatformSettingsUpdateInput {
  return {
    ...(patch.usdToInrOverride !== undefined
      ? { usdToInrOverride: patch.usdToInrOverride }
      : {}),
    ...(patch.platformFeePerTurnPaise !== undefined
      ? { platformFeePerTurnPaise: patch.platformFeePerTurnPaise }
      : {}),
    ...(patch.platformFeeOutboundMediaPaise !== undefined
      ? { platformFeeOutboundMediaPaise: patch.platformFeeOutboundMediaPaise }
      : {}),
    ...(patch.trialGrantPaise !== undefined ? { trialGrantPaise: patch.trialGrantPaise } : {}),
    ...(patch.trialExpiryDays !== undefined ? { trialExpiryDays: patch.trialExpiryDays } : {}),
    ...(patch.catalogImportDailyPaiseCap !== undefined
      ? { catalogImportDailyPaiseCap: patch.catalogImportDailyPaiseCap }
      : {}),
    ...(patch.catalogEnhanceDailyPaiseCap !== undefined
      ? { catalogEnhanceDailyPaiseCap: patch.catalogEnhanceDailyPaiseCap }
      : {}),
    ...(patch.minWalletTopUpPaise !== undefined
      ? { minWalletTopUpPaise: patch.minWalletTopUpPaise }
      : {}),
    ...(patch.maxWalletTopUpPaise !== undefined
      ? { maxWalletTopUpPaise: patch.maxWalletTopUpPaise }
      : {}),
    ...(patch.walletTopUpPresetsPaise !== undefined
      ? { walletTopUpPresetsPaise: patch.walletTopUpPresetsPaise }
      : {}),
    ...(patch.mockWalletTopUpEnabled !== undefined
      ? { mockWalletTopUpEnabled: patch.mockWalletTopUpEnabled }
      : {}),
    ...(updatedBy !== undefined ? { updatedBy } : {})
  };
}

export async function updatePlatformSettings(
  patch: PlatformSettingsPatch,
  updatedBy?: string
): Promise<PlatformSettingsSnapshot> {
  const update = scalarPatch(patch, updatedBy);
  const create: Prisma.PlatformSettingsCreateInput = {
    ...envCreateData(),
    ...(patch.usdToInrOverride !== undefined ? { usdToInrOverride: patch.usdToInrOverride } : {}),
    ...(patch.platformFeePerTurnPaise !== undefined
      ? { platformFeePerTurnPaise: patch.platformFeePerTurnPaise }
      : {}),
    ...(patch.platformFeeOutboundMediaPaise !== undefined
      ? { platformFeeOutboundMediaPaise: patch.platformFeeOutboundMediaPaise }
      : {}),
    ...(patch.trialGrantPaise !== undefined ? { trialGrantPaise: patch.trialGrantPaise } : {}),
    ...(patch.trialExpiryDays !== undefined ? { trialExpiryDays: patch.trialExpiryDays } : {}),
    ...(patch.catalogImportDailyPaiseCap !== undefined
      ? { catalogImportDailyPaiseCap: patch.catalogImportDailyPaiseCap }
      : {}),
    ...(patch.catalogEnhanceDailyPaiseCap !== undefined
      ? { catalogEnhanceDailyPaiseCap: patch.catalogEnhanceDailyPaiseCap }
      : {}),
    ...(patch.minWalletTopUpPaise !== undefined
      ? { minWalletTopUpPaise: patch.minWalletTopUpPaise }
      : {}),
    ...(patch.maxWalletTopUpPaise !== undefined
      ? { maxWalletTopUpPaise: patch.maxWalletTopUpPaise }
      : {}),
    ...(patch.walletTopUpPresetsPaise !== undefined
      ? { walletTopUpPresetsPaise: patch.walletTopUpPresetsPaise }
      : {}),
    ...(patch.mockWalletTopUpEnabled !== undefined
      ? { mockWalletTopUpEnabled: patch.mockWalletTopUpEnabled }
      : {}),
    updatedBy: updatedBy ?? null
  };

  const row = await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create,
    update
  });
  const snapshot = rowToSnapshot(row);
  await writeRedisAndDropMemory(snapshot);
  return snapshot;
}

export async function refreshUsdInrRate(): Promise<FxRefreshResult> {
  let payload: unknown;
  try {
    const response = await fetch(FRANKFURTER_USD_INR_URL, {
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, 'fx_refresh_http_error');
      return {
        ok: false,
        reason: 'fetch_failed',
        settings: await ensurePlatformSettings()
      };
    }
    payload = await response.json();
  } catch (err) {
    logger.warn({ err }, 'fx_refresh_fetch_failed');
    return {
      ok: false,
      reason: 'fetch_failed',
      settings: await ensurePlatformSettings()
    };
  }

  const parsed = parseFrankfurterUsdInr(payload);
  if (!parsed.ok) {
    logger.warn({ reason: parsed.reason, payload }, 'fx_refresh_rejected');
    return {
      ok: false,
      reason: parsed.reason,
      settings: await ensurePlatformSettings()
    };
  }

  const now = new Date();
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: {
        ...envCreateData(),
        usdToInrRate: parsed.rate,
        usdToInrSource: 'frankfurter',
        usdToInrFetchedAt: now
      },
      update: {
        usdToInrRate: parsed.rate,
        usdToInrSource: 'frankfurter',
        usdToInrFetchedAt: now
      }
    });
    await tx.fxRateHistory.create({
      data: {
        base: 'USD',
        quote: 'INR',
        rate: parsed.rate,
        source: 'frankfurter',
        fetchedAt: now
      }
    });
    return updated;
  });

  const snapshot = rowToSnapshot(row);
  await writeRedisAndDropMemory(snapshot);
  logger.info({ rate: parsed.rate }, 'fx_refresh_ok');
  return { ok: true, rate: parsed.rate, settings: snapshot };
}

export async function maybeRefreshUsdInrRate(): Promise<FxRefreshResult | null> {
  const settings = await ensurePlatformSettings();
  const fetchedAt = settings.usdToInrFetchedAt ? Date.parse(settings.usdToInrFetchedAt) : 0;
  if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt < FX_REFRESH_INTERVAL_MS) {
    return null;
  }
  return refreshUsdInrRate();
}

/**
 * Ticks immediately, then every 24h. Callers must gate on
 * `isFxRefreshLoopEnabled` (FX_REFRESH_ENABLED) — a local process sharing the
 * production database should not write PlatformSettings on every restart.
 */
export function startFxRateRefreshLoop(): NodeJS.Timeout {
  const tick = () => {
    void maybeRefreshUsdInrRate().catch((err) => {
      logger.error({ err }, 'fx_refresh_tick_failed');
    });
  };
  tick();
  const timer = setInterval(tick, FX_REFRESH_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
