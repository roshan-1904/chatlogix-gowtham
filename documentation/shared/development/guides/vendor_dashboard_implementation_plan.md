# 📊 Vendor Dashboard Implementation Plan - ChatLogix

## 📋 Document Overview

This document provides a comprehensive, production-ready implementation plan for the Vendor Dashboard in ChatLogix. It includes detailed specifications for displaying orders, revenue, products, conversation insights, and AI credits information in a near real-time, user-friendly dashboard interface.

**Document Status:** ✅ Ready for Implementation (Final Updates Applied)  
**Last Updated:** 2025-01-XX  
**Target Completion:** Phase 7 (Weeks 13-14)  
**Priority:** High - Core Feature  

### 🔧 Critical Fixes Applied (2025-01-XX)

This document has been updated to address critical gaps identified in the implementation plan analysis:

1. **✅ Fixed Credit System Model**
   - Clarified distinction between Plan Credits (monthly conversation allowance) and Wallet Balance (₹)
   - Credits reset monthly; wallet balance persists
   - Updated all credit-related calculations and displays

2. **✅ Added Plan Utilities**
   - Created plan credit mapping utility (`planUtils.ts`)
   - Added billing cycle date calculation
   - Standardized plan credit values

3. **✅ Optimized Database Queries**
   - Implemented parallel query execution (Promise.all)
   - Added optimized conversation stats queries
   - Included proper joins for recent activity data

4. **✅ Enhanced Error Handling**
   - Added request cancellation (AbortController)
   - Implemented retry logic with exponential backoff
   - Added stale data display with refresh indicators

5. **✅ Added Request Validation**
   - Zod schema validation for requests/responses
   - Input sanitization
   - Rate limiting specifications

6. **✅ Fixed Authentication Details**
   - Clarified JWT token requirements
   - Added authorization middleware specifications
   - Documented admin access patterns

7. **✅ Added Database Indexes**
   - Complete index specification for performance
   - Migration-ready SQL statements

8. **✅ Improved Data Calculations**
   - Fixed response time calculation algorithm
   - Added projected usage calculation (linear regression)
   - Fixed trend calculations with edge case handling

9. **✅ Enhanced Frontend Implementation**
   - Added proper cleanup in hooks
   - Implemented request deduplication
   - Added data freshness indicators

10. **✅ Clarified Real-time Updates**
    - Changed from "real-time" to "near real-time" (30-second polling)
    - Added note about WebSocket/SSE for future enhancement

11. **✅ Fixed API Endpoint Path**
    - Updated to match existing API pattern: `/api/vendors/:id/dashboard-stats` (removed `/v1` prefix)
    - Aligned with existing routes in `backend/src/routes/vendors.ts`

---

## 🔧 Prerequisites Before Implementation

Before starting Phase 1, ensure the following infrastructure components are in place:

### **Required Prerequisites (1-2 days):**

1. **Redis Client Implementation** (`backend/src/utils/redis.ts`)
   - Redis client initialization with graceful degradation
   - Cache utility functions (`getCached`, `setCached`)
   - Required for multi-tier caching strategy

2. **Rate Limiting Middleware** (`backend/src/middleware/rateLimit.ts`)
   - Express rate limiting middleware
   - Redis-backed store (with in-memory fallback)
   - 60 requests/minute per vendor limit

3. **Utility Functions** (Create before API endpoint):
   - `backend/src/utils/planUtils.ts` - Plan credits mapping
   - `backend/src/utils/dateRange.ts` - Date range calculations
   - `backend/src/utils/currency.ts` - Currency formatting

4. **Database Indexes Migration**
   - Create Prisma migration with indexes specified in Section 1.1
   - Apply indexes before testing with production data

**Note:** These prerequisites are implementation tasks, not documentation gaps. The document is ready; these components need to be built before Phase 1 begins.

---

## 🎯 Business Objectives

### **Primary Goals:**
- Provide vendors with real-time visibility into their business performance
- Enable data-driven decision making through comprehensive analytics
- Improve vendor engagement and satisfaction with transparent metrics
- Support credit management and cost optimization
- Enhance operational efficiency through actionable insights

### **Success Metrics:**
- Dashboard load time < 2 seconds
- 99.9% data accuracy
- Near real-time updates (30-second refresh polling)
- 95% vendor satisfaction with dashboard usability
- Zero critical bugs in production

**Note:** "Real-time" refers to 30-second polling refresh. For true real-time updates, WebSocket/SSE implementation would be required (future enhancement).

---

## 📊 Current State Analysis

### **Existing Implementation:**
- **Location:** `frontend_v2/apps/web-vendor/src/pages/Dashboard.tsx`
- **Status:** Basic structure with hardcoded zero values
- **Components:** `DashboardStatCard` component exists
- **APIs Available:**
  - `/api/orders/vendor/:vendorId/stats` - Order statistics
  - `/api/vendors/:id/config` - Vendor configuration
  - `/api/vendors/:id/credits-used` - Credits usage
  - `/api/products` - Products list with count

### **Gaps Identified:**
1. ❌ No real-time data fetching
2. ❌ No conversation insights
3. ❌ No detailed credit breakdown
4. ❌ No loading/error states
5. ❌ No recent activity widgets
6. ❌ No visualizations/charts

---

## 🔧 Functional Requirements

### **1. Core Dashboard Metrics (Top Row)**

#### **1.1 Total Orders Card**
- **Display:**
  - Total Orders (filtered by selected date range)
  - Today's Orders (count)
  - Pending Orders (count)
  - Trend indicator (↑/↓ vs previous period)
- **Date Filter:** Applies to orders count and breakdown (see Date Filter section below)
- **Data Source:** `/api/orders/vendor/:vendorId/stats` (with date range query params)
- **Update Frequency:** Real-time on page load, refresh every 30 seconds
- **Visual:** Large number with sub-metrics below

#### **1.2 Revenue Card**
- **Display:**
  - Total Revenue (filtered by selected date range, formatted as ₹X,XXX)
  - Today's Revenue
  - This Month's Revenue
  - Trend indicator (vs previous period)
- **Date Filter:** Applies to revenue calculations (see Date Filter section below)
- **Data Source:** `/api/orders/vendor/:vendorId/stats` (with date range query params)
- **Currency Format:** Indian Rupee (₹) with comma separators
- **Visual:** Large amount with sub-metrics

#### **1.3 Credits Status Card**
- **Display:**
  - **Remaining Plan Credits** (planCredits - usedThisMonth) - Monthly conversation allowance remaining
  - **Used Credits** (this month) - Credits consumed from monthly plan
  - **Plan Credits** (based on subscription plan) - Total monthly allowance
  - **Wallet Balance** (₹) - Separate from credits, used for extra usage charges
  - **Usage Percentage** with progress bar
  - **Low Balance Warning** if walletBalance < ₹100 (for extra usage)
- **Data Sources:**
  - `/api/vendors/:id/config` (walletBalance, subscriptionPlan)
  - `/api/vendors/:id/credits-used` (usage)
- **Plan Credits Mapping:**
  - Starter: 100 credits/month
  - Pro: 500 credits/month
  - Business: 2,000 credits/month
  - Enterprise: 10,000 credits/month
- **Important:** Credits (conversation allowance) are separate from Wallet Balance (₹). Credits reset monthly, wallet balance persists.
- **Visual:** Progress bar with color coding (green/yellow/red)

#### **1.4 Products Card**
- **Display:**
  - Total Products
  - Active Products
  - Out of Stock count
  - Quick link to catalog
- **Data Source:** `/api/products` (with filters)
- **Visual:** Large number with sub-metrics

---

### **2. Conversation Insights Section**

#### **2.1 Conversation Metrics Cards**
- **Total Conversations:** All-time count
- **Active Conversations:** Count where `status = 'open'` and `updatedAt` within last 24 hours
- **Today's Conversations:** New conversations created today
- **Conversations with Orders:** Count of conversations that have at least 1 order
- **AI Paused Conversations:** Count where `aiPaused = true`
- **Conversion Rate:** `(Conversations with Orders / Total Conversations) × 100`

#### **2.2 Conversation Activity Widget**
- **Recent Conversations List:**
  - Last 5-10 active conversations
  - Display: Customer name/phone, last message preview, time since last message
  - Order status badge (if has active order)
  - Click to navigate to conversation detail
- **Data Source:** `/api/vendors/:id/conversations` (with pagination)

#### **2.3 Conversation Activity Insights**
- **Average Messages per Conversation:** Total messages / Total conversations
- **Response Time:** Average time between customer message and AI/vendor response
  - Calculation: For each conversation, find time difference between customer message and next AI/vendor message
  - Average across all conversations with at least one response
  - Exclude conversations without responses
- **Active in Last 24h:** Conversations with messages in last 24 hours
- **Unread/Needs Attention:** Conversations with customer messages but no recent vendor response (customer message > 5 minutes ago, no vendor message after)

**Response Time Calculation Implementation:**
```typescript
// Calculate average response time
const conversationsWithResponses = await prisma.conversation.findMany({
  where: { vendorId },
  include: {
    messages: {
      orderBy: { timestamp: 'asc' },
      select: { senderType: true, timestamp: true }
    }
  }
});

let totalResponseTime = 0;
let responseCount = 0;

for (const conv of conversationsWithResponses) {
  for (let i = 0; i < conv.messages.length - 1; i++) {
    const current = conv.messages[i];
    const next = conv.messages[i + 1];
    
    // If current is customer message and next is AI/vendor response
    if (current.senderType === 'customer' && next.senderType !== 'customer') {
      const responseTime = next.timestamp.getTime() - current.timestamp.getTime();
      totalResponseTime += responseTime;
      responseCount++;
    }
  }
}

const averageResponseTime = responseCount > 0 
  ? totalResponseTime / responseCount 
  : 0; // milliseconds
```

---

### **3. AI Credits Information Section**

#### **3.1 Credit Status Card (Detailed)**
- **Remaining Plan Credits:** `planCredits - usedThisMonth` (monthly conversation allowance remaining)
- **Credits Used:**
  - Total (all-time) - Sum of all creditsConsumed from CreditUsage
  - This Month - Credits consumed in current billing cycle
  - This Week - Credits consumed in last 7 days
  - Today - Credits consumed today
- **Plan Credits:** Based on subscription plan (monthly allowance)
- **Wallet Balance:** Separate ₹ balance for extra usage charges (when plan credits exhausted)
- **Usage Percentage:** `(Used This Month / Plan Credits) × 100`
- **Low Balance Warning:** Alert if `walletBalance < 100` (for extra usage billing)
- **Billing Cycle:** Credits reset monthly based on subscription renewal date

#### **3.2 Credits Breakdown by Type**
- **Text Messages:** Sum of `creditsConsumed` from `CreditUsage` where `conversationType = 'text'`
- **Audio Messages:** Sum where `conversationType = 'audio'`
- **Image Messages:** Sum where `conversationType = 'image'`
- **Document Messages:** Sum where `conversationType = 'document'`
- **Note:** These represent credits consumed (not conversation count), as different message types consume different credit amounts:
  - Text: 1 credit per message
  - Audio: 2 credits per message
  - Image/Document: 3 credits per message
- **Visual:** Pie chart or horizontal bar chart showing credit consumption by type

#### **3.3 Credit Usage Trends**
- **Today's Credits Used**
- **This Week's Credits Used**
- **This Month's Credits Used**
- **Average Credits per Day:** Selected period's credits / days in period
- **Projected Monthly Usage:** Calculated from trends using linear regression
- **Date Filter:** Applies to usage trends and projections (see Date Filter section below)
- **Visual:** Line chart showing daily usage over time (filtered by selected date range)
- **Disclaimer:** Projections are estimates based on recent trends and may not reflect actual future usage

**Projected Monthly Usage Calculation:**
```typescript
// Get daily credit usage for last 7 days
const dailyUsage = await prisma.creditUsage.groupBy({
  by: ['usageDate'],
  where: {
    vendorId,
    usageDate: { gte: startOfWeek }
  },
  _sum: { creditsConsumed: true }
});

// Simple linear regression for projection
function calculateProjection(dailyData: Array<{ usageDate: Date; _sum: { creditsConsumed: number | null } }>): number {
  if (dailyData.length < 2) {
    // Not enough data, use average
    const avg = dailyData.reduce((sum, d) => sum + (d._sum.creditsConsumed || 0), 0) / dailyData.length;
    return avg * 30; // Project to 30 days
  }
  
  // Linear regression: y = mx + b
  const n = dailyData.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  
  dailyData.forEach((d, i) => {
    const x = i;
    const y = d._sum.creditsConsumed || 0;
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

const projectedMonthlyUsage = calculateProjection(dailyUsage);
```

**Note:** Projection is an estimate based on recent trends. Actual usage may vary.

---

### **4. Date Filter Functionality**

#### **4.1 Date Filter Options**
Date filters apply to **Orders**, **Revenue**, and **Credits Usage Trends** sections only. Other sections (Products, Credits Status, Conversations) remain unfiltered as they represent current state or real-time metrics.

**Available Date Range Presets:**
- **This Week** - Monday to today (or last 7 days)
- **This Month** - 1st of current month to today
- **Last 3 Months** - Last 90 days from today
- **Last 6 Months** - Last 180 days from today
- **This Financial Year** - April 1st to today (Indian financial year: April 1 - March 31)
- **Custom Range** - User-selectable start and end dates (max 1 year range)

**Default Selection:** This Month

**UI Location:** Date filter dropdown/selector in dashboard header, visible above Orders and Revenue sections

**Behavior:**
- Changing date filter triggers API call with new date range parameters
- Loading state shown while fetching filtered data
- Date range displayed in filter UI (e.g., "Apr 1 - Dec 15, 2024")
- Filter state persisted in URL query params for bookmarking/sharing
- Cache key includes date range to prevent stale data mixing

**Financial Year Calculation:**
```typescript
function getFinancialYearDates(date: Date = new Date()): { start: Date; end: Date } {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  
  // Indian financial year: April 1 to March 31
  let fyStart: Date;
  let fyEnd: Date;
  
  if (month >= 3) { // April (3) to December (11)
    fyStart = new Date(year, 3, 1); // April 1
    fyEnd = new Date(year + 1, 2, 31, 23, 59, 59); // March 31 next year
  } else { // January (0) to March (2)
    fyStart = new Date(year - 1, 3, 1); // April 1 previous year
    fyEnd = new Date(year, 2, 31, 23, 59, 59); // March 31 current year
  }
  
  return { start: fyStart, end: fyEnd };
}
```

---

### **5. Additional Dashboard Sections**

#### **4.1 Recent Orders Widget**
- **Display:** Last 5-10 orders
- **Information:** Order ID, customer name, amount, status, time
- **Action:** Click to view order details
- **Data Source:** `/api/orders?vendorId=:vendorId` (sorted by createdAt desc)

#### **4.2 Order Status Breakdown**
- **Visual:** Pie chart or bar chart
- **Data:** Status distribution (Pending, Confirmed, Preparing, Ready, Delivered, Cancelled)
- **Data Source:** `/api/orders/vendor/:vendorId/stats` (statusBreakdown)

#### **4.3 Quick Actions Panel**
- **Add Product** button → Navigate to `/catalog/new`
- **View Orders** button → Navigate to `/orders`
- **Recharge Credits** button (if low balance) → Navigate to billing page
- **View Conversations** button → Navigate to `/conversations`

---

## 🏗️ Technical Architecture

### **1. Backend API Design**

#### **1.1 New Endpoint: Dashboard Stats**

**Endpoint:** `GET /api/vendors/:id/dashboard-stats`

**Query Parameters:**
- `dateRange` (optional): Preset date range - `thisWeek` | `thisMonth` | `last3Months` | `last6Months` | `thisFinancialYear` | `custom`
- `startDate` (optional): ISO date string (YYYY-MM-DD) - Required if `dateRange=custom`
- `endDate` (optional): ISO date string (YYYY-MM-DD) - Required if `dateRange=custom`
- Default: `dateRange=thisMonth` if not specified

**Authentication:** Required (vendor or admin)
- Uses JWT token in Authorization header
- Token must contain `vendorId` claim for vendor access
- Admin role can access any vendor's stats

**Authorization:** 
- Vendor can only access their own stats (`req.user.vendorId === req.params.id`)
- Admin can access any vendor's stats
- Middleware: `requireVendorAccess((req) => req.params.id)`

**Rate Limiting:**
- 60 requests per minute per vendor
- Prevents abuse and ensures fair resource usage
- **Short-term Cache:** If a request was made within the last 5 seconds, return cached response immediately (prevents duplicate database queries from rapid successive requests)
  - This works in conjunction with rate limiting to optimize performance
  - Reduces database load while maintaining data freshness
  - Cache key: `dashboard:stats:${vendorId}:shortcache` (5-second TTL)

**Response Structure:**
```typescript
interface DashboardStats {
  // Date range metadata
  dateRange: {
    preset: 'thisWeek' | 'thisMonth' | 'last3Months' | 'last6Months' | 'thisFinancialYear' | 'custom';
    startDate: string; // ISO date string
    endDate: string; // ISO date string
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
```

**Implementation Location:** `backend/src/routes/vendors.ts`

**Required Utility Functions:**

**1. Plan Credits Mapping Utility** (`backend/src/utils/planUtils.ts`):
```typescript
export const PLAN_CREDITS: Record<string, number> = {
  'Starter': 100,
  'Pro': 500,
  'Business': 2000,
  'Enterprise': 10000,
};

export function getPlanCredits(planName: string): number {
  const credits = PLAN_CREDITS[planName];
  if (credits === undefined) {
    console.warn(`Unknown plan: ${planName}, defaulting to Starter`);
    return PLAN_CREDITS['Starter'];
  }
  return credits;
}

export function getBillingCycleDates(vendor: { createdAt: Date; subscriptionPlan?: string }): {
  start: Date;
  end: Date;
} {
  // For now, use calendar month. In future, use planStartDate/planEndDate from Vendor model
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}
```

**2. Currency Formatting Utility** (`backend/src/utils/currency.ts`):
```typescript
export function formatCurrency(amountInPaise: number): string {
  const rupees = amountInPaise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}
```

**3. Date Range Utility** (`backend/src/utils/dateRange.ts`):
```typescript
export type DateRangePreset = 'thisWeek' | 'thisMonth' | 'last3Months' | 'last6Months' | 'thisFinancialYear' | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
  preset: DateRangePreset;
  label: string;
}

export function getDateRange(preset: DateRangePreset, startDate?: string, endDate?: string): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let start: Date;
  let end: Date = new Date(today);
  end.setHours(23, 59, 59, 999); // End of today
  
  switch (preset) {
    case 'thisWeek': {
      const dayOfWeek = today.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
      start = new Date(today);
      start.setDate(today.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    
    case 'thisMonth': {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    
    case 'last3Months': {
      start = new Date(today);
      start.setMonth(today.getMonth() - 3);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    
    case 'last6Months': {
      start = new Date(today);
      start.setMonth(today.getMonth() - 6);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    }
    
    case 'thisFinancialYear': {
      const fyDates = getFinancialYearDates(today);
      start = fyDates.start;
      end = fyDates.end > today ? end : fyDates.end;
      break;
    }
    
    case 'custom': {
      if (!startDate || !endDate) {
        throw new Error('startDate and endDate required for custom range');
      }
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      // Validate: max 1 year range
      const maxEnd = new Date(start);
      maxEnd.setFullYear(maxEnd.getFullYear() + 1);
      if (end > maxEnd) {
        throw new Error('Date range cannot exceed 1 year');
      }
      break;
    }
    
    default:
      // Default to thisMonth
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
  }
  
  const label = formatDateRangeLabel(start, end, preset);
  
  return { start, end, preset, label };
}

function getFinancialYearDates(date: Date): { start: Date; end: Date } {
  const year = date.getFullYear();
  const month = date.getMonth();
  
  let fyStart: Date;
  let fyEnd: Date;
  
  if (month >= 3) { // April to December
    fyStart = new Date(year, 3, 1);
    fyEnd = new Date(year + 1, 2, 31, 23, 59, 59);
  } else { // January to March
    fyStart = new Date(year - 1, 3, 1);
    fyEnd = new Date(year, 2, 31, 23, 59, 59);
  }
  
  return { start: fyStart, end: fyEnd };
}

function formatDateRangeLabel(start: Date, end: Date, preset: DateRangePreset): string {
  if (preset === 'custom') {
    return `${start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} - ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  
  const presetLabels: Record<DateRangePreset, string> = {
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    last3Months: 'Last 3 Months',
    last6Months: 'Last 6 Months',
    thisFinancialYear: 'This Financial Year',
    custom: formatDateRangeLabel(start, end, 'custom')
  };
  
  return presetLabels[preset] || 'This Month';
}
```

**Database Queries Required:**
```typescript
import { getPlanCredits, getBillingCycleDates } from '../utils/planUtils.js';
import { getDateRange, type DateRangePreset } from '../utils/dateRange.js';

// Parse date range from query params
const dateRangePreset = (req.query.dateRange as DateRangePreset) || 'thisMonth';
const startDate = req.query.startDate as string | undefined;
const endDate = req.query.endDate as string | undefined;
const dateRange = getDateRange(dateRangePreset, startDate, endDate);

// Get vendor info first
const vendor = await prisma.vendor.findUnique({
  where: { id: vendorId },
  select: {
    subscriptionPlan: true,
    walletBalance: true,
    createdAt: true,
  }
});

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
  creditUsageTotal,
  creditUsageThisMonth,
  creditUsageThisWeek,
  creditUsageToday,
  creditBreakdown,
  conversationStats,
  productsStats,
  recentConversations,
  recentOrders
] = await Promise.all([
  // Orders stats - optimized single query (filtered by date range)
  prisma.order.groupBy({
    by: ['status'],
    where: { 
      vendorId,
      status: { not: 'cancelled' }, // Exclude cancelled from revenue
      createdAt: { gte: dateRange.start, lte: dateRange.end } // Apply date filter
    },
    _count: { status: true },
    _sum: { totalAmount: true }
  }),
  
  // Total orders
  prisma.order.count({ where: { vendorId } }),
  
  // Today's orders
  prisma.order.count({
    where: {
      vendorId,
      createdAt: { gte: startOfToday }
    }
  }),
  
  // This month's orders
  prisma.order.count({
    where: {
      vendorId,
      createdAt: { gte: billingCycleStart }
    }
  }),
  
  // Yesterday's orders (for trend)
  prisma.order.count({
    where: {
      vendorId,
      createdAt: {
        gte: new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000),
        lt: startOfToday
      }
    }
  }),
  
  // Revenue stats (filtered by date range)
  prisma.order.aggregate({
    where: {
      vendorId,
      status: { not: 'cancelled' },
      createdAt: { gte: dateRange.start, lte: dateRange.end } // Apply date filter
    },
    _sum: { totalAmount: true },
    _avg: { totalAmount: true }
  }),
  
  // Credits usage - total
  prisma.creditUsage.aggregate({
    where: { vendorId },
    _sum: { creditsConsumed: true }
  }),
  
  // Credits usage - this month (billing cycle)
  prisma.creditUsage.aggregate({
    where: {
      vendorId,
      usageDate: { gte: billingCycleStart }
    },
    _sum: { creditsConsumed: true }
  }),
  
  // Credits usage - this week
  prisma.creditUsage.aggregate({
    where: {
      vendorId,
      usageDate: { gte: startOfWeek }
    },
    _sum: { creditsConsumed: true }
  }),
  
  // Credits usage - today
  prisma.creditUsage.aggregate({
    where: {
      vendorId,
      usageDate: { gte: startOfToday }
    },
    _sum: { creditsConsumed: true }
  }),
  
  // Credits breakdown by type (filtered by date range for trends)
  prisma.creditUsage.groupBy({
    by: ['conversationType'],
    where: { 
      vendorId,
      usageDate: { gte: dateRange.start, lte: dateRange.end } // Apply date filter for trends
    },
    _sum: { creditsConsumed: true }
  }),
  
  // Conversations stats - optimized with includes
  prisma.conversation.findMany({
    where: { vendorId },
    select: {
      id: true,
      status: true,
      aiPaused: true,
      createdAt: true,
      updatedAt: true,
      orders: {
        select: { id: true }
      },
      messages: {
        select: { id: true }
      }
    }
  }),
  
  // Products stats - single query
  prisma.product.groupBy({
    by: ['isActive', 'inStock'],
    where: { vendorId },
    _count: true
  }),
  
  // Recent conversations with joins
  prisma.conversation.findMany({
    where: { vendorId },
    include: {
      customer: {
        select: { phone: true }
      },
      customerInsights: {
        select: { customerName: true },
        take: 1
      },
      messages: {
        orderBy: { timestamp: 'desc' },
        take: 1,
        select: { content: true, timestamp: true }
      },
      orders: {
        where: { status: { notIn: ['delivered', 'cancelled'] } },
        take: 1,
        select: { status: true }
      }
    },
    orderBy: { updatedAt: 'desc' },
    take: 10
  }),
  
  // Recent orders
  prisma.order.findMany({
    where: { vendorId },
    include: {
      customer: {
        select: { phone: true }
      },
      customerInsights: {
        select: { customerName: true },
        take: 1
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 10
  })
]);

// Calculate plan credits
const planCredits = getPlanCredits(vendor.subscriptionPlan || 'Starter');
const usedThisMonth = creditUsageThisMonth._sum.creditsConsumed || 0;
const remainingThisMonth = Math.max(0, planCredits - usedThisMonth);

// Calculate trends
const ordersTrend = todayOrders > 0 && yesterdayOrders > 0
  ? {
      direction: todayOrders > yesterdayOrders ? 'up' : todayOrders < yesterdayOrders ? 'down' : 'neutral',
      percentage: Math.abs(((todayOrders - yesterdayOrders) / yesterdayOrders) * 100)
    }
  : undefined;
```

**Performance Considerations:**
- Use database indexes on `vendorId`, `createdAt`, `updatedAt`
- Consider caching for frequently accessed stats (Redis, 30-second TTL)
- Use parallel queries where possible (Promise.all)
- Limit recent activity arrays to 10 items max

**Required Database Indexes** (Migration):
```sql
-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_order_vendor_created ON "Order"(vendorId, createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_order_vendor_status ON "Order"(vendorId, status);
CREATE INDEX IF NOT EXISTS idx_order_vendor_status_created ON "Order"(vendorId, status, createdAt DESC);

-- Credit usage indexes
CREATE INDEX IF NOT EXISTS idx_creditusage_vendor_date ON "CreditUsage"(vendorId, usageDate DESC);
CREATE INDEX IF NOT EXISTS idx_creditusage_vendor_type ON "CreditUsage"(vendorId, conversationType);

-- Conversation indexes
CREATE INDEX IF NOT EXISTS idx_conversation_vendor_updated ON "Conversation"(vendorId, updatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_vendor_status ON "Conversation"(vendorId, status);
CREATE INDEX IF NOT EXISTS idx_conversation_vendor_created ON "Conversation"(vendorId, createdAt DESC);

-- Product indexes
CREATE INDEX IF NOT EXISTS idx_product_vendor_active ON "Product"(vendorId, isActive);
CREATE INDEX IF NOT EXISTS idx_product_vendor_stock ON "Product"(vendorId, inStock);

-- Message indexes (for response time calculations)
CREATE INDEX IF NOT EXISTS idx_message_conversation_timestamp ON "Message"(conversationId, timestamp DESC);
```

**Caching Strategy:**
```typescript
// Multi-tier caching strategy:

// 1. Short-term cache (5 seconds) - Request deduplication
// Prevents duplicate queries from rapid successive requests
const shortCacheKey = `dashboard:stats:${vendorId}:shortcache`; // 5-second TTL
// Returns immediately if request made within last 5 seconds

// 2. Real-time cache (30 seconds) - Standard refresh interval
const realtimeCacheKey = `dashboard:stats:${vendorId}:realtime`; // 30-second TTL
// Used for normal polling refresh

// 3. Daily cache (for historical/aggregated data)
const cacheKey = `dashboard:stats:${vendorId}:${date}`; // Daily cache
// For less frequently changing metrics

// Cache lookup order:
// 1. Check short-term cache (5s) → return if exists
// 2. Check real-time cache (30s) → return if exists
// 3. Query database → store in both caches

// Cache invalidation triggers:
// - On order creation/update
// - On credit usage
// - On conversation update
// - On product update
// - Invalidate both short-term and real-time caches on data changes
```

**Short-term Cache Implementation Example:**
```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

async function getDashboardStats(vendorId: string, dateRange: DateRange): Promise<DashboardStats> {
  // Include date range in cache keys to prevent mixing different date ranges
  const dateRangeKey = `${dateRange.preset}:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}`;
  const shortCacheKey = `dashboard:stats:${vendorId}:${dateRangeKey}:shortcache`;
  const realtimeCacheKey = `dashboard:stats:${vendorId}:${dateRangeKey}:realtime`;
  
  // 1. Check short-term cache (5 seconds) - return immediately if exists
  const shortCache = await redis.get(shortCacheKey);
  if (shortCache) {
    return JSON.parse(shortCache);
  }
  
  // 2. Check real-time cache (30 seconds)
  const realtimeCache = await redis.get(realtimeCacheKey);
  if (realtimeCache) {
    // Also populate short-term cache for next 5 seconds
    await redis.setex(shortCacheKey, 5, realtimeCache);
    return JSON.parse(realtimeCache);
  }
  
  // 3. Query database with date range
  const stats = await fetchDashboardStatsFromDB(vendorId, dateRange);
  
  // 4. Store in both caches
  const statsJson = JSON.stringify(stats);
  await Promise.all([
    redis.setex(shortCacheKey, 5, statsJson),      // 5-second cache
    redis.setex(realtimeCacheKey, 30, statsJson)  // 30-second cache
  ]);
  
  return stats;
}
```

**Request Validation:**
```typescript
import { z } from 'zod';

const DashboardStatsParamsSchema = z.object({
  id: z.string().uuid('Invalid vendor ID format')
});

const DashboardStatsQuerySchema = z.object({
  dateRange: z.enum(['thisWeek', 'thisMonth', 'last3Months', 'last6Months', 'thisFinancialYear', 'custom']).optional().default('thisMonth'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD').optional()
}).refine((data) => {
  // If custom, both startDate and endDate are required
  if (data.dateRange === 'custom') {
    return data.startDate !== undefined && data.endDate !== undefined;
  }
  return true;
}, {
  message: 'startDate and endDate are required when dateRange is custom'
}).refine((data) => {
  // Validate date range doesn't exceed 1 year
  if (data.startDate && data.endDate) {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const maxEnd = new Date(start);
    maxEnd.setFullYear(maxEnd.getFullYear() + 1);
    return end <= maxEnd;
  }
  return true;
}, {
  message: 'Date range cannot exceed 1 year'
});

// Validate before processing
const validatedParams = DashboardStatsParamsSchema.parse(req.params);
const validatedQuery = DashboardStatsQuerySchema.parse(req.query);
```

---

### **2. Frontend Implementation**

#### **2.1 Dashboard Component Structure**

**File:** `frontend_v2/apps/web-vendor/src/pages/Dashboard.tsx`

**Component Hierarchy:**
```
Dashboard
├── DashboardHeader (title, last updated time, DateRangeFilter)
├── DashboardStatsGrid (4 main cards)
│   ├── OrdersCard (filtered by date range)
│   ├── RevenueCard (filtered by date range)
│   ├── CreditsCard
│   └── ProductsCard
├── ConversationInsightsSection
│   ├── ConversationMetricsGrid
│   ├── RecentConversationsWidget
│   └── ConversationActivityChart
├── CreditsDetailsSection
│   ├── CreditsStatusCard
│   ├── CreditsBreakdownChart
│   └── CreditsUsageTrendChart (filtered by date range)
├── RecentOrdersWidget
├── OrderStatusChart
└── QuickActionsPanel
```

#### **2.2 State Management**

**Hook:** `useDashboardStats`

**Location:** `frontend_v2/apps/web-vendor/src/hooks/dashboard/useDashboardStats.ts`

**Implementation:**
```typescript
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../../lib/api';
import { useAuth } from '@chatlogix/auth';
import type { DashboardStats } from '../../types/dashboard';

export type DateRangePreset = 'thisWeek' | 'thisMonth' | 'last3Months' | 'last6Months' | 'thisFinancialYear' | 'custom';

export function useDashboardStats() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Get date range from URL params or default to 'thisMonth'
  const dateRangePreset = (searchParams.get('dateRange') as DateRangePreset) || 'thisMonth';
  const startDate = searchParams.get('startDate') || undefined;
  const endDate = searchParams.get('endDate') || undefined;
  
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let abortController: AbortController | null = null;
    let intervalId: NodeJS.Timeout | null = null;

    const fetchStats = async () => {
      if (!user?.vendorId) {
        setIsLoading(false);
        return;
      }

      // Cancel previous request if still pending
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      try {
        setIsLoading(true);
        setError(null);
        
        // Build query params
        const params = new URLSearchParams({ dateRange: dateRangePreset });
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        
        const data = await apiClient.get<DashboardStats>(
          `/vendors/${user.vendorId}/dashboard-stats?${params.toString()}`,
          { signal: abortController.signal }
        );
        
        setStats(data);
        setLastUpdated(new Date());
      } catch (err) {
        // Don't set error if request was aborted
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        
        setError(err instanceof Error ? err.message : 'Failed to load dashboard stats');
        console.error('Dashboard stats error:', err);
        
        // Keep previous stats on error (show stale data with refresh indicator)
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchStats();
    
    // Refresh every 30 seconds
    intervalId = setInterval(fetchStats, 30000);
    
    // Cleanup
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (abortController) abortController.abort();
    };
  }, [user?.vendorId, dateRangePreset, startDate, endDate]);

  const refetch = useCallback(async () => {
    if (!user?.vendorId) return;
    
    let abortController: AbortController | null = null;
    try {
      abortController = new AbortController();
      setIsLoading(true);
      setError(null);
      
      const params = new URLSearchParams({ dateRange: dateRangePreset });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      
      const data = await apiClient.get<DashboardStats>(
        `/vendors/${user.vendorId}/dashboard-stats?${params.toString()}`,
        { signal: abortController.signal }
      );
      
      setStats(data);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.vendorId, dateRangePreset, startDate, endDate]);

  const setDateRange = useCallback((preset: DateRangePreset, customStart?: string, customEnd?: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('dateRange', preset);
    
    if (preset === 'custom' && customStart && customEnd) {
      newParams.set('startDate', customStart);
      newParams.set('endDate', customEnd);
    } else {
      newParams.delete('startDate');
      newParams.delete('endDate');
    }
    
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  return { 
    stats, 
    isLoading, 
    error, 
    lastUpdated,
    refetch,
    dateRangePreset,
    startDate,
    endDate,
    setDateRange
  };
}
```

#### **2.3 Date Filter Component**

**Component:** `DateRangeFilter`

**Location:** `frontend_v2/apps/web-vendor/src/components/dashboard/DateRangeFilter.tsx`

**Implementation:**
```typescript
import { Select, Button } from '@chatlogix/ui';
import { CalendarIcon } from '@heroicons/react/24/outline';
import type { DateRangePreset } from '../../hooks/dashboard/useDashboardStats';

interface DateRangeFilterProps {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
  onDateRangeChange: (preset: DateRangePreset, startDate?: string, endDate?: string) => void;
  dateRangeLabel?: string;
}

export function DateRangeFilter({
  preset,
  startDate,
  endDate,
  onDateRangeChange,
  dateRangeLabel
}: DateRangeFilterProps) {
  const presets: Array<{ value: DateRangePreset; label: string }> = [
    { value: 'thisWeek', label: 'This Week' },
    { value: 'thisMonth', label: 'This Month' },
    { value: 'last3Months', label: 'Last 3 Months' },
    { value: 'last6Months', label: 'Last 6 Months' },
    { value: 'thisFinancialYear', label: 'This Financial Year' },
    { value: 'custom', label: 'Custom Range' }
  ];

  return (
    <div className="flex items-center gap-2">
      <Select
        value={preset}
        onChange={(e) => {
          const newPreset = e.target.value as DateRangePreset;
          if (newPreset === 'custom') {
            // Open custom date picker modal
            // For now, keep existing dates if set
            onDateRangeChange(newPreset, startDate, endDate);
          } else {
            onDateRangeChange(newPreset);
          }
        }}
        className="min-w-[180px]"
      >
        {presets.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      
      {dateRangeLabel && (
        <span className="text-sm text-gray-600">
          {dateRangeLabel}
        </span>
      )}
      
      {preset === 'custom' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // Open custom date range picker modal
            // Implementation would use a date picker library
          }}
        >
          <CalendarIcon className="w-4 h-4 mr-1" />
          Select Dates
        </Button>
      )}
    </div>
  );
}
```

#### **2.3 Component Implementations**

**Enhanced Stat Card:**
```typescript
// frontend_v2/apps/web-vendor/src/components/dashboard/DashboardStatCard.tsx
interface DashboardStatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | null;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export function DashboardStatCard({
  label,
  value,
  subValue,
  trend,
  icon,
  onClick
}: DashboardStatCardProps) {
  return (
    <Card className={onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-gray-500 mb-1">{label}</h3>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
          {subValue && (
            <p className="text-sm text-gray-600 mt-1">{subValue}</p>
          )}
          {trend && (
            <div className={`flex items-center mt-2 text-sm ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
              {trend === 'up' ? <ArrowUpIcon /> : <ArrowDownIcon />}
              <span className="ml-1">vs yesterday</span>
            </div>
          )}
        </div>
        {icon && <div className="text-gray-400">{icon}</div>}
      </div>
    </Card>
  );
}
```

**Credits Card with Progress:**
```typescript
// frontend_v2/apps/web-vendor/src/components/dashboard/CreditsCard.tsx
import { formatCurrency } from '../../utils/currency';

interface CreditsCardProps {
  planCredits: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  walletBalance: number; // in paise
  planName: string;
  lowBalanceWarning: boolean;
  billingCycleEnd?: string;
}

export function CreditsCard({
  planCredits,
  usedThisMonth,
  remainingThisMonth,
  walletBalance,
  planName,
  lowBalanceWarning,
  billingCycleEnd
}: CreditsCardProps) {
  const usagePercentage = planCredits > 0 ? (usedThisMonth / planCredits) * 100 : 0;
  const progressColor = usagePercentage < 50 ? 'bg-green-500' : 
                       usagePercentage < 80 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <Card>
      <h3 className="text-sm font-medium text-gray-500 mb-2">Credits</h3>
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-3xl font-bold text-gray-900">{remainingThisMonth}</span>
          <span className="text-sm text-gray-500">of {planCredits}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${progressColor}`}
            style={{ width: `${Math.min(usagePercentage, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {usedThisMonth} used ({usagePercentage.toFixed(1)}%) • {planName} Plan
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Wallet: {formatCurrency(walletBalance)} • Resets {billingCycleEnd ? new Date(billingCycleEnd).toLocaleDateString() : 'monthly'}
        </p>
      </div>
      {lowBalanceWarning && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
          <p className="text-sm text-yellow-800">
            ⚠️ Low wallet balance: Recharge now to avoid service interruption for extra usage
          </p>
        </div>
      )}
    </Card>
  );
}
```

---

## 🎨 UI/UX Specifications

### **1. Layout Structure**

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard Header                                           │
│  "Dashboard" | [Date Filter: This Month ▼] | Last updated: 2s│
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  TOP METRICS (4 Cards - Grid Layout)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Orders    │ │ Revenue   │ │ Credits  │ │ Products  │   │
│  │ 150       │ │ ₹45,000   │ │ 450/500  │ │ 25        │   │
│  │ Today: 12 │ │ Today: ₹2K│ │ 90% used │ │ Active: 20│   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  CONVERSATION INSIGHTS                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│  │ Total Convs  │ │ Active Convs │ │ Conv Rate    │     │
│  │    150       │ │     12       │ │   45%        │     │
│  └──────────────┘ └──────────────┘ └──────────────┘     │
│                                                             │
│  Recent Conversations:                                      │
│  • Customer A - "Need 2kg rice" - 5 min ago               │
│  • Customer B - "Order ready?" - 15 min ago               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  AI CREDITS DETAILS                                        │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Credits Remaining: 450 / 500 (90% used)            │   │
│  │ [Progress Bar: ████████████████████░░░░]            │   │
│  │                                                     │   │
│  │ Breakdown:                                         │   │
│  │ • Text: 380 credits                                │   │
│  │ • Audio: 50 credits                                │   │
│  │ • Image: 20 credits                                │   │
│  │                                                     │   │
│  │ Usage This Month: 450 credits                      │   │
│  │ Projected Monthly: ~500 credits                    │   │
│  └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  RECENT ORDERS & QUICK ACTIONS                             │
│  ┌──────────────────────┐ ┌──────────────────────┐       │
│  │ Recent Orders        │ │ Quick Actions        │       │
│  │ • Order #1234 - ₹500 │ │ [Add Product]        │       │
│  │ • Order #1233 - ₹300 │ │ [View Orders]         │       │
│  └──────────────────────┘ └──────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### **2. Design System**

**Colors:**
- Primary: Blue (#3B82F6)
- Success: Green (#10B981)
- Warning: Yellow (#F59E0B)
- Danger: Red (#EF4444)
- Neutral: Gray scale

**Typography:**
- Headings: Inter, Bold
- Body: Inter, Regular
- Numbers: Inter, Bold (for metrics)

**Spacing:**
- Card padding: 1.5rem (24px)
- Card gap: 1.5rem (24px)
- Section margin: 2rem (32px)

**Responsive Breakpoints:**
- Mobile: < 768px (1 column)
- Tablet: 768px - 1024px (2 columns)
- Desktop: > 1024px (4 columns)

### **3. Loading States**

**Skeleton Loaders:**
- Show animated placeholders while loading
- Match actual content layout
- Use shimmer effect
- Progressive loading: Show data as it becomes available (orders first, then conversations)

**Error States:**
- Display error message clearly with actionable guidance
- Provide retry button with exponential backoff
- Show partial/stale data if available with refresh indicator
- Error boundaries for component isolation
- Network error vs server error distinction

**Empty States:**
- No orders: "No orders yet" with CTA to view products
- No conversations: "Start your first conversation" with onboarding link
- No products: "Add your first product" with link to catalog
- No data: Friendly message with relevant CTAs

**Data Freshness Indicators:**
- Show "Last updated: X seconds ago" in header
- Visual indicator when data is stale (> 60 seconds)
- Manual refresh button with loading state

---

## 📅 Implementation Phases

### **Phase 1: Backend API (Week 1)**

#### **Day 1-2: Database Queries & Utilities**
- [ ] Create plan credits mapping utility (`planUtils.ts`)
- [ ] Create currency formatting utility (`currency.ts`)
- [ ] Create date range utility (`dateRange.ts`) with preset calculations
- [ ] Implement financial year calculation (Indian FY: April-March)
- [ ] Implement optimized order statistics queries (parallel) with date filtering
- [ ] Implement credit usage queries with billing cycle logic and date filtering
- [ ] Implement conversation statistics queries (optimized)
- [ ] Implement product statistics queries
- [ ] Add database indexes migration
- [ ] Write unit tests for utilities (including date range calculations)

#### **Day 3-4: API Endpoint**
- [ ] Create `/api/vendors/:id/dashboard-stats` endpoint
- [ ] Add date range query parameter parsing and validation
- [ ] Implement data aggregation logic with parallel queries (filtered by date range)
- [ ] Apply date filters to Orders, Revenue, and Credits Usage Trends queries
- [ ] Add date range metadata to response (startDate, endDate, label)
- [ ] Add comprehensive error handling (try-catch, error boundaries)
- [ ] Add request validation (Zod schemas) including date range validation
- [ ] Add response validation
- [ ] Implement rate limiting (60 req/min per vendor)
- [ ] Implement short-term cache (5-second TTL) with date range in cache keys
- [ ] Add request/response logging
- [ ] Write unit tests (including date range edge cases)
- [ ] Write integration tests

#### **Day 5: Optimization**
- [ ] Add Redis caching (multi-tier: 5-second short-term + 30-second real-time)
- [ ] Optimize database queries
- [ ] Add response compression
- [ ] Performance testing

**Deliverables:**
- ✅ Working API endpoint
- ✅ Comprehensive test coverage
- ✅ Performance benchmarks

---

### **Phase 2: Frontend Core (Week 2)**

#### **Day 1-2: Data Fetching**
- [ ] Create `useDashboardStats` hook with proper cleanup
- [ ] Add date range state management (URL query params)
- [ ] Implement API client integration with date range query params
- [ ] Add error handling with retry logic
- [ ] Add loading states (skeleton loaders)
- [ ] Implement auto-refresh (30 seconds) with request cancellation
- [ ] Add data freshness indicators
- [ ] Implement request deduplication
- [ ] Add error boundaries
- [ ] Update hook to refetch when date range changes

#### **Day 3-4: Core Components**
- [ ] Update `Dashboard.tsx` with real data
- [ ] Create `DateRangeFilter` component with preset options
- [ ] Add date filter to dashboard header
- [ ] Implement custom date range picker (for custom preset)
- [ ] Update URL query params when date range changes
- [ ] Enhance `DashboardStatCard` component with trends
- [ ] Update Orders and Revenue cards to show filtered data
- [ ] Create `CreditsCard` component (fixed credit model)
- [ ] Create loading skeleton components
- [ ] Add error boundary with fallback UI
- [ ] Create empty state components
- [ ] Add currency formatting utilities
- [ ] Implement progressive loading

#### **Day 5: Testing & Polish**
- [ ] Test all components
- [ ] Fix responsive issues
- [ ] Add animations/transitions
- [ ] Code review

**Deliverables:**
- ✅ Functional dashboard with real data
- ✅ Loading and error states
- ✅ Responsive design

---

### **Phase 3: Conversation Insights (Week 3)**

#### **Day 1-2: Conversation Metrics**
- [ ] Create conversation metrics cards
- [ ] Implement conversion rate calculation
- [ ] Add conversation activity widget
- [ ] Create recent conversations list

#### **Day 3-4: Conversation Widgets**
- [ ] Build recent conversations component
- [ ] Add navigation to conversation detail
- [ ] Implement conversation badges
- [ ] Add activity indicators

#### **Day 5: Testing**
- [ ] Test conversation insights
- [ ] Verify data accuracy
- [ ] Performance testing

**Deliverables:**
- ✅ Conversation insights section
- ✅ Recent conversations widget
- ✅ Activity indicators

---

### **Phase 4: Credits Details (Week 4)**

#### **Day 1-2: Credits Breakdown**
- [ ] Create credits breakdown chart
- [ ] Implement credits by type display (filtered by date range)
- [ ] Add usage trends calculation (filtered by date range)
- [ ] Create projected usage feature (based on selected period)
- [ ] Update credits usage trend chart to respect date filter

#### **Day 3-4: Credits Visualization**
- [ ] Build credits usage trend chart (with billing cycle context)
- [ ] Add progress bars (plan credits vs wallet balance distinction)
- [ ] Implement low balance warnings (wallet balance < ₹100)
- [ ] Create recharge CTA
- [ ] Add projected usage calculation (linear regression)
- [ ] Show billing cycle dates

#### **Day 5: Testing & Documentation**
- [ ] Test all credits features
- [ ] Verify calculations
- [ ] Update documentation
- [ ] Code review

**Deliverables:**
- ✅ Credits details section
- ✅ Usage breakdown charts
- ✅ Low balance warnings

---

### **Phase 5: Additional Widgets (Week 5)**

#### **Day 1-2: Recent Orders Widget**
- [ ] Create recent orders component
- [ ] Add order status badges
- [ ] Implement navigation to order details
- [ ] Add time formatting

#### **Day 3-4: Charts & Visualizations**
- [ ] Integrate chart library (Recharts/Chart.js)
- [ ] Create order status pie chart
- [ ] Create revenue trend chart
- [ ] Add chart tooltips

#### **Day 5: Quick Actions**
- [ ] Create quick actions panel
- [ ] Add navigation links
- [ ] Implement conditional actions
- [ ] Add icons

**Deliverables:**
- ✅ Recent orders widget
- ✅ Order status chart
- ✅ Quick actions panel

---

### **Phase 6: Polish & Production (Week 6)**

#### **Day 1-2: Performance Optimization**
- [ ] Optimize API calls
- [ ] Implement request debouncing
- [ ] Add memoization
- [ ] Performance profiling

#### **Day 3-4: UX Enhancements**
- [ ] Add smooth animations
- [ ] Improve loading states
- [ ] Enhance error messages
- [ ] Add empty states

#### **Day 5: Final Testing**
- [ ] End-to-end testing
- [ ] Cross-browser testing
- [ ] Mobile responsiveness testing
- [ ] Accessibility audit

**Deliverables:**
- ✅ Production-ready dashboard
- ✅ Comprehensive testing
- ✅ Performance optimized

---

## 🧪 Testing Requirements

### **1. Unit Tests**

**Backend:**
- [ ] Dashboard stats aggregation logic
- [ ] Credit calculations (plan credits vs wallet balance)
- [ ] Date range queries (billing cycle handling)
- [ ] Error handling (all error paths)
- [ ] Plan utilities (getPlanCredits, billing cycle dates)
- [ ] Currency utilities (formatCurrency, paiseToRupees)
- [ ] Request validation (Zod schemas)
- [ ] Response validation

**Frontend:**
- [ ] Component rendering (all states: loading, error, empty, success)
- [ ] Hook logic (useDashboardStats with cleanup)
- [ ] Data transformations (currency, dates, trends)
- [ ] Error states (network, server, validation)
- [ ] Loading states (skeleton loaders)
- [ ] Empty states
- [ ] Request cancellation

### **2. Integration Tests**

- [ ] API endpoint integration
- [ ] Database query accuracy
- [ ] Frontend-backend communication
- [ ] Real-time updates

### **3. E2E Tests**

- [ ] Dashboard load flow
- [ ] Data refresh flow
- [ ] Navigation flows
- [ ] Error recovery

### **4. Performance Tests**

- [ ] API response time (< 500ms)
- [ ] Dashboard load time (< 2s)
- [ ] Memory usage
- [ ] Concurrent user load

---

## 🚨 Error Handling & Edge Cases

### **1. API Errors**

**Handling:**
- Display user-friendly error messages
- Provide retry mechanism
- Show partial data if available
- Log errors for debugging

**Scenarios:**
- Network failures
- API timeouts
- Invalid vendor ID
- Database errors

### **2. Data Edge Cases**

**Empty States:**
- No orders: Show "No orders yet" message with link to products catalog
- No conversations: Show "Start your first conversation" with onboarding guide
- No products: Show "Add your first product" CTA with link to catalog
- First-time vendor: Show welcome message with quick start guide

**Zero Values:**
- Handle division by zero in calculations (use conditional checks)
- Display "0" appropriately (not "NaN" or "undefined")
- Show "N/A" for metrics that can't be calculated
- Example: `conversionRate = totalConversations > 0 ? (withOrders / totalConversations) * 100 : 0`

**Missing Data:**
- Handle null/undefined gracefully with default values
- Provide sensible defaults (0 for counts, empty array for lists)
- Show loading states appropriately
- Validate data shape with Zod schemas

**Trend Calculations:**
- Handle first-time vendors (no previous data)
- Show "N/A" or "—" when trend can't be calculated
- Use at least 2 data points for meaningful trends

### **3. Performance Edge Cases**

**Large Datasets:**
- Limit recent activity arrays to 10 items max
- Paginate where necessary (conversations, orders)
- Use virtual scrolling for long lists
- Implement lazy loading for charts/visualizations

**Slow Network:**
- Show loading indicators with progress feedback
- Implement request cancellation (AbortController)
- Cache previous data and show stale data indicator
- Timeout after 10 seconds, show retry option
- Progressive enhancement: Show critical data first

**Request Deduplication:**
- Prevent multiple simultaneous requests for same data
- Use request queuing or debouncing
- Cancel in-flight requests on component unmount

---

## 📊 Performance Requirements

### **1. API Performance**

- **Response Time:** < 500ms (p95)
- **Database Queries:** < 200ms each
- **Caching:** 30-second TTL for stats
- **Concurrent Requests:** Support 100+ vendors

### **2. Frontend Performance**

- **Initial Load:** < 2 seconds
- **Time to Interactive:** < 3 seconds
- **Bundle Size:** < 200KB (gzipped)
- **Re-renders:** Minimize unnecessary re-renders

### **3. Optimization Strategies**

- **Database:** Add indexes, use efficient queries
- **Caching:** Redis for frequently accessed data
- **Frontend:** Code splitting, lazy loading
- **API:** Response compression, parallel queries

---

## 🔒 Security Considerations

### **1. Authorization**

- Verify vendor can only access their own data
- Validate vendor ID in all queries (never trust client input)
- Prevent data leakage between vendors
- Use middleware: `requireVendorAccess((req) => req.params.id)`
- Admin access: Explicit check for admin role before allowing cross-vendor access
- Log all authorization failures for security monitoring

### **2. Data Validation**

- Validate all input parameters with Zod schemas
- Sanitize output data (remove sensitive fields)
- Prevent SQL injection (use Prisma parameterized queries)
- Rate limit API endpoints (60 req/min per vendor)
- Validate vendor ID format (UUID)
- Response validation: Ensure response matches expected schema
- Input sanitization: Trim strings, validate types

### **3. Privacy**

- Don't expose sensitive customer data
- Mask phone numbers appropriately
- Follow data privacy regulations

---

## 📝 Documentation Requirements

### **1. API Documentation**

- [ ] OpenAPI/Swagger specification (with Zod schema generation)
- [ ] Request/response examples (all scenarios)
- [ ] Error code documentation (all error types)
- [ ] Rate limiting documentation
- [ ] Authentication/authorization flow
- [ ] Billing cycle explanation
- [ ] Credit vs wallet balance clarification

### **2. Component Documentation**

- [ ] Component props documentation
- [ ] Usage examples
- [ ] Storybook stories (if applicable)

### **3. User Documentation**

- [ ] Dashboard user guide
- [ ] Metric explanations
- [ ] Troubleshooting guide

---

## ✅ Acceptance Criteria

### **Must Have:**
- ✅ Dashboard displays real-time data
- ✅ All 4 core metrics show accurate values
- ✅ Date filter functionality for Orders, Revenue, and Credits Usage Trends
- ✅ Date filter presets: This Week, This Month, Last 3 Months, Last 6 Months, This Financial Year, Custom Range
- ✅ Date filter state persisted in URL query params
- ✅ Conversation insights section functional
- ✅ Credits details with breakdown
- ✅ Loading and error states work correctly
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Performance meets requirements

### **Nice to Have:**
- ⭐ Real-time updates via WebSocket
- ⭐ Export dashboard data to PDF/CSV
- ⭐ Customizable dashboard layout
- ⭐ Dark mode support
- ⭐ Advanced filtering options

---

## 🚀 Deployment Checklist

### **Pre-Deployment:**
- [ ] All tests passing
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Performance benchmarks met
- [ ] Security audit passed

### **Deployment:**
- [ ] Deploy backend API
- [ ] Deploy frontend changes
- [ ] Verify database migrations
- [ ] Test in staging environment
- [ ] Monitor error rates

### **Post-Deployment:**
- [ ] Monitor dashboard performance
- [ ] Check error logs
- [ ] Gather user feedback
- [ ] Track metrics accuracy
- [ ] Plan improvements

---

## 📚 References

### **Related Documents:**
- [Vendor Pricing Calculation Requirements](../../requirements/business/vendor_pricing_calculation_requirements.md)
- [Implementation Roadmap](../../requirements/implementation/README.md)
- [Technical Requirements](../../requirements/technical/README.md)

### **API References:**
- [Orders API](../../backend/src/routes/orders.ts)
- [Vendors API](../../backend/src/routes/vendors.ts)
- [Products API](../../backend/src/routes/products.ts)

### **Component References:**
- [Dashboard Component](../../frontend_v2/apps/web-vendor/src/pages/Dashboard.tsx)
- [Stat Card Component](../../frontend_v2/apps/web-vendor/src/components/dashboard/DashboardStatCard.tsx)

---

## 🎯 Success Metrics

### **Technical Metrics:**
- Dashboard load time < 2 seconds ✅
- API response time < 500ms ✅
- Zero critical bugs ✅
- 95%+ test coverage ✅

### **Business Metrics:**
- 95% vendor satisfaction ✅
- Increased vendor engagement ✅
- Reduced support tickets ✅
- Improved credit management ✅

---

## 📞 Support & Maintenance

### **Monitoring:**
- Track API response times
- Monitor error rates
- Track dashboard usage
- Monitor performance metrics

### **Maintenance:**
- Weekly performance reviews
- Monthly feature updates
- Quarterly UX improvements
- Continuous bug fixes

---

**Document Status:** ✅ Ready for Implementation (Critical Gaps Fixed)  
**Last Review:** 2025-01-XX  
**Critical Fixes Applied:**
- ✅ Fixed credit system conceptual model (plan credits vs wallet balance)
- ✅ Added plan credit mapping utility
- ✅ Fixed credit usage calculations
- ✅ Added billing cycle date handling
- ✅ Optimized database queries (parallel execution)
- ✅ Added request validation and error handling
- ✅ Fixed authentication/authorization details
- ✅ Added database indexes specification
- ✅ Improved error recovery strategy
- ✅ Added data freshness indicators
- ✅ Fixed API endpoint path to match existing pattern (`/api/vendors/:id/dashboard-stats`)

**Next Steps:** Begin Phase 1 - Backend API Development  
**Estimated Completion:** 6 weeks from start date

**Important Notes:**
- Credits (conversation allowance) are separate from Wallet Balance (₹)
- Credits reset monthly based on billing cycle
- Wallet balance persists and is used for extra usage charges
- All amounts stored in paise (divide by 100 for ₹ display)
- **Date Filters:** Apply only to Orders, Revenue, and Credits Usage Trends sections
- Other sections (Products, Credits Status, Conversations) remain unfiltered as they represent current state
- Date filter default: "This Month"
- Date range maximum: 1 year for custom ranges
- Financial year follows Indian calendar (April 1 - March 31)

---

*This document is a living document and will be updated as implementation progresses.*

