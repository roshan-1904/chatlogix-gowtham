/**
 * Spend Trend Chart Component
 * Daily wallet spend in rupees, with the daily average and a month-end projection
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { DashboardStats } from '../../types/dashboard';
import { MILLI_PER_RUPEE, formatWalletAmount } from '../../utils/currency';

interface SpendTrendChartProps {
  dailySpend: DashboardStats['billing']['dailySpend'];
  averagePerDayMilli: number;
  projectedMonthlySpendMilli: number;
}

export function SpendTrendChart({
  dailySpend,
  averagePerDayMilli,
  projectedMonthlySpendMilli
}: SpendTrendChartProps) {
  if (dailySpend.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500">No spend yet to chart</p>
      </div>
    );
  }

  // Recharts needs plain numbers; rupees keep the axis readable.
  const chartData = dailySpend.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    spend: item.milli / MILLI_PER_RUPEE
  }));

  const averagePerDayRupees = averagePerDayMilli / MILLI_PER_RUPEE;
  const hasProjection = projectedMonthlySpendMilli > 0;

  return (
    <div
      className="w-full"
      role="img"
      aria-label={`Daily spend trend${
        hasProjection ? `, projected ${formatWalletAmount(projectedMonthlySpendMilli)} this month` : ''
      }`}
    >
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} aria-label="Daily wallet spend">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis stroke="#6b7280" style={{ fontSize: '12px' }} label={{ value: '₹', angle: -90, position: 'insideLeft' }} />
          <Tooltip
            formatter={(value: number | undefined) => [formatWalletAmount((value ?? 0) * MILLI_PER_RUPEE), 'Spent']}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem'
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="spend"
            stroke="#072349"
            strokeWidth={2}
            dot={{ fill: '#072349', r: 4 }}
            name="Spent per day"
          />
          {averagePerDayMilli > 0 && (
            <ReferenceLine
              y={averagePerDayRupees}
              stroke="#25D366"
              strokeDasharray="5 5"
              label={{ value: 'Daily average', position: 'right' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {hasProjection && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-xs text-gray-700">
            <strong>On track to spend {formatWalletAmount(projectedMonthlySpendMilli)} this month.</strong>{' '}
            That works out to about {formatWalletAmount(averagePerDayMilli)} a day.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Based on recent days. Your actual spend will move with how many customers message you.
          </p>
        </div>
      )}
    </div>
  );
}
