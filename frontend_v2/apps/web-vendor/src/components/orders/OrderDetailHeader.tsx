import { Link } from 'react-router-dom';
import { Badge } from '@chatlogix/ui';
import type { Order } from '../conversations/types';
import { formatAmountWithSymbol } from '../../utils/currency';
import { formatDateTime } from '../../utils/dateFormatting';
import { statusColors, statusLabels } from '../../utils/orderConstants';
import { derivePaymentBadge, paymentBadgeLabel, paymentBadgeVariant } from '../../utils/orderPayment';

interface OrderDetailHeaderProps {
  order: Order;
}

export function OrderDetailHeader({ order }: OrderDetailHeaderProps) {
  const paymentBadge = derivePaymentBadge(order);
  const fulfillmentLabel = statusLabels[order.status] || order.status;

  return (
    <header className="mb-4">
      <Link to="/orders" className="text-sm font-medium text-primary-500 hover:underline">
        ← Orders
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-gray-900 sm:text-2xl">
            Order {order.orderNumber || 'N/A'}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">Created {formatDateTime(order.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={statusColors[order.status] || 'default'}>{fulfillmentLabel}</Badge>
            <Badge variant={paymentBadgeVariant(paymentBadge)}>{paymentBadgeLabel(paymentBadge)}</Badge>
          </div>
        </div>
        <p className="shrink-0 text-lg font-semibold text-gray-900">
          {formatAmountWithSymbol(order.totalAmount ?? 0)}
        </p>
      </div>
    </header>
  );
}
