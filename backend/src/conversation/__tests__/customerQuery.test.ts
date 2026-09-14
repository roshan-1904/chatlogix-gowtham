import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  customerQueryCreate,
  customerQueryUpdate,
  customerQueryUpdateMany,
  customerFindUnique,
  queryRaw,
  executeRaw,
  embedTextMock,
  toVendorEnglishMock,
  logCountMock,
  loggerInfo,
  notifyVendorOfKnowledgeGapMock
} = vi.hoisted(() => ({
  customerQueryCreate: vi.fn(),
  customerQueryUpdate: vi.fn(),
  customerQueryUpdateMany: vi.fn(),
  customerFindUnique: vi.fn(),
  queryRaw: vi.fn(),
  executeRaw: vi.fn(),
  embedTextMock: vi.fn(),
  toVendorEnglishMock: vi.fn(),
  logCountMock: vi.fn(),
  loggerInfo: vi.fn(),
  notifyVendorOfKnowledgeGapMock: vi.fn()
}));

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    customerQuery: {
      create: (...args: unknown[]) => customerQueryCreate(...args),
      update: (...args: unknown[]) => customerQueryUpdate(...args),
      updateMany: (...args: unknown[]) => customerQueryUpdateMany(...args)
    },
    customer: {
      findUnique: (...args: unknown[]) => customerFindUnique(...args)
    },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
    $executeRaw: (...args: unknown[]) => executeRaw(...args)
  }
}));
vi.mock('../../config/env.js', () => ({
  env: { CUSTOMER_QUERY_DEDUP_THRESHOLD: '0.85', OPENAI_API_KEY: 'test' }
}));
vi.mock('../../logger.js', () => ({
  logger: { info: (...args: unknown[]) => loggerInfo(...args), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock('../metrics.js', () => ({ logCount: (...args: unknown[]) => logCountMock(...args) }));
vi.mock('../faq/embedding.js', () => ({
  embedText: (...args: unknown[]) => embedTextMock(...args),
  toVectorLiteral: (embedding: number[]) => `[${embedding.join(',')}]`,
  FAQ_EMBEDDING_MODEL: 'text-embedding-3-small'
}));
vi.mock('../../utils/vendorEnglish.js', () => ({
  toVendorEnglish: (...args: unknown[]) => toVendorEnglishMock(...args)
}));
vi.mock('../customerQueryNotify.js', () => ({
  notifyVendorOfKnowledgeGap: (...args: unknown[]) => notifyVendorOfKnowledgeGapMock(...args)
}));

import { markOpenQueriesAnswered, persistKnowledgeGapIfNeeded, upsertKnowledgeGap } from '../customerQuery.js';

const unitEmbedding = Array.from({ length: 8 }, () => 0.1);

beforeEach(() => {
  vi.clearAllMocks();
  toVendorEnglishMock.mockImplementation(async (text: string) => text);
  embedTextMock.mockResolvedValue(unitEmbedding);
  queryRaw.mockResolvedValue([]);
  executeRaw.mockResolvedValue(1);
  customerQueryCreate.mockResolvedValue({ id: 'query-new' });
  customerQueryUpdate.mockResolvedValue({ id: 'query-open' });
  customerQueryUpdateMany.mockResolvedValue({ count: 0 });
  customerFindUnique.mockResolvedValue({ phone: '919790690170' });
  notifyVendorOfKnowledgeGapMock.mockResolvedValue(undefined);
});

describe('persistKnowledgeGapIfNeeded', () => {
  const base = {
    vendorId: 'vendor-1',
    conversationId: 'conv-1',
    customerId: 'customer-1',
    sourceMessageId: 'msg-1',
    customerText: 'Ithuku dividers varuma??',
    ops: [] as { type: string }[],
    draftReply: 'Sure, added.',
    orderStatusTurn: false,
    hasHandoff: false,
    sandbox: false
  };

  it('skips sandbox, handoff, and order-status turns', async () => {
    await expect(persistKnowledgeGapIfNeeded({ ...base, sandbox: true, ops: [{ type: 'knowledge_gap', question: 'q', category: 'product', productId: null }] })).resolves.toBeNull();
    await expect(
      persistKnowledgeGapIfNeeded({
        ...base,
        hasHandoff: true,
        ops: [{ type: 'knowledge_gap', question: 'q', category: 'product', productId: null }]
      })
    ).resolves.toBeNull();
    await expect(
      persistKnowledgeGapIfNeeded({
        ...base,
        orderStatusTurn: true,
        draftReply: 'I will check and get back to you',
        ops: [{ type: 'knowledge_gap', question: 'Where is the order?', category: 'other', productId: null }]
      })
    ).resolves.toBeNull();
    expect(customerQueryCreate).not.toHaveBeenCalled();
  });

  it('persists on knowledge_gap and on deferral fallback', async () => {
    await persistKnowledgeGapIfNeeded({
      ...base,
      ops: [{ type: 'knowledge_gap', question: 'Does the tin include dividers?', category: 'product', productId: 'prod-tin' }],
      draftReply: "I'll check with the team and get back to you shortly."
    });
    expect(customerQueryCreate).toHaveBeenCalledOnce();

    customerQueryCreate.mockClear();
    await persistKnowledgeGapIfNeeded({
      ...base,
      ops: [{ type: 'noop' }],
      draftReply: 'Kanmani will confirm availability'
    });
    expect(customerQueryCreate).toHaveBeenCalledOnce();
  });
});

describe('upsertKnowledgeGap', () => {
  it('inserts a new open row and logs CustomerQueryOpened (not a notify that writes OrderAlert)', async () => {
    const result = await upsertKnowledgeGap({
      vendorId: 'vendor-1',
      conversationId: 'conv-1',
      customerId: 'customer-1',
      sourceMessageId: 'msg-1',
      customerText: 'Ithuku dividers varuma??',
      modelQuestion: 'Does the baking tin come with dividers?',
      category: 'product',
      productId: 'prod-tin'
    });

    expect(result).toEqual({ id: 'query-new', deduped: false });
    expect(toVendorEnglishMock).toHaveBeenCalledWith('Does the baking tin come with dividers?');
    expect(customerQueryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        vendorId: 'vendor-1',
        questionOriginal: 'Ithuku dividers varuma??',
        questionEn: 'Does the baking tin come with dividers?',
        category: 'product',
        status: 'open',
        productId: 'prod-tin',
        quoteMessageId: 'msg-1',
        sourceMessageId: 'msg-1'
      })
    });
    expect(logCountMock).toHaveBeenCalledWith('CustomerQueryOpened', { vendorId: 'vendor-1', category: 'product' });
    expect(notifyVendorOfKnowledgeGapMock).toHaveBeenCalledWith(
      expect.objectContaining({
        queryId: 'query-new',
        questionEn: 'Does the baking tin come with dividers?',
        customerPhone: '919790690170'
      })
    );
  });

  it('bumps hitCount when an open row is cosine-similar', async () => {
    queryRaw.mockResolvedValue([{ id: 'query-open', relatedMessageIds: ['msg-old'], similarity: 0.91 }]);

    const result = await upsertKnowledgeGap({
      vendorId: 'vendor-1',
      conversationId: 'conv-1',
      customerId: 'customer-1',
      sourceMessageId: 'msg-2',
      customerText: 'dividers varuma?',
      modelQuestion: 'Does the baking tin come with dividers?',
      category: 'product'
    });

    expect(result).toEqual({ id: 'query-open', deduped: true });
    expect(customerQueryCreate).not.toHaveBeenCalled();
    expect(customerQueryUpdate).toHaveBeenCalledWith({
      where: { id: 'query-open' },
      data: expect.objectContaining({
        hitCount: { increment: 1 },
        relatedMessageIds: ['msg-old', 'msg-2'],
        quoteMessageId: 'msg-2'
      })
    });
    expect(logCountMock).toHaveBeenCalledWith('CustomerQueryDeduped', { vendorId: 'vendor-1' });
    expect(logCountMock).not.toHaveBeenCalledWith('CustomerQueryOpened', expect.anything());
  });
});

describe('markOpenQueriesAnswered', () => {
  it('marks every open query on the conversation and stores English vendor answer', async () => {
    customerQueryUpdateMany.mockResolvedValue({ count: 2 });
    toVendorEnglishMock.mockResolvedValue('Yes. An adjustable divider is included.');

    const count = await markOpenQueriesAnswered({
      conversationId: 'conv-1',
      vendorId: 'vendor-1',
      vendorAnswerOriginal: 'Yes da, divider set included',
      answeredByVendorId: 'vendor-1'
    });

    expect(count).toBe(2);
    expect(customerQueryUpdateMany).toHaveBeenCalledWith({
      where: { conversationId: 'conv-1', vendorId: 'vendor-1', status: 'open' },
      data: expect.objectContaining({
        status: 'answered',
        vendorAnswerOriginal: 'Yes da, divider set included',
        vendorAnswerEn: 'Yes. An adjustable divider is included.',
        answeredByVendorId: 'vendor-1'
      })
    });
    expect(logCountMock).toHaveBeenCalledWith('CustomerQueryAnswered', { vendorId: 'vendor-1' }, 2);
  });
});
