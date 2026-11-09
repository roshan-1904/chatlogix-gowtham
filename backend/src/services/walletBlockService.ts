import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import type { WalletBlockStatus } from '@prisma/client';

export type DocumentedWalletBlockReason = 'insufficient_balance' | 'trial_expired';

export interface CreateWalletBlockInput {
  vendorId: string;
  conversationId?: string;
  whatsappMessageId: string;
  messageId?: string;
  reason: DocumentedWalletBlockReason;
  customerPhone?: string;
}

export interface CreateWalletBlockResult {
  id: string;
  status: WalletBlockStatus;
  isNew: boolean;
  shouldEnqueue: boolean;
}

/**
 * Creates or retrieves an existing WalletBlockEvent.
 * Enforces idempotency via unique whatsappMessageId and whitelist of documented reasons.
 */
export async function createOrGetWalletBlockEvent(
  input: CreateWalletBlockInput
): Promise<CreateWalletBlockResult> {
  // Strict whitelist per Decisions and architecture review
  if (input.reason !== 'insufficient_balance' && input.reason !== 'trial_expired') {
    throw new Error(
      `Invalid wallet block reason: "${input.reason}". Only "insufficient_balance" and "trial_expired" are supported.`
    );
  }

  const existing = await prisma.walletBlockEvent.findUnique({
    where: { whatsappMessageId: input.whatsappMessageId }
  });

  if (existing) {
    logger.info(
      {
        walletBlockId: existing.id,
        whatsappMessageId: input.whatsappMessageId,
        status: existing.status
      },
      'WalletBlockEvent already exists for inbound message'
    );
    return {
      id: existing.id,
      status: existing.status,
      isNew: false,
      shouldEnqueue: existing.status === 'pending_enqueue'
    };
  }

  const created = await prisma.walletBlockEvent.create({
    data: {
      vendorId: input.vendorId,
      conversationId: input.conversationId ?? null,
      whatsappMessageId: input.whatsappMessageId,
      messageId: input.messageId ?? null,
      reason: input.reason,
      status: 'pending_enqueue',
      templateSent: false,
      customerPhone: input.customerPhone ?? null
    }
  });

  logger.info(
    {
      walletBlockId: created.id,
      vendorId: input.vendorId,
      reason: input.reason,
      whatsappMessageId: input.whatsappMessageId
    },
    'Created WalletBlockEvent in pending_enqueue state'
  );

  return {
    id: created.id,
    status: created.status,
    isNew: true,
    shouldEnqueue: true
  };
}

/**
 * Marks a WalletBlockEvent as successfully queued in SQS.
 */
export async function markWalletBlockEnqueued(walletBlockId: string): Promise<void> {
  await prisma.walletBlockEvent.update({
    where: { id: walletBlockId },
    data: {
      status: 'queued',
      queuedAt: new Date()
    }
  });
}

/**
 * Atomically claims a WalletBlockEvent for sending.
 * Only claims if status is 'queued', or if previously 'sending' but lease expired (> 5 minutes).
 */
export async function claimWalletBlockForSending(
  walletBlockId: string,
  claimToken: string
): Promise<boolean> {
  const staleCutoff = new Date(Date.now() - 5 * 60 * 1000);

  const result = await prisma.walletBlockEvent.updateMany({
    where: {
      id: walletBlockId,
      OR: [
        { status: 'queued' },
        {
          status: 'sending',
          claimedAt: { lt: staleCutoff },
          retryCount: { lt: 3 }
        }
      ]
    },
    data: {
      status: 'sending',
      claimToken,
      claimedAt: new Date(),
      retryCount: { increment: 1 }
    }
  });

  return result.count > 0;
}

/**
 * Marks a WalletBlockEvent as sent upon successful dispatch to WhatsApp.
 */
export async function markWalletBlockSent(
  walletBlockId: string,
  outboundWhatsappMessageId?: string
): Promise<void> {
  await prisma.walletBlockEvent.update({
    where: { id: walletBlockId },
    data: {
      status: 'sent',
      templateSent: true,
      sentAt: new Date(),
      outboundWhatsappMessageId: outboundWhatsappMessageId ?? null
    }
  });
}

/**
 * Marks a WalletBlockEvent as failed or resets to queued for retry.
 */
export async function markWalletBlockFailed(
  walletBlockId: string,
  errorMessage: string,
  isRecoverable = false
): Promise<void> {
  await prisma.walletBlockEvent.update({
    where: { id: walletBlockId },
    data: {
      status: isRecoverable ? 'queued' : 'failed',
      isRecoverable,
      errorMessage: errorMessage.slice(0, 500),
      ...(isRecoverable ? {} : { failedAt: new Date() })
    }
  });
}

