import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  handlePaymentScreenshotIfApplicable,
  setPaymentScreenshotVisionForTests
} from '../paymentScreenshotService.js';

const orderFindMany = vi.fn();
const orderUpdate = vi.fn();
const orderAuditLogFindMany = vi.fn();
const paymentLinkFindMany = vi.fn();
const customerPaymentFindMany = vi.fn();
const orderAlertFindMany = vi.fn();
const orderAlertFindFirst = vi.fn();
const orderAlertCreate = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    order: {
      findMany: (...args: unknown[]) => orderFindMany(...args),
      update: (...args: unknown[]) => orderUpdate(...args)
    },
    orderAuditLog: { findMany: (...args: unknown[]) => orderAuditLogFindMany(...args) },
    paymentLink: { findMany: (...args: unknown[]) => paymentLinkFindMany(...args) },
    customerPayment: { findMany: (...args: unknown[]) => customerPaymentFindMany(...args) },
    orderAlert: {
      findMany: (...args: unknown[]) => orderAlertFindMany(...args),
      findFirst: (...args: unknown[]) => orderAlertFindFirst(...args),
      create: (...args: unknown[]) => orderAlertCreate(...args)
    }
  }
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe('payment screenshot alert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPaymentScreenshotVisionForTests(async () => ({
      claimsPaid: true,
      promptTokens: 0,
      completionTokens: 0,
      model: 'gpt-4.1-mini'
    }));
    orderFindMany.mockResolvedValue([
      { id: 'ord-1', status: 'awaiting_payment', paymentMethod: 'razorpay', totalAmount: 50000 }
    ]);
    orderAuditLogFindMany.mockResolvedValue([]);
    paymentLinkFindMany.mockResolvedValue([]);
    customerPaymentFindMany.mockResolvedValue([]);
    orderAlertFindMany.mockResolvedValue([]);
    orderAlertFindFirst.mockResolvedValue(null);
    orderAlertCreate.mockImplementation(async ({ data }: { data: { id: string } }) => ({
      ...data,
      resolved: false,
      createdAt: new Date()
    }));
  });

  it('writes one payment_initiated alert and leaves the order unpaid', async () => {
    const first = await handlePaymentScreenshotIfApplicable({
      conversationId: 'conv-1',
      vendorId: 'v1',
      customerId: 'c1',
      messageId: 'msg-1',
      imageBuffer: Buffer.from('img'),
      contentType: 'image/jpeg',
      caption: 'see this',
      visionModel: 'gpt-4.1-mini'
    });

    expect(first.handled).toBe(true);
    expect(orderAlertCreate).toHaveBeenCalledTimes(1);
    expect(orderAlertCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: 'ord-1', type: 'payment_initiated' })
      })
    );
    expect(orderUpdate).not.toHaveBeenCalled();

    orderAlertFindFirst.mockResolvedValue({ id: 'alert-1', resolved: false });
    const second = await handlePaymentScreenshotIfApplicable({
      conversationId: 'conv-1',
      vendorId: 'v1',
      customerId: 'c1',
      messageId: 'msg-2',
      imageBuffer: Buffer.from('img'),
      contentType: 'image/jpeg',
      caption: null,
      visionModel: 'gpt-4.1-mini'
    });

    expect(second.handled).toBe(true);
    expect(orderAlertCreate).toHaveBeenCalledTimes(1);
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});
