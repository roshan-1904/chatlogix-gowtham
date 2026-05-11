import { Card } from '@chatlogix/ui';
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
      confirmed: 'bg-[#072349]/10 text-[#072349]',
      preparing: 'bg-purple-100 text-purple-800',
      ready: 'bg-[#25D366]/10 text-[#25D366]',
      delivered: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Card className="p-3 sm:p-4">
      <h3 className="text-sm sm:text-base font-semibold text-[#072349] mb-2 sm:mb-3">Recent Orders</h3>
      <div className="space-y-1.5 sm:space-y-2" role="list" aria-label="Recent orders list">
        {orders.slice(0, 10).map((order) => (
          <button
            key={order.id}
            type="button"
            className="w-full flex items-center justify-between p-2 sm:p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-all duration-200 border border-transparent hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#072349] focus:ring-offset-1 text-left"
            onClick={() => navigate(`/orders/${order.id}`)}
            role="listitem"
            aria-label={`Order ${order.id.slice(0, 8)} from ${order.customerName}, amount ${formatAmountWithSymbol(order.totalAmount)}, status ${order.status}, ${formatTimeAgo(order.createdAt)}`}
          >
            <div className="flex-1 min-w-0 pr-2 sm:pr-4">
              <p className="text-xs sm:text-sm font-medium text-gray-900 mb-0.5 sm:mb-1">
                Order #{order.id.slice(0, 8)}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-500 truncate">{order.customerName}</p>
            </div>
            <div className="text-right flex-shrink-0 flex flex-col items-end gap-1 sm:gap-2">
              <p className="text-xs sm:text-sm font-semibold text-[#072349]">
                {formatAmountWithSymbol(order.totalAmount)}
              </p>
              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-2">
                <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md font-medium ${getStatusColor(order.status)}`}>
                  {order.status}
                </span>
                <span className="text-[10px] sm:text-xs text-gray-500 whitespace-nowrap">{formatTimeAgo(order.createdAt)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

