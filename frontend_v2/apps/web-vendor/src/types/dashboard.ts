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

  // Wallet spend. Every amount here is in millirupees (1 rupee = 1000),
  // which is a different unit from the paise used for orders and revenue.
  billing: {
    balanceMilli: number; // Prepaid wallet balance
    spend: {
      today: number;
      thisWeek: number; // last 7 days
      thisMonth: number; // current billing cycle
      total: number; // all time
    };
    breakdownBySource: Array<{
      source: string; // e.g. 'conversation', 'catalog_import'
      label: string; // Vendor-facing name for the source
      milli: number;
      count?: number;
    }>;
    dailySpend: Array<{
      date: string; // ISO date string
      milli: number;
    }>;
    averagePerDayMilli: number; // Average spend per day in the selected period
    projectedMonthlySpendMilli: number; // Extrapolated from recent spend
    lowBalanceWarning: boolean; // if balanceMilli < 20000 milli (₹20)
    billingCycleStart?: string; // ISO date of current billing cycle start
    billingCycleEnd?: string; // ISO date of current billing cycle end
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

