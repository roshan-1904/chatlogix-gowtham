import { randomUUID } from 'node:crypto';
import { prisma } from '../../../db/prisma.js';
import { env } from '../../../config/env.js';
import { createError, ErrorType } from '../../../middleware/errorHandler.js';
import { getRazorpayApiClient } from '../../payments/razorpayApiClient.js';
import { milliToPaise } from '../../../utils/money.js';
import type { WalletPaymentProvider } from './types.js';

const INTENT_TTL_MS = 30 * 60 * 1000;

function assertRazorpayConfigured(): { keyId: string } {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) {
    throw createError('Razorpay is not configured', 503, ErrorType.PAYMENT, undefined, {
      error: 'razorpay_not_configured'
    });
  }
  return { keyId };
}

export const razorpayWalletPaymentProvider: WalletPaymentProvider = {
  name: 'razorpay',

  async createIntent(vendorId, amountMilli) {
    const { keyId } = assertRazorpayConfigured();
    const amountPaise = milliToPaise(amountMilli);
    if (amountPaise <= 0) {
      throw createError('Invalid top-up amount', 400, ErrorType.VALIDATION, undefined, { error: 'invalid_amount' });
    }

    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const intentId = randomUUID();

    const intent = await prisma.walletTopUpIntent.create({
      data: {
        id: intentId,
        vendorId,
        amountMilli,
        status: 'pending',
        provider: 'razorpay',
        idempotencyKey: `intent:${intentId}`,
        expiresAt
      }
    });

    const order = await getRazorpayApiClient().createOrder({
      amountPaise,
      receipt: intent.id.replace(/-/g, '').slice(0, 40),
      notes: {
        purpose: 'wallet_topup',
        intentId: intent.id
      }
    });

    return {
      intentId: intent.id,
      provider: 'razorpay',
      amountMilli,
      clientAction: {
        type: 'razorpay_checkout',
        orderId: order.id,
        amountMilli,
        keyId
      }
    };
  }
};
