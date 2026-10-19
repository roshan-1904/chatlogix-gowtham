import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { WhatsAppTemplateService } from './whatsappTemplateService.js';
import {
  getPaymentLinkRazorpayClient,
  type PaymentLinkRazorpayClient
} from './payments/paymentLinkRazorpayClient.js';
import { isCodPaymentMethod } from './payments/linkedAccountService.js';

const PAYMENT_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export interface CreatePaymentLinkResult {
  paymentLinkId: string;
  paymentLink: string;
  expiresAt: Date;
  amountPaise: number;
  sent: boolean;
}

export interface PaymentLinkStatusRow {
  status: string;
  paidAt?: string;
  amountPaise: number;
  orderId: string;
  expiresAt: string;
  url?: string;
}

export class PaymentLinkService {
  private whatsapp = new WhatsAppTemplateService();

  constructor(private readonly razorpay: PaymentLinkRazorpayClient = getPaymentLinkRazorpayClient()) {}

  async getPaymentLinkStatus(paymentLinkId: string, vendorId?: string): Promise<PaymentLinkStatusRow | null> {
    const row = await prisma.paymentLink.findUnique({ where: { id: paymentLinkId } });
    if (!row || (vendorId && row.vendorId !== vendorId)) return null;
    return {
      status: mapLinkStatusForApi(row.status),
      amountPaise: row.amountPaise,
      orderId: row.orderId,
      expiresAt: row.expiresAt.toISOString(),
      url: row.status === 'created' ? row.url : undefined
    };
  }

  async createPaymentLinkForOrder(
    orderId: string,
    options: { sendWhatsApp?: boolean; phoneNumberId?: string } = {}
  ): Promise<CreatePaymentLinkResult> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        vendor: {
          select: {
            id: true,
            businessName: true,
            paymentsManagedByChatlogix: true,
            paymentLinkAutoSend: true
          }
        },
        customer: { select: { id: true, phone: true } }
      }
    });

    if (!order) {
      throw Object.assign(new Error('Order not found'), { statusCode: 404 });
    }
    if (!order.vendor.paymentsManagedByChatlogix) {
      throw Object.assign(new Error('Payment collection is not enabled for this shop'), { statusCode: 409 });
    }
    if (isCodPaymentMethod(order.paymentMethod)) {
      throw Object.assign(new Error('COD orders cannot use payment links'), { statusCode: 409 });
    }

    const captured = await prisma.customerPayment.findFirst({
      where: {
        orderId,
        settlementAlert: null,
        netMilli: { gt: 0 }
      }
    });
    if (captured) {
      throw Object.assign(new Error('Order is already paid'), { statusCode: 409 });
    }

    await this.cancelOpenLinksForOrder(orderId);

    const expiresAt = computeExpireAt(order.estimatedDelivery);
    const expireByUnix = Math.floor(expiresAt.getTime() / 1000);
    const amountPaise = order.totalAmount;

    const created = await this.razorpay.createPaymentLink({
      amountPaise,
      description: `Order ${order.orderNumber}`,
      customer: {
        name: order.vendor.businessName,
        contact: order.customer.phone
      },
      notes: {
        orderId: order.id,
        vendorId: order.vendorId,
        purpose: 'order_payment'
      },
      expireByUnix
    });

    const row = await prisma.paymentLink.create({
      data: {
        vendorId: order.vendorId,
        orderId: order.id,
        amountPaise,
        url: created.short_url,
        expiresAt,
        razorpayLinkId: created.id,
        status: 'created'
      }
    });

    const shouldSend =
      options.sendWhatsApp ??
      order.vendor.paymentLinkAutoSend;

    let sent = false;
    if (shouldSend) {
      sent = await this.sendLinkNotification({
        orderId: order.id,
        orderNumber: order.orderNumber,
        vendorId: order.vendorId,
        customerId: order.customer.id,
        customerPhone: order.customer.phone,
        paymentLink: row.url,
        amountPaise,
        conversationId: order.conversationId,
        phoneNumberId: options.phoneNumberId
      });
    }

    return {
      paymentLinkId: row.id,
      paymentLink: row.url,
      expiresAt,
      amountPaise,
      sent
    };
  }

  async cancelOpenLinksForOrder(orderId: string): Promise<void> {
    const open = await prisma.paymentLink.findMany({
      where: { orderId, status: 'created' }
    });
    for (const link of open) {
      try {
        await this.razorpay.cancelPaymentLink(link.razorpayLinkId);
      } catch (err) {
        logger.warn({ err, linkId: link.id }, 'Failed to cancel Razorpay payment link — marking cancelled locally');
      }
      await prisma.paymentLink.update({
        where: { id: link.id },
        data: { status: 'cancelled' }
      });
    }
  }

  async sendLinkNotification(input: {
    orderId: string;
    orderNumber: string;
    vendorId: string;
    customerId: string;
    customerPhone: string;
    paymentLink: string;
    amountPaise: number;
    conversationId: string;
    phoneNumberId?: string;
  }): Promise<boolean> {
    const amountFormatted = `₹${(input.amountPaise / 100).toFixed(2)}`;
    const lastCustomerMessage = await prisma.message.findFirst({
      where: { conversationId: input.conversationId, senderType: 'customer' },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true }
    });
    const outside24h =
      !lastCustomerMessage ||
      Date.now() - lastCustomerMessage.timestamp.getTime() > 24 * 60 * 60 * 1000;

    const result = await this.whatsapp.sendPaymentLink({
      customerPhone: input.customerPhone,
      paymentLink: input.paymentLink,
      orderNumber: input.orderNumber,
      amountFormatted,
      orderId: input.orderId,
      vendorId: input.vendorId,
      customerId: input.customerId,
      useUtilityTemplate: outside24h,
      phoneNumberId: input.phoneNumberId
    });
    return result.success && result.queued;
  }

  async refreshLinkAfterCartChange(orderId: string, options: { phoneNumberId?: string } = {}): Promise<void> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, vendorId: true }
    });
    if (!order || order.status !== 'awaiting_payment') return;

    const vendor = await prisma.vendor.findUnique({
      where: { id: order.vendorId },
      select: { paymentsManagedByChatlogix: true, paymentLinkAutoSend: true }
    });
    if (!vendor?.paymentsManagedByChatlogix) return;

    await this.createPaymentLinkForOrder(orderId, {
      sendWhatsApp: vendor.paymentLinkAutoSend,
      phoneNumberId: options.phoneNumberId
    });
  }
}

function computeExpireAt(estimatedDelivery: Date | null | undefined): Date {
  const now = Date.now();
  const defaultExpiry = now + PAYMENT_LINK_TTL_MS;
  if (!estimatedDelivery) return new Date(defaultExpiry);
  const promiseMs = estimatedDelivery.getTime();
  if (promiseMs <= now) return new Date(defaultExpiry);
  return new Date(Math.min(promiseMs, defaultExpiry));
}

function mapLinkStatusForApi(status: string): PaymentLinkStatusRow['status'] {
  if (status === 'created') return 'pending';
  if (status === 'paid') return 'paid';
  if (status === 'expired') return 'expired';
  if (status === 'cancelled') return 'failed';
  return status;
}

let serviceOverride: PaymentLinkService | null = null;

export function setPaymentLinkServiceForTests(service: PaymentLinkService | null): void {
  serviceOverride = service;
}

export function getPaymentLinkService(): PaymentLinkService {
  return serviceOverride ?? new PaymentLinkService();
}
