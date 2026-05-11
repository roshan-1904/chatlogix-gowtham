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

### CreditsCard

Displays credit usage information with progress bar and wallet balance.

**Props:**
- `planCredits: number` - Monthly plan credit allowance
- `usedThisMonth: number` - Credits used this month
- `remainingThisMonth: number` - Remaining credits
- `walletBalance: number` - Wallet balance in paise
- `planName: string` - Subscription plan name
- `lowBalanceWarning: boolean` - Show low balance warning
- `billingCycleEnd?: string` - Billing cycle end date

**Features:**
- Progress bar with color coding (green/yellow/red)
- Low balance warning tooltip
- Accessible progress indicator

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

### CreditsBreakdownChart

Pie chart showing credit consumption by type (Text, Audio, Image, Document).

**Props:**
- `breakdown: { text: number, audio: number, image: number, document: number }` - Credit breakdown

**Features:**
- Lazy loaded for performance
- Accessible with ARIA labels
- Empty state handling

### CreditsUsageTrendChart

Line chart showing daily credit usage over time with projected monthly usage.

**Props:**
- `usageTrends?: { dailyUsage: Array<{date: string, creditsConsumed: number}>, averagePerDay: number }` - Usage trend data
- `projectedMonthlyUsage?: number` - Projected monthly usage
- `planCredits: number` - Plan credit limit

**Features:**
- Shows projected usage with disclaimer
- Reference lines for plan limit
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
- `credits: DashboardStats['credits']` - Credit information for conditional display

**Actions:**
- Add Product
- View Orders
- Recharge Credits (shown if low balance)
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

