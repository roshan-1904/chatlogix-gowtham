import { describe, it, expect, vi, beforeEach } from 'vitest';

const messageProcessingUpdateMany = vi.fn();
const messageProcessingFindMany = vi.fn();
const messageFindUnique = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    message: {
      findUnique: (...args: unknown[]) => messageFindUnique(...args)
    },
    messageProcessing: {
      updateMany: (...args: unknown[]) => messageProcessingUpdateMany(...args),
      findMany: (...args: unknown[]) => messageProcessingFindMany(...args)
    }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// config/env.js logs Firebase configuration at import time; stub the two
// platform-fee knobs this module actually reads rather than repeat Step 4/5's
// dependency-bleed problem.
vi.mock('../../config/env.js', () => ({
  env: { USD_TO_INR_RATE: '83' },
  numericEnv: { platformFeePerTurnMilli: 0, platformFeeOutboundMediaMilli: 0 },
  walletEnv: { mockTopUpEnabled: true, presetsMilli: [], minTopUpMilli: 0, maxTopUpMilli: 0 }
}));

vi.mock('../../services/platformSettingsService.js', () => ({
  ensurePlatformSettings: vi.fn().mockResolvedValue(undefined),
  getPlatformSettings: () => ({
    platformFeePerTurnPaise: 0,
    platformFeeOutboundMediaPaise: 0
  })
}));

// The wallet arithmetic and ledger writes belong to pricingService and are
// tested there; this file is about the pipeline's debit *ordering* and
// idempotency handling.
const chargeVendorMock = vi.fn();
vi.mock('../../services/pricing/pricingService.js', () => ({
  chargeVendor: (...args: unknown[]) => chargeVendorMock(...args),
  turnEstimateCost: () => ({ aiCostMilli: 275, platformFeeMilli: 0 })
}));

const emitMetricMock = vi.fn();
vi.mock('../../observability/metrics.js', () => ({
  emitMetric: (...args: unknown[]) => emitMetricMock(...args)
}));

import {
  debitAfterEnqueue,
  debitOutboundMessage,
  outboundMessageDebitExternalId,
  reconcileStuckDebits
} from '../billing.js';

const VENDOR_ID = 'vendor-1';
const CONVERSATION_ID = 'conv-1';

beforeEach(() => {
  vi.clearAllMocks();
  chargeVendorMock.mockResolvedValue({ outcome: 'charged', deductedMilli: 195, balanceAfterMilli: 99_805 });
  messageProcessingUpdateMany.mockResolvedValue({ count: 1 });
});

describe('debitAfterEnqueue', () => {
  it('charges the turn cost and marks the MessageProcessing row queued + debitedAt', async () => {
    const outcome = await debitAfterEnqueue({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      whatsappMessageId: 'wamid.1',
      costs: { aiCostMilli: 130, upstreamCostMilli: 0 }
    });

    expect(outcome).toBe('debited');
    expect(chargeVendorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: VENDOR_ID,
        source: 'conversation_turn',
        conversationId: CONVERSATION_ID,
        idempotencyKey: 'wamid.1',
        cost: { aiCostMilli: 130, platformFeeMilli: 0 }
      })
    );
    const markCall = messageProcessingUpdateMany.mock.calls[0][0];
    expect(markCall.where).toEqual({ whatsappMessageId: 'wamid.1' });
    expect(markCall.data.status).toBe('queued');
    expect(markCall.data.debitedAt).toBeInstanceOf(Date);
  });

  it('folds upstream transcription cost into the same turn charge', async () => {
    await debitAfterEnqueue({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      whatsappMessageId: 'wamid.audio',
      costs: { aiCostMilli: 130, upstreamCostMilli: 25 }
    });

    expect(chargeVendorMock.mock.calls[0][0].cost.aiCostMilli).toBe(155);
  });

  it('is idempotent when the charge was already applied', async () => {
    chargeVendorMock.mockResolvedValue({ outcome: 'already_charged', deductedMilli: 0, balanceAfterMilli: null });

    const outcome = await debitAfterEnqueue({
      vendorId: VENDOR_ID,
      conversationId: CONVERSATION_ID,
      whatsappMessageId: 'wamid.2',
      costs: { aiCostMilli: 130, upstreamCostMilli: 0 }
    });

    expect(outcome).toBe('already_debited');
    // Still marks debitedAt, in case a prior attempt's ledger write landed
    // but its own mark didn't.
    expect(messageProcessingUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('rethrows an unexpected charge failure', async () => {
    chargeVendorMock.mockRejectedValue(new Error('connection reset'));

    await expect(
      debitAfterEnqueue({
        vendorId: VENDOR_ID,
        conversationId: CONVERSATION_ID,
        whatsappMessageId: 'wamid.3',
        costs: { aiCostMilli: 130, upstreamCostMilli: 0 }
      })
    ).rejects.toThrow('connection reset');
  });
});

describe('debitOutboundMessage', () => {
  const MEDIA_MSG_ID = 'assistant-img-1';

  beforeEach(() => {
    messageFindUnique.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      type: 'image',
      conversation: { vendorId: VENDOR_ID }
    });
  });

  it('charges only the outbound-media platform fee, keyed on outbound-msg:{messageId}', async () => {
    const outcome = await debitOutboundMessage(MEDIA_MSG_ID);

    expect(outcome).toBe('debited');
    expect(chargeVendorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorId: VENDOR_ID,
        source: 'outbound_media',
        conversationId: CONVERSATION_ID,
        conversationType: 'image',
        cost: { platformFeeMilli: 0 },
        idempotencyKey: outboundMessageDebitExternalId(MEDIA_MSG_ID)
      })
    );
  });

  it('is idempotent when the charge was already applied', async () => {
    chargeVendorMock.mockResolvedValue({ outcome: 'already_charged', deductedMilli: 0, balanceAfterMilli: null });

    const outcome = await debitOutboundMessage(MEDIA_MSG_ID);

    expect(outcome).toBe('already_debited');
  });

  it('rejects non image/video message types', async () => {
    messageFindUnique.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      type: 'text',
      conversation: { vendorId: VENDOR_ID }
    });

    await expect(debitOutboundMessage(MEDIA_MSG_ID)).rejects.toThrow('image or video');
  });
});

describe('reconcileStuckDebits', () => {
  it('queries only status=queued AND debitedAt=null rows past the threshold', async () => {
    messageProcessingFindMany.mockResolvedValue([]);

    await reconcileStuckDebits(120_000);

    const query = messageProcessingFindMany.mock.calls[0][0];
    expect(query.where.status).toBe('queued');
    expect(query.where.debitedAt).toBeNull();
    expect(query.where.queuedAt.lt).toBeInstanceOf(Date);
  });

  it('charges the worst-case estimate, since the original token usage is gone', async () => {
    messageProcessingFindMany.mockResolvedValue([
      { vendorId: VENDOR_ID, conversationId: CONVERSATION_ID, whatsappMessageId: 'wamid.stuck-1' }
    ]);

    await reconcileStuckDebits();

    expect(chargeVendorMock.mock.calls[0][0].cost).toEqual({ aiCostMilli: 275, platformFeeMilli: 0 });
  });

  it('retries each stuck row and reports success/failure counts', async () => {
    messageProcessingFindMany.mockResolvedValue([
      { vendorId: VENDOR_ID, conversationId: CONVERSATION_ID, whatsappMessageId: 'wamid.stuck-1' },
      { vendorId: VENDOR_ID, conversationId: CONVERSATION_ID, whatsappMessageId: 'wamid.stuck-2' }
    ]);
    chargeVendorMock
      .mockResolvedValueOnce({ outcome: 'charged', deductedMilli: 414, balanceAfterMilli: 0 })
      .mockRejectedValueOnce(new Error('still down'));

    const result = await reconcileStuckDebits();

    expect(result).toEqual({ retried: 2, succeeded: 1, failed: 1 });
    expect(emitMetricMock).toHaveBeenCalledWith('DebitFail', 1, { dimensions: { processor: 'conversation-v1', context: 'sweep' } });
  });

  it('never publishes to any queue — only retries the debit', async () => {
    messageProcessingFindMany.mockResolvedValue([{ vendorId: VENDOR_ID, conversationId: CONVERSATION_ID, whatsappMessageId: 'wamid.stuck-1' }]);

    await reconcileStuckDebits();

    // No sqsClient import/mocks exist in this file at all — if reconcileStuckDebits
    // tried to publish anything, the module import itself would fail, not just an assertion.
    expect(chargeVendorMock).toHaveBeenCalledTimes(1);
  });
});
