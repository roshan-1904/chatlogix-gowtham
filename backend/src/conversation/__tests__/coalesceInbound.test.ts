import { describe, it, expect, vi, beforeEach } from 'vitest';

const drainBurstStashMock = vi.fn();
const messageFindFirst = vi.fn();
const messageFindMany = vi.fn();
const messageProcessingFindMany = vi.fn();

vi.mock('../burstMerge.js', () => ({
  drainBurstStash: (...args: unknown[]) => drainBurstStashMock(...args)
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    message: {
      findFirst: (...args: unknown[]) => messageFindFirst(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args)
    },
    messageProcessing: {
      findMany: (...args: unknown[]) => messageProcessingFindMany(...args)
    }
  }
}));

import { collectCoalescedInbound } from '../coalesceInbound.js';

beforeEach(() => {
  vi.clearAllMocks();
  drainBurstStashMock.mockResolvedValue([]);
  messageFindFirst.mockResolvedValue({ timestamp: new Date('2026-09-11T12:00:00.000Z') });
  messageProcessingFindMany.mockResolvedValue([]);
});

describe('collectCoalescedInbound', () => {
  it('merges multiple unprocessed customer messages since the last assistant reply', async () => {
    messageFindMany.mockResolvedValue([
      { whatsappMessageId: 'wamid.1', content: 'Hi mam' },
      { whatsappMessageId: 'wamid.2', content: 'Heart cake please' }
    ]);

    const result = await collectCoalescedInbound('conv-1', 'wamid.1', 'Hi mam');

    expect(result.mergedContent).toBe('Hi mam\nHeart cake please');
    expect(result.whatsappMessageIds).toEqual(['wamid.1', 'wamid.2']);
  });

  it('skips customer messages that already have terminal MessageProcessing rows', async () => {
    messageProcessingFindMany.mockResolvedValue([{ whatsappMessageId: 'wamid.1' }]);
    messageFindMany.mockResolvedValue([
      { whatsappMessageId: 'wamid.1', content: 'Hi mam' },
      { whatsappMessageId: 'wamid.2', content: 'Heart cake please' }
    ]);

    const result = await collectCoalescedInbound('conv-1', 'wamid.2', 'Heart cake please');

    expect(result.mergedContent).toBe('Heart cake please');
    expect(result.whatsappMessageIds).toEqual(['wamid.2']);
  });

  it('includes Redis-stashed siblings not yet visible in the DB query', async () => {
    messageFindMany.mockResolvedValue([{ whatsappMessageId: 'wamid.1', content: 'Hi mam' }]);
    drainBurstStashMock.mockResolvedValue([{ whatsappMessageId: 'wamid.2', content: 'Second line' }]);

    const result = await collectCoalescedInbound('conv-1', 'wamid.1', 'Hi mam');

    expect(result.mergedContent).toBe('Hi mam\nSecond line');
    expect(result.whatsappMessageIds).toEqual(['wamid.1', 'wamid.2']);
  });
});
