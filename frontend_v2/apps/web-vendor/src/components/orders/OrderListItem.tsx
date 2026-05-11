import { useState, useEffect, useRef } from 'react';
import { Badge, Button } from '@chatlogix/ui';
import type { Order } from '../conversations/types';
import { formatPhone } from '../../lib/format';
import { formatAmountWithSymbol } from '../../utils/currency';
import { formatDateTime } from '../../utils/dateFormatting';
import { getItemsSummary } from '../../utils/orderParsing';
import { statusColors, statusLabels } from '../../utils/orderConstants';

interface OrderListItemProps {
  order: Order;
  onClick: (orderId: string) => void;
  onQuickAction?: (orderId: string, action: string) => void;
  viewMode?: 'table' | 'card';
}

interface QuickAction {
  id: string;
  label: string;
  icon: string;
}

const getQuickActions = (status: string): QuickAction[] => {
  const baseActions: QuickAction[] = [
    { id: 'view', label: 'View Details', icon: '👁️' }
  ];

  switch (status) {
    case 'pending':
      return [
        ...baseActions,
        { id: 'confirm', label: 'Confirm Order', icon: '✅' },
        { id: 'cancel', label: 'Cancel Order', icon: '❌' }
      ];
    case 'confirmed':
      return [
        ...baseActions,
        { id: 'start_preparing', label: 'Start Preparing', icon: '👨‍🍳' },
        { id: 'send_payment_link', label: 'Send Payment Link', icon: '💳' },
        { id: 'cancel', label: 'Cancel Order', icon: '❌' }
      ];
    case 'preparing':
      return [
        ...baseActions,
        { id: 'mark_ready', label: 'Mark Ready', icon: '✅' },
        { id: 'cancel', label: 'Cancel Order', icon: '❌' }
      ];
    case 'ready':
      return [
        ...baseActions,
        { id: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚' },
        { id: 'create_shipment', label: 'Create Shipment', icon: '📦' },
        { id: 'cancel', label: 'Cancel Order', icon: '❌' }
      ];
    case 'out_for_delivery':
      return [
        ...baseActions,
        { id: 'mark_delivered', label: 'Mark Delivered', icon: '🎉' },
        { id: 'track', label: 'Track Shipment', icon: '📍' }
      ];
    case 'delivered':
      return [
        ...baseActions,
        { id: 'view_invoice', label: 'View Invoice', icon: '📄' }
      ];
    case 'cancelled':
      return baseActions;
    default:
      return baseActions;
  }
};

export function OrderListItem({
  order,
  onClick,
  onQuickAction,
  viewMode = 'table',
}: OrderListItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const statusColor = statusColors[order.status] || 'default';
  const statusLabel = statusLabels[order.status] || order.status;
  const actions = getQuickActions(order.status);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleActionClick = (actionId: string) => {
    if (actionId === 'view') {
      onClick(order.id);
    } else if (onQuickAction) {
      onQuickAction(order.id, actionId);
    }
    setShowMenu(false);
  };

  if (viewMode === 'card') {
    return (
      <div className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-3">
          <button
            onClick={() => onClick(order.id)}
            className="text-left flex-1"
          >
            <div className="font-semibold text-gray-900 hover:text-blue-600">
              #{order.orderNumber}
            </div>
          </button>
          <Badge variant={statusColor}>{statusLabel}</Badge>
        </div>

        <div className="space-y-2 text-sm">
          {order.customer && (
            <div>
              <span className="text-gray-500">Customer: </span>
              <a
                href={`tel:${order.customer.phone}`}
                className="text-blue-600 hover:text-blue-800"
              >
                {formatPhone(order.customer.phone)}
              </a>
            </div>
          )}
          <div>
            <span className="text-gray-500">Items: </span>
            <span className="text-gray-900">{getItemsSummary(order.items, 2)}</span>
          </div>
          <div className="font-semibold text-gray-900">
            {formatAmountWithSymbol(order.totalAmount ?? 0)}
          </div>
          <div className="text-gray-500">
            {formatDateTime(order.createdAt)}
          </div>
          {order.estimatedDelivery && (
            <div className="text-xs text-orange-600">
              Est. Delivery: {new Date(order.estimatedDelivery).toLocaleDateString()}
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onClick(order.id)}
            className="flex-1"
          >
            View Details
          </Button>
          <div className="relative" ref={menuRef}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowMenu(!showMenu)}
            >
              ⋯
            </Button>
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
                {actions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => handleActionClick(action.id)}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg transition-colors"
                  >
                    <span className="mr-2">{action.icon}</span>
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Table view
  return (
    <tr
      className="border-b border-gray-200 hover:bg-blue-50 transition-colors cursor-pointer"
      onClick={() => onClick(order.id)}
    >
      <td className="py-4 px-4 md:px-6 whitespace-nowrap">
        <span className="font-semibold text-blue-600 hover:text-blue-800 transition-colors">
          #{order.orderNumber}
        </span>
      </td>
      <td className="py-4 px-4 md:px-6 whitespace-nowrap">
        <Badge variant={statusColor}>{statusLabel}</Badge>
      </td>
      <td className="py-4 px-4 md:px-6 whitespace-nowrap">
        {order.customer ? (
          <a
            href={`tel:${order.customer.phone}`}
            className="text-blue-600 hover:text-blue-800 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {formatPhone(order.customer.phone)}
          </a>
        ) : (
          <span className="text-gray-400">N/A</span>
        )}
      </td>
      <td className="py-4 px-4 md:px-6 text-sm text-gray-900">
        {getItemsSummary(order.items, 2)}
      </td>
      <td className="py-4 px-4 md:px-6 whitespace-nowrap text-sm font-semibold text-gray-900">
        {formatAmountWithSymbol(order.totalAmount ?? 0)}
      </td>
      <td className="py-4 px-4 md:px-6 whitespace-nowrap text-sm text-gray-600">
        {formatDateTime(order.createdAt)}
      </td>
      <td className="py-4 px-4 md:px-6 whitespace-nowrap">
        <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="hover:bg-gray-100"
          >
            ⋯
          </Button>
          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
              {actions.map((action) => (
                <button
                  key={action.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleActionClick(action.id);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg transition-colors"
                >
                  <span className="mr-2">{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

