import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const messageCreate = vi.fn();
const messageFindUnique = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    message: {
      create: (...args: unknown[]) => messageCreate(...args),
      findUnique: (...args: unknown[]) => messageFindUnique(...args)
    }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

import { upsertInboundMessage } from '../idempotency.js';

function p2002Error(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.22.0' });
}

const baseInput = {
  vendorId: 'vendor-1',
  conversationId: 'conv-1',
  customerId: 'customer-1',
  content: 'hi, 2 brownies please',
  whatsappMessageId: 'wamid.1'
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('upsertInboundMessage', () => {
  it('inserts a new customer Message with whatsappMessageId set', async () => {
    messageCreate.mockResolvedValue({ id: 'msg-1' });

    const result = await upsertInboundMessage(baseInput);

    expect(result).toEqual({ messageId: 'msg-1', alreadyProcessed: false });
    const data = messageCreate.mock.calls[0][0].data;
    expect(data.senderType).toBe('customer');
    expect(data.whatsappMessageId).toBe('wamid.1');
    expect(data.conversationId).toBe('conv-1');
  });

  it('§26 test 8 (inbound half): a redelivery of the same whatsappMessageId returns the existing row instead of inserting a second one', async () => {
    messageCreate.mockRejectedValue(p2002Error());
    messageFindUnique.mockResolvedValue({ id: 'msg-1' });

    const result = await upsertInboundMessage(baseInput);

    expect(result).toEqual({ messageId: 'msg-1', alreadyProcessed: true });
    expect(messageFindUnique).toHaveBeenCalledWith({ where: { whatsappMessageId: 'wamid.1' } });
  });

  it('rethrows a non-unique-constraint error', async () => {
    messageCreate.mockRejectedValue(new Error('connection reset'));

    await expect(upsertInboundMessage(baseInput)).rejects.toThrow('connection reset');
  });

  it('surfaces an error if a P2002 conflict fires but the row cannot be found (should not fabricate a result)', async () => {
    messageCreate.mockRejectedValue(p2002Error());
    messageFindUnique.mockResolvedValue(null);

    await expect(upsertInboundMessage(baseInput)).rejects.toThrow(/could not be found/);
  });
});
