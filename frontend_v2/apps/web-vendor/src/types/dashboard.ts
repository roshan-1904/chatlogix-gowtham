/**
 * Dashboard Types
 * TypeScript interfaces matching backend DashboardStats response
 */

export type DateRangePreset = 'thisWeek' | 'thisMonth' | 'last3Months' | 'last6Months' | 'thisFinancialYear' | 'custom';

export interface DashboardStats {
  // Date range metadata
  dateRange: {
    preset: DateRangePreset;
    startDate: string; // ISO date string (YYYY-MM-DD)
    endDate: string; // ISO date string (YYYY-MM-DD)
    label: string; // Human-readable label (e.g., "Apr 1 - Dec 15, 2024")
  };

  // Orders (filtered by date range)
  orders: {
    total: number; // Count within date range
    today: number; // Always today's count (unfiltered)
    pending: number; // Current pending orders (unfiltered)
    thisMonth: number; // This month's count (unfiltered, for reference)
    statusBreakdown: Array<{
      status: string;
      count: number; // Count within date range
      revenue: number; // in paise (excludes cancelled, within date range)
    }>;
    trend?: {
      direction: 'up' | 'down' | 'neutral';
      percentage: number; // vs previous period of same duration
    };
  };

  // Revenue (filtered by date range)
  revenue: {
    total: number; // in paise, within date range (excludes cancelled orders)
    today: number; // in paise (always today, unfiltered)
    thisMonth: number; // in paise (this month, unfiltered, for reference)
    averageOrderValue: number; // in paise (within date range)
    trend?: {
      direction: 'up' | 'down' | 'neutral';
      percentage: number; // vs previous period of same duration
    };
  };

  // Credits
  credits: {
    planCredits: number; // Monthly allowance from subscription plan
    usedThisMonth: number; // Credits consumed in current billing cycle
    remainingThisMonth: number; // planCredits - usedThisMonth
    used: {
      total: number; // all time credits consumed
      thisMonth: number; // current billing cycle
      thisWeek: number; // last 7 days
      today: number; // today
    };
    walletBalance: number; // ₹ balance (in paise) for extra usage charges
    usagePercentage: number; // (usedThisMonth / planCredits) * 100
    planName: string; // Subscription plan name
    breakdown: {
      text: number; // Credits consumed for text messages (within date range if filtered)
      audio: number; // Credits consumed for audio messages (within date range if filtered)
      image: number; // Credits consumed for image messages (within date range if filtered)
      document: number; // Credits consumed for document messages (within date range if filtered)
    };
    projectedMonthlyUsage?: number; // Calculated from trends (linear regression on selected period)
    lowBalanceWarning: boolean; // if walletBalance < 10000 paise (₹100)
    billingCycleStart?: string; // ISO date of current billing cycle start
    billingCycleEnd?: string; // ISO date of current billing cycle end
    // Usage trends (filtered by date range)
    usageTrends?: {
      dailyUsage: Array<{
        date: string; // ISO date string
        creditsConsumed: number;
      }>;
      averagePerDay: number; // Average credits per day in selected period
    };
  };

  // Products
  products: {
    total: number;
    active: number;
    outOfStock: number;
  };

  // Conversations
  conversations: {
    total: number;
    active: number; // open status + updated in last 24h
    today: number; // created today
    withOrders: number; // conversations that have orders
    aiPaused: number;
    conversionRate: number; // (withOrders / total) * 100
    averageMessagesPerConversation: number;
    recentActivity: Array<{
      id: string;
      customerName?: string;
      customerPhone: string;
      lastMessage: string;
      minutesSinceLastMessage: number;
      hasActiveOrder: boolean;
      orderStatus?: string;
    }>;
  };

  // Recent Orders (for widget)
  recentOrders: Array<{
    id: string;
    customerName: string;
    totalAmount: number; // in paise
    status: string;
    createdAt: string;
  }>;
}

