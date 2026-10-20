import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import type { CartOp } from './types.js';
import { getPaymentLinkService } from '../services/paymentLinkService.js';
import {
  acceptPaymentLinkOffer,
  declinePaymentLinkOffer,
  getLatestPaymentLinkOfferState,
  offerPaymentLink
} from '../services/payments/orderPaymentOffer.js';

export interface OrderPaymentPipelineResult {
  /** Bot should ask the customer before sending a Razorpay link. */
  paymentLinkOffered?: {
    orderNumber: string;
    amountPaise: number;
  };
  paymentLinkSent?: boolean;
}

/**
 * After CartEngine.apply: offer or send payment links when collection is on.
 */
export async function handleAcceptPaymentLinkOp(input: {
  orderId: string | null;
  phoneNumberId?: string;
  ops: CartOp[];
}): Promise<OrderPaymentPipelineResult> {
  if (!input.orderId || !input.ops.some((op) => op.type === 'accept_payment_link')) {
    return {};
  }
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true }
  });
  if (!order || order.status !== 'awaiting_payment') return {};
  const { sent } = await acceptPaymentLinkOffer({
    orderId: order.id,
    phoneNumberId: input.phoneNumberId
  });
  return { paymentLinkSent: sent };
}

export async function handleOrderPaymentLinksAfterCartApply(input: {
  vendorId: string;
  conversationId: string;
  phoneNumberId?: string;
  orderId: string | null;
  mutated: boolean;
  ops: CartOp[];
  previousTotalPaise?: number;
  traceId?: string;
}): Promise<OrderPaymentPipelineResult> {
  const acceptResult = await handleAcceptPaymentLinkOp({
    orderId: input.orderId,
    phoneNumberId: input.phoneNumberId,
    ops: input.ops
  });
  if (acceptResult.paymentLinkSent !== undefined) return acceptResult;

  if (!input.mutated || !input.orderId) {
    if (input.orderId && input.traceId) {
      const existing = await getLatestPaymentLinkOfferState(input.orderId);
      if (
        existing.state === 'offered' &&
        existing.traceId === input.traceId &&
        existing.orderNumber &&
        existing.amountPaise != null
      ) {
        return {
          paymentLinkOffered: {
            orderNumber: existing.orderNumber,
            amountPaise: existing.amountPaise
          }
        };
      }
    }
    return {};
  }

  const confirmOp = input.ops.some((op) => op.type === 'confirm');
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true, totalAmount: true, paymentMethod: true, orderNumber: true }
  });
  if (!order) return {};

  const service = getPaymentLinkService();

  if (confirmOp && order.status === 'awaiting_payment') {
    const vendor = await prisma.vendor.findUnique({
      where: { id: input.vendorId },
      select: { paymentLinkAutoSend: true, paymentsManagedByChatlogix: true }
    });
    if (!vendor?.paymentsManagedByChatlogix) return {};
    if (!vendor.paymentLinkAutoSend) return {};

    try {
      await offerPaymentLink({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amountPaise: order.totalAmount,
        traceId: input.traceId
      });
      return {
        paymentLinkOffered: {
          orderNumber: order.orderNumber,
          amountPaise: order.totalAmount
        }
      };
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'Payment link offer after confirm failed');
    }
    return {};
  }

  if (
    order.status === 'awaiting_payment' &&
    input.previousTotalPaise != null &&
    input.previousTotalPaise !== order.totalAmount
  ) {
    try {
      await service.refreshLinkAfterCartChange(order.id, { phoneNumberId: input.phoneNumberId });
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'Payment link refresh after cart change failed');
    }
  }

  return {};
}

/** Clear a pending offer when the customer did not accept this turn. */
export async function maybeDeclinePaymentLinkOffer(input: {
  orderId: string | null;
  ops: CartOp[];
  traceId?: string;
}): Promise<void> {
  if (!input.orderId) return;
  if (input.ops.some((op) => op.type === 'accept_payment_link')) return;
  const offer = await getLatestPaymentLinkOfferState(input.orderId);
  if (offer.state !== 'offered') return;
  if (input.traceId && offer.traceId === input.traceId) return;
  await declinePaymentLinkOffer(input.orderId);
}

const PAYMENT_LINK_QUESTIONS: Record<string, (orderNumber: string, amount: string) => string> = {
  en: (orderNumber, amount) =>
    `Shall I send the payment link for order ${orderNumber}? The amount is ₹${amount}.`,
  hi: (orderNumber, amount) =>
    `क्या मैं ऑर्डर ${orderNumber} का पेमेंट लिंक भेज दूँ? राशि ₹${amount} है।`,
  ta: (orderNumber, amount) =>
    `ஆர்டர் ${orderNumber}க்கான பேமெண்ட் லிங்கை அனுப்பவா? தொகை ₹${amount}.`,
  ml: (orderNumber, amount) =>
    `ഓർഡർ ${orderNumber} ന്റെ പേയ്‌മെന്റ് ലിങ്ക് അയക്കട്ടെ? തുക ₹${amount}.`,
  kn: (orderNumber, amount) =>
    `ಆರ್ಡರ್ ${orderNumber} ಗೆ ಪೇಮೆಂಟ್ ಲಿಂಕ್ ಕಳುಹಿಸಲೇ? ಮೊತ್ತ ₹${amount}.`,
  te: (orderNumber, amount) =>
    `ఆర్డర్ ${orderNumber} కోసం పేమెంట్ లింక్ పంపనా? మొత్తం ₹${amount}.`
};

/** Customer-facing question. Appended after reply selection so the model cannot drop it. */
export function buildPaymentLinkQuestion(input: {
  orderNumber: string;
  amountPaise: number;
  language?: string | null;
}): string {
  const amount = (input.amountPaise / 100).toFixed(2);
  const lang = (input.language ?? 'en').toLowerCase().split(/[-_]/)[0] ?? 'en';
  const line = (PAYMENT_LINK_QUESTIONS[lang] ?? PAYMENT_LINK_QUESTIONS.en)(input.orderNumber, amount);
  return line;
}

export function buildPaymentLinkOfferAppendix(input: {
  orderNumber: string;
  amountPaise: number;
  language?: string | null;
}): string {
  return `\n\n${buildPaymentLinkQuestion(input)}`;
}
