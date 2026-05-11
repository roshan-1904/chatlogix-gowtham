import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@chatlogix/ui';
import { formatPhone } from '../../lib/format';
import { formatAmountWithSymbol } from '../../utils/currency';
import type { Conversation, CustomerInsights, Order } from './types';
import { OrderQuickDetailsModal } from './modals/OrderQuickDetailsModal';
import { useModal } from '../../hooks/useModal';
import { navigateToOrderDetails } from '../../utils/navigation';

interface CustomerDetailsPanelProps {
  readonly conversation: Conversation;
  readonly customerInsights: CustomerInsights | null;
  readonly customerOrders: Order[];
}

export function CustomerDetailsPanel({
  conversation,
  customerInsights,
  customerOrders,
}: CustomerDetailsPanelProps) {
  const navigate = useNavigate();
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const orderModal = useModal();

  const getOrderStatusBadgeVariant = (status: string): 'default' | 'success' | 'warning' => {
    if (status === 'delivered') return 'success';
    if (status === 'pending' || status === 'confirmed' || status === 'preparing' || status === 'ready' || status === 'out_for_delivery') return 'warning';
    return 'default';
  };

  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    orderModal.open();
  };

  const handleViewFullDetails = (orderId: string) => {
    navigateToOrderDetails(orderId, navigate);
  };

  // Separate orders into current/pending and recent (delivered/cancelled)
  const activeOrderStatuses = new Set(['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']);
  const currentPendingOrders = customerOrders.filter(order => 
    activeOrderStatuses.has(order.status.toLowerCase())
  );
  const recentOrders = customerOrders.filter(order => 
    !activeOrderStatuses.has(order.status.toLowerCase())
  );

  const primaryAddress =
    customerInsights?.deliveryAddress || customerInsights?.primaryDeliveryAddress;

  return (
    <div className="w-[20%] min-w-[260px] bg-[#ffffff] border-l border-black/10 overflow-y-auto">
      <div className="px-5 py-4 border-b border-gray-200 bg-[#f0f2f5]">
        <h3 className="text-sm font-semibold text-gray-800">Customer Details</h3>
      </div>
      <div className="p-5 space-y-5">
        {/* Basic Info */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Contact
          </h4>
          <div className="space-y-1.5 text-sm">
            {customerInsights?.customerName && (
              <div className="font-medium text-gray-900">
                {customerInsights.customerName}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Phone</span>
              <span className="text-gray-900 text-sm">
                {formatPhone(conversation.customer.phone)}
              </span>
            </div>
            {customerInsights?.alternativePhoneNumber && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Alt. Phone</span>
                <span className="text-gray-900 text-sm">
                  {formatPhone(customerInsights.alternativePhoneNumber)}
                </span>
              </div>
            )}
            {customerInsights?.email && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Email</span>
                <span className="text-gray-900 text-xs truncate max-w-[140px] text-right">
                  {customerInsights.email}
                </span>
              </div>
            )}
            {customerInsights?.preferredLanguage && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Language</span>
                <span className="text-gray-900 text-sm">
                  {customerInsights.preferredLanguage}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Customer Insights Summary */}
        {customerInsights?.basicDetails && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Customer Insights
            </h4>
            <p className="text-sm text-gray-900 bg-[#f9fafb] rounded-lg px-3 py-2">
              {customerInsights.basicDetails}
            </p>
          </section>
        )}

        {/* Current/Pending Orders */}
        {currentPendingOrders.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Current / Pending Orders
            </h4>
            <div className="space-y-2">
              {currentPendingOrders.map((order) => (
                <div
                  key={order.id}
                  onClick={() => handleOrderClick(order)}
                  className="p-3 bg-[#fff4e6] rounded-lg border border-orange-200 cursor-pointer hover:bg-[#ffe8cc] transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      #{order.orderNumber}
                    </span>
                    <Badge variant={getOrderStatusBadgeVariant(order.status)}>
                      {order.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600">
                    {formatAmountWithSymbol(order.totalAmount)}
                  </div>
                  {order.deliveryAddress && (
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {order.deliveryAddress}
                    </div>
                  )}
                  {order.estimatedDelivery && (
                    <div className="text-xs text-orange-700 mt-1">
                      Est. Delivery: {new Date(order.estimatedDelivery).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Current Order Info from Insights */}
        {customerInsights?.currentOrder && currentPendingOrders.length === 0 && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Current Order
            </h4>
            <div className="text-sm text-gray-900 bg-[#f5f6f6] rounded-lg px-3 py-2">
              {customerInsights.currentOrder}
            </div>
          </section>
        )}

        {/* Delivery Address */}
        {primaryAddress && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Delivery Address
            </h4>
            <div className="border border-green-200 bg-green-50 rounded-lg px-3 py-2">
              <p className="text-xs text-gray-800 whitespace-pre-line">
                {primaryAddress}
              </p>
            </div>
            {customerInsights?.deliveryInstructions && (
              <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                <span className="font-semibold">Instructions: </span>
                {customerInsights.deliveryInstructions}
              </div>
            )}
          </section>
        )}

        {/* Preferences */}
        {customerInsights?.preferences && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Preferences
            </h4>
            <p className="text-sm text-gray-900 bg-[#f9fafb] rounded-lg px-3 py-2">
              {customerInsights.preferences}
            </p>
          </section>
        )}

        {/* Communication Style */}
        {customerInsights?.communicationStyle && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Communication Style
            </h4>
            <p className="text-sm text-gray-900 bg-[#f9fafb] rounded-lg px-3 py-2">
              {customerInsights.communicationStyle}
            </p>
          </section>
        )}

        {/* Purchase History */}
        {customerInsights?.purchaseHistory && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Purchase History
            </h4>
            <p className="text-sm text-gray-900 bg-[#f9fafb] rounded-lg px-3 py-2">
              {customerInsights.purchaseHistory}
            </p>
          </section>
        )}

        {/* Recent Orders */}
        {recentOrders.length > 0 && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Recent Orders
            </h4>
            <div className="space-y-2">
              {recentOrders.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  onClick={() => handleOrderClick(order)}
                  className="p-3 bg-[#f9fafb] rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-gray-900">
                      #{order.orderNumber}
                    </span>
                    <Badge variant={getOrderStatusBadgeVariant(order.status)}>
                      {order.status}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600">
                    {formatAmountWithSymbol(order.totalAmount)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                  {order.deliveryAddress && (
                    <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {order.deliveryAddress}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dietary Restrictions */}
        {customerInsights?.dietaryRestrictions && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Dietary Restrictions
            </h4>
            <p className="text-sm text-gray-900 bg-[#f9fafb] rounded-lg px-3 py-2">
              {customerInsights.dietaryRestrictions}
            </p>
          </section>
        )}

        {/* Payment Preferences */}
        {customerInsights?.paymentPreferences && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Payment Preferences
            </h4>
            <p className="text-sm text-gray-900 bg-[#f9fafb] rounded-lg px-3 py-2">
              {customerInsights.paymentPreferences}
            </p>
          </section>
        )}

        {/* Special Requests */}
        {customerInsights?.specialRequests && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Special Requests
            </h4>
            <p className="text-sm text-gray-900 bg-[#f9fafb] rounded-lg px-3 py-2">
              {customerInsights.specialRequests}
            </p>
          </section>
        )}

        {/* Special Occasions */}
        {customerInsights?.specialOccasions && (
          <section>
            <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Special Occasions
            </h4>
            <div className="text-sm text-gray-900 bg-[#f9fafb] rounded-lg px-3 py-2">
              {typeof customerInsights.specialOccasions === 'string' 
                ? customerInsights.specialOccasions
                : JSON.stringify(customerInsights.specialOccasions, null, 2)}
            </div>
          </section>
        )}

        {/* Future: Vendor notes & Quick replies placeholders */}
        <section>
          <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Vendor Notes (coming soon)
          </h4>
          <div className="text-xs text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2">
            Add private notes about this customer here.
          </div>
        </section>

        <section>
          <h4 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Quick Replies (coming soon)
          </h4>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 rounded-full bg-gray-100 text-[11px] text-gray-600">
              Thanks for your order!
            </span>
            <span className="px-2 py-1 rounded-full bg-gray-100 text-[11px] text-gray-600">
              Your order is on the way.
            </span>
          </div>
        </section>
      </div>

      {/* Order Quick Details Modal */}
      {selectedOrder && (
        <OrderQuickDetailsModal
          order={selectedOrder}
          isOpen={orderModal.isOpen}
          onClose={orderModal.close}
          onViewFullDetails={handleViewFullDetails}
        />
      )}
    </div>
  );
}

