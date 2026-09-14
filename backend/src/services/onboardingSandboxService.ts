import crypto from 'node:crypto';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { processMessage, type ProcessMessageResult } from '../conversation/pipeline.js';
import { usdToPaise } from '../utils/billingPaise.js';
import {
  canProcessMessage,
  recordSandboxSpend
} from './billingService.js';
import { logOnboardingFunnelEvent } from './onboardingFunnelService.js';

const SANDBOX_PHONE_PREFIX = 'sandbox:';
const SANDBOX_PHONE_NUMBER_ID = 'sandbox-onboarding';
const SANDBOX_EMPTY_WALLET_REPLY =
  'Your ₹100 trial is used up. You can still submit for approval — our team will review your shop.';

export interface SandboxChatResult extends ProcessMessageResult {
  transcript?: string;
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
  transcribePaise: number;
}> {
  const { transcribeVendorAudioBuffer } = await import('./vendorAudioTranscriptionService.js');
  const { transcript, costUsd } = await transcribeVendorAudioBuffer(bytes, mimeType);
  const transcribePaise = usdToPaise(costUsd);
  return { transcript, transcribePaise };
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
      costPaise: 0,
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

    logOnboardingFunnelEvent('sandbox_message_sent', {
      vendorId,
      costPaise: result.costPaise,
      durationMs: Date.now() - started
    });

    if (result.costPaise > 0) {
      await recordSandboxSpend({
        vendorId,
        paiseCost: result.costPaise,
        source: 'sandbox_chat',
        externalId: whatsappMessageId,
        metadata: { intent: result.intent, model: result.tokenMeta.model }
      });
    }

    return result;
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
      costPaise: 0,
      tokenMeta: { model: 'none', promptTokens: 0, completionTokens: 0 }
    };
  }

  const { transcript, transcribePaise } = await transcribeAudioBuffer(audioBuffer, mimeType);

  if (transcribePaise > 0) {
    await recordSandboxSpend({
      vendorId,
      paiseCost: transcribePaise,
      source: 'sandbox_transcribe',
      metadata: { model: TRANSCRIBE_MODEL }
    });
  }

  const result = await runOnboardingSandboxChat(vendorId, transcript);
  logOnboardingFunnelEvent('sandbox_voice_sent', {
    vendorId,
    costPaise: result.costPaise + transcribePaise,
    durationMs: Date.now() - started
  });

  return {
    ...result,
    transcript,
    costPaise: result.costPaise + transcribePaise
  };
}
