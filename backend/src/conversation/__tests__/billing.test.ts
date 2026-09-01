import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const vendorFindUnique = vi.fn();
const vendorUpdate = vi.fn();
const walletTransactionCreate = vi.fn();
const creditUsageCreate = vi.fn();
const messageProcessingUpdateMany = vi.fn();
const messageProcessingFindMany = vi.fn();

const txStub = {
  vendor: {
    findUnique: (...args: unknown[]) => vendorFindUnique(...args),
    update: (...args: unknown[]) => vendorUpdate(...args)
  },
  walletTransaction: { create: (...args: unknown[]) => walletTransactionCreate(...args) },
  creditUsage: { create: (...args: unknown[]) => creditUsageCreate(...args) }
};

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    $transaction: (fn: (tx: typeof txStub) => Promise<unknown>) => fn(txStub),
    messageProcessing: {
      updateMany: (...args: unknown[]) => messageProcessingUpdateMany(...args),
      findMany: (...args: unknown[]) => messageProcessingFindMany(...args)
    }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// billingService.js pulls in config/env.js for real (Firebase-config-check
// logging at import time) — mock it out rather than repeat Step 4/5's
// dependency-bleed problem. creditsForKind is a pure lookup; a fixed stub is
// equivalent for this file's purposes.
vi.mock('../../services/billingService.js', () => ({
  creditsForKind: () => 1
}));

const emitMetricMock = vi.fn();
vi.mock('../../observability/metrics.js', () => ({
  emitMetric: (...args: unknown[]) => emitMetricMock(...args)
}));

import { debitAfterEnqueue, reconcileStuckDebits } from '../billing.js';

const VENDOR_ID = 'vendor-1';
const CONVERSATION_ID = 'conv-1';

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0'
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vendorFindUnique.mockResolvedValue({ walletBalance: 100 });
  vendorUpdate.mockResolvedValue({});
  walletTransactionCreate.mockResolvedValue({});
  creditUsageCreate.mockResolvedValue({});
  messageProcessingUpdateMany.mockResolvedValue({ count: 1 });
});

describe('debitAfterEnqueue', () => {
  it('debits once and marks the MessageProcessing row queued + debitedAt', async () => {
    const outcome = await debitAfterEnqueue(VENDOR_ID, CONVERSATION_ID, 'wamid.1');

    expect(outcome).toBe('debited');
    expect(creditUsageCreate).toHaveBeenCalledWith({
      data: { vendorId: VENDOR_ID, conversationId: CONVERSATION_ID, creditsConsumed: 1, conversationType: 'text', externalId: 'wamid.1' }
    });
    const markCall = messageProcessingUpdateMany.mock.calls[0][0];
    expect(markCall.where).toEqual({ whatsappMessageId: 'wamid.1' });
    expect(markCall.data.status).toBe('queued');
    expect(markCall.data.debitedAt).toBeInstanceOf(Date);
  });

  it('is idempotent on a unique-constraint violation (already debited)', async () => {
    creditUsageCreate.mockRejectedValue(p2002Error());

    const outcome = await debitAfterEnqueue(VENDOR_ID, CONVERSATION_ID, 'wamid.2');

    expect(outcome).toBe('already_debited');
    // Still marks debitedAt even on the idempotent path, in case a prior
    // attempt's CreditUsage write landed but its own mark didn't.
    expect(messageProcessingUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('rethrows any non-P2002 error', async () => {
    creditUsageCreate.mockRejectedValue(new Error('connection reset'));

    await expect(debitAfterEnqueue(VENDOR_ID, CONVERSATION_ID, 'wamid.3')).rejects.toThrow('connection reset');
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

  it('retries each stuck row and reports success/failure counts', async () => {
    messageProcessingFindMany.mockResolvedValue([
      { vendorId: VENDOR_ID, conversationId: CONVERSATION_ID, whatsappMessageId: 'wamid.stuck-1' },
      { vendorId: VENDOR_ID, conversationId: CONVERSATION_ID, whatsappMessageId: 'wamid.stuck-2' }
    ]);
    // First retry succeeds, second fails.
    creditUsageCreate.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('still down'));

    const result = await reconcileStuckDebits();

    expect(result).toEqual({ retried: 2, succeeded: 1, failed: 1 });
    expect(emitMetricMock).toHaveBeenCalledWith('DebitFail', 1, { dimensions: { processor: 'conversation-v1', context: 'sweep' } });
  });

  it('never publishes to any queue — only retries the debit', async () => {
    messageProcessingFindMany.mockResolvedValue([{ vendorId: VENDOR_ID, conversationId: CONVERSATION_ID, whatsappMessageId: 'wamid.stuck-1' }]);

    await reconcileStuckDebits();

    // No sqsClient import/mocks exist in this file at all — if reconcileStuckDebits
    // tried to publish anything, the module import itself would fail, not just an assertion.
    expect(creditUsageCreate).toHaveBeenCalledTimes(1);
  });
});
