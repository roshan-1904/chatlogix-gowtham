import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { logger } from '../../logger.js';
import {
  aggregatePlatformFeeInvoice,
  formatInvoiceDisplay,
  formatInrFromPaise
} from './platformFeeInvoiceMath.js';
import {
  istDayOfMonth,
  istMonthKey,
  istMonthRangeUtc,
  previousIstMonthKey
} from './platformFeeInvoiceMonth.js';
import { resolveGatewayFeeInvoiceLineMode } from './platformFeeInvoiceD3.js';
import { buildPlatformFeeInvoicePdf, sha256Hex } from './platformFeeInvoicePdf.js';
import {
  presignPlatformFeeInvoicePdf,
  readLocalPlatformFeeInvoicePdf,
  storePlatformFeeInvoicePdf
} from './platformFeeInvoiceStorage.js';

export class PlatformFeeInvoiceAlreadyIssuedError extends Error {
  statusCode = 409;
  constructor(vendorId: string, monthKey: string) {
    super(`Platform fee invoice already issued for vendor ${vendorId} month ${monthKey}`);
    this.name = 'PlatformFeeInvoiceAlreadyIssuedError';
  }
}

/** Stub — issued invoices are never regenerated; corrections go through credit notes. */
export class PlatformFeeCreditNoteNotAvailableError extends Error {
  statusCode = 501;
  constructor() {
    super('Credit notes for platform fee invoices are not available yet');
    this.name = 'PlatformFeeCreditNoteNotAvailableError';
  }
}

export async function requestPlatformFeeCreditNote(_input: {
  invoiceId: string;
  reason: string;
}): Promise<never> {
  throw new PlatformFeeCreditNoteNotAvailableError();
}

const CAPTURED_STATUSES = ['captured', 'partially_refunded', 'refunded'] as const;

function supplierDetails(): { legalName: string; gstin: string } {
  return {
    legalName: env.CHATLOGIX_LEGAL_NAME?.trim() || 'ChatLogix Technologies Private Limited',
    gstin: env.CHATLOGIX_GSTIN?.trim() || 'GSTIN_PENDING'
  };
}

export async function loadPlatformFeeInvoiceTotals(
  vendorId: string,
  monthKey: string
): Promise<ReturnType<typeof aggregatePlatformFeeInvoice>> {
  const { startInclusive, endExclusive } = istMonthRangeUtc(monthKey);
  const payments = await prisma.customerPayment.findMany({
    where: {
      vendorId,
      status: { in: [...CAPTURED_STATUSES] },
      capturedAt: { gte: startInclusive, lt: endExclusive },
      platformFeePaise: { gt: 0 }
    },
    select: {
      platformFeePaise: true,
      platformFeeGstPaise: true,
      gatewayFeePaise: true,
      gatewayTaxPaise: true
    }
  });
  return aggregatePlatformFeeInvoice({ payments });
}

export async function issuePlatformFeeInvoiceForVendor(input: {
  vendorId: string;
  monthKey: string;
  issuedAt?: Date;
}): Promise<{ id: string; invoiceDisplay: string; invoiceNumber: number }> {
  const issuedAt = input.issuedAt ?? new Date();
  const existing = await prisma.vendorPlatformFeeInvoice.findUnique({
    where: { vendorId_monthKey: { vendorId: input.vendorId, monthKey: input.monthKey } },
    select: { id: true, invoiceDisplay: true, invoiceNumber: true }
  });
  if (existing) {
    throw new PlatformFeeInvoiceAlreadyIssuedError(input.vendorId, input.monthKey);
  }

  const [vendor, totals] = await Promise.all([
    prisma.vendor.findUnique({
      where: { id: input.vendorId },
      select: { id: true, legalName: true, businessName: true, gstin: true, gstExempt: true }
    }),
    loadPlatformFeeInvoiceTotals(input.vendorId, input.monthKey)
  ]);
  if (!vendor) {
    throw Object.assign(new Error('Vendor not found'), { statusCode: 404 });
  }
  if (totals.platformFeePaise <= 0) {
    throw Object.assign(new Error('No platform fees to invoice for this month'), { statusCode: 422 });
  }

  const gatewayLineMode = resolveGatewayFeeInvoiceLineMode();
  const supplier = supplierDetails();
  const recipientLegalName = vendor.legalName?.trim() || vendor.businessName;
  const recipientGstin = vendor.gstExempt ? null : vendor.gstin;

  const { invoiceNumber, invoiceDisplay } = await prisma.$transaction(async (tx) => {
    const again = await tx.vendorPlatformFeeInvoice.findUnique({
      where: { vendorId_monthKey: { vendorId: input.vendorId, monthKey: input.monthKey } }
    });
    if (again) {
      throw new PlatformFeeInvoiceAlreadyIssuedError(input.vendorId, input.monthKey);
    }
    const seq = await tx.platformFeeInvoiceSequence.upsert({
      where: { id: 'default' },
      create: { id: 'default', nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
      select: { nextNumber: true }
    });
    const number = seq.nextNumber - 1;
    return { invoiceNumber: number, invoiceDisplay: formatInvoiceDisplay(number, issuedAt) };
  });

  const pdf = buildPlatformFeeInvoicePdf({
    invoiceDisplay,
    monthKey: input.monthKey,
    issuedAt,
    supplierLegalName: supplier.legalName,
    supplierGstin: supplier.gstin,
    recipientLegalName,
    recipientGstin,
    totals,
    gatewayLineMode
  });
  const pdfSha256 = sha256Hex(pdf);
  const { pdfS3Key } = await storePlatformFeeInvoicePdf({
    vendorId: input.vendorId,
    monthKey: input.monthKey,
    invoiceDisplay,
    pdf
  });

  let seqRow: { id: string; invoiceDisplay: string; invoiceNumber: number };
  try {
    seqRow = await prisma.vendorPlatformFeeInvoice.create({
      data: {
        vendorId: input.vendorId,
        monthKey: input.monthKey,
        invoiceNumber,
        invoiceDisplay,
        platformFeePaise: totals.platformFeePaise,
        platformFeeTaxablePaise: totals.platformFeeTaxablePaise,
        platformFeeGstPaise: totals.platformFeeGstPaise,
        gatewayFeePaise: totals.gatewayFeePaise,
        gatewayTaxPaise: totals.gatewayTaxPaise,
        gatewayLineMode,
        paymentCount: totals.paymentCount,
        pdfS3Key,
        pdfSha256,
        issuedAt
      },
      select: { id: true, invoiceDisplay: true, invoiceNumber: true }
    });
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      throw new PlatformFeeInvoiceAlreadyIssuedError(input.vendorId, input.monthKey);
    }
    throw err;
  }

  logger.info(
    {
      vendorId: input.vendorId,
      monthKey: input.monthKey,
      invoiceDisplay: seqRow.invoiceDisplay,
      platformFeePaise: totals.platformFeePaise,
      platformFeeTaxablePaise: totals.platformFeeTaxablePaise,
      platformFeeGstPaise: totals.platformFeeGstPaise
    },
    'platform fee invoice issued'
  );

  return seqRow;
}

export async function issuePlatformFeeInvoicesForMonth(monthKey: string): Promise<number> {
  const { startInclusive, endExclusive } = istMonthRangeUtc(monthKey);
  const groups = await prisma.customerPayment.groupBy({
    by: ['vendorId'],
    where: {
      status: { in: [...CAPTURED_STATUSES] },
      capturedAt: { gte: startInclusive, lt: endExclusive },
      platformFeePaise: { gt: 0 }
    },
    _sum: { platformFeePaise: true }
  });

  let issued = 0;
  for (const group of groups) {
    if ((group._sum.platformFeePaise ?? 0) <= 0) continue;
    try {
      await issuePlatformFeeInvoiceForVendor({ vendorId: group.vendorId, monthKey });
      issued += 1;
    } catch (err) {
      if (err instanceof PlatformFeeInvoiceAlreadyIssuedError) continue;
      logger.error({ err, vendorId: group.vendorId, monthKey }, 'platform fee invoice issue failed');
    }
  }
  return issued;
}

/** On the 1st (IST), invoice the previous calendar month for every shop with fees. */
export async function issueDuePlatformFeeInvoices(now: Date = new Date()): Promise<number> {
  if (istDayOfMonth(now) !== 1) return 0;
  const monthKey = previousIstMonthKey(now);
  const issued = await issuePlatformFeeInvoicesForMonth(monthKey);
  logger.info({ monthKey, issued }, 'platform fee invoice month batch complete');
  return issued;
}

export async function listVendorPlatformFeeInvoices(vendorId: string) {
  const rows = await prisma.vendorPlatformFeeInvoice.findMany({
    where: { vendorId },
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      monthKey: true,
      invoiceDisplay: true,
      invoiceNumber: true,
      platformFeePaise: true,
      platformFeeTaxablePaise: true,
      platformFeeGstPaise: true,
      gatewayFeePaise: true,
      gatewayTaxPaise: true,
      gatewayLineMode: true,
      paymentCount: true,
      issuedAt: true
    }
  });
  return rows.map((row) => ({
    ...row,
    issuedAt: row.issuedAt.toISOString(),
    platformFeeInr: formatInrFromPaise(row.platformFeePaise),
    platformFeeTaxableInr: formatInrFromPaise(row.platformFeeTaxablePaise),
    platformFeeGstInr: formatInrFromPaise(row.platformFeeGstPaise)
  }));
}

export async function getPlatformFeeInvoicePdfForVendor(input: {
  vendorId: string;
  invoiceId: string;
}): Promise<{ buffer: Buffer; filename: string } | { redirectUrl: string; filename: string }> {
  const row = await prisma.vendorPlatformFeeInvoice.findFirst({
    where: { id: input.invoiceId, vendorId: input.vendorId },
    select: { pdfS3Key: true, invoiceDisplay: true }
  });
  if (!row) {
    throw Object.assign(new Error('Invoice not found'), { statusCode: 404 });
  }
  const filename = `${row.invoiceDisplay}.pdf`;
  const presigned = await presignPlatformFeeInvoicePdf(row.pdfS3Key);
  if (presigned) {
    return { redirectUrl: presigned, filename };
  }
  const local = await readLocalPlatformFeeInvoicePdf(row.pdfS3Key);
  if (!local) {
    throw Object.assign(new Error('Invoice PDF not available'), { statusCode: 404 });
  }
  return { buffer: local, filename };
}

export type OffboardingInvoiceSnapshot = {
  settlementOwedMilli: string;
  platformFeeInvoiceIds: string[];
  monthKeysInvoiced: string[];
};

/**
 * Issues the current IST month's platform-fee invoice when fees exist, and records
 * settlement debt still owed after collection stops (refund shortfalls, disputes).
 */
export async function finalizeInvoicesForShopOffboarding(input: {
  vendorId: string;
  changedBy: string;
  settlementOwedMilli: bigint;
  issuedAt?: Date;
}): Promise<OffboardingInvoiceSnapshot> {
  const issuedAt = input.issuedAt ?? new Date();
  const monthKey = istMonthKey(issuedAt);
  const monthKeysInvoiced: string[] = [];
  const platformFeeInvoiceIds: string[] = [];

  try {
    const row = await issuePlatformFeeInvoiceForVendor({
      vendorId: input.vendorId,
      monthKey,
      issuedAt
    });
    platformFeeInvoiceIds.push(row.id);
    monthKeysInvoiced.push(monthKey);
  } catch (err) {
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err
        ? (err as { statusCode: number }).statusCode
        : undefined;
    if (
      !(err instanceof PlatformFeeInvoiceAlreadyIssuedError) &&
      statusCode !== 422
    ) {
      throw err;
    }
  }

  const snapshot: OffboardingInvoiceSnapshot = {
    settlementOwedMilli: input.settlementOwedMilli.toString(),
    platformFeeInvoiceIds,
    monthKeysInvoiced
  };

  await prisma.vendorSettlementControlAudit.create({
    data: {
      id: randomUUID(),
      vendorId: input.vendorId,
      changedBy: input.changedBy,
      field: 'offboarding_invoice_snapshot',
      oldValue: null,
      newValue: JSON.stringify(snapshot),
      reason: 'offboarding'
    }
  });

  return snapshot;
}
