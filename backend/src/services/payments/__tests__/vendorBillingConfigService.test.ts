import { describe, it, expect, beforeEach, vi } from 'vitest';
import { patchVendorBillingConfig } from '../vendorBillingConfigService.js';

const vendorFindUnique = vi.fn();
const vendorUpdate = vi.fn();
const auditCreate = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
      update: (...args: unknown[]) => vendorUpdate(...args)
    },
    vendorSettlementControlAudit: { create: (...args: unknown[]) => auditCreate(...args) }
  }
}));

describe('patchVendorBillingConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditCreate.mockResolvedValue({});
  });

  it('audits paymentFeeBps changes', async () => {
    vendorFindUnique.mockResolvedValue({ id: 'v1', markupPercent: 50, paymentFeeBps: 100 });
    vendorUpdate.mockResolvedValue({ id: 'v1', markupPercent: 50, paymentFeeBps: 150 });

    await patchVendorBillingConfig({
      vendorId: 'v1',
      changedBy: 'admin-1',
      paymentFeeBps: 150
    });

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          field: 'paymentFeeBps',
          oldValue: '100',
          newValue: '150',
          reason: 'billing_config'
        })
      })
    );
  });
});
