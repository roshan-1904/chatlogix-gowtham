import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FakeLinkedAccountClient,
  setLinkedAccountClientForTests
} from '../linkedAccountClient.js';
import { submitLinkedAccountOptIn, handleLinkedAccountWebhookInTx } from '../linkedAccountService.js';

const vendorFindUnique = vi.fn();
const vendorUpdate = vi.fn();
const vendorFindFirst = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
      update: (...args: unknown[]) => vendorUpdate(...args),
      findFirst: (...args: unknown[]) => vendorFindFirst(...args)
    }
  }
}));

vi.mock('../../../utils/whatsappTokenCrypto.js', () => ({
  encryptWhatsAppToken: (v: string) => `enc:${v}`
}));

describe('linkedAccountService', () => {
  const fake = new FakeLinkedAccountClient();

  beforeEach(() => {
    vi.clearAllMocks();
    setLinkedAccountClientForTests(fake);
    vendorFindUnique.mockResolvedValue({ id: 'v1', razorpayLinkedAccountId: null });
    vendorUpdate.mockResolvedValue({});
    vendorFindFirst.mockResolvedValue({ id: 'v1', razorpayLinkedAccountId: 'acc_fake_1' });
  });

  it('creates linked account and stores masked bank details', async () => {
    const result = await submitLinkedAccountOptIn('v1', {
      legalName: 'Acme Foods',
      businessType: 'partnership',
      pan: 'ABCDE1234F',
      gstin: '29ABCDE1234F1Z5',
      bankAccountNumber: '123456789012',
      bankIfsc: 'HDFC0001234',
      bankAccountHolderName: 'Acme Foods',
      contactEmail: 'shop@example.com',
      contactPhone: '+919876543210'
    });

    expect(result.linkedAccountId).toMatch(/^acc_fake_/);
    expect(result.bankAccountMasked).toBe('****9012');
    expect(vendorUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          razorpayLinkedAccountId: result.linkedAccountId,
          settlementBankAccountMasked: '****9012'
        })
      })
    );
  });

  it('turns collection on when account activates', async () => {
    const tx = { vendor: { update: vi.fn(), findFirst: vendorFindFirst } };
    await handleLinkedAccountWebhookInTx(tx as never, {
      accountId: 'acc_fake_1',
      status: 'activated'
    });
    expect(tx.vendor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentsManagedByChatlogix: true,
          collectionStartedAt: expect.any(Date)
        })
      })
    );
  });
});
