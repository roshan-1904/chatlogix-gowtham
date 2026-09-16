/**
 * Unit authority for **wallet money**, denominated in millirupees ("milli").
 *
 * 1 rupee = 1000 milli = 100 paise, so 1 paise = 10 milli. Every wallet
 * column, env var, API field and local variable that holds millirupees carries
 * the `Milli` suffix. `PlatformSettings` money columns are paise by design
 * (convert with `paiseToMilli` at the wallet boundary). Other `Paise` names
 * are order/product money (see below).
 *
 * ORDER MONEY IS NOT WALLET MONEY. Order totals, product prices and cart
 * amounts stay in **paise** and format themselves at their own call sites
 * (`cart/`, `llm/llm2.ts`). Do not route those through the helpers here —
 * `formatRupeesFromMilli()` on a paise amount is 10x off.
 */

import { env } from '../config/env.js';

/** Millirupees per rupee. Wallet amounts are integers in this unit. */
export const MILLI_PER_RUPEE = 1000;

/** Millirupees per paise — the scale factor of the paise -> milli cutover. */
export const MILLI_PER_PAISE = 10;

/**
 * Env fallback USD -> INR. Live rate is `PlatformSettings` (override ?? fetched);
 * this constant is used only when memory is empty (cold start before
 * `ensurePlatformSettings()`, or tests that never seed).
 */
export const USD_TO_INR = Number(env.USD_TO_INR_RATE || '83');

/** Process-local effective FX, written by platformSettingsService. */
let memoryUsdToInr: number | undefined;

/** Sync hook so `usdToMilliFloat` can stay sync. */
export function setUsdToInrMemoryRate(rate: number | undefined): void {
  memoryUsdToInr =
    typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

export function getUsdToInrMemoryRate(): number | undefined {
  return memoryUsdToInr;
}

function resolveUsdToInr(usdToInr?: number): number {
  if (typeof usdToInr === 'number' && Number.isFinite(usdToInr) && usdToInr > 0) {
    return usdToInr;
  }
  return memoryUsdToInr ?? USD_TO_INR;
}

/**
 * Unrounded USD -> millirupees. Deliberately fractional: costs are summed
 * across LLM-1, LLM-2, transcription and vision before a single rounding at
 * the charge boundary, so intermediate rounding must not creep in here.
 *
 * Uses `usdToInr` when passed, else the in-memory effective PlatformSettings
 * rate, else the env fallback.
 */
export function usdToMilliFloat(costUsd: number, usdToInr?: number): number {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return 0;
  return costUsd * resolveUsdToInr(usdToInr) * MILLI_PER_RUPEE;
}

/**
 * The one rounding step. Applied once, at the charge boundary, after markup —
 * so a sub-millirupee action still costs 1 milli rather than nothing.
 */
export function ceilMilli(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value);
}

/** Exact paise -> millirupees promotion (x10), matching the data migration. */
export function paiseToMilli(paise: number): number {
  if (!Number.isFinite(paise)) return 0;
  return Math.round(paise * MILLI_PER_PAISE);
}

/** Millirupees -> paise, for the few order-money interop points. */
export function milliToPaise(milli: number): number {
  if (!Number.isFinite(milli)) return 0;
  return Math.round(milli / MILLI_PER_PAISE);
}

/** Vendor-facing wallet formatting, e.g. 525 -> "₹0.53". */
export function formatRupeesFromMilli(milli: number): string {
  const safe = Number.isFinite(milli) ? milli : 0;
  return `₹${(safe / MILLI_PER_RUPEE).toFixed(2)}`;
}

/** Rupees -> millirupees, for top-up presets and admin entry. */
export function rupeesToMilli(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  return Math.round(rupees * MILLI_PER_RUPEE);
}
