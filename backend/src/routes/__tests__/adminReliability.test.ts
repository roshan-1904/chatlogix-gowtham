import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const messageFindMany = vi.fn();
const conversationFindMany = vi.fn();
const orderFindMany = vi.fn();
const orderAlertFindMany = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    message: {
      findMany: (...args: unknown[]) => messageFindMany(...args),
    },
    conversation: {
      findMany: (...args: unknown[]) => conversationFindMany(...args),
    },
    order: {
      findMany: (...args: unknown[]) => orderFindMany(...args),
    },
    orderAlert: {
      findMany: (...args: unknown[]) => orderAlertFindMany(...args),
    },
  },
}));

const { adminReliabilityRouter } = await import('../adminReliability.js');

const app = express();
app.use(express.json());
app.use('/admin/reliability', adminReliabilityRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin/reliability`;

afterAll(() => {
  server.close();
});

interface FailedMessagesResponse {
  count: number;
  items: Array<{
    id: string;
    conversationId: string;
    timestamp: string;
    vendorId: string;
    businessName: string;
    customerPhone: string;
    content: string;
    failureReason: string | null;
    senderType: string;
  }>;
}

interface PausedConversationsResponse {
  count: number;
  items: Array<{
    id: string;
    vendorId: string;
    businessName: string;
    customerId: string;
    customerPhone: string;
    updatedAt: string;
    hint: string;
  }>;
}

interface WalletBlocksResponse {
  supported: boolean;
  status: string;
  count: number;
  items: unknown[];
  message: string;
}

interface StuckOrdersResponse {
  count: number;
  items: Array<{
    id: string;
    orderNumber: string;
    vendorId: string;
    businessName: string;
    customerPhone: string;
    status: string;
    totalAmountPaise: number;
    updatedAt: string;
  }>;
}

interface OrderAlertsResponse {
  count: number;
  items: Array<{
    id: string;
    orderId: string;
    orderNumber: string;
    vendorId: string;
    businessName: string;
    customerPhone: string;
    severity: string;
    type: string;
    message: string;
    resolved: boolean;
    createdAt: string;
  }>;
}

describe('Admin Reliability Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /failed-messages', () => {
    it('returns failed messages formatted with vendor and customer info', async () => {
      const now = new Date('2026-10-28T10:00:00Z');
      messageFindMany.mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          timestamp: now,
          content: 'Hello, how can I help you today? We have...',
          failureReason: 'WhatsApp Graph 500 error',
          senderType: 'assistant',
          conversation: {
            id: 'conv-1',
            vendorId: 'v-1',
            vendor: { id: 'v-1', businessName: 'Annapoorna Foods' },
            customer: { id: 'c-1', phone: '+919876543210' },
          },
        },
      ]);

      const res = await fetch(`${baseUrl}/failed-messages`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as FailedMessagesResponse;

      expect(data.count).toBe(1);
      expect(data.items[0]).toEqual({
        id: 'msg-1',
        conversationId: 'conv-1',
        timestamp: now.toISOString(),
        vendorId: 'v-1',
        businessName: 'Annapoorna Foods',
        customerPhone: '+919876543210',
        content: 'Hello, how can I help you today? We have...',
        failureReason: 'WhatsApp Graph 500 error',
        senderType: 'assistant',
      });
      expect(messageFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'failed',
          }),
          take: 50,
          orderBy: { timestamp: 'desc' },
        })
      );
    });

    it('filters by vendorId when provided', async () => {
      messageFindMany.mockResolvedValue([]);
      const res = await fetch(`${baseUrl}/failed-messages?vendorId=vendor-xyz`);
      expect(res.status).toBe(200);

      expect(messageFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'failed',
            conversation: { vendorId: 'vendor-xyz' },
          }),
        })
      );
    });

    it('rejects invalid date range where from > to', async () => {
      const res = await fetch(`${baseUrl}/failed-messages?from=2026-10-29&to=2026-10-20`);
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('Invalid date range');
    });

    it('returns empty list when no failed messages match', async () => {
      messageFindMany.mockResolvedValue([]);
      const res = await fetch(`${baseUrl}/failed-messages`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as FailedMessagesResponse;
      expect(data.count).toBe(0);
      expect(data.items).toEqual([]);
    });
  });

  describe('GET /paused-conversations', () => {
    it('returns paused conversations where aiPaused is true', async () => {
      const updatedAt = new Date('2026-10-28T09:30:00Z');
      conversationFindMany.mockResolvedValue([
        {
          id: 'conv-99',
          vendorId: 'v-2',
          customerId: 'c-2',
          updatedAt,
          status: 'open',
          vendor: { id: 'v-2', businessName: 'Bakery Express' },
          customer: { id: 'c-2', phone: '+919123456789' },
        },
      ]);

      const res = await fetch(`${baseUrl}/paused-conversations`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as PausedConversationsResponse;

      expect(data.count).toBe(1);
      expect(data.items[0]).toEqual({
        id: 'conv-99',
        vendorId: 'v-2',
        businessName: 'Bakery Express',
        customerId: 'c-2',
        customerPhone: '+919123456789',
        updatedAt: updatedAt.toISOString(),
        hint: 'Assistant will not reply until the vendor resumes.',
      });
      expect(conversationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aiPaused: true,
          }),
          orderBy: { updatedAt: 'desc' },
        })
      );
    });

    it('filters by vendorId when provided', async () => {
      conversationFindMany.mockResolvedValue([]);
      const res = await fetch(`${baseUrl}/paused-conversations?vendorId=v-3`);
      expect(res.status).toBe(200);

      expect(conversationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aiPaused: true,
            vendorId: 'v-3',
          }),
        })
      );
    });
  });

  describe('GET /wallet-blocks', () => {
    it('returns pending_migration state per Decision 2 Option A', async () => {
      const res = await fetch(`${baseUrl}/wallet-blocks`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as WalletBlocksResponse;

      expect(data).toMatchObject({
        supported: false,
        status: 'pending_migration',
        count: 0,
        items: [],
      });
      expect(data.message).toContain('WalletBlockEvent persistence requires schema migration');
    });
  });

  describe('GET /stuck-orders', () => {
    it('returns orders stuck in pending or confirmed > 24 hours', async () => {
      const updatedAt = new Date('2026-10-25T10:00:00Z');
      orderFindMany.mockResolvedValue([
        {
          id: 'ord-1',
          orderNumber: 'ORD-2026-001',
          vendorId: 'v-1',
          status: 'pending',
          totalAmount: 49900,
          updatedAt,
          vendor: { id: 'v-1', businessName: 'Annapoorna Foods' },
          customer: { id: 'c-1', phone: '+919876543210' },
        },
      ]);

      const res = await fetch(`${baseUrl}/stuck-orders`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as StuckOrdersResponse;

      expect(data.count).toBe(1);
      expect(data.items[0]).toEqual({
        id: 'ord-1',
        orderNumber: 'ORD-2026-001',
        vendorId: 'v-1',
        businessName: 'Annapoorna Foods',
        customerPhone: '+919876543210',
        status: 'pending',
        totalAmountPaise: 49900,
        updatedAt: updatedAt.toISOString(),
      });
      expect(orderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['pending', 'confirmed'] },
          }),
          orderBy: { updatedAt: 'asc' },
        })
      );
    });

    it('filters stuck orders by vendorId', async () => {
      orderFindMany.mockResolvedValue([]);
      const res = await fetch(`${baseUrl}/stuck-orders?vendorId=v-specific`);
      expect(res.status).toBe(200);

      expect(orderFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            vendorId: 'v-specific',
          }),
        })
      );
    });
  });

  describe('GET /order-alerts', () => {
    it('returns unresolved order alerts', async () => {
      const createdAt = new Date('2026-10-28T05:00:00Z');
      orderAlertFindMany.mockResolvedValue([
        {
          id: 'alert-1',
          orderId: 'ord-10',
          severity: 'high',
          type: 'payment_screenshot_failed',
          message: 'Payment screenshot unverified after 2 attempts',
          resolved: false,
          createdAt,
          order: {
            id: 'ord-10',
            orderNumber: 'ORD-10',
            vendorId: 'v-1',
            vendor: { id: 'v-1', businessName: 'Annapoorna' },
            customer: { id: 'c-1', phone: '+919999999999' },
          },
        },
      ]);

      const res = await fetch(`${baseUrl}/order-alerts`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as OrderAlertsResponse;

      expect(data.count).toBe(1);
      expect(data.items[0]).toEqual({
        id: 'alert-1',
        orderId: 'ord-10',
        orderNumber: 'ORD-10',
        vendorId: 'v-1',
        businessName: 'Annapoorna',
        customerPhone: '+919999999999',
        severity: 'high',
        type: 'payment_screenshot_failed',
        message: 'Payment screenshot unverified after 2 attempts',
        resolved: false,
        createdAt: createdAt.toISOString(),
      });
      expect(orderAlertFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            resolved: false,
          }),
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });
});
