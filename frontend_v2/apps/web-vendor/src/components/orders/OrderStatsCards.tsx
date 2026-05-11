import { Card } from '@chatlogix/ui';
import { formatAmountWithSymbol } from '../../utils/currency';

interface OrderStatsCardsProps {
  stats: {
    totalOrders: number;
    todayOrders: number;
    pendingOrders: number;
    totalRevenue: number;
  };
  isLoading?: boolean;
}

export function OrderStatsCards({ stats, isLoading }: OrderStatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card>
        <div className="text-sm text-gray-500 mb-1">Total Orders</div>
        <div className="text-2xl font-bold text-gray-900">{stats.totalOrders}</div>
      </Card>
      <Card>
        <div className="text-sm text-gray-500 mb-1">Today's Orders</div>
        <div className="text-2xl font-bold text-gray-900">{stats.todayOrders}</div>
      </Card>
      <Card>
        <div className="text-sm text-gray-500 mb-1">Pending Orders</div>
        <div className="text-2xl font-bold text-orange-600">{stats.pendingOrders}</div>
      </Card>
      <Card>
        <div className="text-sm text-gray-500 mb-1">Total Revenue</div>
        <div className="text-2xl font-bold text-green-600">
          {formatAmountWithSymbol(stats.totalRevenue ?? 0)}
        </div>
      </Card>
    </div>
  );
}

