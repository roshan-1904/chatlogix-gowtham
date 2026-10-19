import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  aggregatePlatformFeeInvoice,
  fixtureSingleOrderPlatformFeeAtOnePercent,
  formatInrFromPaise
} from '../platformFeeInvoiceMath.js';
import { buildPlatformFeeInvoicePdf } from '../platformFeeInvoicePdf.js';
import { gatewayFeeLineLabel } from '../platformFeeInvoiceD3.js';
import {
  issuePlatformFeeInvoiceForVendor,
  PlatformFeeInvoiceAlreadyIssuedError,
  requestPlatformFeeCreditNote,
  PlatformFeeCreditNoteNotAvailableError
} from '../platformFeeInvoiceService.js';
import { issueDuePlatformFeeInvoices } from '../platformFeeInvoiceService.js';
import { istDayOfMonth, previousIstMonthKey } from '../platformFeeInvoiceMonth.js';

const vendorFindUnique = vi.fn();
const customerPaymentFindMany = vi.fn();
const customerPaymentGroupBy = vi.fn();
const invoiceFindUnique = vi.fn();
const invoiceCreate = vi.fn();
const sequenceUpsert = vi.fn();
const transaction = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) },
    customerPayment: {
      findMany: (...args: unknown[]) => customerPaymentFindMany(...args),
      groupBy: (...args: unknown[]) => customerPaymentGroupBy(...args)
    },
    vendorPlatformFeeInvoice: {
      findUnique: (...args: unknown[]) => invoiceFindUnique(...args),
      create: (...args: unknown[]) => invoiceCreate(...args)
    },
    platformFeeInvoiceSequence: {
      upsert: (...args: unknown[]) => sequenceUpsert(...args)
    },
    $transaction: (...args: unknown[]) => transaction(...args)
  }
}));

vi.mock('../platformFeeInvoiceStorage.js', () => ({
  storePlatformFeeInvoicePdf: vi.fn(async () => ({ pdfS3Key: 'local:test.pdf', storage: 'local' })),
  presignPlatformFeeInvoicePdf: vi.fn(),
  readLocalPlatformFeeInvoicePdf: vi.fn()
}));

describe('platformFeeInvoiceMath', () => {
  it('shows taxable 8.47 and GST 1.53 for one ₹1,000 order at 1%', () => {
    const totals = fixtureSingleOrderPlatformFeeAtOnePercent();
    expect(totals.platformFeePaise).toBe(1000);
    expect(totals.platformFeeTaxablePaise).toBe(847);
    expect(totals.platformFeeGstPaise).toBe(153);
    expect(formatInrFromPaise(totals.platformFeeTaxablePaise)).toBe('8.47');
    expect(formatInrFromPaise(totals.platformFeeGstPaise)).toBe('1.53');
  });

  it('sums multiple payments for a month', () => {
    const totals = aggregatePlatformFeeInvoice({
      payments: [
        { platformFeePaise: 1000, platformFeeGstPaise: 153, gatewayFeePaise: 0, gatewayTaxPaise: 0 },
        { platformFeePaise: 2000, platformFeeGstPaise: 305, gatewayFeePaise: 100, gatewayTaxPaise: 18 }
      ]
    });
    expect(totals.platformFeePaise).toBe(3000);
    expect(totals.platformFeeGstPaise).toBe(458);
    expect(totals.platformFeeTaxablePaise).toBe(2542);
    expect(totals.gatewayFeePaise).toBe(100);
  });
});

describe('platformFeeInvoicePdf', () => {
  it('embeds taxable and GST amounts in the PDF bytes', () => {
    const totals = fixtureSingleOrderPlatformFeeAtOnePercent();
    const pdf = buildPlatformFeeInvoicePdf({
      invoiceDisplay: 'CLX-2026-000001',
      monthKey: '2026-09',
      issuedAt: new Date('2026-10-01T12:00:00+05:30'),
      supplierLegalName: 'ChatLogix Test',
      supplierGstin: '29TEST1234F1Z5',
      recipientLegalName: 'Demo Shop',
      recipientGstin: '29ABCDE1234F1Z5',
      totals,
      gatewayLineMode: 'pure_agent'
    });
    const text = pdf.toString('utf8');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('8.47');
    expect(text).toContain('1.53');
    expect(text).toContain('pure agent');
    expect(gatewayFeeLineLabel('pure_agent')).toContain('reimbursement');
  });
});

describe('platformFeeInvoiceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invoiceFindUnique.mockResolvedValue(null);
    vendorFindUnique.mockResolvedValue({
      id: 'v1',
      legalName: 'Demo Shop Pvt Ltd',
      businessName: 'Demo Shop',
      gstin: '29ABCDE1234F1Z5',
      gstExempt: false
    });
    customerPaymentFindMany.mockResolvedValue([
      {
        platformFeePaise: 1000,
        platformFeeGstPaise: 153,
        gatewayFeePaise: 0,
        gatewayTaxPaise: 0
      }
    ]);
    sequenceUpsert.mockResolvedValue({ nextNumber: 2 });
    transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        vendorPlatformFeeInvoice: { findUnique: invoiceFindUnique },
        platformFeeInvoiceSequence: { upsert: sequenceUpsert }
      })
    );
    invoiceCreate.mockResolvedValue({
      id: 'inv_1',
      invoiceDisplay: 'CLX-2026-000001',
      invoiceNumber: 1
    });
  });

  it('issues a sequential invoice and stores totals', async () => {
    const result = await issuePlatformFeeInvoiceForVendor({
      vendorId: 'v1',
      monthKey: '2026-09',
      issuedAt: new Date('2026-10-01T00:00:00+05:30')
    });
    expect(result.invoiceNumber).toBe(1);
    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          platformFeeTaxablePaise: 847,
          platformFeeGstPaise: 153,
          gatewayLineMode: 'pure_agent'
        })
      })
    );
  });

  it('refuses to regenerate for the same vendor and month', async () => {
    invoiceFindUnique.mockResolvedValueOnce({ id: 'existing' });
    await expect(
      issuePlatformFeeInvoiceForVendor({ vendorId: 'v1', monthKey: '2026-09' })
    ).rejects.toBeInstanceOf(PlatformFeeInvoiceAlreadyIssuedError);
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  it('credit note path is stubbed', async () => {
    await expect(
      requestPlatformFeeCreditNote({ invoiceId: 'inv_1', reason: 'typo' })
    ).rejects.toBeInstanceOf(PlatformFeeCreditNoteNotAvailableError);
  });
});

describe('issueDuePlatformFeeInvoices', () => {
  it('runs only on the 1st IST', async () => {
    customerPaymentGroupBy.mockResolvedValue([]);
    const notFirst = new Date('2026-10-02T12:00:00+05:30');
    expect(istDayOfMonth(notFirst)).not.toBe(1);
    await expect(issueDuePlatformFeeInvoices(notFirst)).resolves.toBe(0);
    expect(customerPaymentGroupBy).not.toHaveBeenCalled();
  });

  it('targets the previous IST month on the 1st', () => {
    const first = new Date('2026-10-01T06:00:00+05:30');
    expect(istDayOfMonth(first)).toBe(1);
    expect(previousIstMonthKey(first)).toBe('2026-09');
  });
});
