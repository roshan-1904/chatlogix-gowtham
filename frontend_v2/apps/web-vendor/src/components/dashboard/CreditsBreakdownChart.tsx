/**
 * Credits Breakdown Chart Component
 * Displays credit consumption by type (Text, Audio, Image, Document) as a pie chart
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { DashboardStats } from '../../types/dashboard';

interface CreditsBreakdownChartProps {
  breakdown: DashboardStats['credits']['breakdown'];
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']; // Blue, Green, Orange, Red

export function CreditsBreakdownChart({ breakdown }: CreditsBreakdownChartProps) {
  const data = [
    { name: 'Text', value: breakdown.text },
    { name: 'Audio', value: breakdown.audio },
    { name: 'Image', value: breakdown.image },
    { name: 'Document', value: breakdown.document },
  ].filter(item => item.value > 0); // Only show types with usage

  const totalCredits = data.reduce((sum, item) => sum + item.value, 0);

  if (totalCredits === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-sm text-gray-500">No credit usage data available</p>
      </div>
    );
  }

  return (
    <div className="w-full" role="img" aria-label={`Credits breakdown chart showing ${data.map(d => `${d.name}: ${d.value} credits`).join(', ')}`}>
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
            aria-label="Credits breakdown by type"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number | undefined) => [`${value ?? 0} credits`, 'Credits']}
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
        Total Credits: <span className="font-semibold">{totalCredits}</span>
      </div>
    </div>
  );
}

