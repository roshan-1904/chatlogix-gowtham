import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  assessLinkedAccountRetention,
  assertVendorDeletable,
  disableCollectionPreservingLedger,
  offboardVendor,
  vendorHasPaymentTaxRecords
} from '../vendorOffboardingService.js';

const vendorFindUnique = vi.fn();
const vendorUpdate = vi.fn();
const settlementEntryCount = vi.fn();
const settlementTransferCount = vi.fn();
const customerPaymentCount = vi.fn();
const customerPaymentFindFirst = vi.fn();
const finalizeInvoicesForShopOffboarding = vi.fn();
const paymentLinkFindFirst = vi.fn();
const settlementEntryFindFirst = vi.fn();
const settlementTransferFindFirst = vi.fn();
const customerRefundFindFirst = vi.fn();
const auditCreate = vi.fn();

const disablePaymentCollection = vi.fn();
const getSettlementPosition = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
      update: (...args: unknown[]) => vendorUpdate(...args)
    },
    settlementEntry: {
      count: (...args: unknown[]) => settlementEntryCount(...args),
      findFirst: (...args: unknown[]) => settlementEntryFindFirst(...args)
    },
    settlementTransfer: {
      count: (...args: unknown[]) => settlementTransferCount(...args),
      findFirst: (...args: unknown[]) => settlementTransferFindFirst(...args)
    },
    customerPayment: {
      count: (...args: unknown[]) => customerPaymentCount(...args),
      findFirst: (...args: unknown[]) => customerPaymentFindFirst(...args)
    },
    paymentLink: {
      findFirst: (...args: unknown[]) => paymentLinkFindFirst(...args)
    },
    customerRefund: {
      findFirst: (...args: unknown[]) => customerRefundFindFirst(...args)
    },
    vendorSettlementControlAudit: {
      create: (...args: unknown[]) => auditCreate(...args)
    }
  }
}));

vi.mock('../collectionControlService.js', () => ({
  disablePaymentCollection: (...args: unknown[]) => disablePaymentCollection(...args)
}));

vi.mock('../settlementService.js', () => ({
  getSettlementPosition: (...args: unknown[]) => getSettlementPosition(...args)
}));

vi.mock('../platformFeeInvoiceService.js', () => ({
  finalizeInvoicesForShopOffboarding: (...args: unknown[]) =>
    finalizeInvoicesForShopOffboarding(...args)
}));

describe('vendorOffboardingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vendorUpdate.mockResolvedValue({});
    auditCreate.mockResolvedValue({});
    finalizeInvoicesForShopOffboarding.mockResolvedValue({
      settlementOwedMilli: '500000',
      platformFeeInvoiceIds: ['inv_1'],
      monthKeysInvoiced: ['2026-10']
    });
  });

  it('keeps ledger and shows owed when collection is turned off for a shop that owes', async () => {
    vendorFindUnique.mockResolvedValue({
      id: 'v1',
      settlementBalanceMilli: -1_000_000n
    });
    settlementEntryCount.mockResolvedValue(4);
    disablePaymentCollection.mockResolvedValue({
      paymentsManagedByChatlogix: false,
      cancelledLinkCount: 1
    });
    getSettlementPosition.mockResolvedValue({
      balanceMilli: -1_000_000n,
      owedMilli: 1_000_000n,
      heldMilli: 0n,
      reserveMilli: 0n
    });

    const result = await disableCollectionPreservingLedger({
      vendorId: 'v1',
      changedBy: 'admin'
    });

    expect(result.paymentsManagedByChatlogix).toBe(false);
    expect(result.ledgerEntryCount).toBe(4);
    expect(result.settlementBalanceMilli).toBe('-1000000');
    expect(result.owedMilli).toBe('1000000');
    expect(settlementEntryCount).toHaveBeenCalledTimes(2);
    expect(disablePaymentCollection).toHaveBeenCalledWith({ vendorId: 'v1', changedBy: 'admin' });
  });

  it('offboards: deactivates, keeps linked account, and records invoice snapshot', async () => {
    vendorFindUnique.mockResolvedValue({
      id: 'v1',
      subscriptionStatus: 'active',
      settlementBalanceMilli: -500_000n,
      razorpayLinkedAccountId: 'acc_linked'
    });
    settlementEntryCount.mockResolvedValue(2);
    disablePaymentCollection.mockResolvedValue({
      paymentsManagedByChatlogix: false,
      cancelledLinkCount: 0
    });
    getSettlementPosition.mockResolvedValue({
      balanceMilli: -500_000n,
      owedMilli: 500_000n,
      heldMilli: 0n,
      reserveMilli: 0n
    });
    settlementTransferCount.mockResolvedValue(1);
    customerPaymentCount.mockResolvedValue(0);

    const result = await offboardVendor({ vendorId: 'v1', changedBy: 'admin' });

    expect(result.subscriptionStatus).toBe('deactivated');
    expect(result.linkedAccountId).toBe('acc_linked');
    expect(result.linkedAccountRetention.mayCloseLinkedAccount).toBe(false);
    expect(result.linkedAccountRetention.activeTransferCount).toBe(1);
    expect(result.owedMilli).toBe('500000');
    expect(result.invoiceSnapshot.platformFeeInvoiceIds).toEqual(['inv_1']);
    expect(finalizeInvoicesForShopOffboarding).toHaveBeenCalledWith(
      expect.objectContaining({ settlementOwedMilli: 500_000n })
    );
    expect(vendorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { subscriptionStatus: 'deactivated' } })
    );
  });

  it('blocks hard delete when payment tax records exist', async () => {
    settlementEntryFindFirst.mockResolvedValue({ id: 'e1' });
    paymentLinkFindFirst.mockResolvedValue(null);
    customerPaymentFindFirst.mockResolvedValue(null);
    settlementTransferFindFirst.mockResolvedValue(null);
    customerRefundFindFirst.mockResolvedValue(null);

    expect(await vendorHasPaymentTaxRecords('v1')).toBe(true);
    await expect(assertVendorDeletable('v1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('allows linked account closure only when no active transfers or disputes', async () => {
    settlementTransferCount.mockResolvedValue(0);
    customerPaymentCount.mockResolvedValue(0);
    const clear = await assessLinkedAccountRetention('v1');
    expect(clear.mayCloseLinkedAccount).toBe(true);

    settlementTransferCount.mockResolvedValue(2);
    customerPaymentCount.mockResolvedValue(1);
    const blocked = await assessLinkedAccountRetention('v1');
    expect(blocked.mayCloseLinkedAccount).toBe(false);
  });
});
