# Vendor Dashboard API Documentation

## Overview

The Vendor Dashboard API provides comprehensive business metrics, conversation insights, credit management, and order analytics with date filtering capabilities.

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
  credits: {
    planCredits: number;
    usedThisMonth: number;
    remainingThisMonth: number;
    used: {
      total: number;
      thisMonth: number;
      thisWeek: number;
      today: number;
    };
    walletBalance: number; // in paise
    usagePercentage: number;
    planName: string;
    breakdown: {
      text: number;
      audio: number;
      image: number;
      document: number;
    };
    projectedMonthlyUsage?: number;
    lowBalanceWarning: boolean;
    billingCycleStart?: string; // ISO date
    billingCycleEnd?: string; // ISO date
    usageTrends?: {
      dailyUsage: Array<{
        date: string; // ISO date string
        creditsConsumed: number;
      }>;
      averagePerDay: number;
    };
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
  "credits": {
    "planCredits": 500,
    "usedThisMonth": 350,
    "remainingThisMonth": 150,
    "usagePercentage": 70,
    "planName": "Pro",
    "breakdown": {
      "text": 300,
      "audio": 30,
      "image": 20,
      "document": 0
    }
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
- Credits usage trends

Date range filtering does NOT apply to:
- Products (current state)
- Credits status (current state)
- Conversations (current state)

## Notes

- All amounts are stored/returned in paise (divide by 100 for ₹ display)
- Financial year follows Indian calendar (April 1 - March 31)
- Custom date ranges are limited to maximum 1 year

