# Vendor Dashboard User Guide

## Overview

The Vendor Dashboard provides a comprehensive view of your business performance, including orders, revenue, products, conversations, and wallet spend.

> **How you're charged:** there is no monthly credit allowance. Each AI action costs what it actually costs to run, plus a fixed percentage. You pay from a prepaid wallet you top up on the **Wallet** page. Details: [Billing and Pricing](../../../../docs/BILLING_AND_PRICING.md).

## Accessing the Dashboard

1. Log in to your vendor account
2. Navigate to the Dashboard from the main menu
3. The dashboard loads automatically with current data

## Dashboard Sections

### Top Metrics Cards

Four key metrics displayed at the top:

1. **Total Orders** - Orders within selected date range
   - Shows today's count and pending orders
   - Click to view all orders

2. **Revenue** - Total revenue within selected date range
   - Shows today's and this month's revenue
   - Click to view orders

3. **Wallet** - Prepaid balance and this cycle's spend
   - Shows your current balance and what you've spent this billing cycle
   - Low balance warning if the balance drops below **₹20**
   - Links to the Wallet page to top up

4. **Products** - Product catalog statistics
   - Shows total, active, and out-of-stock products
   - Click to view catalog

### Conversation Insights

- **Total Conversations** - All conversations
- **Active Conversations** - Open conversations with recent activity
- **Conversion Rate** - Percentage of conversations with orders
- **Recent Conversations Widget** - List of recent conversations
  - Click any conversation to view details
  - Shows customer name, last message, and order status

### Spend Analytics

Two charts showing where your wallet money goes:

1. **Spend Breakdown by Source**
   - Pie chart split by what caused the charge — customer replies, product media sends, catalog import, catalog enhancer, voice transcription, sandbox replies
   - Hover for detailed values

2. **Spend Trend & Projection**
   - Line chart showing daily spend over the last 7 days
   - Shows projected monthly spend
   - No plan-limit line, because there is no plan limit

### Order Status Distribution

- Pie chart showing orders by status
- Color-coded by status type
- Hover for order count and revenue

### Recent Orders

- List of last 10 orders
- Shows order ID, customer name, amount, status, and time
- Click any order to view details

### Quick Actions

Quick access buttons for:
- Add Product
- View Orders
- Top up wallet (highlighted if your balance is low)
- View Conversations

## Date Range Filtering

Use the date range filter to view data for different time periods:

1. **Presets:**
   - This Week
   - This Month (default)
   - Last 3 Months
   - Last 6 Months
   - This Financial Year (April-March)

2. **Custom Range:**
   - Select "Custom Range" from dropdown
   - Click "Select Dates" button
   - Choose start and end dates
   - Maximum range: 1 year

**Note:** Date filtering applies to Orders, Revenue, and the Spend Breakdown. Products, your wallet balance, the spend totals, the 7-day spend trend, and Conversations always show the current state.

## Data Refresh

- Dashboard auto-refreshes every 30 seconds
- Manual refresh button available in header
- "Last updated" timestamp shows data freshness
- Stale data indicator appears if data > 60 seconds old

## Understanding Metrics

### Wallet

- **Wallet Balance**: your prepaid ₹ balance. It carries over and never expires (a *trial* balance does expire)
- **Spent this cycle**: what you've been charged since the start of the current calendar month
- **Projected Monthly Spend**: an estimate from your recent daily spend
- **Low balance warning**: appears under **₹20**. Below the cost of one reply, the AI stops answering customers and sends them a "we'll get back to you" message instead — so top up before you hit zero

**What you're charged for:** each customer reply costs its real AI cost plus a fixed percentage. A reply on the default model works out to roughly **₹0.20**. Voice notes from customers cost more than text, because transcription is priced by how long the recording is. Sending product photos or videos is currently **free**. Catalog import and the AI catalog enhancer are charged per job.

**What you are *not* charged for:** there is no monthly subscription quota, no per-message "credits", and no separate WhatsApp bill — ChatLogix covers WhatsApp's own conversation fees today.

### Orders

- **Total**: Count within selected date range
- **Today**: Always shows today's count (unfiltered)
- **Pending**: Current pending orders (unfiltered)
- **Trend**: Comparison vs previous period

### Revenue

- **Total**: Revenue within selected date range (excludes cancelled)
- **Today**: Today's revenue (unfiltered)
- **Average Order Value**: Total revenue / Order count

### Conversations

- **Total**: All conversations
- **Active**: Open + updated in last 24h
- **Conversion Rate**: (Conversations with Orders / Total) × 100

## Tips

1. **Monitor Spend**: Check the spend breakdown to see which feature is costing you most, and the trend to catch a jump early
2. **Track Orders**: Use date filters to analyze performance over time
3. **Quick Actions**: Use quick actions for common tasks
4. **Recent Activity**: Monitor recent conversations and orders for timely responses

## Troubleshooting

### Data Not Loading

- Check internet connection
- Click refresh button
- Wait for auto-refresh (30 seconds)
- Contact support if issue persists

### Incorrect Data

- Verify date range selection
- Check if filters are applied correctly
- Refresh dashboard
- Contact support with details

### Performance Issues

- Charts load lazily - wait a moment
- Reduce date range if loading slowly
- Check browser console for errors

## Keyboard Navigation

- **Tab**: Navigate between interactive elements
- **Enter/Space**: Activate buttons and clickable cards
- **Arrow Keys**: Navigate within lists (where applicable)

## Mobile Usage

Dashboard is fully responsive:
- Single column layout on mobile
- Touch-friendly buttons
- Scrollable sections
- Optimized for small screens

## Support

For questions or issues:
- Check this guide first
- Review component documentation
- Contact support with specific details

