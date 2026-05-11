/**
 * Order Status Chart Component
 * Displays order status distribution as a pie chart
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { DashboardStats } from '../../types/dashboard';
import { formatAmountWithSymbol } from '../../utils/currency';

interface OrderStatusChartProps {
  statusBreakdown: DashboardStats['orders']['statusBreakdown'];
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b', // Orange
  confirmed: '#3b82f6', // Blue
  preparing: '#8b5cf6', // Purple
  ready: '#10b981', // Green
  delivered: '#059669', // Dark Green
  cancelled: '#ef4444', // Red
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function OrderStatusChart({ statusBreakdown }: OrderStatusChartProps) {
  const data = statusBreakdown
    .map((item) => ({
      name: STATUS_LABELS[item.status.toLowerCase()] || item.status,
      value: item.count,
      revenue: item.revenue,
      status: item.status.toLowerCase(),
    }))
    .filter((item) => item.value > 0); // Only show statuses with orders

  const totalOrders = data.reduce((sum, item) => sum + item.value, 0);
  const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);

  if (totalOrders === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500">No orders data available</p>
      </div>
    );
  }

  const chartDescription = `Order status distribution chart showing ${data.map(d => `${d.name}: ${d.value} orders`).join(', ')}`;
  
  return (
    <div className="w-full" role="img" aria-label={chartDescription}>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            aria-label="Order status distribution"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={STATUS_COLORS[entry.status] || `#${Math.floor(Math.random() * 16777215).toString(16)}`}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number | undefined, name?: string, props?: any) => [
              `${value ?? 0} orders (${formatAmountWithSymbol(props?.payload?.revenue ?? 0)})`,
              name ?? 'Orders',
            ]}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-4 text-center text-sm text-gray-600">
        Total Orders: <span className="font-semibold">{totalOrders}</span>
        {' • '}
        Total Revenue: <span className="font-semibold">{formatAmountWithSymbol(totalRevenue)}</span>
      </div>
    </div>
  );
}

