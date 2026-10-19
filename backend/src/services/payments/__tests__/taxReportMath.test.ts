import { describe, expect, it } from 'vitest';
import {
  buildMonthlyTaxReports,
  proportionalWithheldPaise,
  withheldTaxRefundCreditPaise
} from '../taxReportMath.js';

describe('taxReportMath', () => {
  const vendors = [
    {
      vendorId: 'v1',
      businessName: 'Shop One',
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F'
    },
    {
      vendorId: 'v2',
      businessName: 'Shop Two',
      gstin: '27FGHIJ5678K1Z9',
      pan: 'FGHIJ5678K'
    }
  ];

  it('fixture month TCS and TDS totals match payment sums when there are no refunds', () => {
    const capturedAt = new Date('2026-10-15T10:00:00.000Z');
    const payments = [
      {
        id: 'p1',
        vendorId: 'v1',
        amountPaise: 100_000,
        gstTcsPaise: 500,
        tdsPaise: 100,
        capturedAt,
        tcsBasePaise: 100_000
      },
      {
        id: 'p2',
        vendorId: 'v2',
        amountPaise: 50_000,
        gstTcsPaise: 250,
        tdsPaise: 50,
        capturedAt,
        tcsBasePaise: 50_000
      }
    ];

    const reports = buildMonthlyTaxReports({
      yearMonth: '2026-10',
      payments,
      refunds: [],
      vendors
    });

    const sumTcs = payments.reduce((s, p) => s + p.gstTcsPaise, 0);
    const sumTds = payments.reduce((s, p) => s + p.tdsPaise, 0);
    expect(reports.gstr8.totals.netGstTcsPaise).toBe(sumTcs);
    expect(reports.tds194o.totals.netTdsPaise).toBe(sumTds);
    expect(reports.gstr8.totals.gstTcsOnPaymentsPaise).toBe(sumTcs);
    expect(reports.tds194o.totals.tdsOnPaymentsPaise).toBe(sumTds);
    expect(reports.gstr8.table3).toHaveLength(2);
  });

  it('same-month refunds reduce taxable value and withheld tax in the report', () => {
    const capturedAt = new Date('2026-10-10T06:30:00.000Z');
    const processedAt = new Date('2026-10-20T06:30:00.000Z');
    const payments = [
      {
        id: 'p1',
        vendorId: 'v1',
        amountPaise: 100_000,
        gstTcsPaise: 500,
        tdsPaise: 100,
        capturedAt,
        tcsBasePaise: 100_000
      }
    ];
    const refunds = [
      {
        id: 'r1',
        vendorId: 'v1',
        customerPaymentId: 'p1',
        amountPaise: 40_000,
        processedAt
      }
    ];

    const reports = buildMonthlyTaxReports({
      yearMonth: '2026-10',
      payments,
      refunds,
      vendors: [vendors[0]!]
    });

    const tcsCut = proportionalWithheldPaise(40_000, 100_000, 500);
    const tdsCut = proportionalWithheldPaise(40_000, 100_000, 100);
    expect(reports.gstr8.totals.netGstTcsPaise).toBe(500 - tcsCut);
    expect(reports.tds194o.totals.netTdsPaise).toBe(100 - tdsCut);
    expect(reports.gstr8.totals.netTaxableValuePaise).toBe(100_000 - 40_000);
    expect(reports.gstr8.table3[0]?.taxableValuePaise).toBe(60_000);
  });

  it('refunds in a later month do not reduce the capture month report', () => {
    const capturedAt = new Date('2026-10-05T06:30:00.000Z');
    const processedAt = new Date('2026-11-05T06:30:00.000Z');
    const payments = [
      {
        id: 'p1',
        vendorId: 'v1',
        amountPaise: 100_000,
        gstTcsPaise: 500,
        tdsPaise: 100,
        capturedAt,
        tcsBasePaise: 100_000
      }
    ];
    const refunds = [
      {
        id: 'r1',
        vendorId: 'v1',
        customerPaymentId: 'p1',
        amountPaise: 100_000,
        processedAt
      }
    ];

    const reports = buildMonthlyTaxReports({
      yearMonth: '2026-10',
      payments,
      refunds,
      vendors: [vendors[0]!]
    });

    expect(reports.gstr8.totals.netGstTcsPaise).toBe(500);
    expect(reports.tds194o.totals.netTdsPaise).toBe(100);
  });

  it('withheldTaxRefundCreditPaise sums proportional TCS and TDS', () => {
    const credit = withheldTaxRefundCreditPaise(50_000, {
      amountPaise: 100_000,
      gstTcsPaise: 500,
      tdsPaise: 100
    });
    expect(credit).toBe(250 + 50);
  });
});
