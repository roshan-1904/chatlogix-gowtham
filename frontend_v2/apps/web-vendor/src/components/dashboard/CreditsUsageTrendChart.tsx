/**
 * Credits Usage Trend Chart Component
 * Displays daily credit usage over time with projected monthly usage
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { DashboardStats } from '../../types/dashboard';

interface CreditsUsageTrendChartProps {
  usageTrends?: DashboardStats['credits']['usageTrends'];
  projectedMonthlyUsage?: number;
  planCredits: number;
}

export function CreditsUsageTrendChart({
  usageTrends,
  projectedMonthlyUsage,
  planCredits,
}: CreditsUsageTrendChartProps) {
  if (!usageTrends || usageTrends.dailyUsage.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500">No usage trend data available</p>
      </div>
    );
  }

  // Format dates for display
  const chartData = usageTrends.dailyUsage.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    credits: item.creditsConsumed,
  }));

  // Add projected data point if available
  const extendedData = [...chartData];
  if (projectedMonthlyUsage !== undefined) {
    const projectedDaily = projectedMonthlyUsage / 30;
    extendedData.push({
      date: 'Projected',
      credits: Math.round(projectedDaily),
    });
  }

  const chartDescription = `Daily credit usage trend chart showing usage over time${projectedMonthlyUsage !== undefined ? ` with projected monthly usage of ${projectedMonthlyUsage.toFixed(0)} credits` : ''}`;
  
  return (
    <div className="w-full" role="img" aria-label={chartDescription}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={extendedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} aria-label="Credits usage trend over time">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            angle={-45}
            textAnchor="end"
            height={60}
          />
          <YAxis
            stroke="#6b7280"
            style={{ fontSize: '12px' }}
            label={{ value: 'Credits', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            formatter={(value: number | undefined) => [`${value ?? 0} credits`, 'Daily Usage']}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '0.5rem',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="credits"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 4 }}
            name="Daily Credits Used"
          />
          {projectedMonthlyUsage !== undefined && (
            <ReferenceLine
              y={projectedMonthlyUsage / 30}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              label={{ value: 'Projected Daily Avg', position: 'right' }}
            />
          )}
          {planCredits > 0 && (
            <ReferenceLine
              y={planCredits / 30}
              stroke="#10b981"
              strokeDasharray="3 3"
              label={{ value: 'Plan Daily Limit', position: 'right' }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {projectedMonthlyUsage !== undefined && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800">
            <strong>Projected Monthly Usage:</strong> {projectedMonthlyUsage.toFixed(0)} credits
            {planCredits > 0 && (
              <>
                {' '}
                ({((projectedMonthlyUsage / planCredits) * 100).toFixed(1)}% of plan limit)
              </>
            )}
          </p>
          <p className="text-xs text-yellow-700 mt-1">
            Based on linear regression of recent usage trends. Actual usage may vary.
          </p>
        </div>
      )}
    </div>
  );
}

