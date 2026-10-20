import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import { prisma } from '../../db/prisma.js';
import { createError, ErrorType } from '../../middleware/errorHandler.js';
import { getPaymentLinkService } from '../paymentLinkService.js';
import { uploadWhatsAppMedia, sendWhatsAppImage, sendWhatsAppCtaUrl } from '../whatsappClient.js';
import { resolveVendorSendingPhoneNumberId } from '../whatsapp/vendorSendingNumber.js';
import { getTapToPayUrlForOrder } from './upiTapToPayUrl.js';

export function buildUpiUri(input: {
  vpa: string;
  payeeName: string;
  amountRupees: string;
  note: string;
}): string {
  const query = [
    ['pa', input.vpa],
    ['pn', input.payeeName],
    ['am', input.amountRupees],
    ['cu', 'INR'],
    ['tn', input.note]
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return `upi://pay?${query}`;
}

async function isOutsideWhatsApp24hWindow(conversationId: string): Promise<boolean> {
  const lastCustomerMessage = await prisma.message.findFirst({
    where: { conversationId, senderType: 'customer' },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true }
  });
  return (
    !lastCustomerMessage ||
    Date.now() - lastCustomerMessage.timestamp.getTime() > 24 * 60 * 60 * 1000
  );
}

export async function sendUpiQrForOrder(input: {
  orderId: string;
  vendorId: string;
  changedBy?: string;
}): Promise<{
  sent: true;
  payeeName: string;
  upiVpa: string;
  amountPaise: number;
  tapToPayUrl: string;
}> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      vendor: { select: { upiVpa: true, upiPayeeName: true, businessName: true } },
      customer: { select: { phone: true, id: true } }
    }
  });
  if (!order || order.vendorId !== input.vendorId) {
    throw createError('Order not found', 404, ErrorType.NOT_FOUND);
  }
  if (order.status === 'cancelled') {
    throw createError('Cancelled orders cannot receive a UPI QR', 409, ErrorType.PAYMENT);
  }

  const captured = await prisma.customerPayment.findFirst({
    where: { orderId: order.id, settlementAlert: null, netMilli: { gt: 0 } }
  });
  if (captured) {
    throw createError('Order is already paid online', 409, ErrorType.PAYMENT);
  }

  const cashCollected = await prisma.orderAuditLog.findFirst({
    where: { orderId: order.id, action: 'cash_collected' }
  });
  if (cashCollected) {
    throw createError('Payment already marked received for this order', 409, ErrorType.PAYMENT);
  }

  const vpa = order.vendor.upiVpa?.trim();
  const payeeName = order.vendor.upiPayeeName?.trim();
  if (!vpa || !payeeName) {
    throw createError('Save your UPI ID and payee name in payment settings first', 409, ErrorType.VALIDATION);
  }

  if (await isOutsideWhatsApp24hWindow(order.conversationId)) {
    throw createError(
      'The customer must message within the last 24 hours to send a GPay QR on WhatsApp',
      409,
      ErrorType.PAYMENT
    );
  }

  await getPaymentLinkService().cancelOpenLinksForOrder(order.id);

  const amountRupees = (order.totalAmount / 100).toFixed(2);
  const upiUri = buildUpiUri({
    vpa,
    payeeName,
    amountRupees,
    note: order.orderNumber
  });
  const pngBuffer = await QRCode.toBuffer(upiUri, { type: 'png', width: 512, margin: 2 });

  const phoneNumberId = await resolveVendorSendingPhoneNumberId(order.vendorId);
  if (!phoneNumberId) {
    throw createError('WhatsApp sending number is not configured for this shop', 409, ErrorType.PAYMENT);
  }
  const caption = `${payeeName}\nUPI: ${vpa}\nAmount: ₹${amountRupees}\nOrder: ${order.orderNumber}`;

  const { mediaId } = await uploadWhatsAppMedia(
    phoneNumberId,
    'image/png',
    pngBuffer,
    `upi-${order.orderNumber}.png`
  );
  const sendResult = await sendWhatsAppImage({
    phoneNumberId,
    to: order.customer.phone,
    mediaId,
    caption
  });

  const tapToPayUrl = await getTapToPayUrlForOrder(order.id);
  if (!tapToPayUrl) {
    throw createError('Could not build tap-to-pay link for this order', 500, ErrorType.PAYMENT);
  }

  await sendWhatsAppCtaUrl({
    phoneNumberId,
    to: order.customer.phone,
    bodyText: `Pay ${amountRupees} for order ${order.orderNumber}. Open your UPI app (GPay, PhonePe, or bank).`,
    displayText: 'Tap to pay',
    url: tapToPayUrl
  });

  const now = new Date();
  const messageId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.orderAuditLog.create({
      data: {
        id: randomUUID(),
        orderId: order.id,
        action: 'upi_qr_sent',
        changes: {
          amountPaise: order.totalAmount,
          payeeName,
          changedBy: input.changedBy ?? 'vendor'
        },
        timestamp: now
      }
    });
    await tx.message.create({
      data: {
        id: messageId,
        conversationId: order.conversationId,
        senderType: 'assistant',
        type: 'image',
        content: caption,
        timestamp: now,
        whatsappMessageId: sendResult?.messageId ?? null,
        status: sendResult ? 'sent' : 'pending'
      }
    });
  });

  return { sent: true, payeeName, upiVpa: vpa, amountPaise: order.totalAmount, tapToPayUrl };
}
