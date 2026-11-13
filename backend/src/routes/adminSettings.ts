import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../logger.js';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import { recordInMemoryAuditLog } from '../services/adminControlsService.js';
import { recordStaffAuditLog } from '../services/adminSupportService.js';
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
    mockWalletTopUpEnabled: z.boolean().optional(),
    refundReturnsWithheldTaxToShop: z.boolean().optional(),
    gstTcsBaseExcludesShopGst: z.boolean().optional()
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
    const actorId = typeof updatedBy === 'string' ? updatedBy : 'admin';
    const settings = await updatePlatformSettings(
      parsed.data as PlatformSettingsPatch,
      typeof updatedBy === 'string' ? updatedBy : undefined
    );

    // Extract previous values for changed keys
    const previousValues: Record<string, unknown> = {};
    for (const key of Object.keys(parsed.data)) {
      previousValues[key] = (current as any)[key];
    }

    recordInMemoryAuditLog({
      actorId,
      action: 'settings_changed',
      vendorId: null,
      summary: `Platform settings updated: ${Object.keys(parsed.data).join(', ')}`,
      metadata: {
        patch: parsed.data,
        previous: previousValues,
      },
    });

    const auditRecorded = await recordStaffAuditLog({
      actorId,
      action: 'settings_changed',
      vendorId: null,
      summary: `Platform settings updated: ${Object.keys(parsed.data).join(', ')}`,
      metadata: {
        patch: parsed.data,
        previous: previousValues,
      },
    });
    if (!auditRecorded) {
      logger.error({ patch: parsed.data, actorId }, 'Staff audit log failed closed for settings_changed');
    }

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
