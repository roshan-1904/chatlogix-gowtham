import { describe, it, expect, vi, beforeEach } from 'vitest';

const walletBlockFindUnique = vi.fn();
const walletBlockCreate = vi.fn();
const walletBlockUpdate = vi.fn();
const walletBlockUpdateMany = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    walletBlockEvent: {
      findUnique: (...args: unknown[]) => walletBlockFindUnique(...args),
      create: (...args: unknown[]) => walletBlockCreate(...args),
      update: (...args: unknown[]) => walletBlockUpdate(...args),
      updateMany: (...args: unknown[]) => walletBlockUpdateMany(...args),
    },
  },
}));

vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  createOrGetWalletBlockEvent,
  markWalletBlockEnqueued,
  claimWalletBlockForSending,
  markWalletBlockSent,
  markWalletBlockFailed,
} from '../walletBlockService.js';

describe('walletBlockService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOrGetWalletBlockEvent', () => {
    it('creates a new WalletBlockEvent in pending_enqueue state when none exists', async () => {
      walletBlockFindUnique.mockResolvedValue(null);
      walletBlockCreate.mockResolvedValue({
        id: 'wb-123',
        status: 'pending_enqueue',
        vendorId: 'vnd-1',
        reason: 'insufficient_balance',
      });

      const result = await createOrGetWalletBlockEvent({
        vendorId: 'vnd-1',
        conversationId: 'conv-1',
        whatsappMessageId: 'wamid-abc-1',
        messageId: 'msg-1',
        reason: 'insufficient_balance',
        customerPhone: '+919876543210',
      });

      expect(walletBlockFindUnique).toHaveBeenCalledWith({
        where: { whatsappMessageId: 'wamid-abc-1' },
      });
      expect(walletBlockCreate).toHaveBeenCalledWith({
        data: {
          vendorId: 'vnd-1',
          conversationId: 'conv-1',
          whatsappMessageId: 'wamid-abc-1',
          messageId: 'msg-1',
          reason: 'insufficient_balance',
          status: 'pending_enqueue',
          templateSent: false,
          customerPhone: '+919876543210',
        },
      });
      expect(result).toEqual({
        id: 'wb-123',
        status: 'pending_enqueue',
        isNew: true,
        shouldEnqueue: true,
      });
    });

    it('rejects unsupported reason like vendor_not_found', async () => {
      await expect(
        createOrGetWalletBlockEvent({
          vendorId: 'vnd-1',
          whatsappMessageId: 'wamid-abc-2',
          reason: 'vendor_not_found' as any,
        })
      ).rejects.toThrow('Invalid wallet block reason');
    });

    it('returns existing event with shouldEnqueue: false if already queued or sent', async () => {
      walletBlockFindUnique.mockResolvedValue({
        id: 'wb-existing-1',
        status: 'queued',
        vendorId: 'vnd-1',
      });

      const result = await createOrGetWalletBlockEvent({
        vendorId: 'vnd-1',
        whatsappMessageId: 'wamid-duplicate',
        reason: 'trial_expired',
      });

      expect(walletBlockCreate).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'wb-existing-1',
        status: 'queued',
        isNew: false,
        shouldEnqueue: false,
      });
    });

    it('returns existing event with shouldEnqueue: true if still pending_enqueue from a crashed retry', async () => {
      walletBlockFindUnique.mockResolvedValue({
        id: 'wb-pending-1',
        status: 'pending_enqueue',
        vendorId: 'vnd-1',
      });

      const result = await createOrGetWalletBlockEvent({
        vendorId: 'vnd-1',
        whatsappMessageId: 'wamid-retry',
        reason: 'insufficient_balance',
      });

      expect(walletBlockCreate).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'wb-pending-1',
        status: 'pending_enqueue',
        isNew: false,
        shouldEnqueue: true,
      });
    });
  });

  describe('markWalletBlockEnqueued', () => {
    it('updates event status to queued', async () => {
      walletBlockUpdate.mockResolvedValue({ id: 'wb-1', status: 'queued' });

      await markWalletBlockEnqueued('wb-1');

      expect(walletBlockUpdate).toHaveBeenCalledWith({
        where: { id: 'wb-1' },
        data: expect.objectContaining({
          status: 'queued',
          queuedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('claimWalletBlockForSending', () => {
    it('returns true when atomic update claims a queued event', async () => {
      walletBlockUpdateMany.mockResolvedValue({ count: 1 });

      const claimed = await claimWalletBlockForSending('wb-1', 'claim-token-123');

      expect(claimed).toBe(true);
      expect(walletBlockUpdateMany).toHaveBeenCalledWith({
        where: {
          id: 'wb-1',
          OR: [
            { status: 'queued' },
            {
              status: 'sending',
              claimedAt: { lt: expect.any(Date) },
              retryCount: { lt: 3 },
            },
          ],
        },
        data: expect.objectContaining({
          status: 'sending',
          claimToken: 'claim-token-123',
          claimedAt: expect.any(Date),
          retryCount: { increment: 1 },
        }),
      });
    });

    it('returns false when event is already claimed or sent (count: 0)', async () => {
      walletBlockUpdateMany.mockResolvedValue({ count: 0 });

      const claimed = await claimWalletBlockForSending('wb-1', 'claim-token-123');

      expect(claimed).toBe(false);
    });
  });

  describe('markWalletBlockSent', () => {
    it('updates event status to sent and sets templateSent = true', async () => {
      walletBlockUpdate.mockResolvedValue({ id: 'wb-1', status: 'sent' });

      await markWalletBlockSent('wb-1', 'outbound-wamid-999');

      expect(walletBlockUpdate).toHaveBeenCalledWith({
        where: { id: 'wb-1' },
        data: {
          status: 'sent',
          templateSent: true,
          sentAt: expect.any(Date),
          outboundWhatsappMessageId: 'outbound-wamid-999',
        },
      });
    });
  });

  describe('markWalletBlockFailed', () => {
    it('marks terminal failure when isRecoverable is false', async () => {
      walletBlockUpdate.mockResolvedValue({ id: 'wb-1', status: 'failed' });

      await markWalletBlockFailed('wb-1', 'Meta client error 400', false);

      expect(walletBlockUpdate).toHaveBeenCalledWith({
        where: { id: 'wb-1' },
        data: {
          status: 'failed',
          isRecoverable: false,
          errorMessage: 'Meta client error 400',
          failedAt: expect.any(Date),
        },
      });
    });

    it('resets status to queued for retry when isRecoverable is true', async () => {
      walletBlockUpdate.mockResolvedValue({ id: 'wb-1', status: 'queued' });

      await markWalletBlockFailed('wb-1', 'Transient 500 error', true);

      expect(walletBlockUpdate).toHaveBeenCalledWith({
        where: { id: 'wb-1' },
        data: {
          status: 'queued',
          isRecoverable: true,
          errorMessage: 'Transient 500 error',
        },
      });
    });
  });
});

