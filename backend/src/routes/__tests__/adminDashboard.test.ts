import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const vendorCount = vi.fn();
const orderAggregate = vi.fn();

vi.mock('../../db/prisma.js', () => ({
  prisma: {
    vendor: {
      count: (...args: unknown[]) => vendorCount(...args)
    },
    order: {
      aggregate: (...args: unknown[]) => orderAggregate(...args)
    }
  }
}));

const { adminDashboardRouter } = await import('../adminDashboard.js');

const app = express();
app.use(express.json());
app.use('/admin', adminDashboardRouter);

const server = app.listen(0);
await new Promise<void>((resolve) => server.once('listening', resolve));
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/admin`;

afterAll(() => {
  server.close();
});

describe('GET /admin/dashboard-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all four KPI metrics correctly', async () => {
    vendorCount.mockImplementation((args?: { where?: { registrationStatus?: string } }) => {
      if (!args || !args.where) return Promise.resolve(128);
      if (args.where.registrationStatus === 'approved') return Promise.resolve(96);
      if (args.where.registrationStatus === 'pending_approval') return Promise.resolve(4);
      return Promise.resolve(0);
    });

    orderAggregate.mockResolvedValue({
      _sum: {
        totalAmount: 12040000
      }
    });

    const res = await fetch(`${baseUrl}/dashboard-summary`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      totalVendors: 128,
      approvedVendors: 96,
      pendingApproval: 4,
      orderRevenuePaiseMonth: 12040000
    });

    // Check query filters
    expect(vendorCount).toHaveBeenCalledWith();
    expect(vendorCount).toHaveBeenCalledWith({
      where: { registrationStatus: 'approved' }
    });
    expect(vendorCount).toHaveBeenCalledWith({
      where: { registrationStatus: 'pending_approval' }
    });
    expect(orderAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        _sum: { totalAmount: true },
        where: expect.objectContaining({
          status: { not: 'cancelled' },
          createdAt: expect.objectContaining({
            gte: expect.any(Date),
            lt: expect.any(Date)
          })
        })
      })
    );
  });

  it('safely handles zero revenue when order aggregate sum is null', async () => {
    vendorCount.mockResolvedValue(0);
    orderAggregate.mockResolvedValue({
      _sum: {
        totalAmount: null
      }
    });

    const res = await fetch(`${baseUrl}/dashboard-summary`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      totalVendors: 0,
      approvedVendors: 0,
      pendingApproval: 0,
      orderRevenuePaiseMonth: 0
    });
  });
});
