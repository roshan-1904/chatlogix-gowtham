import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const vendorFindUnique = vi.fn();
const conversationFindUnique = vi.fn();
const whatsAppNumberFindFirst = vi.fn();
const messageFindFirst = vi.fn();
const customerQueryFindMany = vi.fn();
const messageFindMany = vi.fn();

let mockCases: any[] = [];
let mockNotes: any[] = [];

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ 1: 1 }]),
    $transaction: vi.fn(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      return arg;
    }),
    vendor: {
      findUnique: (...args: unknown[]) => vendorFindUnique(...args),
    },
    conversation: {
      findUnique: (...args: unknown[]) => conversationFindUnique(...args),
    },
    whatsAppNumber: {
      findFirst: (...args: unknown[]) => whatsAppNumberFindFirst(...args),
    },
    message: {
      findFirst: (...args: unknown[]) => messageFindFirst(...args),
      findMany: (...args: unknown[]) => messageFindMany(...args),
    },
    customerQuery: {
      findMany: (...args: unknown[]) => customerQueryFindMany(...args),
    },
    staffCase: {
      findMany: vi.fn(async (args: any) => {
        let list = [...mockCases];
        if (args?.where?.status && args.where.status !== 'all') {
          list = list.filter((c) => c.status === args.where.status);
        }
        if (args?.where?.vendorId) {
          list = list.filter((c) => c.vendorId === args.where.vendorId);
        }
        return list.map((c) => ({
          ...c,
          notes: mockNotes.filter((n) => n.caseId === c.id),
        }));
      }),
      findUnique: vi.fn(async (args: any) => {
        const c = mockCases.find((x) => x.id === args?.where?.id);
        if (!c) return null;
        return {
          ...c,
          notes: mockNotes.filter((n) => n.caseId === c.id),
        };
      }),
      create: vi.fn(async (args: any) => {
        const vendorData = (await vendorFindUnique({ where: { id: args.data.vendorId } })) || {
          id: args.data.vendorId,
          businessName: 'Shop A',
        };
        const c = {
          id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          vendorId: args.data.vendorId,
          subject: args.data.subject,
          status: args.data.status ?? 'open',
          conversationId: args.data.conversationId ?? null,
          openedBy: args.data.openedBy,
          resolvedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          vendor: vendorData,
        };
        mockCases.push(c);
        return c;
      }),
      update: vi.fn(async (args: any) => {
        const c = mockCases.find((x) => x.id === args?.where?.id);
        if (!c) throw new Error('Not found');
        if (args.data.status !== undefined) c.status = args.data.status;
        if (args.data.resolvedAt !== undefined) c.resolvedAt = args.data.resolvedAt;
        c.updatedAt = new Date();
        const vendorData = (await vendorFindUnique({ where: { id: c.vendorId } })) || {
          id: c.vendorId,
          businessName: 'Shop A',
        };
        return {
          ...c,
          vendor: vendorData,
          notes: mockNotes.filter((n) => n.caseId === c.id),
        };
      }),
    },
    staffCaseNote: {
      create: vi.fn(async (args: any) => {
        const note = {
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          caseId: args.data.caseId,
          authorId: args.data.authorId,
          body: args.data.body,
          createdAt: new Date(),
        };
        mockNotes.push(note);
        return note;
      }),
      findMany: vi.fn(async (args: any) => {
        return mockNotes.filter((n) => n.caseId === args?.where?.caseId);
      }),
    },
  },
}));

function seedMockCase(c: any) {
  mockCases.push({
    id: c.id,
    vendorId: c.vendorId,
    subject: c.subject,
    status: c.status,
    openedBy: c.openedBy || 'admin-1',
    conversationId: c.conversationId ?? null,
    resolvedAt: c.resolvedAt ?? null,
    createdAt: new Date(c.createdAt || Date.now()),
    updatedAt: new Date(c.updatedAt || Date.now()),
    vendor: { id: c.vendorId, businessName: 'Shop A' },
  });
}

const { adminSupportRouter } = await import('../adminSupport.js');
const { setCustomAuditWriterForTest } = await import('../../services/adminSupportService.js');

const app = express();
app.use(express.json());
// Simulate authenticated admin user
app.use((req, _res, next) => {
  (req as any).user = { id: 'admin-user-1', roles: ['admin'] };
  next();
});
app.use('/admin/support', adminSupportRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/support`;

afterAll(() => {
  server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCases = [];
  mockNotes = [];
  setCustomAuditWriterForTest(null);
});

describe('Admin Support Module', () => {
  describe('POST /cases - Case creation and validation', () => {
    it('returns 400 if vendorId is missing', async () => {
      const res = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: 'Valid subject' }),
      });
      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toBe('invalid_vendor');
    });

    it('returns 400 if subject is less than 3 characters or too long', async () => {
      const resShort = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: 'v-1', subject: 'hi' }),
      });
      expect(resShort.status).toBe(400);
      const dataShort: any = await resShort.json();
      expect(dataShort.error).toBe('invalid_subject');

      const resLong = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: 'v-1', subject: 'a'.repeat(141) }),
      });
      expect(resLong.status).toBe(400);
      const dataLong: any = await resLong.json();
      expect(dataLong.error).toBe('invalid_subject');
    });

    it('returns 404 if vendor does not exist', async () => {
      vendorFindUnique.mockResolvedValueOnce(null);

      const res = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId: 'missing-v', subject: 'Valid subject' }),
      });
      expect(res.status).toBe(404);
      const data: any = await res.json();
      expect(data.error).toBe('vendor_not_found');
    });

    it('returns 400 if conversationId does not belong to the specified shop', async () => {
      vendorFindUnique.mockResolvedValueOnce({ id: 'v-1', businessName: 'Shop A' });
      // Conversation belongs to v-2
      conversationFindUnique.mockResolvedValueOnce({ id: 'c-1', vendorId: 'v-2' });

      const res = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: 'v-1',
          subject: 'Issue with chat',
          conversationId: 'c-1',
        }),
      });
      expect(res.status).toBe(400);
      const data: any = await res.json();
      expect(data.error).toBe('invalid_conversation');
      expect(data.message).toBe('That conversation is not on this shop.');
    });

    it('successfully creates a case with valid vendor and matching conversation', async () => {
      vendorFindUnique.mockResolvedValueOnce({ id: 'v-1', businessName: 'Shop A' });
      conversationFindUnique.mockResolvedValueOnce({ id: 'c-1', vendorId: 'v-1' });
      setCustomAuditWriterForTest(async () => true);

      const res = await fetch(`${baseUrl}/cases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId: 'v-1',
          subject: 'Wallet recharge inquiry',
          conversationId: 'c-1',
        }),
      });
      expect(res.status).toBe(201);
      const data: any = await res.json();
      expect(data.id).toBeDefined();
      expect(data.subject).toBe('Wallet recharge inquiry');
      expect(data.status).toBe('open');
      expect(data.conversationId).toBe('c-1');
      expect(data.vendor.businessName).toBe('Shop A');
    });
  });

  describe('PATCH /cases/:id - Status transitions', () => {
    it('allows valid transition open -> waiting', async () => {
      seedMockCase({
        id: 'case-1',
        vendorId: 'v-1',
        subject: 'Test case',
        status: 'open',
        openedBy: 'admin-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setCustomAuditWriterForTest(async () => true);

      const res = await fetch(`${baseUrl}/cases/case-1`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'waiting' }),
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.status).toBe('waiting');
      expect(data.notes.length).toBe(1);
      expect(data.notes[0].body).toContain('Status set to waiting');
    });

    it('allows valid transition open -> resolved', async () => {
      seedMockCase({
        id: 'case-2',
        vendorId: 'v-1',
        subject: 'Test case',
        status: 'open',
        openedBy: 'admin-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setCustomAuditWriterForTest(async () => true);

      const res = await fetch(`${baseUrl}/cases/case-2`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.status).toBe('resolved');
    });

    it('allows valid transition waiting -> open and waiting -> resolved', async () => {
      seedMockCase({
        id: 'case-3',
        vendorId: 'v-1',
        subject: 'Test case',
        status: 'waiting',
        openedBy: 'admin-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setCustomAuditWriterForTest(async () => true);

      const resToOpen = await fetch(`${baseUrl}/cases/case-3`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'open' }),
      });
      expect(resToOpen.status).toBe(200);
      const dataToOpen: any = await resToOpen.json();
      expect(dataToOpen.status).toBe('open');

      // Now from open -> waiting -> resolved
      await fetch(`${baseUrl}/cases/case-3`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'waiting' }),
      });
      const resToResolved = await fetch(`${baseUrl}/cases/case-3`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      expect(resToResolved.status).toBe(200);
      const dataToResolved: any = await resToResolved.json();
      expect(dataToResolved.status).toBe('resolved');
    });

    it('allows reopening resolved -> open', async () => {
      seedMockCase({
        id: 'case-4',
        vendorId: 'v-1',
        subject: 'Test case',
        status: 'resolved',
        openedBy: 'admin-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setCustomAuditWriterForTest(async () => true);

      const res = await fetch(`${baseUrl}/cases/case-4`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'open' }),
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.status).toBe('open');
    });

    it('rejects invalid transitions with 409 invalid_status_transition', async () => {
      seedMockCase({
        id: 'case-5',
        vendorId: 'v-1',
        subject: 'Test case',
        status: 'resolved',
        openedBy: 'admin-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // resolved -> waiting is invalid
      const res1 = await fetch(`${baseUrl}/cases/case-5`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'waiting' }),
      });
      expect(res1.status).toBe(409);
      const data1: any = await res1.json();
      expect(data1.error).toBe('invalid_status_transition');

      // resolved -> resolved is invalid
      const res2 = await fetch(`${baseUrl}/cases/case-5`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      expect(res2.status).toBe(409);
    });
  });

  describe('POST /cases/:id/notes - Case notes timeline', () => {
    it('appends note to case timeline', async () => {
      seedMockCase({
        id: 'case-notes',
        vendorId: 'v-1',
        subject: 'Notes test',
        status: 'open',
        openedBy: 'admin-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const res = await fetch(`${baseUrl}/cases/case-notes/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Called vendor to confirm WhatsApp number.' }),
      });
      expect(res.status).toBe(201);
      const note: any = await res.json();
      expect(note.id).toBeDefined();
      expect(note.body).toBe('Called vendor to confirm WhatsApp number.');
      expect(note.authorId).toBe('admin-user-1');

      // Verify case detail now contains note
      const detailRes = await fetch(`${baseUrl}/cases/case-notes`);
      const detail: any = await detailRes.json();
      expect(detail.notes.length).toBe(1);
    });

    it('rejects empty or overly long notes', async () => {
      seedMockCase({
        id: 'case-note-val',
        vendorId: 'v-1',
        subject: 'Val test',
        status: 'open',
        openedBy: 'admin-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const resEmpty = await fetch(`${baseUrl}/cases/case-note-val/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: '   ' }),
      });
      expect(resEmpty.status).toBe(400);

      const resLong = await fetch(`${baseUrl}/cases/case-note-val/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'x'.repeat(2001) }),
      });
      expect(resLong.status).toBe(400);
    });
  });

  describe('GET /conversations/:conversationId - Audited transcript read', () => {
    it('FAILS CLOSED (HTTP 500) and returns NO messages when audit logging fails', async () => {
      conversationFindUnique.mockResolvedValueOnce({
        id: 'conv-100',
        vendorId: 'v-1',
        vendor: { id: 'v-1', businessName: 'Test Vendor' },
        customer: { id: 'cust-1', phone: '+919999999999' },
      });

      // Simulate audit write failure (e.g. DB error or missing table)
      setCustomAuditWriterForTest(async () => false);

      const res = await fetch(`${baseUrl}/conversations/conv-100`);
      expect(res.status).toBe(500);
      const data: any = await res.json();
      expect(data.error).toBe('audit_failed');
      expect(data.message).toBe('Could not record this read. The conversation was not opened.');
      // Crucial: messageFindMany must NEVER have been called!
      expect(messageFindMany).not.toHaveBeenCalled();
    });

    it('SUCCEEDS and returns messages when audit logging succeeds', async () => {
      conversationFindUnique.mockResolvedValueOnce({
        id: 'conv-200',
        vendorId: 'v-1',
        vendor: { id: 'v-1', businessName: 'Test Vendor' },
        customer: { id: 'cust-1', phone: '+919999999999' },
      });

      // Query orders by timestamp: 'desc', so m-2 is returned first by the DB
      messageFindMany.mockResolvedValueOnce([
        {
          id: 'm-2',
          senderType: 'assistant',
          timestamp: new Date('2026-10-17T10:00:02Z'),
          content: 'Yes, we deliver across Chennai.',
          contentEn: 'Yes, we deliver across Chennai.',
          status: 'sent',
        },
        {
          id: 'm-1',
          senderType: 'customer',
          timestamp: new Date('2026-10-17T10:00:00Z'),
          content: 'Do you deliver to Chennai?',
          contentEn: null,
          status: 'delivered',
        },
      ]);

      // Simulate audit write success
      setCustomAuditWriterForTest(async () => true);

      const res = await fetch(`${baseUrl}/conversations/conv-200`);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.auditRecorded).toBe(true);
      expect(data.messages.length).toBe(2);
      expect(data.messages[0].senderType).toBe('customer');
      expect(data.messages[1].status).toBe('sent');
      expect(data.vendor.businessName).toBe('Test Vendor');
      expect(data.customer.phone).toBe('+919999999999');
    });

    it('returns 404 if conversation does not exist', async () => {
      conversationFindUnique.mockResolvedValueOnce(null);

      const res = await fetch(`${baseUrl}/conversations/missing-conv`);
      expect(res.status).toBe(404);
      expect(messageFindMany).not.toHaveBeenCalled();
    });
  });

  describe('GET /vendors/:vendorId/context - Shop Context Card data', () => {
    it('returns comprehensive context including wallet, whatsapp, last failure, and open queries', async () => {
      vendorFindUnique.mockResolvedValueOnce({
        id: 'v-ctx',
        businessName: 'Annapoorna Foods',
        walletBalanceMilli: 12400, // ₹12.40
        markupPercent: 50,
      });

      whatsAppNumberFindFirst.mockResolvedValueOnce({
        phoneNumber: '+919876543210',
        connectStatus: 'live',
      });

      messageFindFirst.mockResolvedValueOnce({
        id: 'msg-fail',
        conversationId: 'c-fail',
        timestamp: new Date('2026-10-17T14:00:00Z'),
        failureReason: 'Graph 500 on outbound replies',
        content: 'Failed outbound message text preview',
      });

      customerQueryFindMany.mockResolvedValueOnce([
        {
          id: 'q-1',
          questionEn: 'Do you deliver to Coimbatore?',
          category: 'policy',
          hitCount: 5,
          lastSeenAt: new Date('2026-10-17T12:00:00Z'),
          status: 'open',
        },
      ]);

      const res = await fetch(`${baseUrl}/vendors/v-ctx/context`);
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.vendor.businessName).toBe('Annapoorna Foods');
      expect(data.vendor.walletBalanceMilli).toBe(12400);
      expect(data.whatsapp.connectStatus).toBe('live');
      expect(data.lastFailure.failureReason).toBe('Graph 500 on outbound replies');
      expect(data.openQuestions.length).toBe(1);
      expect(data.openQuestions[0].questionEn).toBe('Do you deliver to Coimbatore?');
    });

    it('returns 404 if vendor does not exist', async () => {
      vendorFindUnique.mockResolvedValueOnce(null);

      const res = await fetch(`${baseUrl}/vendors/non-existent/context`);
      expect(res.status).toBe(404);
    });
  });
});
