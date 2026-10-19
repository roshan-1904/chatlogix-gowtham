import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedPlatformSettingsMemory } from '../../platformSettingsService.js';

const creditAdjustment = vi.hoisted(() => vi.fn(async () => true));

vi.mock('../settlementService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../settlementService.js')>();
  return {
    ...actual,
    creditWithheldTaxRefundAdjustmentTx: creditAdjustment
  };
});

const prismaMock = vi.hoisted(() => ({
  customerPayment: { findMany: vi.fn() },
  vendor: { findMany: vi.fn() },
  customerRefund: { findMany: vi.fn() },
  taxReportMonthClose: { findUnique: vi.fn(), create: vi.fn() },
  $transaction: vi.fn()
}));

vi.mock('../../../db/prisma.js', () => ({ prisma: prismaMock }));

import { closeTaxReportMonth } from '../taxReportService.js';

describe('closeTaxReportMonth refund adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedPlatformSettingsMemory({ refundReturnsWithheldTaxToShop: true });
    prismaMock.taxReportMonthClose.findUnique.mockResolvedValue(null);
    prismaMock.taxReportMonthClose.create.mockImplementation(async ({ data }: { data: object }) => ({
      ...data,
      closedAt: new Date('2026-11-01T00:00:00.000Z')
    }));
    prismaMock.customerPayment.findMany.mockResolvedValue([
      {
        id: 'p1',
        vendorId: 'v1',
        amountPaise: 100_000,
        gstTcsPaise: 500,
        tdsPaise: 100,
        capturedAt: new Date('2026-10-12T06:30:00.000Z')
      }
    ]);
    prismaMock.vendor.findMany.mockResolvedValue([
      {
        id: 'v1',
        businessName: 'Shop',
        gstin: '29ABCDE1234F1Z5',
        panEncrypted: null
      }
    ]);
    prismaMock.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
  });

  it('credits withheld tax adjustments when the CA refund flag is on', async () => {
    prismaMock.customerRefund.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'r1',
          vendorId: 'v1',
          amountPaise: 100_000,
          updatedAt: new Date('2026-10-25T06:30:00.000Z'),
          customerPayment: {
            id: 'p1',
            vendorId: 'v1',
            amountPaise: 100_000,
            gstTcsPaise: 500,
            tdsPaise: 100,
            capturedAt: new Date('2026-10-12T06:30:00.000Z')
          }
        }
      ]);

    const result = await closeTaxReportMonth('2026-10', 'admin-1');
    expect(result.adjustmentCount).toBe(1);
    expect(creditAdjustment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        vendorId: 'v1',
        customerRefundId: 'r1',
        yearMonth: '2026-10',
        creditPaise: 600
      })
    );
  });

  it('skips adjustments when the CA refund flag is off', async () => {
    seedPlatformSettingsMemory({ refundReturnsWithheldTaxToShop: false });
    prismaMock.customerRefund.findMany.mockResolvedValue([]);

    const result = await closeTaxReportMonth('2026-10', 'admin-1');
    expect(result.adjustmentCount).toBe(0);
    expect(creditAdjustment).not.toHaveBeenCalled();
  });
});
