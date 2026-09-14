import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const customerQueryFindMany = vi.fn();
const customerQueryCount = vi.fn();
const customerQueryFindFirst = vi.fn();
const messageFindMany = vi.fn();
const sendVendorConversationReplyMock = vi.fn();
const promoteCustomerQueryMock = vi.fn();
const buildPromotionDraftMock = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    customerQuery: {
      findMany: (...args: unknown[]) => customerQueryFindMany(...args),
      count: (...args: unknown[]) => customerQueryCount(...args),
      findFirst: (...args: unknown[]) => customerQueryFindFirst(...args)
    },
    message: {
      findMany: (...args: unknown[]) => messageFindMany(...args)
    }
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock('../../services/vendorConversationReply.js', () => ({
  sendVendorConversationReply: (...args: unknown[]) => sendVendorConversationReplyMock(...args)
}));
vi.mock('../../conversation/customerQueryPromotion.js', () => ({
  promoteCustomerQuery: (...args: unknown[]) => promoteCustomerQueryMock(...args),
  buildPromotionDraft: (...args: unknown[]) => buildPromotionDraftMock(...args)
}));

const { customerQueriesRouter } = await import('../customerQueries.js');

const VENDOR_ID = 'vendor-1';
let currentUser: { vendorId?: string; roles: string[] } = { vendorId: VENDOR_ID, roles: ['vendor'] };

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = currentUser;
  next();
});
app.use('/customer-queries', customerQueriesRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/customer-queries`;

afterAll(() => {
  server.close();
});

const listRow = {
  id: 'query-1',
  conversationId: 'conv-1',
  questionEn: 'Does the baking tin come with dividers?',
  questionOriginal: 'Ithuku dividers varuma??',
  category: 'product',
  status: 'open',
  hitCount: 1,
  lastSeenAt: new Date('2026-09-14T10:00:00.000Z'),
  createdAt: new Date('2026-09-14T09:00:00.000Z'),
  productId: 'prod-tin',
  customer: { phone: '919790690170', customerInsights: [{ customerName: 'Murali' }] }
};

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { vendorId: VENDOR_ID, roles: ['vendor'] };
  customerQueryFindMany.mockResolvedValue([listRow]);
  customerQueryCount.mockResolvedValue(1);
  customerQueryFindFirst.mockResolvedValue({
    ...listRow,
    vendorAnswerOriginal: null,
    vendorAnswerEn: null,
    faqId: null,
    dismissReason: null,
    answeredAt: null,
    vendorId: VENDOR_ID
  });
  messageFindMany.mockResolvedValue([]);
  sendVendorConversationReplyMock.mockResolvedValue({
    message: { id: 'msg-v', conversationId: 'conv-1', senderType: 'vendor', content: 'Yes, divider included.' },
    markedOpenQueries: 1
  });
});

describe('GET /customer-queries', () => {
  it('lists only the requesting vendor\'s queries and defaults status to open', async () => {
    const res = await fetch(baseUrl);
    const body = (await res.json()) as { queries: Array<{ id: string }>; total: number };

    expect(res.status).toBe(200);
    expect(customerQueryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ vendorId: VENDOR_ID, status: 'open' })
      })
    );
    expect(body.queries[0].id).toBe('query-1');
    expect(body.total).toBe(1);
  });

  it('returns 403 when the vendor context is missing', async () => {
    currentUser = { roles: ['vendor'] };
    const res = await fetch(baseUrl);
    expect(res.status).toBe(403);
    expect(customerQueryFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /customer-queries/summary', () => {
  it('returns openCount for the vendor', async () => {
    customerQueryCount.mockResolvedValue(3);
    const res = await fetch(`${baseUrl}/summary`);
    const body = (await res.json()) as { openCount: number };
    expect(res.status).toBe(200);
    expect(body.openCount).toBe(3);
    expect(customerQueryCount).toHaveBeenCalledWith({ where: { vendorId: VENDOR_ID, status: 'open' } });
  });
});

describe('POST /customer-queries/:id/reply', () => {
  it('returns 404 when the query belongs to another vendor', async () => {
    customerQueryFindFirst.mockResolvedValue(null);
    const res = await fetch(`${baseUrl}/not-mine/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Yes, divider included.' })
    });
    expect(res.status).toBe(404);
    expect(sendVendorConversationReplyMock).not.toHaveBeenCalled();
  });

  it('sends via the conversation reply path and marks open queries', async () => {
    customerQueryFindFirst.mockResolvedValue({
      id: 'query-1',
      conversationId: 'conv-1',
      vendorId: VENDOR_ID
    });

    const res = await fetch(`${baseUrl}/query-1/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Yes, divider included.' })
    });
    const body = (await res.json()) as { markedOpenQueries: number };

    expect(res.status).toBe(200);
    expect(sendVendorConversationReplyMock).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      user: currentUser,
      content: 'Yes, divider included.'
    });
    expect(body.markedOpenQueries).toBe(1);
  });
});

describe('POST /customer-queries/:id/promote', () => {
  it('returns 409 when promotion is rejected because the query is still open', async () => {
    promoteCustomerQueryMock.mockRejectedValueOnce(Object.assign(new Error('Query must be answered before promotion'), { statusCode: 409 }));

    const res = await fetch(`${baseUrl}/query-1/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'faq', question: 'Q', answer: 'A' })
    });

    expect(res.status).toBe(409);
  });
});
