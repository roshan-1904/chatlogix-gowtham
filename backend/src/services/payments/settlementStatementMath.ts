/**
 * Monthly settlement statement — pure arithmetic and IST calendar bounds.
 * Ledger sign rules match `paymentReconciliationService.runSettlementLedgerCheck`.
 */

export const SETTLEMENT_STATEMENT_TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const CREDIT_ENTRY_KINDS = new Set(['payment_credit', 'shop_funding', 'dispute_credit']);
const DEBIT_ENTRY_KINDS = new Set(['transfer_release', 'refund_debit', 'dispute_debit']);

export interface LedgerEntrySlice {
  amountMilli: bigint;
  direction: string;
  kind: string;
  balanceAfterMilli: bigint;
  createdAt: Date;
}

export interface PaymentSlice {
  amountPaise: number;
  gatewayFeePaise: number;
  gatewayTaxPaise: number;
  platformFeePaise: number;
  platformFeeGstPaise: number;
  gstTcsPaise: number;
  tdsPaise: number;
  netMilli: bigint;
  capturedAt: Date;
  settlementAlert: string | null;
}

export interface TransferSlice {
  kind: string;
  amountPaise: number;
  reversedPaise: number;
  createdAt: Date;
}

export interface StatementMovements {
  grossCollectedPaise: number;
  gatewayFeePaise: number;
  gatewayTaxPaise: number;
  platformFeePaise: number;
  platformFeeGstPaise: number;
  gstTcsPaise: number;
  tdsPaise: number;
  netCollectedMilli: bigint;
  reservePaise: number;
  releasesMilli: bigint;
  refundsMilli: bigint;
  fundingMilli: bigint;
  disputeCreditsMilli: bigint;
  disputeDebitsMilli: bigint;
  adjustmentsMilli: bigint;
}

export interface BuiltMonthlyStatement {
  openingBalanceMilli: bigint;
  closingBalanceMilli: bigint;
  movements: StatementMovements;
  ledgerNetChangeMilli: bigint;
  ledgerSumAtCloseMilli: bigint;
  balances: boolean;
  ledgerMatchesClosing: boolean;
}

/** Inclusive start, exclusive end — IST calendar month. */
export function istCalendarMonthUtcRange(
  year: number,
  month: number
): { start: Date; endExclusive: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
  const endExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - IST_OFFSET_MS);
  return { start, endExclusive };
}

export function ledgerSignedDelta(entry: Pick<LedgerEntrySlice, 'amountMilli' | 'direction' | 'kind'>): bigint {
  if (entry.kind === 'adjustment') {
    return entry.direction === 'credit' ? entry.amountMilli : -entry.amountMilli;
  }
  if (CREDIT_ENTRY_KINDS.has(entry.kind)) return entry.amountMilli;
  if (DEBIT_ENTRY_KINDS.has(entry.kind)) return -entry.amountMilli;
  return 0n;
}

export function sumLedgerEntries(entries: Iterable<LedgerEntrySlice>): bigint {
  let sum = 0n;
  for (const e of entries) {
    sum += ledgerSignedDelta(e);
  }
  return sum;
}

function inHalfOpenRange(at: Date, start: Date, endExclusive: Date): boolean {
  const t = at.getTime();
  return t >= start.getTime() && t < endExclusive.getTime();
}

function lastEntryBefore(entries: LedgerEntrySlice[], before: Date): LedgerEntrySlice | null {
  let best: LedgerEntrySlice | null = null;
  for (const e of entries) {
    if (e.createdAt.getTime() >= before.getTime()) continue;
    if (!best || e.createdAt.getTime() > best.createdAt.getTime()) best = e;
    else if (e.createdAt.getTime() === best.createdAt.getTime() && e.balanceAfterMilli > best.balanceAfterMilli) {
      best = e;
    }
  }
  return best;
}

function lastEntryInRange(entries: LedgerEntrySlice[], start: Date, endExclusive: Date): LedgerEntrySlice | null {
  let best: LedgerEntrySlice | null = null;
  for (const e of entries) {
    if (!inHalfOpenRange(e.createdAt, start, endExclusive)) continue;
    if (!best || e.createdAt.getTime() > best.createdAt.getTime()) best = e;
    else if (e.createdAt.getTime() === best.createdAt.getTime() && e.balanceAfterMilli >= best.balanceAfterMilli) {
      best = e;
    }
  }
  return best;
}

export function aggregatePaymentBreakdown(payments: PaymentSlice[], start: Date, endExclusive: Date): Omit<
  StatementMovements,
  | 'netCollectedMilli'
  | 'reservePaise'
  | 'releasesMilli'
  | 'refundsMilli'
  | 'fundingMilli'
  | 'disputeCreditsMilli'
  | 'disputeDebitsMilli'
  | 'adjustmentsMilli'
> {
  let grossCollectedPaise = 0;
  let gatewayFeePaise = 0;
  let gatewayTaxPaise = 0;
  let platformFeePaise = 0;
  let platformFeeGstPaise = 0;
  let gstTcsPaise = 0;
  let tdsPaise = 0;
  for (const p of payments) {
    if (!inHalfOpenRange(p.capturedAt, start, endExclusive)) continue;
    if (p.settlementAlert != null || p.netMilli <= 0n) continue;
    grossCollectedPaise += p.amountPaise;
    gatewayFeePaise += p.gatewayFeePaise;
    gatewayTaxPaise += p.gatewayTaxPaise;
    platformFeePaise += p.platformFeePaise;
    platformFeeGstPaise += p.platformFeeGstPaise;
    gstTcsPaise += p.gstTcsPaise;
    tdsPaise += p.tdsPaise;
  }
  return {
    grossCollectedPaise,
    gatewayFeePaise,
    gatewayTaxPaise,
    platformFeePaise,
    platformFeeGstPaise,
    gstTcsPaise,
    tdsPaise
  };
}

export function aggregateReservePaise(transfers: TransferSlice[], start: Date, endExclusive: Date): number {
  let reservePaise = 0;
  for (const t of transfers) {
    if (t.kind !== 'reserve') continue;
    if (!inHalfOpenRange(t.createdAt, start, endExclusive)) continue;
    reservePaise += Math.max(0, t.amountPaise - t.reversedPaise);
  }
  return reservePaise;
}

function sumKindMilli(
  entries: LedgerEntrySlice[],
  start: Date,
  endExclusive: Date,
  kind: string,
  direction?: 'credit' | 'debit'
): bigint {
  let sum = 0n;
  for (const e of entries) {
    if (e.kind !== kind) continue;
    if (direction && e.direction !== direction) continue;
    if (!inHalfOpenRange(e.createdAt, start, endExclusive)) continue;
    sum += e.amountMilli;
  }
  return sum;
}

export function buildMonthlyStatement(input: {
  entries: LedgerEntrySlice[];
  payments: PaymentSlice[];
  transfers: TransferSlice[];
  start: Date;
  endExclusive: Date;
}): BuiltMonthlyStatement {
  const sorted = [...input.entries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const beforeOpen = lastEntryBefore(sorted, input.start);
  const openingBalanceMilli = beforeOpen?.balanceAfterMilli ?? 0n;
  const lastInMonth = lastEntryInRange(sorted, input.start, input.endExclusive);
  const closingBalanceMilli =
    lastInMonth?.balanceAfterMilli ?? openingBalanceMilli;

  const entriesInMonth = sorted.filter((e) => inHalfOpenRange(e.createdAt, input.start, input.endExclusive));
  const ledgerNetChangeMilli = sumLedgerEntries(entriesInMonth);

  const paymentBreakdown = aggregatePaymentBreakdown(input.payments, input.start, input.endExclusive);
  const netCollectedMilli = sumKindMilli(sorted, input.start, input.endExclusive, 'payment_credit');
  const releasesMilli = sumKindMilli(sorted, input.start, input.endExclusive, 'transfer_release');
  const refundsMilli = sumKindMilli(sorted, input.start, input.endExclusive, 'refund_debit');
  const fundingMilli = sumKindMilli(sorted, input.start, input.endExclusive, 'shop_funding');
  const disputeCreditsMilli = sumKindMilli(sorted, input.start, input.endExclusive, 'dispute_credit');
  const disputeDebitsMilli = sumKindMilli(sorted, input.start, input.endExclusive, 'dispute_debit');

  let adjustmentsMilli = 0n;
  for (const e of entriesInMonth) {
    if (e.kind !== 'adjustment') continue;
    adjustmentsMilli += ledgerSignedDelta(e);
  }

  const movements: StatementMovements = {
    ...paymentBreakdown,
    netCollectedMilli,
    reservePaise: aggregateReservePaise(input.transfers, input.start, input.endExclusive),
    releasesMilli,
    refundsMilli,
    fundingMilli,
    disputeCreditsMilli,
    disputeDebitsMilli,
    adjustmentsMilli
  };

  const entriesAtClose = sorted.filter((e) => e.createdAt.getTime() < input.endExclusive.getTime());
  const ledgerSumAtCloseMilli = sumLedgerEntries(entriesAtClose);

  const balances = openingBalanceMilli + ledgerNetChangeMilli === closingBalanceMilli;
  const ledgerMatchesClosing = ledgerSumAtCloseMilli === closingBalanceMilli;

  return {
    openingBalanceMilli,
    closingBalanceMilli,
    movements,
    ledgerNetChangeMilli,
    ledgerSumAtCloseMilli,
    balances,
    ledgerMatchesClosing
  };
}

export function formatStatementCsv(input: {
  shopLabel: string;
  year: number;
  month: number;
  periodStart: Date;
  periodEndExclusive: Date;
  statement: BuiltMonthlyStatement;
}): string {
  const rupees = (milli: bigint) => (Number(milli) / 1000).toFixed(2);
  const paise = (p: number) => (p / 100).toFixed(2);
  const m = input.statement.movements;
  const lines = [
    'ChatLogix settlement statement',
    `Shop,${escapeCsv(input.shopLabel)}`,
    `Period,${input.year}-${String(input.month).padStart(2, '0')} (IST)`,
    `From,${input.periodStart.toISOString()}`,
    `To (exclusive),${input.periodEndExclusive.toISOString()}`,
    '',
    'Line,Amount (INR)',
    `Opening balance,${rupees(input.statement.openingBalanceMilli)}`,
    `Gross collected,${paise(m.grossCollectedPaise)}`,
    `Gateway fee,${paise(m.gatewayFeePaise)}`,
    `Gateway tax,${paise(m.gatewayTaxPaise)}`,
    `Platform fee,${paise(m.platformFeePaise)}`,
    `Platform fee GST,${paise(m.platformFeeGstPaise)}`,
    `GST TCS withheld,${paise(m.gstTcsPaise)}`,
    `TDS withheld,${paise(m.tdsPaise)}`,
    `Net credited to ledger,${rupees(m.netCollectedMilli)}`,
    `Reserve (new holds),${paise(m.reservePaise)}`,
    `Released to bank,${rupees(m.releasesMilli)}`,
    `Refunds,${rupees(m.refundsMilli)}`,
    `Shop funding,${rupees(m.fundingMilli)}`,
    `Dispute credits,${rupees(m.disputeCreditsMilli)}`,
    `Dispute debits,${rupees(m.disputeDebitsMilli)}`,
    `Adjustments (net),${rupees(m.adjustmentsMilli)}`,
    `Closing balance,${rupees(input.statement.closingBalanceMilli)}`,
    '',
    `Opening + ledger movement = closing,${input.statement.balances ? 'yes' : 'no'}`,
    `Closing = ledger sum (stage 9),${input.statement.ledgerMatchesClosing ? 'yes' : 'no'}`
  ];
  return lines.join('\r\n') + '\r\n';
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
