import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { getSettlementPosition } from './settlementService.js';

const RESERVE_BPS_MAX = 2000;

async function writeAudit(input: {
  vendorId: string;
  changedBy: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason?: string | null;
}): Promise<void> {
  await prisma.vendorSettlementControlAudit.create({
    data: {
      id: randomUUID(),
      vendorId: input.vendorId,
      changedBy: input.changedBy,
      field: input.field,
      oldValue: input.oldValue,
      newValue: input.newValue,
      reason: input.reason ?? null
    }
  });
}

export async function freezeVendorReleases(input: {
  vendorId: string;
  reason: string;
  changedBy: string;
}): Promise<void> {
  const reason = input.reason.trim();
  if (reason.length < 3) {
    throw createError('Freeze reason is required', 400, ErrorType.VALIDATION);
  }
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  const now = new Date();
  await prisma.vendor.update({
    where: { id: input.vendorId },
    data: { releasesFrozenAt: now, releasesFrozenReason: reason }
  });
  await writeAudit({
    vendorId: input.vendorId,
    changedBy: input.changedBy,
    field: 'releasesFrozenAt',
    oldValue: vendor.releasesFrozenAt?.toISOString() ?? null,
    newValue: now.toISOString(),
    reason
  });
}

export async function unfreezeVendorReleases(input: {
  vendorId: string;
  changedBy: string;
}): Promise<void> {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  const openDispute = await prisma.customerPayment.findFirst({
    where: { vendorId: input.vendorId, disputeStatus: 'open' }
  });
  if (openDispute) {
    throw createError('Cannot unfreeze while a dispute is open', 409, ErrorType.PAYMENT);
  }
  await prisma.vendor.update({
    where: { id: input.vendorId },
    data: { releasesFrozenAt: null, releasesFrozenReason: null }
  });
  await writeAudit({
    vendorId: input.vendorId,
    changedBy: input.changedBy,
    field: 'releasesFrozenAt',
    oldValue: vendor.releasesFrozenAt?.toISOString() ?? null,
    newValue: null,
    reason: 'admin_unfreeze'
  });
}

export async function setVendorRollingReserveBps(input: {
  vendorId: string;
  rollingReserveBps: number;
  changedBy: string;
}): Promise<{ rollingReserveBps: number }> {
  const bps = input.rollingReserveBps;
  if (!Number.isInteger(bps) || bps < 0 || bps > RESERVE_BPS_MAX) {
    throw createError(`rollingReserveBps must be 0–${RESERVE_BPS_MAX}`, 400, ErrorType.VALIDATION);
  }
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  await prisma.vendor.update({
    where: { id: input.vendorId },
    data: { rollingReserveBps: bps }
  });
  await writeAudit({
    vendorId: input.vendorId,
    changedBy: input.changedBy,
    field: 'rollingReserveBps',
    oldValue: String(vendor.rollingReserveBps),
    newValue: String(bps)
  });
  return { rollingReserveBps: bps };
}

export async function getAdminSettlementView(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      releasesFrozenAt: true,
      releasesFrozenReason: true,
      rollingReserveBps: true,
      settlementBankChangedAt: true,
      paymentsManagedByChatlogix: true
    }
  });
  if (!vendor) throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  const position = await getSettlementPosition(vendorId);
  const releasedEntries = await prisma.settlementEntry.aggregate({
    where: { vendorId, kind: 'transfer_release' },
    _sum: { amountMilli: true }
  });
  const audits = await prisma.vendorSettlementControlAudit.findMany({
    where: { vendorId },
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  return {
    ...vendor,
    position: {
      balanceMilli: position.balanceMilli.toString(),
      heldMilli: position.heldMilli.toString(),
      reserveMilli: position.reserveMilli.toString(),
      owedMilli: position.owedMilli.toString(),
      releasedMilli: (releasedEntries._sum.amountMilli ?? 0n).toString(),
      nextReleaseAt: position.nextReleaseAt?.toISOString() ?? null,
      asOf: position.asOf.toISOString()
    },
    recentAudits: audits
  };
}
