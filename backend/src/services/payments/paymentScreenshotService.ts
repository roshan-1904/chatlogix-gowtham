import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger.js';
import { createAlert } from '../orderAlertService.js';
import { aiCostMilliForTokens, chargeVendor } from '../pricing/pricingService.js';
import { loadOrderPaymentContext } from './orderPaymentState.js';

const PAID_CAPTION_PHRASES = [
  'payment done',
  'payment sent',
  'sent payment',
  'upi done',
  'gpay done',
  'pay cheythu',
  'pay panniten',
  'paisa bhej',
  'payment kar diya'
];

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export function captionClaimsPaid(caption: string | null | undefined): boolean {
  const text = (caption ?? '').trim().toLowerCase();
  if (!text) return false;
  if (PAID_CAPTION_PHRASES.some((phrase) => text.includes(phrase))) return true;
  if (/\bunpaid\b/.test(text)) return false;
  return /\bpaid\b/.test(text);
}

export interface VisionPaidResult {
  claimsPaid: boolean;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

async function visionClaimsPaid(
  imageBuffer: Buffer,
  contentType: string,
  model: string
): Promise<VisionPaidResult> {
  if (!openai) return { claimsPaid: false, promptTokens: 0, completionTokens: 0, model };
  const dataUrl = `data:${contentType};base64,${imageBuffer.toString('base64')}`;
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Does this image appear to be a payment confirmation or UPI/GPay/bank transfer screenshot showing the customer paid? Reply with JSON only: {"claimsPaid": boolean}'
            },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 64
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as { claimsPaid?: boolean };
    return {
      claimsPaid: parsed.claimsPaid === true,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      model
    };
  } catch (err) {
    logger.warn({ err }, 'Payment screenshot vision check failed');
    return { claimsPaid: false, promptTokens: 0, completionTokens: 0, model };
  }
}

let visionOverride: ((imageBuffer: Buffer, contentType: string, model: string) => Promise<VisionPaidResult>) | null =
  null;

export function setPaymentScreenshotVisionForTests(
  fn: ((imageBuffer: Buffer, contentType: string, model: string) => Promise<VisionPaidResult>) | null
): void {
  visionOverride = fn;
}

export async function findUnpaidOrderForPaymentScreenshot(input: {
  conversationId: string;
  vendorId: string;
}): Promise<string | null> {
  const orders = await prisma.order.findMany({
    where: {
      conversationId: input.conversationId,
      vendorId: input.vendorId,
      status: { not: 'cancelled' }
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, status: true, paymentMethod: true, totalAmount: true }
  });
  if (orders.length === 0) return null;

  const ctx = await loadOrderPaymentContext(orders.map((o) => o.id));
  for (const order of orders) {
    if (ctx.capturedByOrderId.has(order.id)) continue;
    if (ctx.cashCollectedOrderIds.has(order.id)) continue;
    if (order.status === 'awaiting_payment') return order.id;
    if (ctx.openLinkByOrderId.has(order.id)) return order.id;
    if (ctx.upiQrSentOrderIds.has(order.id)) return order.id;
  }
  return null;
}

async function billScreenshotVision(input: {
  vendorId: string;
  conversationId: string;
  messageId?: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}): Promise<void> {
  if (!input.messageId || (input.promptTokens <= 0 && input.completionTokens <= 0)) return;
  const aiCostMilli = aiCostMilliForTokens(input.model, input.promptTokens, input.completionTokens);
  if (aiCostMilli <= 0) return;
  await chargeVendor({
    vendorId: input.vendorId,
    source: 'conversation_turn',
    conversationId: input.conversationId,
    conversationType: 'image',
    idempotencyKey: `payment-screenshot:${input.messageId}`,
    cost: { aiCostMilli },
    metadata: { purpose: 'payment_screenshot' }
  });
}

export async function handlePaymentScreenshotIfApplicable(input: {
  conversationId: string;
  vendorId: string;
  customerId: string;
  messageId?: string;
  imageBuffer: Buffer;
  contentType: string;
  caption: string | null | undefined;
  visionModel: string;
}): Promise<{ handled: true; customerReply: string; orderId: string } | { handled: false }> {
  const orderId = await findUnpaidOrderForPaymentScreenshot({
    conversationId: input.conversationId,
    vendorId: input.vendorId
  });
  if (!orderId) return { handled: false };

  const ctx = await loadOrderPaymentContext([orderId]);
  if (ctx.capturedByOrderId.has(orderId)) return { handled: false };

  const captionPaid = captionClaimsPaid(input.caption);
  let visionPaid = false;
  if (!captionPaid) {
    const vision = await (visionOverride ?? visionClaimsPaid)(
      input.imageBuffer,
      input.contentType,
      input.visionModel
    );
    visionPaid = vision.claimsPaid;
    await billScreenshotVision({
      vendorId: input.vendorId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      model: vision.model,
      promptTokens: vision.promptTokens,
      completionTokens: vision.completionTokens
    }).catch((err) => {
      logger.warn({ err, orderId }, 'Payment screenshot vision charge failed');
    });
  }
  const claimsPaid = captionPaid || visionPaid;
  if (!claimsPaid) return { handled: false };

  const existing = await prisma.orderAlert.findFirst({
    where: { orderId, type: 'payment_initiated', resolved: false }
  });
  if (!existing) {
    await createAlert(
      orderId,
      'payment_initiated',
      'medium',
      'Customer sent a payment screenshot — confirm when you see the money.'
    );
  }

  return {
    handled: true,
    orderId,
    customerReply:
      'Thanks! We received your payment screenshot. The shop will confirm once they see the payment in their account.'
  };
}

export async function ensurePaymentInitiatedAlert(orderId: string): Promise<void> {
  const existing = await prisma.orderAlert.findFirst({
    where: { orderId, type: 'payment_initiated', resolved: false }
  });
  if (existing) return;
  await createAlert(
    orderId,
    'payment_initiated',
    'medium',
    'Customer sent a payment screenshot — confirm when you see the money.'
  );
}
