# Vendor Dashboard API Documentation

## Overview

The Vendor Dashboard API provides comprehensive business metrics, conversation insights, wallet spend, and order analytics with date filtering capabilities.

> **Updated 2026-09-16.** The old `credits` block (plan quota, per-message-type credit weights) was replaced by a `billing` block denominated in **millirupees**. See [BILLING_AND_PRICING.md](../../../../docs/BILLING_AND_PRICING.md).

## Endpoint

### GET /api/vendors/:id/dashboard-stats

Get comprehensive dashboard statistics for a vendor.

#### Authentication

- **Required**: Yes
- **Method**: JWT token in `Authorization` header
- **Middleware**: `requireVendorAccess`

#### Authorization

- Vendor can only access their own stats (`req.user.vendorId === req.params.id`)
- Admin can access any vendor's stats

#### Rate Limiting

- **Limit**: 60 requests per minute per vendor
- **Middleware**: `dashboardStatsRateLimit`

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `dateRange` | string | No | `thisMonth` | Preset date range: `thisWeek`, `thisMonth`, `last3Months`, `last6Months`, `thisFinancialYear`, `custom` |
| `startDate` | string (YYYY-MM-DD) | Yes (if `dateRange=custom`) | - | Start date for custom range |
| `endDate` | string (YYYY-MM-DD) | Yes (if `dateRange=custom`) | - | End date for custom range |

#### Response Structure

```typescript
interface DashboardStats {
  dateRange: {
    preset: DateRangePreset;
    startDate: string; // ISO date string (YYYY-MM-DD)
    endDate: string; // ISO date string (YYYY-MM-DD)
    label: string; // Human-readable label
  };
  orders: {
    total: number;
    today: number;
    pending: number;
    thisMonth: number;
    statusBreakdown: Array<{
      status: string;
      count: number;
      revenue: number; // in paise
    }>;
    trend?: {
      direction: 'up' | 'down' | 'neutral';
      percentage: number;
    };
  };
  revenue: {
    total: number; // in paise
    today: number; // in paise
    thisMonth: number; // in paise
    averageOrderValue: number; // in paise
    trend?: {
      direction: 'up' | 'down' | 'neutral';
      percentage: number;
    };
  };
  // Wallet spend. Every amount here is in MILLIRUPEES (1 rupee = 1000),
  // a different unit from the paise used above for orders and revenue.
  billing: {
    balanceMilli: number;
    spend: {
      today: number;
      thisWeek: number;  // trailing 7 days
      thisMonth: number; // current billing cycle
      total: number;     // all time
    };
    breakdownBySource: Array<{
      source: string; // e.g. 'conversation_turn', 'catalog_import'
      label: string;  // vendor-facing name
      milli: number;
      count?: number;
    }>;
    dailySpend: Array<{
      date: string; // YYYY-MM-DD, trailing 7 days, backfilled with zeros
      milli: number;
    }>;
    averagePerDayMilli: number;
    projectedMonthlySpendMilli: number; // linear regression over dailySpend
    lowBalanceWarning: boolean;         // balanceMilli < 20000 (₹20)
    billingCycleStart: string;          // ISO
    billingCycleEnd: string;            // ISO
  };
  products: {
    total: number;
    active: number;
    outOfStock: number;
  };
  conversations: {
    total: number;
    active: number;
    today: number;
    withOrders: number;
    aiPaused: number;
    conversionRate: number;
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
  recentOrders: Array<{
    id: string;
    customerName: string;
    totalAmount: number; // in paise
    status: string;
    createdAt: string; // ISO date string
  }>;
}
```

#### Example Request

```bash
GET /api/vendors/123e4567-e89b-12d3-a456-426614174000/dashboard-stats?dateRange=thisMonth
Authorization: Bearer <jwt_token>
```

#### Example Response

```json
{
  "dateRange": {
    "preset": "thisMonth",
    "startDate": "2024-12-01",
    "endDate": "2024-12-31",
    "label": "Dec 1 - Dec 31, 2024"
  },
  "orders": {
    "total": 150,
    "today": 5,
    "pending": 12,
    "thisMonth": 150,
    "statusBreakdown": [
      {
        "status": "delivered",
        "count": 120,
        "revenue": 1200000
      },
      {
        "status": "pending",
        "count": 12,
        "revenue": 120000
      }
    ],
    "trend": {
      "direction": "up",
      "percentage": 15.5
    }
  },
  "billing": {
    "balanceMilli": 42350,
    "spend": {
      "today": 1240,
      "thisWeek": 8430,
      "thisMonth": 31200,
      "total": 96500
    },
    "breakdownBySource": [
      { "source": "conversation_turn", "label": "Customer replies", "milli": 24100, "count": 118 },
      { "source": "catalog_import", "label": "Catalog import", "milli": 5200, "count": 2 },
      { "source": "catalog_enhance", "label": "Catalog enhancer", "milli": 1900, "count": 7 }
    ],
    "dailySpend": [
      { "date": "2026-09-10", "milli": 900 },
      { "date": "2026-09-11", "milli": 1310 }
    ],
    "averagePerDayMilli": 1204,
    "projectedMonthlySpendMilli": 36120,
    "lowBalanceWarning": false,
    "billingCycleStart": "2026-09-01T00:00:00.000Z",
    "billingCycleEnd": "2026-09-30T23:59:59.999Z"
  }
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "error": "Unauthorized"
}
```

**403 Forbidden**
```json
{
  "error": "Access denied"
}
```

**404 Not Found**
```json
{
  "error": "Vendor not found"
}
```

**429 Too Many Requests**
```json
{
  "error": "Rate limit exceeded"
}
```

**500 Internal Server Error**
```json
{
  "error": "Internal server error"
}
```

## Caching

The endpoint uses multi-tier caching:

- **Short-term cache**: 5 seconds (request deduplication)
- **Real-time cache**: 30 seconds (normal refresh)
- **Cache keys**: Include date range to prevent mixing different ranges

## Date Range Filtering

Date range filtering applies to:
- Orders (count and breakdown)
- Revenue (total and breakdown)
- `billing.breakdownBySource`

Date range filtering does NOT apply to:
- Products (current state)
- `billing.balanceMilli`, `billing.spend.*`, `billing.dailySpend` (fixed windows: today, trailing 7 days, billing cycle, all time)
- Conversations (current state)

## Notes

- **Two money units.** Order and revenue amounts are **paise** (divide by 100 for ₹ display). Everything under `billing` is **millirupees** (divide by 1000). See [BILLING_AND_PRICING.md](../../../../docs/BILLING_AND_PRICING.md) §1
- There is **no** `credits` block, no `planCredits` / `remainingThisMonth` / `usagePercentage` / `planName`, and no per-message-type credit breakdown — the monthly plan quota and flat credit weights were removed in the 2026-09-16 billing rework
- `billing.spend.*` and `breakdownBySource` come from `CreditUsage.chargedMilli` grouped by `source`; wallet top-ups are excluded
- Financial year follows Indian calendar (April 1 - March 31)
- Custom date ranges are limited to maximum 1 year

