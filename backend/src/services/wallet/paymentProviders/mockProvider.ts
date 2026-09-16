import { randomUUID } from 'node:crypto';
import { prisma } from '../../../db/prisma.js';
import { getPlatformSettings } from '../../platformSettingsService.js';
import { createError, ErrorType } from '../../../middleware/errorHandler.js';
import { creditWalletFromTopUp } from '../walletTopUpService.js';
import type { WalletPaymentProvider } from './types.js';

const INTENT_TTL_MS = 30 * 60 * 1000;

export const mockWalletPaymentProvider: WalletPaymentProvider = {
  name: 'mock',

  async createIntent(vendorId, amountMilli) {
    if (!getPlatformSettings().mockWalletTopUpEnabled) {
      throw createError('Mock wallet top-up is disabled', 403, ErrorType.AUTHORIZATION, undefined, {
        error: 'mock_topup_disabled'
      });
    }

    const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
    const intentId = randomUUID();
    const intent = await prisma.walletTopUpIntent.create({
      data: {
        id: intentId,
        vendorId,
        amountMilli,
        status: 'pending',
        provider: 'mock',
        idempotencyKey: `intent:${intentId}`,
        expiresAt
      }
    });

    return {
      intentId: intent.id,
      provider: 'mock',
      amountMilli,
      clientAction: { type: 'mock_confirm', intentId: intent.id }
    };
  },

  async confirmMock(vendorId, intentId) {
    if (!getPlatformSettings().mockWalletTopUpEnabled) {
      throw createError('Mock wallet top-up is disabled', 403, ErrorType.AUTHORIZATION, undefined, {
        error: 'mock_topup_disabled'
      });
    }

    const intent = await prisma.walletTopUpIntent.findUnique({ where: { id: intentId } });
    if (!intent) {
      throw createError('Top-up intent not found', 404, ErrorType.NOT_FOUND, undefined, { error: 'intent_not_found' });
    }

    if (intent.vendorId !== vendorId) {
      throw createError('Intent does not belong to this vendor', 403, ErrorType.AUTHORIZATION, undefined, {
        error: 'intent_forbidden'
      });
    }

    if (intent.status === 'completed') {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { walletBalanceMilli: true }
      });
      throw createError('Top-up already completed', 409, ErrorType.BUSINESS_LOGIC, undefined, {
        error: 'intent_already_completed',
        balanceMilli: vendor?.walletBalanceMilli ?? 0
      });
    }

    if (intent.status !== 'pending') {
      throw createError('Top-up intent is not pending', 409, ErrorType.BUSINESS_LOGIC, undefined, {
        error: 'intent_not_pending',
        status: intent.status
      });
    }

    if (intent.expiresAt.getTime() < Date.now()) {
      await prisma.walletTopUpIntent.update({
        where: { id: intentId },
        data: { status: 'expired' }
      });
      throw createError('Top-up intent expired', 410, ErrorType.BUSINESS_LOGIC, undefined, { error: 'intent_expired' });
    }

    const credit = await creditWalletFromTopUp({
      vendorId,
      amountMilli: intent.amountMilli,
      idempotencyKey: intent.idempotencyKey,
      metadata: {
        source: 'wallet_topup',
        provider: 'mock',
        intentId: intent.id,
        idempotencyKey: intent.idempotencyKey,
        amountMilli: intent.amountMilli,
        currency: 'INR'
      }
    });

    await prisma.walletTopUpIntent.update({
      where: { id: intentId },
      data: {
        status: 'completed',
        completedAt: new Date()
      }
    });

    return {
      balanceMilli: credit.balanceAfterMilli,
      transactionId: credit.transactionId,
      alreadyCompleted: credit.idempotent
    };
  }
};
