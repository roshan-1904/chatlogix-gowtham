import { prisma } from '../db/prisma.js';
import { getPlanCredits, getBillingCycleDates } from '../utils/planUtils.js';
import { getDateRange, type DateRangePreset } from '../utils/dateRange.js';
import { getCached, setCached } from '../utils/redis.js';
import { DatabaseRetryService } from './databaseRetryService.js';

/**
 * Calculate projected monthly usage using linear regression
 */
function calculateProjectedMonthlyUsage(
  dailyUsage: Array<{ usageDate: Date; creditsConsumed: number }>
): number {
  if (dailyUsage.length < 2) {
    // Not enough data, use average
    const avg = dailyUsage.reduce((sum, d) => sum + d.creditsConsumed, 0) / dailyUsage.length;
    return avg * 30; // Project to 30 days
  }

  // Linear regression: y = mx + b
  const n = dailyUsage.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;

  dailyUsage.forEach((d, i) => {
    const x = i;
    const y = d.creditsConsumed;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const b = (sumY - m * sumX) / n;

  // Project to 30 days
  const projected30Days = m * 30 + b;
  return Math.max(0, projected30Days); // Ensure non-negative
}

/**
 * Fetch dashboard stats from database
 */
async function fetchDashboardStatsFromDB(
  vendorId: string,
  dateRange: ReturnType<typeof getDateRange>
) {
  // Get vendor info first
  const vendor = await DatabaseRetryService.withRetry(
    () =>
      prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          subscriptionPlan: true,
          walletBalance: true,
          createdAt: true,
        },
      }),
    'vendor_findUnique',
    { vendorId }
  );

  if (!vendor) {
    throw new Error('Vendor not found');
  }

  const { start: billingCycleStart, end: billingCycleEnd } = getBillingCycleDates(vendor);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  // Parallel queries for performance
  const [
    orderStats,
    totalOrders,
    todayOrders,
    thisMonthOrders,
    yesterdayOrders,
    revenueStats,
    todayRevenue,
    thisMonthRevenue,
    creditUsageTotal,
    creditUsageThisMonth,
    creditUsageThisWeek,
    creditUsageToday,
    creditBreakdown,
    conversationStats,
    productsStats,
    recentConversations,
    recentOrders,
    dailyCreditUsage,
  ] = await Promise.all([
    // Orders stats - optimized single query (filtered by date range)
    DatabaseRetryService.withRetry(
      () =>
        prisma.order.groupBy({
          by: ['status'],
          where: {
            vendorId,
            status: { not: 'cancelled' },
            createdAt: { gte: dateRange.start, lte: dateRange.end },
          },
          _count: { status: true },
          _sum: { totalAmount: true },
        }),
      'order_groupBy',
      { vendorId }
    ),

    // Total orders
    DatabaseRetryService.withRetry(
      () => prisma.order.count({ where: { vendorId } }),
      'order_count_total',
      { vendorId }
    ),

    // Today's orders
    DatabaseRetryService.withRetry(
      () =>
        prisma.order.count({
          where: {
            vendorId,
            createdAt: { gte: startOfToday },
          },
        }),
      'order_count_today',
      { vendorId }
    ),

    // This month's orders
    DatabaseRetryService.withRetry(
      () =>
        prisma.order.count({
          where: {
            vendorId,
            createdAt: { gte: billingCycleStart },
          },
        }),
      'order_count_month',
      { vendorId }
    ),

    // Yesterday's orders (for trend)
    DatabaseRetryService.withRetry(
      () =>
        prisma.order.count({
          where: {
            vendorId,
            createdAt: {
              gte: new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000),
              lt: startOfToday,
            },
          },
        }),
      'order_count_yesterday',
      { vendorId }
    ),

    // Revenue stats (filtered by date range)
    DatabaseRetryService.withRetry(
      () =>
        prisma.order.aggregate({
          where: {
            vendorId,
            status: { not: 'cancelled' },
            createdAt: { gte: dateRange.start, lte: dateRange.end },
          },
          _sum: { totalAmount: true },
          _avg: { totalAmount: true },
        }),
      'order_aggregate_revenue',
      { vendorId }
    ),

    // Today's revenue
    DatabaseRetryService.withRetry(
      () =>
        prisma.order.aggregate({
          where: {
            vendorId,
            status: { not: 'cancelled' },
            createdAt: { gte: startOfToday },
          },
          _sum: { totalAmount: true },
        }),
      'order_aggregate_today_revenue',
      { vendorId }
    ),

    // This month's revenue
    DatabaseRetryService.withRetry(
      () =>
        prisma.order.aggregate({
          where: {
            vendorId,
            status: { not: 'cancelled' },
            createdAt: { gte: billingCycleStart },
          },
          _sum: { totalAmount: true },
        }),
      'order_aggregate_month_revenue',
      { vendorId }
    ),

    // Credits usage - total
    DatabaseRetryService.withRetry(
      () =>
        prisma.creditUsage.aggregate({
          where: { vendorId },
          _sum: { creditsConsumed: true },
        }),
      'creditUsage_aggregate_total',
      { vendorId }
    ),

    // Credits usage - this month (billing cycle)
    DatabaseRetryService.withRetry(
      () =>
        prisma.creditUsage.aggregate({
          where: {
            vendorId,
            usageDate: { gte: billingCycleStart },
          },
          _sum: { creditsConsumed: true },
        }),
      'creditUsage_aggregate_month',
      { vendorId }
    ),

    // Credits usage - this week
    DatabaseRetryService.withRetry(
      () =>
        prisma.creditUsage.aggregate({
          where: {
            vendorId,
            usageDate: { gte: startOfWeek },
          },
          _sum: { creditsConsumed: true },
        }),
      'creditUsage_aggregate_week',
      { vendorId }
    ),

    // Credits usage - today
    DatabaseRetryService.withRetry(
      () =>
        prisma.creditUsage.aggregate({
          where: {
            vendorId,
            usageDate: { gte: startOfToday },
          },
          _sum: { creditsConsumed: true },
        }),
      'creditUsage_aggregate_today',
      { vendorId }
    ),

    // Credits breakdown by type (filtered by date range for trends)
    DatabaseRetryService.withRetry(
      () =>
        prisma.creditUsage.groupBy({
          by: ['conversationType'],
          where: {
            vendorId,
            usageDate: { gte: dateRange.start, lte: dateRange.end },
          },
          _sum: { creditsConsumed: true },
        }),
      'creditUsage_groupBy_type',
      { vendorId }
    ),

    // Conversations stats - optimized with includes
    DatabaseRetryService.withRetry(
      () =>
        prisma.conversation.findMany({
          where: { vendorId },
          select: {
            id: true,
            status: true,
            aiPaused: true,
            createdAt: true,
            updatedAt: true,
            orders: {
              select: { id: true },
            },
            messages: {
              select: { id: true },
            },
          },
        }),
      'conversation_findMany_stats',
      { vendorId }
    ),

    // Products stats - single query
    DatabaseRetryService.withRetry(
      () =>
        prisma.product.groupBy({
          by: ['isActive', 'inStock'],
          where: { vendorId },
          _count: true,
        }),
      'product_groupBy',
      { vendorId }
    ),

    // Recent conversations with joins
    DatabaseRetryService.withRetry(
      () =>
        prisma.conversation.findMany({
          where: { vendorId },
          include: {
            customer: {
              select: { phone: true, id: true },
            },
            messages: {
              orderBy: { timestamp: 'desc' },
              take: 1,
              select: { content: true, timestamp: true },
            },
            orders: {
              where: { status: { notIn: ['delivered', 'cancelled'] } },
              take: 1,
              select: { status: true },
            },
          },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
      'conversation_findMany_recent',
      { vendorId }
    ),

    // Recent orders
    DatabaseRetryService.withRetry(
      () =>
        prisma.order.findMany({
          where: { vendorId },
          include: {
            customer: {
              select: { phone: true, id: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      'order_findMany_recent',
      { vendorId }
    ),

    // Daily credit usage for trends (last 7 days)
    DatabaseRetryService.withRetry(
      () =>
        prisma.creditUsage.groupBy({
          by: ['usageDate'],
          where: {
            vendorId,
            usageDate: { gte: startOfWeek },
          },
          _sum: { creditsConsumed: true },
        }),
      'creditUsage_groupBy_daily',
      { vendorId }
    ),
  ]);

  // Calculate plan credits
  const planCredits = getPlanCredits(vendor.subscriptionPlan || 'Starter');
  const usedThisMonth = creditUsageThisMonth._sum.creditsConsumed || 0;
  const remainingThisMonth = Math.max(0, planCredits - usedThisMonth);

  // Calculate trends
  const ordersTrend =
    todayOrders > 0 && yesterdayOrders > 0
      ? {
          direction:
            todayOrders > yesterdayOrders
              ? 'up'
              : todayOrders < yesterdayOrders
                ? 'down'
                : 'neutral',
          percentage: Math.abs(((todayOrders - yesterdayOrders) / yesterdayOrders) * 100),
        }
      : undefined;

  // Calculate revenue trend (compare today vs yesterday)
  const yesterdayRevenue = await DatabaseRetryService.withRetry(
    () =>
      prisma.order.aggregate({
        where: {
          vendorId,
          status: { not: 'cancelled' },
          createdAt: {
            gte: new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000),
            lt: startOfToday,
          },
        },
        _sum: { totalAmount: true },
      }),
    'order_aggregate_yesterday_revenue',
    { vendorId }
  );

  const todayRevenueAmount = todayRevenue._sum.totalAmount || 0;
  const yesterdayRevenueAmount = yesterdayRevenue._sum.totalAmount || 0;
  const revenueTrend =
    todayRevenueAmount > 0 && yesterdayRevenueAmount > 0
      ? {
          direction:
            todayRevenueAmount > yesterdayRevenueAmount
              ? 'up'
              : todayRevenueAmount < yesterdayRevenueAmount
                ? 'down'
                : 'neutral',
          percentage: Math.abs(
            ((todayRevenueAmount - yesterdayRevenueAmount) / yesterdayRevenueAmount) * 100
          ),
        }
      : undefined;

  // Process order status breakdown
  const statusBreakdown = orderStats.map((stat) => ({
    status: stat.status,
    count: stat._count.status,
    revenue: stat._sum.totalAmount || 0,
  }));

  // Get pending orders count
  const pendingStatus = statusBreakdown.find((s) => s.status === 'pending');
  const pendingOrders = pendingStatus?.count || 0;

  // Process conversation stats
  const totalConversations = conversationStats.length;
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const startOfTodayForConversations = new Date();
  startOfTodayForConversations.setHours(0, 0, 0, 0);

  const activeConversations = conversationStats.filter(
    (c) => c.status === 'open' && c.updatedAt.getTime() >= twentyFourHoursAgo
  ).length;

  const todayConversations = conversationStats.filter(
    (c) => c.createdAt >= startOfTodayForConversations
  ).length;

  const conversationsWithOrders = conversationStats.filter((c) => c.orders.length > 0).length;
  const aiPausedConversations = conversationStats.filter((c) => c.aiPaused).length;

  const totalMessages = conversationStats.reduce((sum, c) => sum + c.messages.length, 0);
  const averageMessagesPerConversation =
    totalConversations > 0 ? totalMessages / totalConversations : 0;

  const conversionRate =
    totalConversations > 0 ? (conversationsWithOrders / totalConversations) * 100 : 0;

  // Fetch CustomerInsights for recent conversations
  const customerIds = recentConversations.map((c) => c.customer.id);
  const customerInsightsMap = new Map<string, string | undefined>();
  
  if (customerIds.length > 0) {
    const insights = await DatabaseRetryService.withRetry(
      () =>
        prisma.customerInsights.findMany({
          where: {
            vendorId,
            customerId: { in: customerIds },
          },
          select: {
            customerId: true,
            customerName: true,
          },
        }),
      'customerInsights_findMany_recent',
      { vendorId, customerIds }
    );

    insights.forEach((insight) => {
      customerInsightsMap.set(insight.customerId, insight.customerName || undefined);
    });
  }

  // Process recent conversations
  const recentActivity = recentConversations.map((conv) => {
    const lastMessage = conv.messages[0];
    const activeOrder = conv.orders[0];
    const customerName = customerInsightsMap.get(conv.customer.id);

    const minutesSinceLastMessage = lastMessage
      ? Math.floor((now - new Date(lastMessage.timestamp).getTime()) / 60000)
      : 0;

    return {
      id: conv.id,
      customerName,
      customerPhone: conv.customer.phone,
      lastMessage: lastMessage?.content || '',
      minutesSinceLastMessage,
      hasActiveOrder: !!activeOrder,
      orderStatus: activeOrder?.status,
    };
  });

  // Process products stats
  let totalProducts = 0;
  let activeProducts = 0;
  let outOfStockProducts = 0;

  productsStats.forEach((stat) => {
    const count = stat._count;
    totalProducts += count;
    if (stat.isActive) {
      activeProducts += count;
    }
    if (!stat.inStock) {
      outOfStockProducts += count;
    }
  });

  // Process credit breakdown
  const creditBreakdownMap: Record<string, number> = {
    text: 0,
    audio: 0,
    image: 0,
    document: 0,
  };

  creditBreakdown.forEach((item) => {
    const type = item.conversationType;
    if (type in creditBreakdownMap) {
      creditBreakdownMap[type] = item._sum.creditsConsumed || 0;
    }
  });

  // Process daily credit usage for trends
  const dailyUsage = dailyCreditUsage
    .map((item) => ({
      usageDate: item.usageDate,
      creditsConsumed: item._sum.creditsConsumed || 0,
    }))
    .sort((a, b) => a.usageDate.getTime() - b.usageDate.getTime());

  const totalCreditsInPeriod = dailyUsage.reduce((sum, d) => sum + d.creditsConsumed, 0);
  const daysInPeriod = Math.max(1, Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (24 * 60 * 60 * 1000)));
  const averagePerDay = totalCreditsInPeriod / daysInPeriod;

  const projectedMonthlyUsage = calculateProjectedMonthlyUsage(dailyUsage);

  // Fetch CustomerInsights for recent orders
  const orderCustomerIds = recentOrders.map((o) => o.customer.id);
  const orderCustomerInsightsMap = new Map<string, string | undefined>();
  
  if (orderCustomerIds.length > 0) {
    const orderInsights = await DatabaseRetryService.withRetry(
      () =>
        prisma.customerInsights.findMany({
          where: {
            vendorId,
            customerId: { in: orderCustomerIds },
          },
          select: {
            customerId: true,
            customerName: true,
          },
        }),
      'customerInsights_findMany_recent_orders',
      { vendorId, customerIds: orderCustomerIds }
    );

    orderInsights.forEach((insight) => {
      orderCustomerInsightsMap.set(insight.customerId, insight.customerName || undefined);
    });
  }

  // Process recent orders
  const recentOrdersFormatted = recentOrders.map((order) => {
    const customerName = orderCustomerInsightsMap.get(order.customer.id) || order.customer.phone;

    return {
      id: order.id,
      customerName,
      totalAmount: order.totalAmount,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
    };
  });

  return {
    dateRange: {
      preset: dateRange.preset,
      startDate: dateRange.start.toISOString().split('T')[0],
      endDate: dateRange.end.toISOString().split('T')[0],
      label: dateRange.label,
    },
    orders: {
      total: orderStats.reduce((sum, stat) => sum + stat._count.status, 0),
      today: todayOrders,
      pending: pendingOrders,
      thisMonth: thisMonthOrders,
      statusBreakdown,
      trend: ordersTrend,
    },
    revenue: {
      total: revenueStats._sum.totalAmount || 0,
      today: todayRevenueAmount,
      thisMonth: thisMonthRevenue._sum.totalAmount || 0,
      averageOrderValue: revenueStats._avg.totalAmount || 0,
      trend: revenueTrend,
    },
    credits: {
      planCredits,
      usedThisMonth,
      remainingThisMonth,
      used: {
        total: creditUsageTotal._sum.creditsConsumed || 0,
        thisMonth: usedThisMonth,
        thisWeek: creditUsageThisWeek._sum.creditsConsumed || 0,
        today: creditUsageToday._sum.creditsConsumed || 0,
      },
      walletBalance: vendor.walletBalance,
      usagePercentage: planCredits > 0 ? (usedThisMonth / planCredits) * 100 : 0,
      planName: vendor.subscriptionPlan || 'Starter',
      breakdown: creditBreakdownMap,
      projectedMonthlyUsage,
      lowBalanceWarning: vendor.walletBalance < 10000, // ₹100 in paise
      billingCycleStart: billingCycleStart.toISOString(),
      billingCycleEnd: billingCycleEnd.toISOString(),
      usageTrends: {
        dailyUsage: dailyUsage.map((d) => ({
          date: d.usageDate.toISOString().split('T')[0],
          creditsConsumed: d.creditsConsumed,
        })),
        averagePerDay,
      },
    },
    products: {
      total: totalProducts,
      active: activeProducts,
      outOfStock: outOfStockProducts,
    },
    conversations: {
      total: totalConversations,
      active: activeConversations,
      today: todayConversations,
      withOrders: conversationsWithOrders,
      aiPaused: aiPausedConversations,
      conversionRate,
      averageMessagesPerConversation,
      recentActivity,
    },
    recentOrders: recentOrdersFormatted,
  };
}

/**
 * Get dashboard stats with caching
 */
export async function getDashboardStats(
  vendorId: string,
  dateRangePreset: DateRangePreset,
  startDate?: string,
  endDate?: string
) {
  const dateRange = getDateRange(dateRangePreset, startDate, endDate);

  // Include date range in cache keys to prevent mixing different date ranges
  const dateRangeKey = `${dateRange.preset}:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}`;
  const shortCacheKey = `dashboard:stats:${vendorId}:${dateRangeKey}:shortcache`;
  const realtimeCacheKey = `dashboard:stats:${vendorId}:${dateRangeKey}:realtime`;

  // 1. Check short-term cache (5 seconds) - return immediately if exists
  const shortCache = await getCached<any>(shortCacheKey);
  if (shortCache) {
    return shortCache;
  }

  // 2. Check real-time cache (30 seconds)
  const realtimeCache = await getCached<any>(realtimeCacheKey);
  if (realtimeCache) {
    // Also populate short-term cache for next 5 seconds
    await setCached(shortCacheKey, realtimeCache, 5);
    return realtimeCache;
  }

  // 3. Query database with date range
  const stats = await fetchDashboardStatsFromDB(vendorId, dateRange);

  // 4. Store in both caches
  const statsJson = JSON.stringify(stats);
  await Promise.all([
    setCached(shortCacheKey, stats, 5), // 5-second cache
    setCached(realtimeCacheKey, stats, 30), // 30-second cache
  ]);

  return stats;
}

