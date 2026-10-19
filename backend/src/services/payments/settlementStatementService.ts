import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { bigintToDecimalString } from '../../utils/bigIntJson.js';
import {
  buildMonthlyStatement,
  formatStatementCsv,
  istCalendarMonthUtcRange,
  SETTLEMENT_STATEMENT_TZ,
  type BuiltMonthlyStatement,
  type StatementMovements
} from './settlementStatementMath.js';

export interface SettlementStatementResponse {
  vendorId: string;
  shopName: string;
  year: number;
  month: number;
  timezone: typeof SETTLEMENT_STATEMENT_TZ;
  periodStart: string;
  periodEndExclusive: string;
  openingBalanceMilli: string;
  closingBalanceMilli: string;
  ledgerNetChangeMilli: string;
  ledgerSumAtCloseMilli: string;
  balances: boolean;
  ledgerMatchesClosing: boolean;
  movements: {
    grossCollectedPaise: number;
    gatewayFeePaise: number;
    gatewayTaxPaise: number;
    platformFeePaise: number;
    platformFeeGstPaise: number;
    gstTcsPaise: number;
    tdsPaise: number;
    netCollectedMilli: string;
    reservePaise: number;
    releasesMilli: string;
    refundsMilli: string;
    fundingMilli: string;
    disputeCreditsMilli: string;
    disputeDebitsMilli: string;
    adjustmentsMilli: string;
  };
}

function bigintField(value: bigint | null | undefined): string {
  return bigintToDecimalString(value) ?? '0';
}

function serializeMovements(m: StatementMovements): SettlementStatementResponse['movements'] {
  return {
    grossCollectedPaise: m.grossCollectedPaise,
    gatewayFeePaise: m.gatewayFeePaise,
    gatewayTaxPaise: m.gatewayTaxPaise,
    platformFeePaise: m.platformFeePaise,
    platformFeeGstPaise: m.platformFeeGstPaise,
    gstTcsPaise: m.gstTcsPaise,
    tdsPaise: m.tdsPaise,
    netCollectedMilli: bigintField(m.netCollectedMilli),
    reservePaise: m.reservePaise,
    releasesMilli: bigintField(m.releasesMilli),
    refundsMilli: bigintField(m.refundsMilli),
    fundingMilli: bigintField(m.fundingMilli),
    disputeCreditsMilli: bigintField(m.disputeCreditsMilli),
    disputeDebitsMilli: bigintField(m.disputeDebitsMilli),
    adjustmentsMilli: bigintField(m.adjustmentsMilli)
  };
}

function serializeStatement(
  vendorId: string,
  shopName: string,
  year: number,
  month: number,
  start: Date,
  endExclusive: Date,
  built: BuiltMonthlyStatement
): SettlementStatementResponse {
  return {
    vendorId,
    shopName,
    year,
    month,
    timezone: SETTLEMENT_STATEMENT_TZ,
    periodStart: start.toISOString(),
    periodEndExclusive: endExclusive.toISOString(),
    openingBalanceMilli: bigintField(built.openingBalanceMilli),
    closingBalanceMilli: bigintField(built.closingBalanceMilli),
    ledgerNetChangeMilli: bigintField(built.ledgerNetChangeMilli),
    ledgerSumAtCloseMilli: bigintField(built.ledgerSumAtCloseMilli),
    balances: built.balances,
    ledgerMatchesClosing: built.ledgerMatchesClosing,
    movements: serializeMovements(built.movements)
  };
}

export async function getVendorSettlementStatement(
  vendorId: string,
  year: number,
  month: number
): Promise<SettlementStatementResponse> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, businessName: true }
  });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }

  const { start, endExclusive } = istCalendarMonthUtcRange(year, month);

  const [entries, payments, transfers] = await Promise.all([
    prisma.settlementEntry.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'asc' },
      select: {
        amountMilli: true,
        direction: true,
        kind: true,
        balanceAfterMilli: true,
        createdAt: true
      }
    }),
    prisma.customerPayment.findMany({
      where: { vendorId },
      select: {
        amountPaise: true,
        gatewayFeePaise: true,
        gatewayTaxPaise: true,
        platformFeePaise: true,
        platformFeeGstPaise: true,
        gstTcsPaise: true,
        tdsPaise: true,
        netMilli: true,
        capturedAt: true,
        settlementAlert: true
      }
    }),
    prisma.settlementTransfer.findMany({
      where: { vendorId },
      select: {
        kind: true,
        amountPaise: true,
        reversedPaise: true,
        createdAt: true
      }
    })
  ]);

  const built = buildMonthlyStatement({
    entries,
    payments,
    transfers,
    start,
    endExclusive
  });

  return serializeStatement(
    vendor.id,
    vendor.businessName,
    year,
    month,
    start,
    endExclusive,
    built
  );
}

export async function getVendorSettlementStatementCsv(
  vendorId: string,
  year: number,
  month: number
): Promise<{ filename: string; body: string }> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, businessName: true }
  });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }

  const { start, endExclusive } = istCalendarMonthUtcRange(year, month);
  const [entries, payments, transfers] = await Promise.all([
    prisma.settlementEntry.findMany({
      where: { vendorId },
      orderBy: { createdAt: 'asc' },
      select: {
        amountMilli: true,
        direction: true,
        kind: true,
        balanceAfterMilli: true,
        createdAt: true
      }
    }),
    prisma.customerPayment.findMany({
      where: { vendorId },
      select: {
        amountPaise: true,
        gatewayFeePaise: true,
        gatewayTaxPaise: true,
        platformFeePaise: true,
        platformFeeGstPaise: true,
        gstTcsPaise: true,
        tdsPaise: true,
        netMilli: true,
        capturedAt: true,
        settlementAlert: true
      }
    }),
    prisma.settlementTransfer.findMany({
      where: { vendorId },
      select: {
        kind: true,
        amountPaise: true,
        reversedPaise: true,
        createdAt: true
      }
    })
  ]);

  const built = buildMonthlyStatement({ entries, payments, transfers, start, endExclusive });
  const body = formatStatementCsv({
    shopLabel: vendor.businessName,
    year,
    month,
    periodStart: start,
    periodEndExclusive: endExclusive,
    statement: built
  });
  const filename = `settlement-statement-${year}-${String(month).padStart(2, '0')}.csv`;
  return { filename, body };
}
