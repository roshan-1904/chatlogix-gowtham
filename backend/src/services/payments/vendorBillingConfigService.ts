import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { clampPaymentFeeBps } from './settlementMath.js';

async function writeBillingAudit(input: {
  vendorId: string;
  changedBy: string;
  field: string;
  oldValue: string;
  newValue: string;
}): Promise<void> {
  await prisma.vendorSettlementControlAudit.create({
    data: {
      id: randomUUID(),
      vendorId: input.vendorId,
      changedBy: input.changedBy,
      field: input.field,
      oldValue: input.oldValue,
      newValue: input.newValue,
      reason: 'billing_config'
    }
  });
}

export async function patchVendorBillingConfig(input: {
  vendorId: string;
  changedBy: string;
  markupPercent?: number;
  paymentFeeBps?: number;
}): Promise<{ id: string; markupPercent: number; paymentFeeBps: number }> {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }

  const data: { markupPercent?: number; paymentFeeBps?: number } = {};
  const audits: Array<{ field: string; oldValue: string; newValue: string }> = [];

  if (input.markupPercent !== undefined && input.markupPercent !== vendor.markupPercent) {
    data.markupPercent = input.markupPercent;
    audits.push({
      field: 'markupPercent',
      oldValue: String(vendor.markupPercent),
      newValue: String(input.markupPercent)
    });
  }

  if (input.paymentFeeBps !== undefined) {
    const next = clampPaymentFeeBps(input.paymentFeeBps);
    if (next !== vendor.paymentFeeBps) {
      data.paymentFeeBps = next;
      audits.push({
        field: 'paymentFeeBps',
        oldValue: String(vendor.paymentFeeBps),
        newValue: String(next)
      });
    }
  }

  if (Object.keys(data).length === 0) {
    return { id: vendor.id, markupPercent: vendor.markupPercent, paymentFeeBps: vendor.paymentFeeBps };
  }

  const updated = await prisma.vendor.update({
    where: { id: input.vendorId },
    data,
    select: { id: true, markupPercent: true, paymentFeeBps: true }
  });

  for (const audit of audits) {
    await writeBillingAudit({ vendorId: input.vendorId, changedBy: input.changedBy, ...audit });
  }

  return updated;
}
