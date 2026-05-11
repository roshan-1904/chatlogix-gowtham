import { Modal, Badge, Button } from '@chatlogix/ui';
import type { Order } from '../types';
import { formatAmountWithSymbol } from '../../../utils/currency';
import { formatOrderDate, formatDateTime } from '../../../utils/dateFormatting';
import { parseOrderItems, getItemsSummary } from '../../../utils/orderParsing';
import { statusColors, statusLabels } from '../../../utils/orderConstants';

interface OrderQuickDetailsModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onViewFullDetails: (orderId: string) => void;
}

export function OrderQuickDetailsModal({
  order,
  isOpen,
  onClose,
  onViewFullDetails,
}: OrderQuickDetailsModalProps) {
  const items = parseOrderItems(order.items);
  const statusColor = statusColors[order.status] || 'default';
  const statusLabel = statusLabels[order.status] || order.status;

  const handleViewFullDetails = () => {
    onViewFullDetails(order.id);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Order ${order.orderNumber}`}
      size="md"
    >
      <div className="space-y-4">
        {/* Status and Amount */}
        <div className="flex items-center justify-between">
          <Badge variant={statusColor}>{statusLabel}</Badge>
          <div className="text-lg font-semibold text-gray-900">
            {formatAmountWithSymbol(order.totalAmount)}
          </div>
        </div>

        {/* Items Summary */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Items</h4>
          <div className="text-sm text-gray-900">
            <div className="mb-1">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </div>
            <div className="text-gray-600">
              {getItemsSummary(order.items, 3)}
            </div>
            {items.length > 3 && (
              <button
                onClick={handleViewFullDetails}
                className="mt-1 text-blue-600 hover:text-blue-800 text-sm"
              >
                View all {items.length} items
              </button>
            )}
          </div>
        </div>

        {/* Delivery Address */}
        {order.deliveryAddress && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-2">Delivery Address</h4>
            <p className="text-sm text-gray-900 line-clamp-2">
              {order.deliveryAddress}
            </p>
          </div>
        )}

        {/* Estimated Delivery */}
        {order.estimatedDelivery && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-1">Estimated Delivery</h4>
            <p className="text-sm text-gray-900">
              {formatOrderDate(order.estimatedDelivery)}
            </p>
          </div>
        )}

        {/* Created Date */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1">Order Date</h4>
          <p className="text-sm text-gray-900">
            {formatDateTime(order.createdAt)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200">
          <Button
            variant="primary"
            onClick={handleViewFullDetails}
            className="flex-1"
          >
            View Full Details
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

