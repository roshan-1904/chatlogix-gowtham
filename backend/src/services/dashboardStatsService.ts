import { prisma } from '../db/prisma.js';
import { getBillingCycleDates } from '../utils/planUtils.js';
import { getDateRange, type DateRangePreset } from '../utils/dateRange.js';
import { getCached, setCached } from '../utils/redis.js';
import { DatabaseRetryService } from './databaseRetryService.js';

/**
 * Wallet balance below this triggers the low-balance warning (₹20 in millirupees).
 * Must stay under the trial grant (PlatformSettings.trialGrantPaise → milli), or every trial vendor starts out warned.
 */
const LOW_BALANCE_THRESHOLD_MILLI = 20000;

/** Number of trailing days reported in `billing.dailySpend`. */
const DAILY_SPEND_WINDOW_DAYS = 7;

/**
 * Vendor-facing labels for every `ChargeSource` that `pricingService.chargeVendor`
 * can write to `CreditUsage.source`. Wording matches billingService's trial
 * breakdown so the two views name the same spend the same way.
 */
const SPEND_SOURCE_LABELS: Record<string, string> = {
  conversation_turn: 'Customer replies',
  legacy_conversation_turn: 'Customer replies',
  outbound_media: 'Product media sends',
  catalog_import: 'Catalog import',
  catalog_enhance: 'Catalog enhancer',
  catalog_enhance_transcribe: 'Catalog enhancer voice',
  sandbox_chat: 'Sandbox replies',
  sandbox_transcribe: 'Voice transcription',
};

/**
 * Wallet *credits*, which reach `WalletTransaction` through walletTopUpService
 * and never `chargeVendor` — so they cannot appear in `CreditUsage` today.
 * Filtered anyway so a future caller mistake can't report a top-up as spend.
 */
const NON_SPEND_SOURCES = new Set(['wallet_topup', 'admin_recharge']);

/**
 * Calculate projected monthly spend (millirupees) using linear regression
 */
function calculateProjectedMonthlySpendMilli(dailySpend: Array<{ milli: number }>): number {
  if (dailySpend.length === 0) {
    return 0;
  }

  if (dailySpend.length < 2) {
    // Not enough data, use average
    const avg = dailySpend.reduce((sum, d) => sum + d.milli, 0) / dailySpend.length;
    return Math.max(0, Math.round(avg * 30)); // Project to 30 days
  }

  // Linear regression: y = mx + b
  const n = dailySpend.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0;

  dailySpend.forEach((d, i) => {
    const x = i;
    const y = d.milli;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  });

  const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const b = (sumY - m * sumX) / n;

  // Project to 30 days
  const projected30Days = m * 30 + b;
  return Math.max(0, Math.round(projected30Days)); // Ensure non-negative
}

/** Local YYYY-MM-DD key, so daily buckets line up with the vendor's calendar days. */
function toDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
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
          walletBalanceMilli: true,
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
  // Trailing DAILY_SPEND_WINDOW_DAYS window, inclusive of today.
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - (DAILY_SPEND_WINDOW_DAYS - 1));

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
    spendTotal,
    spendThisMonth,
    spendThisWeek,
    spendToday,
    spendBySource,
    conversationStats,
    productsStats,
    recentConversations,
    recentOrders,
    dailySpendRows,
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
          _sum: { chargedMilli: true },
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
          _sum: { chargedMilli: true },
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
          _sum: { chargedMilli: true },
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
          _sum: { chargedMilli: true },
        }),
      'creditUsage_aggregate_today',
      { vendorId }
    ),

    // Spend breakdown by source (filtered by date range)
    DatabaseRetryService.withRetry(
      () =>
        prisma.creditUsage.groupBy({
          by: ['source'],
          where: {
            vendorId,
            usageDate: { gte: dateRange.start, lte: dateRange.end },
          },
          _sum: { chargedMilli: true },
          _count: true,
        }),
      'creditUsage_groupBy_source',
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
              select: { content: true, contentEn: true, timestamp: true },
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

    // Daily spend for trends (trailing DAILY_SPEND_WINDOW_DAYS)
    DatabaseRetryService.withRetry(
      () =>
        prisma.creditUsage.groupBy({
          by: ['usageDate'],
          where: {
            vendorId,
            usageDate: { gte: startOfWeek },
          },
          _sum: { chargedMilli: true },
        }),
      'creditUsage_groupBy_daily',
      { vendorId }
    ),
  ]);

  const spentThisMonthMilli = spendThisMonth._sum.chargedMilli || 0;

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
      lastMessage: lastMessage?.contentEn ?? lastMessage?.content ?? '',
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

  // Process spend breakdown by source (only sources with recorded spend are reported)
  const breakdownBySource = spendBySource
    .filter((item) => !NON_SPEND_SOURCES.has(item.source))
    .map((item) => ({
      source: item.source,
      label: SPEND_SOURCE_LABELS[item.source] ?? 'Other usage',
      milli: item._sum.chargedMilli || 0,
      count: item._count,
    }))
    .sort((a, b) => b.milli - a.milli);

  // Process daily spend for trends. `usageDate` is a timestamp, so bucket by calendar day
  // and backfill the whole window so the trend chart has one point per day.
  const dailySpendByDay = new Map<string, number>();
  dailySpendRows.forEach((item) => {
    const key = toDayKey(item.usageDate);
    dailySpendByDay.set(key, (dailySpendByDay.get(key) || 0) + (item._sum.chargedMilli || 0));
  });

  const dailySpend: Array<{ date: string; milli: number }> = [];
  for (let offset = DAILY_SPEND_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
    const day = new Date(startOfToday);
    day.setDate(day.getDate() - offset);
    const key = toDayKey(day);
    dailySpend.push({ date: key, milli: dailySpendByDay.get(key) || 0 });
  }

  const windowSpendMilli = dailySpend.reduce((sum, d) => sum + d.milli, 0);
  const averagePerDayMilli = Math.round(windowSpendMilli / DAILY_SPEND_WINDOW_DAYS);

  const projectedMonthlySpendMilli = calculateProjectedMonthlySpendMilli(dailySpend);

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
    billing: {
      balanceMilli: vendor.walletBalanceMilli,
      spend: {
        today: spendToday._sum.chargedMilli || 0,
        thisWeek: spendThisWeek._sum.chargedMilli || 0,
        thisMonth: spentThisMonthMilli,
        total: spendTotal._sum.chargedMilli || 0,
      },
      breakdownBySource,
      dailySpend,
      averagePerDayMilli,
      projectedMonthlySpendMilli,
      lowBalanceWarning: vendor.walletBalanceMilli < LOW_BALANCE_THRESHOLD_MILLI,
      billingCycleStart: billingCycleStart.toISOString(),
      billingCycleEnd: billingCycleEnd.toISOString(),
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

