/**
 * Pure settlement arithmetic. Vendor balance uses millirupees (bigint).
 * Gateway, tax, and fee amounts stay in paise until conversion.
 *
 * 1 rupee = 100 paise = 1000 milli → 1 paise = 10 milli.
 */

export const SETTLEMENT_HOLD_MS = 48 * 60 * 60 * 1000;
export const NEW_SHOP_HOLD_MS = 7 * 24 * 60 * 60 * 1000;
export const NEW_SHOP_WINDOW_DAYS = 30;
export const NEW_SHOP_ORDER_COUNT = 20;
export const NEW_SHOP_DAILY_RELEASE_CAP_MILLI = 25_000_000n;
export const RESERVE_HOLD_MS = 30 * 24 * 60 * 60 * 1000;
export const BANK_CHANGE_PAUSE_MS = 48 * 60 * 60 * 1000;
export const REFUND_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
export const PLATFORM_FEE_GST_BPS = 1800;
export const AUTO_RECHARGE_THRESHOLD_MILLI = 100_000;

export const PAYMENT_FEE_BPS_MIN = 0;
export const PAYMENT_FEE_BPS_MAX = 2000;

export const RELEASE_BATCH_SIZE = 100;

const BPS_DENOMINATOR = 10_000;
const MILLI_PER_PAISE = 10n;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function clampPaymentFeeBps(paymentFeeBps: number): number {
  if (!Number.isInteger(paymentFeeBps)) return PAYMENT_FEE_BPS_MIN;
  if (paymentFeeBps < PAYMENT_FEE_BPS_MIN) return PAYMENT_FEE_BPS_MIN;
  if (paymentFeeBps > PAYMENT_FEE_BPS_MAX) return PAYMENT_FEE_BPS_MAX;
  return paymentFeeBps;
}

/** ceil(amountPaise * bps / 10000), integer-only. */
export function bpsOfPaise(amountPaise: number, bps: number): number {
  const safeBps = Math.max(0, Math.min(BPS_DENOMINATOR, bps));
  if (!Number.isInteger(amountPaise) || amountPaise <= 0 || safeBps === 0) return 0;
  return Math.floor((amountPaise * safeBps + BPS_DENOMINATOR - 1) / BPS_DENOMINATOR);
}

export function platformFeePaise(amountPaise: number, paymentFeeBps: number): number {
  return bpsOfPaise(amountPaise, clampPaymentFeeBps(paymentFeeBps));
}

/** GST embedded in an inclusive platform fee (18% of pre-tax → ×18/118). */
export function platformFeeGstFromInclusive(feePaise: number): number {
  if (feePaise <= 0) return 0;
  return Math.round((feePaise * PLATFORM_FEE_GST_BPS) / (10_000 + PLATFORM_FEE_GST_BPS));
}

export interface OrderSettlementQuote {
  gatewayCostPaise: number;
  platformFeePaise: number;
  platformFeeGstPaise: number;
  gstTcsPaise: number;
  tdsPaise: number;
  netPaise: number;
  netMilli: bigint;
  blocked: boolean;
}

export function quoteOrderSettlement(input: {
  amountPaise: number;
  gatewayFeePaise: number;
  gatewayTaxPaise: number;
  paymentFeeBps: number;
  gstTcsBps?: number;
  tdsBps?: number;
}): OrderSettlementQuote {
  const amountPaise = nonNegativeInt(input.amountPaise);
  const gatewayFeePaise = nonNegativeInt(input.gatewayFeePaise);
  const gatewayTaxPaise = nonNegativeInt(input.gatewayTaxPaise);
  const gatewayCostPaise = gatewayFeePaise + gatewayTaxPaise;
  const feePaise = platformFeePaise(amountPaise, input.paymentFeeBps);
  const platformFeeGstPaise = platformFeeGstFromInclusive(feePaise);
  const gstTcsPaise = bpsOfPaise(amountPaise, input.gstTcsBps ?? 0);
  const tdsPaise = bpsOfPaise(amountPaise, input.tdsBps ?? 0);
  const netPaise = amountPaise - gatewayCostPaise - feePaise - gstTcsPaise - tdsPaise;
  if (netPaise <= 0) {
    return {
      gatewayCostPaise,
      platformFeePaise: feePaise,
      platformFeeGstPaise,
      gstTcsPaise,
      tdsPaise,
      netPaise,
      netMilli: 0n,
      blocked: true
    };
  }
  return {
    gatewayCostPaise,
    platformFeePaise: feePaise,
    platformFeeGstPaise,
    gstTcsPaise,
    tdsPaise,
    netPaise,
    netMilli: BigInt(netPaise) * MILLI_PER_PAISE,
    blocked: false
  };
}

export function paiseToMilliBig(paise: number): bigint {
  const safe = nonNegativeInt(paise);
  return BigInt(safe) * MILLI_PER_PAISE;
}

export function milliToPaiseBig(milli: bigint): number {
  if (milli <= 0n) return 0;
  return Number(milli / MILLI_PER_PAISE);
}

/**
 * Gross checkout amount (paise) so settlement net covers `targetNetMilli`,
 * using list platform fee + optional TCS/TDS (gateway fees come from the capture).
 */
export function grossPaiseForTargetNetMilli(input: {
  targetNetMilli: bigint;
  paymentFeeBps: number;
  gstTcsBps?: number;
  tdsBps?: number;
}): number {
  const targetNetPaise = Number(input.targetNetMilli / MILLI_PER_PAISE);
  if (targetNetPaise <= 0) return 0;
  let gross = targetNetPaise;
  for (let i = 0; i < 32; i += 1) {
    const quote = quoteOrderSettlement({
      amountPaise: gross,
      gatewayFeePaise: 0,
      gatewayTaxPaise: 0,
      paymentFeeBps: input.paymentFeeBps,
      gstTcsBps: input.gstTcsBps ?? 0,
      tdsBps: input.tdsBps ?? 0
    });
    if (quote.netMilli >= input.targetNetMilli) return gross;
    const gapPaise = Math.max(1, targetNetPaise - quote.netPaise);
    gross += gapPaise;
  }
  return gross;
}

function nonNegativeInt(value: number): number {
  if (!Number.isInteger(value) || value < 0) return 0;
  return value;
}

export interface TransferSplit {
  mainPaise: number;
  reservePaise: number;
}

/** Split net paise into main + rolling reserve (ceil on reserve). */
export function splitReserve(netPaise: number, rollingReserveBps: number): TransferSplit {
  if (netPaise <= 0 || rollingReserveBps <= 0) {
    return { mainPaise: netPaise, reservePaise: 0 };
  }
  const reservePaise = bpsOfPaise(netPaise, rollingReserveBps);
  const mainPaise = netPaise - reservePaise;
  return { mainPaise, reservePaise };
}

export function isNewShop(input: {
  now: Date;
  collectionStartedAt: Date | null;
  capturedPaymentCount: number;
}): boolean {
  const withinWindow =
    input.collectionStartedAt != null &&
    input.now.getTime() <
      input.collectionStartedAt.getTime() + NEW_SHOP_WINDOW_DAYS * MS_PER_DAY;
  const underOrderCount = input.capturedPaymentCount < NEW_SHOP_ORDER_COUNT;
  return withinWindow || underOrderCount;
}

export function holdMsForShop(input: {
  now: Date;
  collectionStartedAt: Date | null;
  capturedPaymentCount: number;
}): number {
  return isNewShop(input) ? NEW_SHOP_HOLD_MS : SETTLEMENT_HOLD_MS;
}

export function transferEligibleAt(capturedAt: Date, holdMs: number): Date {
  return new Date(capturedAt.getTime() + holdMs);
}

export function reserveEligibleAt(capturedAt: Date): Date {
  return new Date(capturedAt.getTime() + RESERVE_HOLD_MS);
}

/** Paise still on hold (not reversed) for active transfer rows. */
export function heldPaiseFromTransfers(
  transfers: Array<{ amountPaise: number; reversedPaise: number; status: string }>
): number {
  let total = 0;
  for (const row of transfers) {
    if (row.status === 'released' || row.status === 'reversed' || row.status === 'failed') continue;
    total += Math.max(0, row.amountPaise - row.reversedPaise);
  }
  return total;
}

export function summarizeSettlement(input: {
  balanceMilli: bigint;
  transfers: Array<{ amountPaise: number; reversedPaise: number; kind: string; status: string }>;
}): {
  heldMilli: bigint;
  reserveMilli: bigint;
  owedMilli: bigint;
} {
  let heldPaise = 0;
  let reservePaise = 0;
  for (const row of input.transfers) {
    if (row.status === 'released' || row.status === 'reversed' || row.status === 'failed') continue;
    const remaining = Math.max(0, row.amountPaise - row.reversedPaise);
    if (remaining <= 0) continue;
    heldPaise += remaining;
    if (row.kind === 'reserve') reservePaise += remaining;
  }
  const owedMilli = input.balanceMilli < 0n ? -input.balanceMilli : 0n;
  return {
    heldMilli: paiseToMilliBig(heldPaise),
    reserveMilli: paiseToMilliBig(reservePaise),
    owedMilli
  };
}

/** IST calendar day key for daily release cap (Asia/Kolkata). */
export function istDayKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function exceedsNewShopDailyCap(input: {
  releasedTodayMilli: bigint;
  transferMilli: bigint;
  transferAlone: boolean;
}): boolean {
  if (input.transferAlone) return false;
  return input.releasedTodayMilli + input.transferMilli > NEW_SHOP_DAILY_RELEASE_CAP_MILLI;
}

/** Paise to route after paying down a negative balance (owed). */
export function transferablePaiseAfterOwed(balanceBeforeMilli: bigint, creditMilli: bigint): number {
  const after = balanceBeforeMilli + creditMilli;
  if (after <= 0n) return 0;
  if (balanceBeforeMilli >= 0n) return milliToPaiseBig(creditMilli);
  return milliToPaiseBig(after);
}
