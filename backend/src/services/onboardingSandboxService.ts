import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { processMessage, type ProcessMessageResult } from '../conversation/pipeline.js';
import { aiCostMilliForAudio, chargeVendor } from './pricing/pricingService.js';
import { canProcessMessage } from './billingService.js';
import { logOnboardingFunnelEvent } from './onboardingFunnelService.js';
import { TRANSCRIBE_MODEL, estimateWebRecordingDurationSec } from './audioTranscription.js';

const SANDBOX_PHONE_PREFIX = 'sandbox:';
const SANDBOX_PHONE_NUMBER_ID = 'sandbox-onboarding';
const SANDBOX_EMPTY_WALLET_REPLY =
  'Your trial balance is used up. You can still submit for approval — our team will review your shop.';

export interface SandboxChatResult extends ProcessMessageResult {
  transcript?: string;
  /**
   * Millirupees actually taken from the trial wallet — the marked-up charge,
   * clamped so a trial balance never goes negative. The pipeline itself only
   * reports the pre-markup `aiCostMilli`; the demo shows this number so the
   * vendor sees the same pricing a live reply would cost them.
   */
  costMilli: number;
}

async function ensureSandboxConversation(vendorId: string): Promise<{
  customerId: string;
  conversationId: string;
  customerPhone: string;
}> {
  const customerPhone = `${SANDBOX_PHONE_PREFIX}${vendorId}`;
  const customer = await prisma.customer.upsert({
    where: { phone: customerPhone },
    update: {},
    create: { phone: customerPhone }
  });

  const existing = await prisma.conversation.findFirst({
    where: { vendorId, customerId: customer.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true }
  });

  const conversationId =
    existing?.id ??
    (
      await prisma.conversation.create({
        data: { vendorId, customerId: customer.id, status: 'sandbox' }
      })
    ).id;

  return { customerId: customer.id, conversationId, customerPhone };
}

async function transcribeAudioBuffer(bytes: Buffer, mimeType: string): Promise<{
  transcript: string;
  transcribeCostMilli: number;
}> {
  const { transcribeVendorAudioBuffer } = await import('./vendorAudioTranscriptionService.js');
  const { transcript } = await transcribeVendorAudioBuffer(bytes, mimeType);
  // Priced from audio duration rather than the returned costUsd, which is a
  // per-token figure computed from a synthetic token count — not how OpenAI
  // bills speech-to-text.
  return {
    transcript,
    transcribeCostMilli: aiCostMilliForAudio(
      TRANSCRIBE_MODEL,
      estimateWebRecordingDurationSec(bytes.byteLength)
    )
  };
}

export async function runOnboardingSandboxChat(
  vendorId: string,
  text: string
): Promise<SandboxChatResult> {
  const started = Date.now();
  const credit = await canProcessMessage(vendorId, 'text');
  if (!credit.allowed) {
    return {
      finalText:
        credit.reason === 'trial_expired'
          ? 'Your trial has expired. You can still submit for approval or contact support.'
          : SANDBOX_EMPTY_WALLET_REPLY,
      intent: 'guard_no_credit',
      aiCostMilli: 0,
      costMilli: 0,
      tokenMeta: { model: 'none', promptTokens: 0, completionTokens: 0 }
    };
  }

  const { customerPhone } = await ensureSandboxConversation(vendorId);
  const whatsappMessageId = `sandbox-${crypto.randomUUID()}`;

  try {
    const result = await processMessage({
      vendorId,
      phoneNumberId: SANDBOX_PHONE_NUMBER_ID,
      customerPhone,
      content: text,
      whatsappMessageId,
      sandbox: true
    });

    if (!result) {
      throw new Error('Sandbox did not return a reply. Please try again.');
    }

    // The sandbox runs the real pipeline but skips its debit (finalizeTurn
    // returns before the charge when `sandbox` is set), so the trial wallet is
    // charged here instead — at the vendor's real markup, so the demo numbers
    // match what live traffic will cost.
    const charge = await chargeVendor({
      vendorId,
      source: 'sandbox_chat',
      cost: { aiCostMilli: result.aiCostMilli },
      entityId: whatsappMessageId,
      floorAtZero: true,
      metadata: { intent: result.intent, model: result.tokenMeta.model }
    });

    logOnboardingFunnelEvent('sandbox_message_sent', {
      vendorId,
      costMilli: charge.deductedMilli,
      durationMs: Date.now() - started
    });

    return { ...result, costMilli: charge.deductedMilli };
  } catch (err) {
    logger.error({ err, vendorId, durationMs: Date.now() - started }, 'onboarding_sandbox_chat_failed');
    if (Date.now() - started > 20_000) {
      logger.warn({ vendorId, durationMs: Date.now() - started }, 'sandbox_p95_alert_threshold');
    }
    throw new Error("Something went wrong. Your message was saved — please try again.");
  }
}

export async function runOnboardingSandboxVoice(
  vendorId: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<SandboxChatResult> {
  const started = Date.now();
  const credit = await canProcessMessage(vendorId, 'audio');
  if (!credit.allowed) {
    return {
      finalText:
        credit.reason === 'trial_expired'
          ? 'Your trial has expired. You can still submit for approval or contact support.'
          : SANDBOX_EMPTY_WALLET_REPLY,
      intent: 'guard_no_credit',
      aiCostMilli: 0,
      costMilli: 0,
      tokenMeta: { model: 'none', promptTokens: 0, completionTokens: 0 }
    };
  }

  const { transcript, transcribeCostMilli } = await transcribeAudioBuffer(audioBuffer, mimeType);

  // Charged separately from the reply (unlike the live WhatsApp path, which
  // folds transcription into the turn) so the trial breakdown can show the
  // vendor where their demo spend went.
  const transcribeCharge = await chargeVendor({
    vendorId,
    source: 'sandbox_transcribe',
    cost: { aiCostMilli: transcribeCostMilli },
    floorAtZero: true,
    metadata: { model: TRANSCRIBE_MODEL }
  });

  const result = await runOnboardingSandboxChat(vendorId, transcript);
  const costMilli = result.costMilli + transcribeCharge.deductedMilli;
  logOnboardingFunnelEvent('sandbox_voice_sent', {
    vendorId,
    costMilli,
    durationMs: Date.now() - started
  });

  return { ...result, transcript, costMilli };
}
