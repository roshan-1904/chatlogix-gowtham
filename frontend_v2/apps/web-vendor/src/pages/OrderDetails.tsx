import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge, Button, Card } from '@chatlogix/ui';
import { useAuth } from '@chatlogix/auth';
import { formatPhone } from '../lib/format';
import { apiClient } from '../lib/api';
import { formatAmountWithSymbol } from '../utils/currency';
import { formatDateTime } from '../utils/dateFormatting';
import { parseOrderItems } from '../utils/orderParsing';
import { isValidStatusTransition } from '../utils/orderConstants';
import { getErrorMessage } from '../utils/errorHandling';
import { mergeOrder } from '../utils/orderPayment';
import type { Order } from '../components/conversations/types';
import { orderService } from '../services/orderService';
import { CustomerConversationModal } from '../components/orders/modals/CustomerConversationModal';
import { ShippingModal } from '../components/orders/modals/ShippingModal';
import { OrderDetailHeader } from '../components/orders/OrderDetailHeader';
import { OrderNextStep } from '../components/orders/OrderNextStep';
import { OrderPaymentPanel, type ShopPaySettings } from '../components/orders/OrderPaymentPanel';
import { useModal } from '../hooks/useModal';
import { navigateToConversation } from '../utils/navigation';

export function OrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paySettings, setPaySettings] = useState<ShopPaySettings | null>(null);
  const [paySettingsLoaded, setPaySettingsLoaded] = useState(false);
  const [shippingStatus, setShippingStatus] = useState<'not_created' | 'created' | 'in_transit' | 'delivered'>('not_created');
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [shippingPartner] = useState<string | null>(null);

  const conversationModal = useModal();
  const shippingModal = useModal();

  useEffect(() => {
    const loadOrderDetails = async () => {
      if (!orderId) {
        setError('Order ID is required');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const orderData = await orderService.getOrderDetails(orderId);
        setOrder(orderData);
      } catch (err: unknown) {
        const errorMessage = getErrorMessage(err);
        setError(
          errorMessage.toLowerCase().includes('not found')
            ? 'Order not found. It may have been deleted or you do not have access.'
            : errorMessage
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadOrderDetails();
  }, [orderId]);

  useEffect(() => {
    if (!user?.vendorId) {
      setPaySettingsLoaded(true);
      return;
    }
    let cancelled = false;
    apiClient
      .get<ShopPaySettings>(`/vendors/${user.vendorId}/payments/collection`)
      .then((data) => {
        if (!cancelled) setPaySettings(data);
      })
      .catch(() => {
        if (!cancelled) setPaySettings(null);
      })
      .finally(() => {
        if (!cancelled) setPaySettingsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.vendorId]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) return;

    if (!isValidStatusTransition(order.status, newStatus)) {
      setError(`Invalid status transition from ${order.status} to ${newStatus}`);
      return;
    }

    if (newStatus === 'cancelled') {
      const confirmed = window.confirm('Are you sure you want to cancel this order? This action cannot be undone.');
      if (!confirmed) return;
    }

    if (newStatus === 'delivered') {
      const confirmed = window.confirm('Mark this order as delivered?');
      if (!confirmed) return;
    }

    setStatusBusy(true);
    setError(null);
    try {
      const updatedOrder = await orderService.updateOrderStatus(order.id, {
        status: newStatus,
        ...(newStatus === 'cancelled' ? { cancellationReason: 'Cancelled by vendor' } : {}),
      });
      setOrder((prev) => (prev ? mergeOrder(prev, updatedOrder) : updatedOrder));
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setStatusBusy(false);
    }
  };

  const handleOpenFullConversation = (convId: string) => {
    navigateToConversation(convId, navigate);
    conversationModal.close();
  };

  if (isLoading && !order) {
    return (
      <div className="mx-auto max-w-7xl animate-pulse space-y-3">
        <div className="h-8 w-1/4 rounded bg-gray-200" />
        <div className="h-64 rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-7xl py-8 text-center">
        <p className="mb-3 text-red-600">{error || 'Order not found'}</p>
        <Button onClick={() => navigate('/orders')}>Back to Orders</Button>
      </div>
    );
  }

  const totalAmountInPaise = order.totalAmount ?? 0;
  const items = parseOrderItems(order.items ?? [], totalAmountInPaise / 100);
  const openConversation = order.conversation?.id ? () => conversationModal.open() : undefined;

  return (
    <div className="mx-auto h-full max-w-7xl overflow-auto">
      <OrderDetailHeader order={order} />

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="order-2 min-w-0 space-y-4 lg:order-1 lg:col-span-8">
          <Card title="Items" className="!p-3 sm:!p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-2 py-1.5 text-left text-xs font-medium text-gray-700 sm:px-3 sm:text-sm">Product</th>
                    <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-700 sm:px-3 sm:text-sm">Quantity</th>
                    <th className="hidden px-2 py-1.5 text-right text-xs font-medium text-gray-700 sm:table-cell sm:px-3 sm:text-sm">
                      Unit Price
                    </th>
                    <th className="px-2 py-1.5 text-right text-xs font-medium text-gray-700 sm:px-3 sm:text-sm">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-sm text-gray-500">
                        No items found
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={index} className="border-b border-gray-100">
                        <td className="px-2 py-2 sm:px-3">
                          <span className="text-xs text-gray-900 sm:text-sm">{item.product || 'Unknown Product'}</span>
                          {item.notes && <div className="mt-0.5 text-xs italic text-gray-400">{item.notes}</div>}
                        </td>
                        <td className="px-2 py-2 text-right text-xs text-gray-900 sm:px-3 sm:text-sm">
                          {item.quantity || 0} {item.unit || 'piece'}
                        </td>
                        <td className="hidden px-2 py-2 text-right text-xs text-gray-900 sm:table-cell sm:px-3 sm:text-sm">
                          {formatAmountWithSymbol(item.unitPrice * 100)}
                        </td>
                        <td className="px-2 py-2 text-right text-xs font-medium text-gray-900 sm:px-3 sm:text-sm">
                          {formatAmountWithSymbol(item.totalPrice * 100)}
                        </td>
                      </tr>
                    ))
                  )}
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={2} className="px-2 py-2 text-right text-xs font-semibold text-gray-900 sm:hidden">
                      Total
                    </td>
                    <td colSpan={3} className="hidden px-2 py-2 text-right text-sm font-semibold text-gray-900 sm:table-cell">
                      Total
                    </td>
                    <td className="px-2 py-2 text-right text-base font-bold text-gray-900">
                      {formatAmountWithSymbol(totalAmountInPaise)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Delivery and notes" className="!p-3 sm:!p-4">
            <div className="space-y-2">
              {order.deliveryAddress && (
                <div>
                  <h4 className="mb-0.5 text-sm font-medium text-gray-700">Address</h4>
                  <p className="text-sm text-gray-900">{order.deliveryAddress}</p>
                </div>
              )}
              {order.deliveryInstructions && (
                <div>
                  <h4 className="mb-0.5 text-sm font-medium text-gray-700">Instructions</h4>
                  <p className="text-sm text-gray-900">{order.deliveryInstructions}</p>
                </div>
              )}
              {order.specialRequests && (
                <div>
                  <h4 className="mb-0.5 text-sm font-medium text-gray-700">Special requests</h4>
                  <p className="text-sm text-gray-900">{order.specialRequests}</p>
                </div>
              )}
              {order.estimatedDelivery && (
                <div>
                  <h4 className="mb-0.5 text-sm font-medium text-gray-700">Estimated delivery</h4>
                  <p className="text-sm text-gray-900">{formatDateTime(order.estimatedDelivery)}</p>
                </div>
              )}
              {!order.deliveryAddress && !order.deliveryInstructions && !order.specialRequests && !order.estimatedDelivery && (
                <p className="text-sm text-gray-500">No delivery notes yet.</p>
              )}
            </div>
          </Card>

          <Card title="Timeline" className="!p-3 sm:!p-4">
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Order created</p>
                  <p className="text-xs text-gray-500">{formatDateTime(order.createdAt)}</p>
                </div>
              </div>
              {order.confirmedAt && (
                <div className="flex items-start gap-2.5">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-secondary-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Order confirmed</p>
                    <p className="text-xs text-gray-500">{formatDateTime(order.confirmedAt)}</p>
                  </div>
                </div>
              )}
              {order.estimatedDelivery && (
                <div className="flex items-start gap-2.5">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Estimated delivery</p>
                    <p className="text-xs text-gray-500">{formatDateTime(order.estimatedDelivery)}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-4">
          <div className="space-y-4 lg:sticky lg:top-4">
            <OrderNextStep
              status={order.status}
              busy={statusBusy}
              onAdvance={(nextStatus) => void handleStatusUpdate(nextStatus)}
              onCancel={() => void handleStatusUpdate('cancelled')}
            />
            <OrderPaymentPanel
              order={order}
              settings={paySettings}
              settingsLoaded={paySettingsLoaded}
              onOrderUpdated={(fresh) => setOrder((prev) => (prev ? mergeOrder(prev, fresh) : fresh))}
              onViewConversation={openConversation}
            />
            <Card title="Customer" className="!p-3 sm:!p-4">
              {order.customer ? (
                <div className="space-y-2">
                  <div>
                    <h4 className="mb-0.5 text-sm font-medium text-gray-700">Phone</h4>
                    <a href={`tel:${order.customer.phone}`} className="text-sm text-primary-500 hover:underline">
                      {formatPhone(order.customer.phone)}
                    </a>
                  </div>
                  {openConversation && (
                    <button
                      type="button"
                      onClick={openConversation}
                      className="text-sm font-medium text-primary-500 hover:underline"
                    >
                      View conversation
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No customer on this order.</p>
              )}
            </Card>
            <Card title="Shipping Information" className="!p-3 sm:!p-4">
              <div className="space-y-2">
                <div>
                  <Badge variant={shippingStatus === 'delivered' ? 'success' : 'info'} className="text-xs sm:text-sm">
                    {shippingStatus === 'not_created'
                      ? 'Not Created'
                      : shippingStatus === 'created'
                        ? 'Created'
                        : shippingStatus === 'in_transit'
                          ? 'In Transit'
                          : 'Delivered'}
                  </Badge>
                </div>
                {trackingNumber && (
                  <div>
                    <h4 className="mb-0.5 text-xs font-medium text-gray-700 sm:text-sm">Tracking Number</h4>
                    <p className="text-xs text-gray-900 sm:text-sm">{trackingNumber}</p>
                  </div>
                )}
                {shippingPartner && (
                  <div>
                    <h4 className="mb-0.5 text-xs font-medium text-gray-700 sm:text-sm">Shipping Partner</h4>
                    <p className="text-xs text-gray-900 sm:text-sm">{shippingPartner}</p>
                  </div>
                )}
                {shippingStatus === 'not_created' ? (
                  <Button variant="primary" size="sm" onClick={() => shippingModal.open()} className="w-full text-xs sm:text-sm">
                    Create Shipment
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => shippingModal.open()} className="w-full text-xs sm:text-sm">
                    View Shipping Details
                  </Button>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {order.conversation && (
        <CustomerConversationModal
          conversationId={order.conversation.id}
          customerId={order.customer?.id || ''}
          customerPhone={order.customer?.phone || ''}
          isOpen={conversationModal.isOpen}
          onClose={conversationModal.close}
          onOpenFullConversation={handleOpenFullConversation}
        />
      )}

      <ShippingModal
        orderId={order.id}
        order={order}
        isOpen={shippingModal.isOpen}
        onClose={shippingModal.close}
        onShipmentCreated={(_shipmentId, trackingNum) => {
          setTrackingNumber(trackingNum);
          setShippingStatus('created');
        }}
      />
    </div>
  );
}
