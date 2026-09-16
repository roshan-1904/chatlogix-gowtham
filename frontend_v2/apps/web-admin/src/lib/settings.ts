import { apiClient } from './api';
import { paiseToRupeeInput, parseRupeeInput, rupeesToPaise } from './money';

/**
 * Platform settings as the admin UI uses them.
 * Money fields are integer paise from GET/PATCH; FX rates are dimensionless INR per USD.
 */
export interface PlatformSettings {
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

/** PATCH body. Money is integer paise. Do not send `usdToInrRate` or `usdToInrFetchedAt`. */
export interface PatchPlatformSettings {
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
}

export interface BillingDraft {
  usdToInrOverride: string;
  platformFeePerTurn: string;
  platformFeeOutboundMedia: string;
  trialGrant: string;
  trialExpiryDays: string;
  catalogImportDailyCap: string;
  catalogEnhanceDailyCap: string;
  minWalletTopUp: string;
  maxWalletTopUp: string;
  walletTopUpPresets: string;
  mockWalletTopUpEnabled: boolean;
}

export type BillingField = keyof BillingDraft;

export type BillingFieldErrors = Partial<Record<BillingField, string>>;

/** Mirrors the backend PATCH schema: an override outside 50..150 is rejected whole-request. */
export const FX_OVERRIDE_MIN = 50;
export const FX_OVERRIDE_MAX = 150;
export const TRIAL_EXPIRY_DAYS_MAX = 3650;
export const WALLET_TOPUP_PRESETS_MAX = 20;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asInt(value: unknown): number | null {
  const n = asFiniteNumber(value);
  if (n === null) return null;
  return Math.trunc(n);
}

function requireInt(row: Record<string, unknown>, key: string): number {
  const n = asInt(row[key]);
  if (n === null) {
    throw new Error(`Platform settings is missing ${key}`);
  }
  return n;
}

function requireRate(row: Record<string, unknown>, key: string): number {
  const n = asFiniteNumber(row[key]);
  if (n === null) {
    throw new Error(`Platform settings is missing ${key}`);
  }
  return n;
}

function asNullableRate(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return asFiniteNumber(value);
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asPaiseArray(value: unknown): number[] {
  let items: unknown = value;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(items)) return [];
  const out: number[] = [];
  for (const item of items) {
    const n = asInt(item);
    if (n !== null && n >= 0) out.push(n);
  }
  return out;
}

function tryUnwrapSettings(body: unknown): Record<string, unknown> | null {
  const rec = asRecord(body);
  if (!rec) return null;
  if ('trialGrantPaise' in rec) return rec;
  const nested = asRecord(rec.settings) ?? asRecord(rec.data);
  if (nested && 'trialGrantPaise' in nested) return nested;
  return null;
}

function unwrapSettings(body: unknown): Record<string, unknown> {
  const row = tryUnwrapSettings(body);
  if (!row) {
    throw new Error('Could not read platform settings');
  }
  return row;
}

export function normalizePlatformSettings(row: Record<string, unknown>): PlatformSettings {
  const usdToInrRate = requireRate(row, 'usdToInrRate');
  const usdToInrOverride = asNullableRate(row.usdToInrOverride);
  const effective =
    asFiniteNumber(row.effectiveUsdToInrRate) ?? usdToInrOverride ?? usdToInrRate;

  return {
    usdToInrRate,
    usdToInrSource: typeof row.usdToInrSource === 'string' ? row.usdToInrSource : 'fallback',
    usdToInrFetchedAt: asNullableString(row.usdToInrFetchedAt),
    usdToInrOverride,
    effectiveUsdToInrRate: effective,
    platformFeePerTurnPaise: requireInt(row, 'platformFeePerTurnPaise'),
    platformFeeOutboundMediaPaise: requireInt(row, 'platformFeeOutboundMediaPaise'),
    trialGrantPaise: requireInt(row, 'trialGrantPaise'),
    trialExpiryDays: requireInt(row, 'trialExpiryDays'),
    catalogImportDailyPaiseCap: requireInt(row, 'catalogImportDailyPaiseCap'),
    catalogEnhanceDailyPaiseCap: requireInt(row, 'catalogEnhanceDailyPaiseCap'),
    minWalletTopUpPaise: requireInt(row, 'minWalletTopUpPaise'),
    maxWalletTopUpPaise: requireInt(row, 'maxWalletTopUpPaise'),
    walletTopUpPresetsPaise: asPaiseArray(row.walletTopUpPresetsPaise),
    mockWalletTopUpEnabled: row.mockWalletTopUpEnabled === true,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    updatedBy: asNullableString(row.updatedBy),
  };
}

export function draftFromSettings(settings: PlatformSettings): BillingDraft {
  return {
    usdToInrOverride:
      settings.usdToInrOverride === null ? '' : String(settings.usdToInrOverride),
    platformFeePerTurn: paiseToRupeeInput(settings.platformFeePerTurnPaise),
    platformFeeOutboundMedia: paiseToRupeeInput(settings.platformFeeOutboundMediaPaise),
    trialGrant: paiseToRupeeInput(settings.trialGrantPaise),
    trialExpiryDays: String(settings.trialExpiryDays),
    catalogImportDailyCap: paiseToRupeeInput(settings.catalogImportDailyPaiseCap),
    catalogEnhanceDailyCap: paiseToRupeeInput(settings.catalogEnhanceDailyPaiseCap),
    minWalletTopUp: paiseToRupeeInput(settings.minWalletTopUpPaise),
    maxWalletTopUp: paiseToRupeeInput(settings.maxWalletTopUpPaise),
    walletTopUpPresets: settings.walletTopUpPresetsPaise.map(paiseToRupeeInput).join(', '),
    mockWalletTopUpEnabled: settings.mockWalletTopUpEnabled,
  };
}

function requirePaise(
  rupeeText: string,
  field: BillingField,
  label: string,
  errors: BillingFieldErrors
): number | undefined {
  const rupees = parseRupeeInput(rupeeText);
  if (rupees === null) {
    errors[field] = `Enter ${label} in rupees.`;
    return undefined;
  }
  return rupeesToPaise(rupees);
}

export function parsePresetRupees(value: string): number[] | null {
  const parts = value.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const paise: number[] = [];
  for (const part of parts) {
    const rupees = parseRupeeInput(part);
    if (rupees === null) return null;
    paise.push(rupeesToPaise(rupees));
  }
  return [...new Set(paise)].sort((a, b) => a - b);
}

export function parseBillingDraft(draft: BillingDraft): {
  patch: PatchPlatformSettings;
  errors: BillingFieldErrors;
} {
  const errors: BillingFieldErrors = {};
  const patch: PatchPlatformSettings = {
    mockWalletTopUpEnabled: draft.mockWalletTopUpEnabled,
  };

  const overrideRaw = draft.usdToInrOverride.trim();
  if (overrideRaw === '') {
    patch.usdToInrOverride = null;
  } else {
    const n = Number(overrideRaw.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < FX_OVERRIDE_MIN || n > FX_OVERRIDE_MAX) {
      errors.usdToInrOverride = `Enter a rate between ${FX_OVERRIDE_MIN} and ${FX_OVERRIDE_MAX}, or leave blank to use the live rate.`;
    } else {
      patch.usdToInrOverride = n;
    }
  }

  const platformFeePerTurnPaise = requirePaise(
    draft.platformFeePerTurn,
    'platformFeePerTurn',
    'the per-turn fee',
    errors
  );
  if (platformFeePerTurnPaise !== undefined) patch.platformFeePerTurnPaise = platformFeePerTurnPaise;

  const platformFeeOutboundMediaPaise = requirePaise(
    draft.platformFeeOutboundMedia,
    'platformFeeOutboundMedia',
    'the outbound media fee',
    errors
  );
  if (platformFeeOutboundMediaPaise !== undefined) {
    patch.platformFeeOutboundMediaPaise = platformFeeOutboundMediaPaise;
  }

  const trialGrantPaise = requirePaise(draft.trialGrant, 'trialGrant', 'the trial grant', errors);
  if (trialGrantPaise !== undefined) patch.trialGrantPaise = trialGrantPaise;

  const daysRaw = draft.trialExpiryDays.trim();
  const days = Number(daysRaw);
  if (!/^\d+$/.test(daysRaw) || days < 1 || days > TRIAL_EXPIRY_DAYS_MAX) {
    errors.trialExpiryDays = `Enter a whole number of days from 1 to ${TRIAL_EXPIRY_DAYS_MAX}.`;
  } else {
    patch.trialExpiryDays = days;
  }

  const catalogImportDailyPaiseCap = requirePaise(
    draft.catalogImportDailyCap,
    'catalogImportDailyCap',
    'the import daily cap',
    errors
  );
  if (catalogImportDailyPaiseCap !== undefined) {
    patch.catalogImportDailyPaiseCap = catalogImportDailyPaiseCap;
  }

  const catalogEnhanceDailyPaiseCap = requirePaise(
    draft.catalogEnhanceDailyCap,
    'catalogEnhanceDailyCap',
    'the enhancer daily cap',
    errors
  );
  if (catalogEnhanceDailyPaiseCap !== undefined) {
    patch.catalogEnhanceDailyPaiseCap = catalogEnhanceDailyPaiseCap;
  }

  const minWalletTopUpPaise = requirePaise(
    draft.minWalletTopUp,
    'minWalletTopUp',
    'the minimum top-up',
    errors
  );
  const maxWalletTopUpPaise = requirePaise(
    draft.maxWalletTopUp,
    'maxWalletTopUp',
    'the maximum top-up',
    errors
  );
  if (minWalletTopUpPaise !== undefined) patch.minWalletTopUpPaise = minWalletTopUpPaise;
  if (maxWalletTopUpPaise !== undefined) patch.maxWalletTopUpPaise = maxWalletTopUpPaise;
  if (
    minWalletTopUpPaise !== undefined &&
    maxWalletTopUpPaise !== undefined &&
    minWalletTopUpPaise > maxWalletTopUpPaise
  ) {
    errors.maxWalletTopUp = 'Maximum must be at least the minimum.';
  }

  const presets = parsePresetRupees(draft.walletTopUpPresets);
  if (presets === null || presets.length === 0) {
    errors.walletTopUpPresets = 'Enter at least one top-up amount in rupees, separated by commas.';
  } else if (presets.length > WALLET_TOPUP_PRESETS_MAX) {
    errors.walletTopUpPresets = `Enter at most ${WALLET_TOPUP_PRESETS_MAX} top-up amounts.`;
  } else {
    const min = minWalletTopUpPaise;
    const max = maxWalletTopUpPaise;
    if (
      min !== undefined &&
      max !== undefined &&
      presets.some((amount) => amount < min || amount > max)
    ) {
      errors.walletTopUpPresets = 'Each preset must sit between the minimum and maximum top-up.';
    } else {
      patch.walletTopUpPresetsPaise = presets;
    }
  }

  return { patch, errors };
}

export function billingDraftHasErrors(errors: BillingFieldErrors): boolean {
  return Object.keys(errors).length > 0;
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const body = await apiClient.get<unknown>('/admin/settings');
  return normalizePlatformSettings(unwrapSettings(body));
}

export async function updatePlatformSettings(
  patch: PatchPlatformSettings
): Promise<PlatformSettings | null> {
  const body = await apiClient.patch<unknown>('/admin/settings', patch);
  const row = tryUnwrapSettings(body);
  return row ? normalizePlatformSettings(row) : null;
}

export async function refreshUsdInrRate(): Promise<PlatformSettings | null> {
  let body: unknown;
  try {
    body = await apiClient.post<unknown>('/admin/settings/refresh-fx', {});
  } catch (err) {
    // A rejected fetch is a 502 `{ ok: false, reason, settings }`, and the client
    // surfaces that body only as the status line. The stored rate is untouched.
    if (err instanceof Error && err.message.includes('502')) {
      throw new Error('Could not fetch a live USD to INR rate. The saved rate is unchanged.');
    }
    throw err;
  }
  const row = tryUnwrapSettings(body);
  return row ? normalizePlatformSettings(row) : null;
}
