import { describe, it, expect, vi, beforeEach } from 'vitest';

const vendorFindUnique = vi.fn();
const redisSet = vi.fn();
const publishToQueue = vi.fn();
const logCount = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: { vendor: { findUnique: (...args: unknown[]) => vendorFindUnique(...args) } }
}));
vi.mock('../../config/env.js', () => ({ env: { RESPONSE_QUEUE_URL: 'https://sqs.example/response' } }));
vi.mock('../../queue/sqsClient.js', () => ({
  publishToQueue: (...args: unknown[]) => publishToQueue(...args)
}));
vi.mock('../../logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/redis.js', () => ({
  getRedisClient: () => ({ set: (...args: unknown[]) => redisSet(...args) })
}));
vi.mock('../metrics.js', () => ({ logCount: (...args: unknown[]) => logCount(...args) }));

import { notifyVendorOfKnowledgeGap } from '../customerQueryNotify.js';

beforeEach(() => {
  vi.clearAllMocks();
  redisSet.mockResolvedValue('OK');
  vendorFindUnique.mockResolvedValue({
    phone: '+91999999999',
    whatsappNumbers: [{ phoneNumberId: 'waba-1' }]
  });
  publishToQueue.mockResolvedValue(undefined);
});

describe('notifyVendorOfKnowledgeGap', () => {
  const input = {
    vendorId: 'vendor-1',
    conversationId: 'conv-1',
    queryId: 'query-1',
    questionEn: 'Does the baking tin come with dividers?',
    customerPhone: '919790690170'
  };

  it('sends a light WhatsApp ping and does not write OrderAlert', async () => {
    await notifyVendorOfKnowledgeGap(input);

    expect(publishToQueue).toHaveBeenCalledWith(
      'https://sqs.example/response',
      expect.objectContaining({
        to: '+91999999999',
        text: expect.stringMatching(/AI is still on; answer from Queries/)
      })
    );
    expect(publishToQueue.mock.calls[0][1].text).toContain(input.questionEn);
    expect(publishToQueue.mock.calls[0][1]).not.toHaveProperty('orderId');
  });

  it('throttles a second ping within 15 minutes', async () => {
    redisSet.mockResolvedValueOnce(null);

    await notifyVendorOfKnowledgeGap(input);

    expect(publishToQueue).not.toHaveBeenCalled();
    expect(redisSet).toHaveBeenCalledWith('customer_query_notify:vendor-1', '1', 'EX', 900, 'NX');
  });
});
