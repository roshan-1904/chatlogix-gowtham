/**
 * Spend Breakdown Chart Component
 * Shows what the wallet was spent on, in rupees, as a pie chart
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { DashboardStats } from '../../types/dashboard';
import { MILLI_PER_RUPEE, formatWalletAmount } from '../../utils/currency';

interface SpendBreakdownChartProps {
  breakdownBySource: DashboardStats['billing']['breakdownBySource'];
}

const COLORS = ['#072349', '#25D366', '#f59e0b', '#3b82f6', '#a855f7', '#ef4444'];

export function SpendBreakdownChart({ breakdownBySource }: SpendBreakdownChartProps) {
  const data = breakdownBySource
    .filter((item) => item.milli > 0)
    .map((item) => ({
      name: item.label || item.source,
      // Recharts needs a plain number; rupees keep the legend readable.
      value: item.milli / MILLI_PER_RUPEE,
      milli: item.milli
    }));

  const totalMilli = data.reduce((sum, item) => sum + item.milli, 0);

  if (totalMilli === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500">Nothing spent yet in this period</p>
      </div>
    );
  }

  return (
    <div
      className="w-full"
      role="img"
      aria-label={`Spend breakdown showing ${data
        .map((d) => `${d.name}: ${formatWalletAmount(d.milli)}`)
        .join(', ')}`}
    >
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
            outerRadius={80}
            fill="#072349"
            dataKey="value"
            aria-label="Spend breakdown by source"
          >
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number | undefined) => [
              formatWalletAmount((value ?? 0) * MILLI_PER_RUPEE),
              'Spent'
            ]}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem'
            }}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-4 text-center text-sm text-gray-600">
        Total spent: <span className="font-semibold">{formatWalletAmount(totalMilli)}</span>
      </div>
    </div>
  );
}
