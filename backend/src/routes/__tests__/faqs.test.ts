import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

// faqs.ts's two OpenAI-embedding-dependent steps (create/update) must never
// block a save on OpenAI being down, and must never trust the client for
// vendorId — these are the behaviors worth locking down beyond what
// products.ts's (untested) CRUD pattern already establishes.

const faqCreate = vi.fn();
const faqUpdate = vi.fn();
const faqFindFirst = vi.fn();
const faqFindMany = vi.fn();
const executeRaw = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    faq: {
      create: (...args: unknown[]) => faqCreate(...args),
      update: (...args: unknown[]) => faqUpdate(...args),
      findFirst: (...args: unknown[]) => faqFindFirst(...args),
      findMany: (...args: unknown[]) => faqFindMany(...args)
    },
    $executeRaw: (...args: unknown[]) => executeRaw(...args)
  }
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const invalidateFaqsMock = vi.fn();
vi.mock('../../conversation/prefetch.js', () => ({
  invalidateFaqs: (...args: unknown[]) => invalidateFaqsMock(...args)
}));

const embedTextMock = vi.fn();
vi.mock('../../conversation/faq/embedding.js', () => ({
  embedText: (...args: unknown[]) => embedTextMock(...args),
  toVectorLiteral: (embedding: number[]) => `[${embedding.join(',')}]`,
  FAQ_EMBEDDING_MODEL: 'text-embedding-3-small'
}));

const { faqsRouter } = await import('../faqs.js');

const VENDOR_ID = 'vendor-1';
let currentUser: { vendorId?: string; roles: string[] } = { vendorId: VENDOR_ID, roles: ['vendor'] };

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = currentUser;
  next();
});
app.use('/faqs', faqsRouter);

let baseUrl: string;
const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/faqs`;

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  currentUser = { vendorId: VENDOR_ID, roles: ['vendor'] };
  faqCreate.mockImplementation(async ({ data }: any) => ({ id: 'faq-1', ...data }));
  faqUpdate.mockImplementation(async ({ data }: any) => ({ id: 'faq-1', vendorId: VENDOR_ID, ...data }));
  faqFindFirst.mockResolvedValue({ id: 'faq-1', vendorId: VENDOR_ID, question: 'Old Q?', answer: 'Old A.', isActive: true });
  embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
  executeRaw.mockResolvedValue(undefined);
});

describe('POST /faqs', () => {
  it('always creates under req.user.vendorId, ignoring any vendorId in the body', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Do you deliver on Sundays?', answer: 'Yes.', vendorId: 'someone-elses-vendor' })
    });

    expect(res.status).toBe(201);
    expect(faqCreate).toHaveBeenCalledWith({ data: { question: 'Do you deliver on Sundays?', answer: 'Yes.', isActive: true, vendorId: VENDOR_ID } });
  });

  it('returns 400 on a Zod validation failure', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '', answer: 'Yes.' })
    });

    expect(res.status).toBe(400);
    expect(faqCreate).not.toHaveBeenCalled();
  });

  it('still saves and returns 201 when the embedding call fails, flagging embeddingPending', async () => {
    embedTextMock.mockResolvedValue(null);

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Do you deliver on Sundays?', answer: 'Yes.' })
    });
    const body = (await res.json()) as { embeddingPending: boolean };

    expect(res.status).toBe(201);
    expect(body.embeddingPending).toBe(true);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('calls invalidateFaqs for the creating vendor after a successful create', async () => {
    await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Do you deliver on Sundays?', answer: 'Yes.' })
    });

    expect(invalidateFaqsMock).toHaveBeenCalledWith(VENDOR_ID);
  });
});

describe('PUT /faqs/:id', () => {
  it('re-embeds when the question changes', async () => {
    const res = await fetch(`${baseUrl}/faq-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Updated question?' })
    });

    expect(res.status).toBe(200);
    expect(embedTextMock).toHaveBeenCalledWith('Updated question?');
    expect(executeRaw).toHaveBeenCalled();
  });

  it('skips re-embedding on an answer-only edit', async () => {
    const res = await fetch(`${baseUrl}/faq-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'Updated answer.' })
    });

    expect(res.status).toBe(200);
    expect(embedTextMock).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('skips re-embedding on an isActive-only edit', async () => {
    const res = await fetch(`${baseUrl}/faq-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: false })
    });

    expect(res.status).toBe(200);
    expect(embedTextMock).not.toHaveBeenCalled();
  });

  it('calls invalidateFaqs after a successful update', async () => {
    await fetch(`${baseUrl}/faq-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'Updated answer.' })
    });

    expect(invalidateFaqsMock).toHaveBeenCalledWith(VENDOR_ID);
  });

  it('returns 404 when the FAQ does not belong to the requesting vendor', async () => {
    faqFindFirst.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/not-mine`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'x' })
    });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /faqs/:id', () => {
  it('soft-deletes (isActive: false) and invalidates the FAQ cache', async () => {
    const res = await fetch(`${baseUrl}/faq-1`, { method: 'DELETE' });

    expect(res.status).toBe(200);
    expect(faqUpdate).toHaveBeenCalledWith({ where: { id: 'faq-1' }, data: { isActive: false } });
    expect(invalidateFaqsMock).toHaveBeenCalledWith(VENDOR_ID);
  });
});
