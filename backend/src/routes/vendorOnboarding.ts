import { Router, type Request } from 'express';
import express from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireRole } from '../middleware/authorize.js';
import { asyncHandler, createValidationError } from '../middleware/errorHandler.js';
import { logger } from '../logger.js';
import { getTrialWalletSummary } from '../services/billingService.js';
import {
  runOnboardingSandboxChat,
  runOnboardingSandboxVoice
} from '../services/onboardingSandboxService.js';
import { logOnboardingFunnelEvent } from '../services/onboardingFunnelService.js';
import { buildAIPromptsUpdate, generateOnboardingAiConfig, mergeHoursIntoDelivery } from '../services/vendorAIConfigService.js';
import {
  applyIntakeAnswers,
  asExtractedFields,
  getIntakeSnapshot,
  persistThinProductsForDemo
} from '../services/onboardingIntakeService.js';

export const vendorOnboardingRouter = Router();

const ONBOARDING_STATUSES = new Set(['onboarding', 'pending_approval', 'approved', 'rejected']);

const step1CatalogSchema = z
  .object({
    catalogJobId: z.string().uuid().optional(),
    skipped: z.boolean().optional(),
    productCount: z.number().int().min(0).optional()
  })
  .passthrough();

const intakeSchema = z.object({
  answers: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  askedIds: z.array(z.string()).optional(),
  skipped: z.boolean().optional()
});

const confirmSchema = z.object({
  businessName: z.string().min(3).max(100).optional(),
  ownerName: z.string().min(2).max(50).optional(),
  email: z.string().email().optional(),
  category: z.enum(['Food', 'Retail', 'Services', 'Healthcare', 'Education', 'Other']).optional(),
  city: z.string().max(120).optional(),
  aiPickupDeliveryAddress: z.string().min(8).max(500).optional(),
  aiDeliveryInstructions: z.string().max(1000).optional(),
  aiBotName: z.string().min(1).max(80).optional(),
  aiGreeting: z.string().min(1).max(500).optional(),
  aiPersonality: z.string().max(2000).optional(),
  aiClosing: z.string().max(500).optional()
});

const reviewSchema = z.object({
  email: z.string().email().optional()
});

const patchOnboardingSchema = z.object({
  step: z.number().int().min(1).max(5),
  data: z.record(z.unknown()).optional(),
  advance: z.boolean().optional()
});

function requireVendorId(req: Request): string {
  const vendorId = req.user?.vendorId;
  if (!vendorId) {
    throw createValidationError('Vendor context is required', 'vendorId');
  }
  return vendorId;
}

async function assertEmailAvailable(vendorId: string, email: string): Promise<void> {
  const emailOwner = await prisma.vendor.findFirst({
    where: { email, NOT: { id: vendorId } },
    select: { id: true }
  });
  if (emailOwner) {
    throw createValidationError('That email is already used by another shop', 'email');
  }
}

function stepPath(step: number): string {
  const paths = ['catalog', 'clarify', 'confirm', 'demo-chat', 'review'];
  return paths[Math.max(0, Math.min(step - 1, paths.length - 1))] ?? 'catalog';
}

vendorOnboardingRouter.get(
  '/me/onboarding',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        businessName: true,
        phone: true,
        email: true,
        category: true,
        registrationStatus: true,
        onboardingStep: true,
        onboardingData: true,
        submittedAt: true,
        rejectionReason: true,
        walletBalanceMilli: true,
        trialGrantedMilli: true,
        trialExpiresAt: true,
        aiBotName: true,
        aiGreeting: true,
        aiPersonality: true,
        aiClosing: true,
        aiDeliveryInstructions: true,
        aiPickupDeliveryAddress: true,
        _count: { select: { products: true } }
      }
    });

    if (!vendor) {
      return res.status(404).json({ error: 'vendor_not_found' });
    }

    const intakeSnapshot = await getIntakeSnapshot(vendorId);

    return res.json({
      ...vendor,
      resumePath: `/onboarding/${stepPath(vendor.onboardingStep)}`,
      productCount: vendor._count.products,
      completeness: intakeSnapshot.completeness,
      nextQuestions: intakeSnapshot.nextQuestions,
      extractedProfile: asExtractedFields(intakeSnapshot.extractedProfile),
      demoPrompts: intakeSnapshot.demoPrompts
    });
  })
);

vendorOnboardingRouter.patch(
  '/me/onboarding',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const parsed = patchOnboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw createValidationError('Invalid onboarding payload', 'body', parsed.error.flatten());
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        registrationStatus: true,
        onboardingData: true,
        onboardingStep: true,
        email: true,
        businessName: true,
        category: true
      }
    });
    if (!vendor) {
      return res.status(404).json({ error: 'vendor_not_found' });
    }
    if (vendor.registrationStatus === 'approved') {
      return res.status(403).json({ error: 'already_approved' });
    }

    const { step, data = {}, advance = true } = parsed.data;
    const mergedData = {
      ...((vendor.onboardingData as Record<string, unknown> | null) ?? {}),
      ...data
    };

    let updateData: Record<string, unknown> = {
      onboardingData: mergedData
    };

    if (step === 1) {
      const s1 = step1CatalogSchema.safeParse(data);
      if (!s1.success) {
        throw createValidationError('Please check your catalog step', 'data', s1.error.flatten());
      }
      updateData = {
        ...updateData,
        onboardingData: { ...mergedData, catalog: s1.data }
      };
      logOnboardingFunnelEvent('step_1_completed', { vendorId });
    }

    if (step === 2) {
      const intake = intakeSchema.safeParse(data.intake ?? data);
      if (!intake.success) {
        throw createValidationError('Please check your answers', 'data', intake.error.flatten());
      }
      if (intake.data.skipped) {
        logOnboardingFunnelEvent('intake_skipped', { vendorId });
        updateData = {
          ...updateData,
          onboardingData: {
            ...mergedData,
            intake: {
              ...((mergedData.intake as Record<string, unknown> | undefined) ?? {}),
              skipped: true
            }
          }
        };
      } else if (intake.data.answers || intake.data.askedIds) {
        await applyIntakeAnswers(vendorId, intake.data);
        const refreshed = await prisma.vendor.findUnique({
          where: { id: vendorId },
          select: { onboardingData: true }
        });
        updateData.onboardingData = refreshed?.onboardingData ?? mergedData;
      }
      logOnboardingFunnelEvent('step_2_completed', { vendorId });
    }

    if (step === 3) {
      const confirm = confirmSchema.safeParse(data);
      if (!confirm.success) {
        throw createValidationError('Please check your shop details', 'data', confirm.error.flatten());
      }
      if (confirm.data.email && confirm.data.email !== vendor.email) {
        await assertEmailAvailable(vendorId, confirm.data.email);
      }
      const snapshot = await getIntakeSnapshot(vendorId);
      const extracted = {
        ...(snapshot.extractedProfile ?? {}),
        ...((mergedData.extractedProfile as {
          hours?: string | null;
          address?: string | null;
          city?: string | null;
          deliveryNotes?: string | null;
          languageHint?: string | null;
        } | undefined) ?? {})
      };
      const generated = generateOnboardingAiConfig({
        businessName: confirm.data.businessName ?? vendor.businessName,
        category: confirm.data.category ?? vendor.category,
        languageHint: extracted.languageHint,
        deliveryNotes: extracted.deliveryNotes,
        address: extracted.address,
        city: confirm.data.city ?? extracted.city,
        hours: extracted.hours,
        deliveryInstructions: confirm.data.aiDeliveryInstructions
      });
      const aiUpdate = buildAIPromptsUpdate({
        botName: confirm.data.aiBotName,
        greeting: confirm.data.aiGreeting,
        personality: confirm.data.aiPersonality,
        closing: confirm.data.aiClosing,
        deliveryInstructions: mergeHoursIntoDelivery(
          confirm.data.aiDeliveryInstructions,
          extracted.hours
        ),
        pickupDeliveryAddress: confirm.data.aiPickupDeliveryAddress,
        contentImportantInstructions: generated.contentImportantInstructions
      });
      updateData = {
        ...updateData,
        ...(confirm.data.businessName ? { businessName: confirm.data.businessName } : {}),
        ...(confirm.data.email ? { email: confirm.data.email } : {}),
        ...(confirm.data.category ? { category: confirm.data.category } : {}),
        ...aiUpdate,
        onboardingData: { ...mergedData, confirm: confirm.data }
      };
      logOnboardingFunnelEvent('step_3_completed', { vendorId });
    }

    if (step === 4) {
      logOnboardingFunnelEvent('step_4_completed', { vendorId });
    }

    if (step === 5) {
      const review = reviewSchema.safeParse(data);
      if (!review.success) {
        throw createValidationError('Please check your email', 'data', review.error.flatten());
      }
      if (review.data.email && review.data.email !== vendor.email) {
        await assertEmailAvailable(vendorId, review.data.email);
      }
      updateData = {
        ...updateData,
        ...(review.data.email ? { email: review.data.email } : {})
      };
    }

    if (advance) {
      updateData.onboardingStep = Math.max(vendor.onboardingStep, step) + (step < 5 ? 1 : 0);
      if (step === 5) {
        updateData.onboardingStep = 5;
        logOnboardingFunnelEvent('step_5_completed', { vendorId });
      }
    } else {
      updateData.onboardingStep = step;
    }

    const updated = await prisma.vendor.update({
      where: { id: vendorId },
      data: updateData,
      select: {
        registrationStatus: true,
        onboardingStep: true,
        onboardingData: true,
        businessName: true,
        email: true
      }
    });

    if (step === 3) {
      try {
        await persistThinProductsForDemo(vendorId);
      } catch (err) {
        logger.warn({ err, vendorId }, 'onboarding_demo_enrich_failed');
      }
    }

    return res.json({
      ...updated,
      resumePath: `/onboarding/${stepPath(updated.onboardingStep)}`
    });
  })
);

vendorOnboardingRouter.get(
  '/me/trial-wallet',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const summary = await getTrialWalletSummary(vendorId);
    return res.json(summary);
  })
);

vendorOnboardingRouter.post(
  '/me/sandbox/chat',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      throw createValidationError('Please type a message to send', 'text');
    }

    const started = Date.now();
    const result = await runOnboardingSandboxChat(vendorId, text);
    const durationMs = Date.now() - started;
    if (durationMs > 20_000) {
      logger.warn({ vendorId, durationMs }, 'sandbox_latency_alert');
    }

    return res.json({
      response: result.finalText,
      intent: result.intent,
      costMilli: result.costMilli,
      tokenUsage: result.tokenMeta,
      durationMs
    });
  })
);

vendorOnboardingRouter.post(
  '/me/sandbox/voice',
  requireRole('vendor'),
  express.raw({ type: ['audio/*', 'application/octet-stream', 'video/webm'], limit: '10mb' }),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    if (!buffer.length) {
      throw createValidationError('Please upload a voice note', 'audio');
    }

    const started = Date.now();
    const result = await runOnboardingSandboxVoice(
      vendorId,
      buffer,
      req.get('content-type')?.split(';')[0]?.trim() || 'audio/ogg'
    );

    return res.json({
      transcript: result.transcript,
      response: result.finalText,
      intent: result.intent,
      costMilli: result.costMilli,
      tokenUsage: result.tokenMeta,
      durationMs: Date.now() - started
    });
  })
);

vendorOnboardingRouter.post(
  '/me/submit-for-approval',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { registrationStatus: true, businessName: true, email: true }
    });
    if (!vendor) {
      return res.status(404).json({ error: 'vendor_not_found' });
    }
    if (vendor.registrationStatus === 'approved') {
      return res.status(400).json({ error: 'already_approved' });
    }

    const updated = await prisma.vendor.update({
      where: { id: vendorId },
      data: {
        registrationStatus: 'pending_approval',
        submittedAt: new Date(),
        onboardingStep: 5
      },
      select: {
        registrationStatus: true,
        submittedAt: true,
        businessName: true,
        phone: true
      }
    });

    logOnboardingFunnelEvent('submitted', { vendorId });

    return res.json(updated);
  })
);

vendorOnboardingRouter.get(
  '/me',
  requireRole('vendor'),
  asyncHandler(async (req, res) => {
    const vendorId = requireVendorId(req);
    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        businessName: true,
        phone: true,
        email: true,
        registrationStatus: true,
        onboardingStep: true,
        walletBalanceMilli: true,
        trialGrantedMilli: true,
        trialExpiresAt: true
      }
    });
    if (!vendor) {
      return res.status(404).json({ error: 'vendor_not_found' });
    }
    if (!ONBOARDING_STATUSES.has(vendor.registrationStatus)) {
      return res.status(500).json({ error: 'invalid_registration_status' });
    }
    return res.json(vendor);
  })
);
