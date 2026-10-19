/**
 * Phase 10 — monthly GST TCS (GSTR-8) and 194-O TDS report arithmetic.
 * Amounts are paise unless noted.
 */

const IST = 'Asia/Kolkata';

/** IST calendar month key `YYYY-MM`. */
export function istYearMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  return `${year}-${month}`;
}

/** Inclusive UTC bounds for an IST calendar month. */
export function istMonthUtcRange(yearMonth: string): { start: Date; end: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) {
    throw new Error(`Invalid yearMonth: ${yearMonth}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid yearMonth: ${yearMonth}`);
  }
  const start = istLocalToUtc(year, month, 1, 0, 0, 0, 0);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = istLocalToUtc(nextYear, nextMonth, 1, 0, 0, 0, 0);
  return { start, end };
}

function istLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const offsetMs = istOffsetMs(new Date(guess));
  return new Date(guess - offsetMs);
}

function istOffsetMs(at: Date): number {
  const utc = at.getTime();
  const istWall = new Date(at.toLocaleString('en-US', { timeZone: IST }));
  return istWall.getTime() - utc;
}

export interface TaxPaymentSlice {
  id: string;
  vendorId: string;
  amountPaise: number;
  gstTcsPaise: number;
  tdsPaise: number;
  capturedAt: Date;
  /** TCS base for GSTR-8 (may exclude shop GST when configured). */
  tcsBasePaise: number;
}

export interface TaxRefundSlice {
  id: string;
  vendorId: string;
  customerPaymentId: string;
  amountPaise: number;
  processedAt: Date;
}

export interface VendorTaxMeta {
  vendorId: string;
  businessName: string;
  gstin: string | null;
  pan: string | null;
}

export interface Gstr8SupplierRow {
  vendorId: string;
  supplierGstin: string;
  supplierName: string;
  /** Table 3 — gross / net taxable value of supplies. */
  taxableValuePaise: number;
  /** Total TCS withheld for the month (after same-month refund reductions). */
  tcsTotalPaise: number;
  /** Split for filing; default all IGST when interstate filing is unknown. */
  tcsIgstPaise: number;
  tcsCgstPaise: number;
  tcsSgstPaise: number;
}

export interface Tds194oSupplierRow {
  vendorId: string;
  supplierPan: string | null;
  supplierName: string;
  grossSalesPaise: number;
  tdsPaise: number;
}

export interface MonthlyTaxReportTotals {
  paymentCount: number;
  grossCapturedPaise: number;
  gstTcsOnPaymentsPaise: number;
  tdsOnPaymentsPaise: number;
  sameMonthRefundPaise: number;
  gstTcsRefundReductionPaise: number;
  tdsRefundReductionPaise: number;
  netTaxableValuePaise: number;
  netGstTcsPaise: number;
  netTdsPaise: number;
}

export interface MonthlyTaxReports {
  yearMonth: string;
  gstr8: { table3: Gstr8SupplierRow[]; totals: MonthlyTaxReportTotals };
  tds194o: { suppliers: Tds194oSupplierRow[]; totals: MonthlyTaxReportTotals };
}

/** Proportional TCS/TDS attributable to a refund amount. */
export function proportionalWithheldPaise(
  refundPaise: number,
  paymentAmountPaise: number,
  withheldPaise: number
): number {
  if (refundPaise <= 0 || paymentAmountPaise <= 0 || withheldPaise <= 0) return 0;
  return Math.round((withheldPaise * refundPaise) / paymentAmountPaise);
}

export function tcsBasePaiseForPayment(
  amountPaise: number,
  gstTcsBaseExcludesShopGst: boolean,
  shopGstPaise: number
): number {
  if (!gstTcsBaseExcludesShopGst) return amountPaise;
  return Math.max(0, amountPaise - Math.max(0, shopGstPaise));
}

export function buildMonthlyTaxReports(input: {
  yearMonth: string;
  payments: TaxPaymentSlice[];
  refunds: TaxRefundSlice[];
  vendors: VendorTaxMeta[];
}): MonthlyTaxReports {
  const paymentById = new Map(input.payments.map((p) => [p.id, p]));
  const vendorById = new Map(input.vendors.map((v) => [v.vendorId, v]));

  const sameMonthRefunds = input.refunds.filter((r) => {
    const payment = paymentById.get(r.customerPaymentId);
    if (!payment) return false;
    return (
      istYearMonth(payment.capturedAt) === input.yearMonth &&
      istYearMonth(r.processedAt) === input.yearMonth
    );
  });

  type Acc = {
    taxableValuePaise: number;
    tcsTotalPaise: number;
    grossSalesPaise: number;
    tdsPaise: number;
    capturedPaise: number;
    tcsOnPayments: number;
    tdsOnPayments: number;
    refundPaise: number;
    tcsRefundReduction: number;
    tdsRefundReduction: number;
    paymentCount: number;
  };

  const accByVendor = new Map<string, Acc>();

  function accFor(vendorId: string): Acc {
    let row = accByVendor.get(vendorId);
    if (!row) {
      row = {
        taxableValuePaise: 0,
        tcsTotalPaise: 0,
        grossSalesPaise: 0,
        tdsPaise: 0,
        capturedPaise: 0,
        tcsOnPayments: 0,
        tdsOnPayments: 0,
        refundPaise: 0,
        tcsRefundReduction: 0,
        tdsRefundReduction: 0,
        paymentCount: 0
      };
      accByVendor.set(vendorId, row);
    }
    return row;
  }

  for (const payment of input.payments) {
    if (istYearMonth(payment.capturedAt) !== input.yearMonth) continue;
    const acc = accFor(payment.vendorId);
    acc.paymentCount += 1;
    acc.capturedPaise += payment.amountPaise;
    acc.tcsOnPayments += payment.gstTcsPaise;
    acc.tdsOnPayments += payment.tdsPaise;
    acc.taxableValuePaise += payment.tcsBasePaise;
    acc.tcsTotalPaise += payment.gstTcsPaise;
    acc.grossSalesPaise += payment.amountPaise;
    acc.tdsPaise += payment.tdsPaise;
  }

  for (const refund of sameMonthRefunds) {
    const payment = paymentById.get(refund.customerPaymentId);
    if (!payment) continue;
    const acc = accFor(refund.vendorId);
    acc.refundPaise += refund.amountPaise;
    const tcsCut = proportionalWithheldPaise(
      refund.amountPaise,
      payment.amountPaise,
      payment.gstTcsPaise
    );
    const tdsCut = proportionalWithheldPaise(
      refund.amountPaise,
      payment.amountPaise,
      payment.tdsPaise
    );
    const baseCut = proportionalWithheldPaise(
      refund.amountPaise,
      payment.amountPaise,
      payment.tcsBasePaise
    );
    acc.tcsRefundReduction += tcsCut;
    acc.tdsRefundReduction += tdsCut;
    acc.taxableValuePaise -= baseCut;
    acc.tcsTotalPaise -= tcsCut;
    acc.grossSalesPaise -= refund.amountPaise;
    acc.tdsPaise -= tdsCut;
  }

  const totalsFromAcc = (rows: Acc[]): MonthlyTaxReportTotals => {
    const sum = rows.reduce(
      (s, r) => ({
        paymentCount: s.paymentCount + r.paymentCount,
        grossCapturedPaise: s.grossCapturedPaise + r.capturedPaise,
        gstTcsOnPaymentsPaise: s.gstTcsOnPaymentsPaise + r.tcsOnPayments,
        tdsOnPaymentsPaise: s.tdsOnPaymentsPaise + r.tdsOnPayments,
        sameMonthRefundPaise: s.sameMonthRefundPaise + r.refundPaise,
        gstTcsRefundReductionPaise: s.gstTcsRefundReductionPaise + r.tcsRefundReduction,
        tdsRefundReductionPaise: s.tdsRefundReductionPaise + r.tdsRefundReduction,
        netTaxableValuePaise: s.netTaxableValuePaise + r.taxableValuePaise,
        netGstTcsPaise: s.netGstTcsPaise + r.tcsTotalPaise,
        netTdsPaise: s.netTdsPaise + r.tdsPaise
      }),
      {
        paymentCount: 0,
        grossCapturedPaise: 0,
        gstTcsOnPaymentsPaise: 0,
        tdsOnPaymentsPaise: 0,
        sameMonthRefundPaise: 0,
        gstTcsRefundReductionPaise: 0,
        tdsRefundReductionPaise: 0,
        netTaxableValuePaise: 0,
        netGstTcsPaise: 0,
        netTdsPaise: 0
      }
    );
    return sum;
  };

  const gstr8Rows: Gstr8SupplierRow[] = [];
  const tdsRows: Tds194oSupplierRow[] = [];
  const accList: Acc[] = [];

  for (const [vendorId, acc] of accByVendor) {
    if (
      acc.paymentCount === 0 &&
      acc.refundPaise === 0 &&
      acc.taxableValuePaise === 0 &&
      acc.tdsPaise === 0
    ) {
      continue;
    }
    accList.push(acc);
    const vendor = vendorById.get(vendorId);
    const name = vendor?.businessName ?? vendorId;
    const gstin = vendor?.gstin?.trim() || 'UNREGISTERED';
    gstr8Rows.push({
      vendorId,
      supplierGstin: gstin,
      supplierName: name,
      taxableValuePaise: Math.max(0, acc.taxableValuePaise),
      tcsTotalPaise: Math.max(0, acc.tcsTotalPaise),
      tcsIgstPaise: Math.max(0, acc.tcsTotalPaise),
      tcsCgstPaise: 0,
      tcsSgstPaise: 0
    });
    tdsRows.push({
      vendorId,
      supplierPan: vendor?.pan ?? null,
      supplierName: name,
      grossSalesPaise: Math.max(0, acc.grossSalesPaise),
      tdsPaise: Math.max(0, acc.tdsPaise)
    });
  }

  gstr8Rows.sort((a, b) => a.supplierGstin.localeCompare(b.supplierGstin));
  tdsRows.sort((a, b) => (a.supplierPan ?? '').localeCompare(b.supplierPan ?? ''));

  const totals = totalsFromAcc(accList);
  return {
    yearMonth: input.yearMonth,
    gstr8: { table3: gstr8Rows, totals },
    tds194o: { suppliers: tdsRows, totals }
  };
}

/** Paise to credit the shop when withheld tax is returned on a same-month refund (D2). */
export function withheldTaxRefundCreditPaise(
  refundPaise: number,
  payment: Pick<TaxPaymentSlice, 'amountPaise' | 'gstTcsPaise' | 'tdsPaise'>
): number {
  const tcs = proportionalWithheldPaise(refundPaise, payment.amountPaise, payment.gstTcsPaise);
  const tds = proportionalWithheldPaise(refundPaise, payment.amountPaise, payment.tdsPaise);
  return tcs + tds;
}
