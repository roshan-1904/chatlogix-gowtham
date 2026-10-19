/**
 * Phase 10 — monthly GST TCS (GSTR-8) and 194-O TDS reports from CustomerPayment.
 */

import { prisma } from '../../db/prisma.js';
import { decryptWhatsAppToken } from '../../utils/whatsappTokenCrypto.js';
import { getPlatformSettings } from '../platformSettingsService.js';
import { creditWithheldTaxRefundAdjustmentTx } from './settlementService.js';
import {
  buildMonthlyTaxReports,
  istMonthUtcRange,
  istYearMonth,
  tcsBasePaiseForPayment,
  type MonthlyTaxReports,
  type TaxPaymentSlice,
  type TaxRefundSlice,
  type VendorTaxMeta,
  withheldTaxRefundCreditPaise
} from './taxReportMath.js';

export type { MonthlyTaxReports };

const CAPTURED_STATUSES = ['captured', 'partially_refunded', 'refunded'] as const;

function vendorPanPlain(panEncrypted: string | null): string | null {
  if (!panEncrypted) return null;
  try {
    return decryptWhatsAppToken(panEncrypted).toUpperCase();
  } catch {
    return null;
  }
}

function yearMonthSchema(value: string): string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) {
    throw new Error('yearMonth must be YYYY-MM');
  }
  return trimmed;
}

async function loadTaxReportInputs(yearMonth: string): Promise<{
  payments: TaxPaymentSlice[];
  refunds: TaxRefundSlice[];
  vendors: VendorTaxMeta[];
}> {
  const settings = getPlatformSettings();
  const { start, end } = istMonthUtcRange(yearMonth);

  const paymentRows = await prisma.customerPayment.findMany({
    where: {
      status: { in: [...CAPTURED_STATUSES] },
      capturedAt: { gte: start, lt: end }
    },
    select: {
      id: true,
      vendorId: true,
      amountPaise: true,
      gstTcsPaise: true,
      tdsPaise: true,
      capturedAt: true
    }
  });

  const vendorIds = [...new Set(paymentRows.map((p) => p.vendorId))];
  const vendorRows =
    vendorIds.length === 0
      ? []
      : await prisma.vendor.findMany({
          where: { id: { in: vendorIds } },
          select: {
            id: true,
            businessName: true,
            gstin: true,
            panEncrypted: true
          }
        });

  const refunds =
    vendorIds.length === 0
      ? []
      : await prisma.customerRefund.findMany({
          where: {
            status: 'processed',
            vendorId: { in: vendorIds },
            updatedAt: { gte: start, lt: end }
          },
          select: {
            id: true,
            vendorId: true,
            customerPaymentId: true,
            amountPaise: true,
            updatedAt: true
          }
        });

  const payments: TaxPaymentSlice[] = paymentRows.map((p) => ({
    id: p.id,
    vendorId: p.vendorId,
    amountPaise: p.amountPaise,
    gstTcsPaise: p.gstTcsPaise,
    tdsPaise: p.tdsPaise,
    capturedAt: p.capturedAt,
    tcsBasePaise: tcsBasePaiseForPayment(
      p.amountPaise,
      settings.gstTcsBaseExcludesShopGst,
      0
    )
  }));

  const refundSlices: TaxRefundSlice[] = refunds.map((r) => ({
    id: r.id,
    vendorId: r.vendorId,
    customerPaymentId: r.customerPaymentId,
    amountPaise: r.amountPaise,
    processedAt: r.updatedAt
  }));

  const vendors: VendorTaxMeta[] = vendorRows.map((v) => ({
    vendorId: v.id,
    businessName: v.businessName,
    gstin: v.gstin,
    pan: vendorPanPlain(v.panEncrypted)
  }));

  return { payments, refunds: refundSlices, vendors };
}

export async function getMonthlyTaxReports(yearMonthInput: string): Promise<MonthlyTaxReports> {
  const yearMonth = yearMonthSchema(yearMonthInput);
  const input = await loadTaxReportInputs(yearMonth);
  return buildMonthlyTaxReports({ yearMonth, ...input });
}

export interface CloseTaxMonthResult {
  yearMonth: string;
  alreadyClosed: boolean;
  closedAt: string;
  adjustmentCount: number;
  reports: MonthlyTaxReports;
}

export async function closeTaxReportMonth(
  yearMonthInput: string,
  closedBy?: string
): Promise<CloseTaxMonthResult> {
  const yearMonth = yearMonthSchema(yearMonthInput);
  const existing = await prisma.taxReportMonthClose.findUnique({ where: { yearMonth } });
  const reports = await getMonthlyTaxReports(yearMonth);

  if (existing) {
    return {
      yearMonth,
      alreadyClosed: true,
      closedAt: existing.closedAt.toISOString(),
      adjustmentCount: existing.adjustmentCount,
      reports
    };
  }

  const settings = getPlatformSettings();
  let adjustmentCount = 0;

  if (settings.refundReturnsWithheldTaxToShop) {
    const { start, end } = istMonthUtcRange(yearMonth);
    const refunds = await prisma.customerRefund.findMany({
      where: {
        status: 'processed',
        updatedAt: { gte: start, lt: end }
      },
      include: {
        customerPayment: {
          select: {
            id: true,
            vendorId: true,
            amountPaise: true,
            gstTcsPaise: true,
            tdsPaise: true,
            capturedAt: true
          }
        }
      }
    });

    for (const refund of refunds) {
      const payment = refund.customerPayment;
      if (!payment) continue;
      if (istYearMonth(payment.capturedAt) !== yearMonth) continue;
      if (istYearMonth(refund.updatedAt) !== yearMonth) continue;

      const creditPaise = withheldTaxRefundCreditPaise(refund.amountPaise, {
        amountPaise: payment.amountPaise,
        gstTcsPaise: payment.gstTcsPaise,
        tdsPaise: payment.tdsPaise
      });
      if (creditPaise <= 0) continue;

      const credited = await prisma.$transaction((tx) =>
        creditWithheldTaxRefundAdjustmentTx(tx, {
          vendorId: refund.vendorId,
          customerPaymentId: payment.id,
          customerRefundId: refund.id,
          yearMonth,
          creditPaise
        })
      );
      if (credited) adjustmentCount += 1;
    }
  }

  const row = await prisma.taxReportMonthClose.create({
    data: {
      yearMonth,
      closedBy: closedBy ?? null,
      adjustmentCount
    }
  });

  return {
    yearMonth,
    alreadyClosed: false,
    closedAt: row.closedAt.toISOString(),
    adjustmentCount,
    reports
  };
}

export async function getTaxMonthCloseStatus(yearMonthInput: string): Promise<{
  yearMonth: string;
  closed: boolean;
  closedAt: string | null;
  adjustmentCount: number;
}> {
  const yearMonth = yearMonthSchema(yearMonthInput);
  const row = await prisma.taxReportMonthClose.findUnique({ where: { yearMonth } });
  return {
    yearMonth,
    closed: row != null,
    closedAt: row?.closedAt.toISOString() ?? null,
    adjustmentCount: row?.adjustmentCount ?? 0
  };
}
