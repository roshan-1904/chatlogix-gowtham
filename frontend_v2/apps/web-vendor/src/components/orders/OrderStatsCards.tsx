import { formatAmountWithSymbol } from '../../utils/currency';

interface OrderStatsCardsProps {
  stats: {
    totalOrders: number;
    todayOrders: number;
    needAttention: number;
    totalRevenue: number;
  };
  isLoading?: boolean;
}

const LABELS = ['Orders', 'Today', 'Need attention', 'Collected'] as const;

export function OrderStatsCards({ stats, isLoading }: OrderStatsCardsProps) {
  const values = isLoading
    ? null
    : [
        String(stats.totalOrders),
        String(stats.todayOrders),
        String(stats.needAttention),
        formatAmountWithSymbol(stats.totalRevenue ?? 0),
      ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
      {LABELS.map((label, index) => (
        <div key={label} className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <p className="text-xs text-gray-500">{label}</p>
          {values ? (
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900">{values[index]}</p>
          ) : (
            <div className="mt-1 h-6 w-16 animate-pulse rounded bg-gray-200" />
          )}
        </div>
      ))}
    </div>
  );
}
