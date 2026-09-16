# Vendor Dashboard Components Documentation

## Overview

This document describes the React components used in the Vendor Dashboard.

## Components

### DashboardStatCard

Displays a single metric with optional trend indicator and sub-values.

**Props:**
- `label: string` - Metric label
- `value: string | number` - Main value to display
- `subValue?: string` - Additional information (e.g., "Today: 5")
- `trend?: 'up' | 'down' | 'neutral' | null` - Trend direction
- `onClick?: () => void` - Optional click handler for navigation

**Features:**
- Keyboard accessible (Enter/Space to activate)
- ARIA labels for screen readers
- Memoized for performance

### WalletBalanceCard

Displays the prepaid wallet balance and this cycle's spend. Replaced `CreditsCard`, which was deleted along with the plan-quota model in the 2026-09-16 billing rework.

**Props:**
- `balanceMilli: number` - Wallet balance in **millirupees** (1 rupee = 1000)
- `spentThisMonthMilli: number` - Spend in the current billing cycle
- `lowBalanceWarning: boolean` - Show low balance warning (set when balance < ₹20)
- `billingCycleEnd?: string` - Billing cycle end date

**Features:**
- Low balance warning
- Links to `/wallet` for top-up

> There is no progress bar against a plan allowance, because **there is no monthly quota** — spend is real cost plus the vendor's markup. See [BILLING_AND_PRICING.md](../../../../docs/BILLING_AND_PRICING.md).

### DateRangeFilter

Date range selector with presets and custom date picker support.

**Props:**
- `preset: DateRangePreset` - Current preset selection
- `startDate?: string` - Custom start date (YYYY-MM-DD)
- `endDate?: string` - Custom end date (YYYY-MM-DD)
- `onDateRangeChange: (preset, startDate?, endDate?) => void` - Change handler
- `dateRangeLabel?: string` - Display label for selected range

**Presets:**
- `thisWeek` - Current week (Monday to today)
- `thisMonth` - Current month
- `last3Months` - Last 3 months
- `last6Months` - Last 6 months
- `thisFinancialYear` - Indian financial year (April-March)
- `custom` - Custom date range

### SpendBreakdownChart

Pie chart showing wallet spend grouped by **charge source** (customer replies, catalog import, catalog enhancer, sandbox, …). Replaced `CreditsBreakdownChart`, which split by message type against the deleted flat credit weights.

**Props:**
- `breakdownBySource: DashboardStats['billing']['breakdownBySource']` — `Array<{ source, label, milli, count? }>`

**Features:**
- Lazy loaded for performance
- Accessible with ARIA labels
- Empty state handling; sources with zero spend are filtered out

### SpendTrendChart

Line chart showing daily wallet spend over the trailing 7 days, with the projected monthly figure. Replaced `CreditsUsageTrendChart`.

**Props:**
- `dailySpend: DashboardStats['billing']['dailySpend']` — `Array<{ date, milli }>`, backfilled so every day has a point
- `averagePerDayMilli: number`
- `projectedMonthlySpendMilli: number` — linear regression over `dailySpend`

**Features:**
- Shows projected spend with disclaimer
- No plan-limit reference line — there is no plan quota
- Lazy loaded for performance

### OrderStatusChart

Pie chart showing order status distribution.

**Props:**
- `statusBreakdown: Array<{status: string, count: number, revenue: number}>` - Order status breakdown

**Features:**
- Color-coded by status
- Shows revenue per status
- Lazy loaded for performance

### RecentConversationsWidget

List of recent conversations with customer information and order status.

**Props:**
- `conversations: Array<{id, customerName?, customerPhone, lastMessage, minutesSinceLastMessage, hasActiveOrder, orderStatus?}>` - Conversation data

**Features:**
- Clickable to navigate to conversation
- Shows order status badges
- Keyboard accessible

### RecentOrdersWidget

List of recent orders with customer and status information.

**Props:**
- `orders: Array<{id, customerName, totalAmount, status, createdAt}>` - Order data

**Features:**
- Clickable to navigate to order details
- Status color coding
- Keyboard accessible

### QuickActionsPanel

Quick action buttons for common tasks.

**Props:**
- `billing: DashboardStats['billing']` - Wallet information for conditional display

**Actions:**
- Add Product
- View Orders
- Top up wallet → `/wallet` (highlighted when `lowBalanceWarning` is set)
- View Conversations

### DashboardSkeleton

Loading skeleton for dashboard content.

**Features:**
- Matches dashboard layout
- Progressive loading support

### DashboardErrorBoundary

Error boundary component for dashboard errors.

**Features:**
- Catches React errors
- Shows fallback UI
- Error logging

### EmptyStates

Empty state components for different sections.

**Components:**
- `EmptyOrders` - No orders message
- `EmptyConversations` - No conversations message

## Performance Optimizations

- **Lazy Loading**: Chart components are lazy loaded
- **Memoization**: Stat cards are memoized
- **Code Splitting**: Charts split into separate chunks
- **Request Deduplication**: Auto-refresh prevents duplicate requests

## Accessibility

All components include:
- ARIA labels and roles
- Keyboard navigation support
- Screen reader compatibility
- Focus indicators
- Semantic HTML

## Usage Example

```tsx
import { Dashboard } from '../pages/Dashboard';

function App() {
  return <Dashboard />;
}
```

