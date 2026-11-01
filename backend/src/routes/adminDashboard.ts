import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { istYearMonth, istMonthUtcRange } from '../services/payments/taxReportMath.js';

export const adminDashboardRouter = Router();

adminDashboardRouter.get(
  '/dashboard-summary',
  asyncHandler(async (_req, res) => {
    const currentYm = istYearMonth(new Date());
    const { start, end } = istMonthUtcRange(currentYm);

    const [totalVendors, approvedVendors, pendingApproval, orderRevenueAggregate] = await Promise.all([
      prisma.vendor.count(),
      prisma.vendor.count({
        where: {
          registrationStatus: 'approved'
        }
      }),
      prisma.vendor.count({
        where: {
          registrationStatus: 'pending_approval'
        }
      }),
      prisma.order.aggregate({
        _sum: {
          totalAmount: true
        },
        where: {
          status: {
            not: 'cancelled'
          },
          createdAt: {
            gte: start,
            lt: end
          }
        }
      })
    ]);

    return res.json({
      totalVendors,
      approvedVendors,
      pendingApproval,
      orderRevenuePaiseMonth: orderRevenueAggregate._sum.totalAmount ?? 0
    });
  })
);
