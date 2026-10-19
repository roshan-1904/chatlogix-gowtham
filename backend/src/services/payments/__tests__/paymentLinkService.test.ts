import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakePaymentLinkRazorpayClient } from '../paymentLinkRazorpayClient.js';
import { PaymentLinkService } from '../../paymentLinkService.js';
import { FakeRouteClient } from '../routeClient.js';
import { creditCapturedPaymentTx, setRouteClientForTests } from '../settlementService.js';

const vendorFindUnique = vi.fn();
const orderFindUnique = vi.fn();
const customerPaymentFindFirst = vi.fn();
const paymentLinkFindMany = vi.fn();
const paymentLinkCreate = vi.fn();
const paymentLinkUpdate = vi.fn();
const messageFindFirst = vi.fn();

vi.mock('../../../db/prisma.js', () => ({
  prisma: {
    vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) },
    order: { findUnique: (...args: unknown[]) => orderFindUnique(...args) },
    customerPayment: { findFirst: (...args: unknown[]) => customerPaymentFindFirst(...args) },
    paymentLink: {
      findMany: (...args: unknown[]) => paymentLinkFindMany(...args),
      create: (...args: unknown[]) => paymentLinkCreate(...args),
      update: (...args: unknown[]) => paymentLinkUpdate(...args),
      updateMany: vi.fn()
    },
    message: { findFirst: (...args: unknown[]) => messageFindFirst(...args) },
    notificationHistory: { create: vi.fn().mockResolvedValue({ id: 'n1' }) },
    $transaction: vi.fn()
  }
}));

vi.mock('../../../config/env.js', () => ({
  env: {
    RESPONSE_QUEUE_URL: 'https://sqs.test/response',
    WHATSAPP_PHONE_NUMBER_ID: 'pn',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test'
  }
}));

vi.mock('../../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../../../queue/sqsClient.js', () => ({
  publishToQueue: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../whatsapp/vendorSendingNumber.js', () => ({
  resolveVendorSendingPhoneNumberId: vi.fn().mockResolvedValue('phone_id')
}));

describe('PaymentLinkService', () => {
  const fakeRzp = new FakePaymentLinkRazorpayClient();
  let service: PaymentLinkService;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeRzp.links.clear();
    fakeRzp.cancelled.clear();
    service = new PaymentLinkService(fakeRzp);
    paymentLinkFindMany.mockResolvedValue([]);
    customerPaymentFindFirst.mockResolvedValue(null);
    messageFindFirst.mockResolvedValue({ timestamp: new Date() });
    paymentLinkCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'pl_local_1', ...data })
    );
    paymentLinkUpdate.mockResolvedValue({});
  });

  it('creates one open link and cancels prior open links', async () => {
    paymentLinkFindMany.mockResolvedValueOnce([
      { id: 'old', razorpayLinkId: 'plink_old', status: 'created' }
    ]);
    orderFindUnique.mockResolvedValue({
      id: 'ord_1',
      orderNumber: 'ORD-1',
      totalAmount: 50_000,
      estimatedDelivery: null,
      conversationId: 'conv_1',
      vendorId: 'v1',
      paymentMethod: 'razorpay',
      vendor: { id: 'v1', businessName: 'Shop', paymentsManagedByChatlogix: true, paymentLinkAutoSend: false },
      customer: { id: 'c1', phone: '+919999999999' }
    });

    const result = await service.createPaymentLinkForOrder('ord_1', { sendWhatsApp: false });

    expect(fakeRzp.cancelled.has('plink_old')).toBe(true);
    expect(result.paymentLink).toMatch(/^https:\/\/rzp.io/);
    expect(paymentLinkCreate).toHaveBeenCalledTimes(1);
  });

  it('does not send WhatsApp when auto-send is off and sendWhatsApp is omitted', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'ord_1',
      orderNumber: 'ORD-1',
      totalAmount: 50_000,
      estimatedDelivery: null,
      conversationId: 'conv_1',
      vendorId: 'v1',
      paymentMethod: 'razorpay',
      vendor: { id: 'v1', businessName: 'Shop', paymentsManagedByChatlogix: true, paymentLinkAutoSend: false },
      customer: { id: 'c1', phone: '+919999999999' }
    });

    const result = await service.createPaymentLinkForOrder('ord_1');

    expect(result.sent).toBe(false);
  });

  it('refuses when collection is off', async () => {
    orderFindUnique.mockResolvedValue({
      id: 'ord_1',
      orderNumber: 'ORD-1',
      totalAmount: 100,
      estimatedDelivery: null,
      conversationId: 'conv_1',
      vendorId: 'v1',
      paymentMethod: null,
      vendor: { id: 'v1', businessName: 'Shop', paymentsManagedByChatlogix: false, paymentLinkAutoSend: true },
      customer: { id: 'c1', phone: '+919999999999' }
    });
    await expect(service.createPaymentLinkForOrder('ord_1')).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('order payment capture + transfer', () => {
  it('uses creditCapturedPaymentTx and createPendingTransfers without touching AI wallet', async () => {
    const fakeRoute = new FakeRouteClient();
    setRouteClientForTests(fakeRoute);

    const tx = {
      customerPayment: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'cp1', ...data })
        ),
        count: vi.fn().mockResolvedValue(1)
      },
      vendor: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'v1',
          paymentFeeBps: 100,
          panEncrypted: 'x',
          rollingReserveBps: 0,
          collectionStartedAt: new Date(Date.now() - 86400000 * 40),
          settlementBalanceMilli: 0n,
          razorpayLinkedAccountId: 'la_1'
        }),
        update: vi.fn().mockResolvedValue({})
      },
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'ord_1',
          vendorId: 'v1',
          totalAmount: 100_00,
          cancelledAt: null,
          status: 'awaiting_payment'
        }),
        update: vi.fn()
      },
      paymentLink: {
        findFirst: vi.fn().mockResolvedValue({ razorpayLinkId: 'plink_1' }),
        updateMany: vi.fn()
      },
      settlementEntry: { create: vi.fn() },
      settlementTransfer: { create: vi.fn().mockResolvedValue({ id: 'st1' }) },
      $queryRaw: vi.fn().mockResolvedValue([{ now: new Date() }]),
      $executeRaw: vi.fn().mockResolvedValue(0)
    };

    await creditCapturedPaymentTx(tx as never, {
      vendorId: 'v1',
      orderId: 'ord_1',
      amountPaise: 100_00,
      gatewayFeePaise: 200,
      gatewayTaxPaise: 36,
      razorpayPaymentId: 'pay_ord_1',
      razorpayPaymentLinkId: 'plink_1'
    });

    expect(tx.settlementEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'payment_credit' }) })
    );
    expect(tx.vendor.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ settlementBalanceMilli: expect.any(BigInt) }) })
    );
    setRouteClientForTests(null);
  });
});
