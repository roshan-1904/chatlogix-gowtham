import { Router, type Request } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/authorize.js';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import { walletEnv } from '../config/env.js';
import { assertVendorCanTopUp } from '../services/wallet/walletTopUpService.js';
import { getVendorWalletSummary } from '../services/wallet/walletSummaryService.js';
import { getWalletPaymentProvider } from '../services/wallet/paymentProviders/index.js';
import { ensurePlatformSettings, getPlatformSettings } from '../services/platformSettingsService.js';
import { paiseToMilli } from '../utils/money.js';
import { walletTopUpIntentRateLimit } from '../middleware/walletTopUpRateLimit.js';
import {
  disableAutoRecharge,
  startAutoRechargeMandateRegistration
} from '../services/wallet/autoRechargeService.js';
import { isAutoRechargePresetMilli } from '../services/wallet/autoRechargeConstants.js';

export const vendorWalletRouter = Router();

function requireVendorId(req: Request): string {
  const vendorId = req.user?.vendorId;
  if (!vendorId) {
    throw createValidationError('Vendor context is required', 'vendorId');
  }
  return vendorId;
}

function topUpIntentSchema(minMilli: number, maxMilli: number) {
  return z.object({
    amountMilli: z
      .number()
      .int()
      .min(minMilli, `Minimum top-up is ${minMilli} millirupees`)
      .max(maxMilli, `Maximum top-up is ${maxMilli} millirupees`)
  });
}

const confirmMockSchema = z.object({
  intentId: z.string().uuid()
});

const autoRechargeSetupSchema = z.object({
  amountMilli: z.number().int()
});

const autoRechargeDisableSchema = z.object({
  enabled: z.literal(false)
});

vendorWalletRouter.get(
  '/me/wallet',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const summary = await getVendorWalletSummary(vendorId);
    if (!summary) {
      return res.status(404).json({ error: 'vendor_not_found' });
    }
    res.json(summary);
  })
);

vendorWalletRouter.post(
  '/me/wallet/top-up-intent',
  requireRole('vendor'),
  walletTopUpIntentRateLimit,
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    await ensurePlatformSettings();
    await assertVendorCanTopUp(vendorId);

    const settings = getPlatformSettings();
    const minMilli = paiseToMilli(settings.minWalletTopUpPaise);
    const maxMilli = paiseToMilli(settings.maxWalletTopUpPaise);
    const parsed = topUpIntentSchema(minMilli, maxMilli).safeParse(req.body);
    if (!parsed.success) {
      throw createValidationError(parsed.error.errors[0]?.message ?? 'Invalid amount', 'amountMilli');
    }

    const provider = getWalletPaymentProvider();
    const result = await provider.createIntent(vendorId, parsed.data.amountMilli);
    res.status(201).json(result);
  })
);

vendorWalletRouter.post(
  '/me/wallet/confirm-mock',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);

    await ensurePlatformSettings();

    if (walletEnv.paymentProvider !== 'mock') {
      return res.status(403).json({ error: 'mock_confirm_not_available' });
    }

    if (!getPlatformSettings().mockWalletTopUpEnabled) {
      return res.status(403).json({ error: 'mock_topup_disabled' });
    }

    await assertVendorCanTopUp(vendorId);

    const parsed = confirmMockSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createValidationError('Invalid intent id', 'intentId');
    }

    const provider = getWalletPaymentProvider();
    if (!provider.confirmMock) {
      return res.status(403).json({ error: 'mock_confirm_not_available' });
    }

    const result = await provider.confirmMock(vendorId, parsed.data.intentId);
    res.json({
      balanceMilli: result.balanceMilli,
      transactionId: result.transactionId,
      alreadyCompleted: result.alreadyCompleted ?? false
    });
  })
);

function requireUserId(req: Request): string {
  const uid = req.user?.id ?? req.user?.userId;
  if (!uid) {
    throw createValidationError('User context is required', 'userId');
  }
  return uid;
}

vendorWalletRouter.post(
  '/me/wallet/auto-recharge/setup',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const approvedBy = requireUserId(req);
    const parsed = autoRechargeSetupSchema.safeParse(req.body);
    if (!parsed.success || !isAutoRechargePresetMilli(parsed.data.amountMilli)) {
      throw createValidationError('Choose ₹500, ₹1,000, or ₹2,000 for auto-recharge', 'amountMilli');
    }

    const result = await startAutoRechargeMandateRegistration(
      vendorId,
      parsed.data.amountMilli,
      approvedBy
    );
    res.status(201).json(result);
  })
);

vendorWalletRouter.patch(
  '/me/wallet/auto-recharge',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const parsed = autoRechargeDisableSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createValidationError('Only { enabled: false } is supported', 'enabled');
    }
    await disableAutoRecharge(vendorId);
    res.json({ ok: true });
  })
);
