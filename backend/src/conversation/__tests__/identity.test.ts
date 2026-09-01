import { describe, it, expect, vi, beforeEach } from 'vitest';

const vendorFindUnique = vi.fn();
const whatsAppNumberFindUnique = vi.fn();
const customerUpsert = vi.fn();
const conversationFindFirst = vi.fn();
const conversationCreate = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) },
    whatsAppNumber: { findUnique: (...args: unknown[]) => whatsAppNumberFindUnique(...args) },
    customer: { upsert: (...args: unknown[]) => customerUpsert(...args) },
    conversation: {
      findFirst: (...args: unknown[]) => conversationFindFirst(...args),
      create: (...args: unknown[]) => conversationCreate(...args)
    }
  }
}));

import { resolveIdentity } from '../identity.js';

beforeEach(() => {
  vi.clearAllMocks();
  customerUpsert.mockResolvedValue({ id: 'customer-1' });
});

describe('resolveIdentity', () => {
  it('resolves the vendor directly by vendorId when given', async () => {
    vendorFindUnique.mockResolvedValue({ id: 'vendor-1' });
    conversationFindFirst.mockResolvedValue({ id: 'conv-1' });

    const result = await resolveIdentity({ vendorId: 'vendor-1', customerPhone: '+91111' });

    expect(result.vendorId).toBe('vendor-1');
    expect(whatsAppNumberFindUnique).not.toHaveBeenCalled();
  });

  it('throws if the given vendorId does not exist', async () => {
    vendorFindUnique.mockResolvedValue(null);

    await expect(resolveIdentity({ vendorId: 'nonexistent', customerPhone: '+91111' })).rejects.toThrow(/Vendor not found/);
  });

  it('falls back to resolving vendor via phoneNumberId when vendorId is absent', async () => {
    whatsAppNumberFindUnique.mockResolvedValue({ vendorId: 'vendor-2' });
    conversationFindFirst.mockResolvedValue({ id: 'conv-1' });

    const result = await resolveIdentity({ phoneNumberId: 'waba-1', customerPhone: '+91111' });

    expect(result.vendorId).toBe('vendor-2');
    expect(whatsAppNumberFindUnique).toHaveBeenCalledWith({ where: { phoneNumberId: 'waba-1' } });
  });

  it('throws if neither vendorId nor phoneNumberId is provided', async () => {
    await expect(resolveIdentity({ customerPhone: '+91111' })).rejects.toThrow(/neither vendorId nor phoneNumberId/);
  });

  it('throws if phoneNumberId does not map to any vendor', async () => {
    whatsAppNumberFindUnique.mockResolvedValue(null);

    await expect(resolveIdentity({ phoneNumberId: 'unknown-waba', customerPhone: '+91111' })).rejects.toThrow(/No vendor found/);
  });

  it('reuses an existing open conversation instead of creating a new one', async () => {
    vendorFindUnique.mockResolvedValue({ id: 'vendor-1' });
    conversationFindFirst.mockResolvedValue({ id: 'existing-conv' });

    const result = await resolveIdentity({ vendorId: 'vendor-1', customerPhone: '+91111' });

    expect(result.conversationId).toBe('existing-conv');
    expect(conversationCreate).not.toHaveBeenCalled();
  });

  it('creates a new conversation when none is open', async () => {
    vendorFindUnique.mockResolvedValue({ id: 'vendor-1' });
    conversationFindFirst.mockResolvedValue(null);
    conversationCreate.mockResolvedValue({ id: 'new-conv' });

    const result = await resolveIdentity({ vendorId: 'vendor-1', customerPhone: '+91111' });

    expect(result.conversationId).toBe('new-conv');
    expect(conversationCreate).toHaveBeenCalledWith({ data: { vendorId: 'vendor-1', customerId: 'customer-1' } });
  });
});
