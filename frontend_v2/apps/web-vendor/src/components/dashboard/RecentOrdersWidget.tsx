import { useNavigate } from 'react-router-dom';
import { formatAmountWithSymbol } from '../../utils/currency';
import type { DashboardStats } from '../../types/dashboard';

interface RecentOrdersWidgetProps {
  orders: DashboardStats['recentOrders'];
}

export function RecentOrdersWidget({ orders }: RecentOrdersWidgetProps) {
  const navigate = useNavigate();

  if (orders.length === 0) {
    return null;
  }

  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-primary-500/10 text-primary-500',
      preparing: 'bg-purple-100 text-purple-800',
      ready: 'bg-secondary-500/10 text-secondary-500',
      delivered: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-1.5 sm:space-y-2" role="list" aria-label="Recent orders list">
      {orders.slice(0, 5).map((order) => (
        <button
          key={order.id}
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-transparent p-2 text-left transition-colors hover:border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500/30 sm:p-2.5"
          onClick={() => navigate(`/orders/${order.id}`)}
          role="listitem"
        >
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-xs font-medium text-gray-900 sm:text-sm">Order #{order.id.slice(0, 8)}</p>
            <p className="truncate text-[10px] text-gray-500 sm:text-xs">{order.customerName}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <p className="text-xs font-semibold text-primary-500 sm:text-sm">
              {formatAmountWithSymbol(order.totalAmount)}
            </p>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium sm:text-xs ${getStatusColor(order.status)}`}>
              {order.status}
            </span>
            <span className="text-[10px] text-gray-500">{formatTimeAgo(order.createdAt)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
