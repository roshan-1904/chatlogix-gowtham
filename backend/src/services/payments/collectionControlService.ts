import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { getPaymentLinkService } from '../paymentLinkService.js';

async function writeAudit(input: {
  vendorId: string;
  changedBy: string;
  oldValue: string;
  newValue: string;
}): Promise<void> {
  await prisma.vendorSettlementControlAudit.create({
    data: {
      id: randomUUID(),
      vendorId: input.vendorId,
      changedBy: input.changedBy,
      field: 'paymentsManagedByChatlogix',
      oldValue: input.oldValue,
      newValue: input.newValue,
      reason: 'collection_disabled'
    }
  });
}

/**
 * Turns managed collection off, cancels every open payment link for the shop,
 * and leaves held settlement money on its existing release schedule.
 */
export async function disablePaymentCollection(input: {
  vendorId: string;
  changedBy: string;
}): Promise<{ paymentsManagedByChatlogix: false; cancelledLinkCount: number }> {
  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }
  if (!vendor.paymentsManagedByChatlogix) {
    return { paymentsManagedByChatlogix: false, cancelledLinkCount: 0 };
  }

  const openLinks = await prisma.paymentLink.findMany({
    where: { vendorId: input.vendorId, status: 'created' },
    select: { orderId: true }
  });
  const orderIds = [...new Set(openLinks.map((l) => l.orderId))];
  const linkService = getPaymentLinkService();
  for (const orderId of orderIds) {
    await linkService.cancelOpenLinksForOrder(orderId);
  }

  await prisma.vendor.update({
    where: { id: input.vendorId },
    data: { paymentsManagedByChatlogix: false }
  });

  await writeAudit({
    vendorId: input.vendorId,
    changedBy: input.changedBy,
    oldValue: 'true',
    newValue: 'false'
  });

  return { paymentsManagedByChatlogix: false, cancelledLinkCount: openLinks.length };
}
