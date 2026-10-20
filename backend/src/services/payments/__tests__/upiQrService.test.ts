import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendUpiQrForOrder } from '../upiQrService.js';

const orderFindUnique = vi.fn();
const customerPaymentFindFirst = vi.fn();
const orderAuditLogFindFirst = vi.fn();
const messageFindFirst = vi.fn();
const orderAuditLogCreate = vi.fn();
const messageCreate = vi.fn();
const settlementEntryCreate = vi.fn();
const vendorUpdate = vi.fn();
const cancelOpenLinksForOrder = vi.fn();
const uploadWhatsAppMedia = vi.fn();
const sendWhatsAppImage = vi.fn();
const sendWhatsAppCtaUrl = vi.fn();
const getTapToPayUrlForOrder = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    order: { findUnique: (...args: unknown[]) => orderFindUnique(...args) },
    customerPayment: { findFirst: (...args: unknown[]) => customerPaymentFindFirst(...args) },
    orderAuditLog: {
      findFirst: (...args: unknown[]) => orderAuditLogFindFirst(...args),
      create: (...args: unknown[]) => orderAuditLogCreate(...args)
    },
    message: {
      findFirst: (...args: unknown[]) => messageFindFirst(...args),
      create: (...args: unknown[]) => messageCreate(...args)
    },
    settlementEntry: { create: (...args: unknown[]) => settlementEntryCreate(...args) },
    vendor: { update: (...args: unknown[]) => vendorUpdate(...args) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        orderAuditLog: { create: (...args: unknown[]) => orderAuditLogCreate(...args) },
        message: { create: (...args: unknown[]) => messageCreate(...args) }
      })
  }
}));

vi.mock('../../paymentLinkService.js', () => ({
  getPaymentLinkService: () => ({ cancelOpenLinksForOrder })
}));

vi.mock('../../whatsappClient.js', () => ({
  uploadWhatsAppMedia: (...args: unknown[]) => uploadWhatsAppMedia(...args),
  sendWhatsAppImage: (...args: unknown[]) => sendWhatsAppImage(...args),
  sendWhatsAppCtaUrl: (...args: unknown[]) => sendWhatsAppCtaUrl(...args)
}));

vi.mock('../upiTapToPayUrl.js', () => ({
  getTapToPayUrlForOrder: (...args: unknown[]) => getTapToPayUrlForOrder(...args)
}));

vi.mock('../../whatsapp/vendorSendingNumber.js', () => ({
  resolveVendorSendingPhoneNumberId: vi.fn().mockResolvedValue('phone-1')
}));

vi.mock('qrcode', () => ({
  default: { toBuffer: vi.fn().mockResolvedValue(Buffer.from('png')) }
}));

describe('sendUpiQrForOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cancelOpenLinksForOrder.mockResolvedValue(undefined);
    customerPaymentFindFirst.mockResolvedValue(null);
    orderAuditLogFindFirst.mockResolvedValue(null);
    messageFindFirst.mockResolvedValue({ timestamp: new Date() });
    uploadWhatsAppMedia.mockResolvedValue({ mediaId: 'media-1' });
    sendWhatsAppImage.mockResolvedValue({ messageId: 'wamid.1' });
    sendWhatsAppCtaUrl.mockResolvedValue({ messageId: 'wamid.2' });
    getTapToPayUrlForOrder.mockResolvedValue('https://pay.example/pay/u/token');
    orderAuditLogCreate.mockResolvedValue({});
    messageCreate.mockResolvedValue({});
    orderFindUnique.mockResolvedValue({
      id: 'ord_1',
      vendorId: 'v1',
      status: 'awaiting_payment',
      totalAmount: 219800,
      orderNumber: 'ORD-9',
      conversationId: 'conv-1',
      paymentMethod: 'razorpay',
      vendor: { upiVpa: 'shop@okaxis', upiPayeeName: 'Annapoorna Sweets', businessName: 'Shop' },
      customer: { phone: '919800000000', id: 'cust-1' }
    });
  });

  it('cancels an open link, writes upi_qr_sent, and does not settle', async () => {
    const result = await sendUpiQrForOrder({ orderId: 'ord_1', vendorId: 'v1' });

    expect(result).toEqual({
      sent: true,
      payeeName: 'Annapoorna Sweets',
      upiVpa: 'shop@okaxis',
      amountPaise: 219800,
      tapToPayUrl: 'https://pay.example/pay/u/token'
    });
    expect(sendWhatsAppCtaUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        displayText: 'Tap to pay',
        url: 'https://pay.example/pay/u/token'
      })
    );
    expect(cancelOpenLinksForOrder).toHaveBeenCalledWith('ord_1');
    expect(orderAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'upi_qr_sent',
          changes: expect.objectContaining({ amountPaise: 219800, payeeName: 'Annapoorna Sweets' })
        })
      })
    );
    expect(settlementEntryCreate).not.toHaveBeenCalled();
    expect(vendorUpdate).not.toHaveBeenCalled();
    expect(messageCreate).toHaveBeenCalled();
  });

  it('does not mark the QR sent when the customer is outside the 24 hour window', async () => {
    messageFindFirst.mockResolvedValue({ timestamp: new Date(Date.now() - 25 * 60 * 60 * 1000) });

    await expect(sendUpiQrForOrder({ orderId: 'ord_1', vendorId: 'v1' })).rejects.toThrow(/24 hours/);
    expect(cancelOpenLinksForOrder).not.toHaveBeenCalled();
    expect(orderAuditLogCreate).not.toHaveBeenCalled();
  });
});
