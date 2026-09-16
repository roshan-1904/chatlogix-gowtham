import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import {
  ensurePlatformSettings,
  getPlatformSettings,
  refreshUsdInrRate,
  updatePlatformSettings,
  FX_SANITY_MAX,
  FX_SANITY_MIN,
  type PlatformSettingsPatch
} from '../services/platformSettingsService.js';

export const adminSettingsRouter = Router();

const optionalNonNegInt = z.number().int().min(0);
const optionalPresets = z.array(z.number().int().min(0)).max(20);

const patchSchema = z
  .object({
    usdToInrOverride: z.number().min(FX_SANITY_MIN).max(FX_SANITY_MAX).nullable().optional(),
    platformFeePerTurnPaise: optionalNonNegInt.optional(),
    platformFeeOutboundMediaPaise: optionalNonNegInt.optional(),
    trialGrantPaise: optionalNonNegInt.optional(),
    trialExpiryDays: z.number().int().min(1).max(3650).optional(),
    catalogImportDailyPaiseCap: optionalNonNegInt.optional(),
    catalogEnhanceDailyPaiseCap: optionalNonNegInt.optional(),
    minWalletTopUpPaise: optionalNonNegInt.optional(),
    maxWalletTopUpPaise: optionalNonNegInt.optional(),
    walletTopUpPresetsPaise: optionalPresets.optional(),
    mockWalletTopUpEnabled: z.boolean().optional()
  })
  .strict();

adminSettingsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    await ensurePlatformSettings();
    res.json(getPlatformSettings());
  })
);

adminSettingsRouter.patch(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createValidationError(
        parsed.error.errors[0]?.message ?? 'Invalid settings',
        parsed.error.errors[0]?.path.join('.') || 'body'
      );
    }

    const current = await ensurePlatformSettings();
    const nextMin = parsed.data.minWalletTopUpPaise ?? current.minWalletTopUpPaise;
    const nextMax = parsed.data.maxWalletTopUpPaise ?? current.maxWalletTopUpPaise;
    if (nextMin > nextMax) {
      throw createValidationError(
        'minWalletTopUpPaise must be less than or equal to maxWalletTopUpPaise',
        'minWalletTopUpPaise'
      );
    }

    const updatedBy = req.user?.userId ?? req.user?.id ?? req.user?.phoneNumber;
    const settings = await updatePlatformSettings(
      parsed.data as PlatformSettingsPatch,
      typeof updatedBy === 'string' ? updatedBy : undefined
    );
    res.json(settings);
  })
);

adminSettingsRouter.post(
  '/refresh-fx',
  asyncHandler(async (_req, res) => {
    const result = await refreshUsdInrRate();
    res.status(result.ok ? 200 : 502).json(result);
  })
);
