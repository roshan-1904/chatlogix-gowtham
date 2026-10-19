import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { disablePaymentCollection } from './collectionControlService.js';
import { finalizeInvoicesForShopOffboarding } from './platformFeeInvoiceService.js';
import { getSettlementPosition } from './settlementService.js';

const ACTIVE_TRANSFER_STATUSES = ['on_hold', 'releasing', 'pending', 'to_create'] as const;

export type LinkedAccountRetention = {
  /** Linked account id is kept on the vendor row until this is true. */
  mayCloseLinkedAccount: boolean;
  activeTransferCount: number;
  openDisputeCount: number;
};

export async function assessLinkedAccountRetention(vendorId: string): Promise<LinkedAccountRetention> {
  const [activeTransferCount, openDisputeCount] = await Promise.all([
    prisma.settlementTransfer.count({
      where: { vendorId, status: { in: [...ACTIVE_TRANSFER_STATUSES] } }
    }),
    prisma.customerPayment.count({
      where: { vendorId, disputeStatus: 'open' }
    })
  ]);

  const mayCloseLinkedAccount = activeTransferCount === 0 && openDisputeCount === 0;

  return {
    mayCloseLinkedAccount,
    activeTransferCount,
    openDisputeCount
  };
}

/** Rule 10: money tables are tax records; vendors with payment ledger rows must not be hard-deleted. */
export async function vendorHasPaymentTaxRecords(vendorId: string): Promise<boolean> {
  const [payment, link, entry, transfer, refund] = await Promise.all([
    prisma.customerPayment.findFirst({ where: { vendorId }, select: { id: true } }),
    prisma.paymentLink.findFirst({ where: { vendorId }, select: { id: true } }),
    prisma.settlementEntry.findFirst({ where: { vendorId }, select: { id: true } }),
    prisma.settlementTransfer.findFirst({ where: { vendorId }, select: { id: true } }),
    prisma.customerRefund.findFirst({ where: { vendorId }, select: { id: true } })
  ]);
  return !!(payment || link || entry || transfer || refund);
}

export async function assertVendorDeletable(vendorId: string): Promise<void> {
  if (await vendorHasPaymentTaxRecords(vendorId)) {
    throw createError(
      'Shop has order payment records and cannot be deleted; deactivate instead',
      409,
      ErrorType.PAYMENT
    );
  }
}

export type OffboardVendorResult = {
  subscriptionStatus: 'deactivated';
  paymentsManagedByChatlogix: false;
  cancelledLinkCount: number;
  settlementBalanceMilli: string;
  owedMilli: string;
  ledgerEntryCount: number;
  linkedAccountId: string | null;
  linkedAccountRetention: LinkedAccountRetention;
  invoiceSnapshot: Awaited<ReturnType<typeof finalizeInvoicesForShopOffboarding>>;
};

/**
 * Shop leaving: same collection-off path (no new links, open links cancelled),
 * held money keeps its release schedule, owed amounts are snapshotted for invoicing,
 * linked account stays until transfers and disputes clear, vendor is deactivated not deleted.
 */
export async function offboardVendor(input: {
  vendorId: string;
  changedBy: string;
}): Promise<OffboardVendorResult> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: input.vendorId },
    select: {
      id: true,
      subscriptionStatus: true,
      settlementBalanceMilli: true,
      razorpayLinkedAccountId: true
    }
  });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }

  const ledgerEntryCountBefore = await prisma.settlementEntry.count({
    where: { vendorId: input.vendorId }
  });
  const balanceBefore = vendor.settlementBalanceMilli;

  const collection = await disablePaymentCollection({
    vendorId: input.vendorId,
    changedBy: input.changedBy
  });

  const position = await getSettlementPosition(input.vendorId);
  const ledgerEntryCountAfter = await prisma.settlementEntry.count({
    where: { vendorId: input.vendorId }
  });

  if (ledgerEntryCountAfter !== ledgerEntryCountBefore) {
    throw createError('Offboarding must not mutate the settlement ledger', 500, ErrorType.SYSTEM);
  }
  if (position.balanceMilli !== balanceBefore) {
    throw createError('Offboarding must not change settlement balance', 500, ErrorType.SYSTEM);
  }

  const invoiceSnapshot = await finalizeInvoicesForShopOffboarding({
    vendorId: input.vendorId,
    changedBy: input.changedBy,
    settlementOwedMilli: position.owedMilli
  });

  const linkedAccountRetention = await assessLinkedAccountRetention(input.vendorId);

  await prisma.vendor.update({
    where: { id: input.vendorId },
    data: { subscriptionStatus: 'deactivated' }
  });

  await prisma.vendorSettlementControlAudit.create({
    data: {
      id: randomUUID(),
      vendorId: input.vendorId,
      changedBy: input.changedBy,
      field: 'subscriptionStatus',
      oldValue: vendor.subscriptionStatus,
      newValue: 'deactivated',
      reason: 'shop_offboarding'
    }
  });

  return {
    subscriptionStatus: 'deactivated',
    paymentsManagedByChatlogix: collection.paymentsManagedByChatlogix,
    cancelledLinkCount: collection.cancelledLinkCount,
    settlementBalanceMilli: position.balanceMilli.toString(),
    owedMilli: position.owedMilli.toString(),
    ledgerEntryCount: ledgerEntryCountAfter,
    linkedAccountId: vendor.razorpayLinkedAccountId,
    linkedAccountRetention,
    invoiceSnapshot
  };
}

/** Collection off without deactivating the shop; returns owed amount for dashboards. */
export async function disableCollectionPreservingLedger(input: {
  vendorId: string;
  changedBy: string;
}): Promise<{
  paymentsManagedByChatlogix: false;
  cancelledLinkCount: number;
  settlementBalanceMilli: string;
  owedMilli: string;
  ledgerEntryCount: number;
}> {
  const ledgerEntryCountBefore = await prisma.settlementEntry.count({
    where: { vendorId: input.vendorId }
  });
  const vendor = await prisma.vendor.findUnique({
    where: { id: input.vendorId },
    select: { settlementBalanceMilli: true }
  });
  if (!vendor) {
    throw createError('Vendor not found', 404, ErrorType.NOT_FOUND);
  }

  const collection = await disablePaymentCollection(input);
  const position = await getSettlementPosition(input.vendorId);
  const ledgerEntryCountAfter = await prisma.settlementEntry.count({
    where: { vendorId: input.vendorId }
  });

  if (ledgerEntryCountAfter !== ledgerEntryCountBefore) {
    throw createError('Collection disable must not mutate the settlement ledger', 500, ErrorType.SYSTEM);
  }
  if (position.balanceMilli !== vendor.settlementBalanceMilli) {
    throw createError('Collection disable must not change settlement balance', 500, ErrorType.SYSTEM);
  }

  return {
    ...collection,
    settlementBalanceMilli: position.balanceMilli.toString(),
    owedMilli: position.owedMilli.toString(),
    ledgerEntryCount: ledgerEntryCountAfter
  };
}
