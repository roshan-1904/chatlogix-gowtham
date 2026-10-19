import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Badge, Button, Card } from '@chatlogix/ui';
import { formatPhone } from '../lib/format';
import { formatAmountWithSymbol } from '../utils/currency';
import { formatDateTime } from '../utils/dateFormatting';
import { parseOrderItems } from '../utils/orderParsing';
import { statusColors, statusLabels, isValidStatusTransition } from '../utils/orderConstants';
import { getErrorMessage } from '../utils/errorHandling';
import type { Order } from '../components/conversations/types';
import { orderService } from '../services/orderService';
import { CustomerConversationModal } from '../components/orders/modals/CustomerConversationModal';
import { PaymentLinkModal } from '../components/orders/modals/PaymentLinkModal';
import { ShippingModal } from '../components/orders/modals/ShippingModal';
import { useModal } from '../hooks/useModal';
import { navigateToConversation } from '../utils/navigation';
import { createShopFundingIntent, requestOrderRefund } from '../lib/refunds';
import { openRazorpayCheckout } from '../lib/razorpayCheckout';
import toast from 'react-hot-toast';

export function OrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const saved = localStorage.getItem('orderNotificationsEnabled');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [paymentLink, setPaymentLink] = useState<string | null>(null);
  const [shippingStatus, setShippingStatus] = useState<'not_created' | 'created' | 'in_transit' | 'delivered'>('not_created');
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [shippingPartner] = useState<string | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [awaitingFundingRefundId, setAwaitingFundingRefundId] = useState<string | null>(null);

  const conversationModal = useModal();
  const paymentLinkModal = useModal();
  const shippingModal = useModal();

  useEffect(() => {
    localStorage.setItem('orderNotificationsEnabled', JSON.stringify(notificationsEnabled));
  }, [notificationsEnabled]);

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
        const linkUrl = orderData.payment?.paymentLinkUrl ?? null;
        if (linkUrl) setPaymentLink(linkUrl);
      } catch (err: any) {
        const errorMessage = getErrorMessage(err);
        setError(errorMessage);
        console.error('Error loading order:', err);
        
        // If order not found, show specific message
        if (errorMessage.includes('not found')) {
          setError('Order not found. It may have been deleted or you do not have access.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadOrderDetails();
  }, [orderId]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) {
      setError('No order data available');
      return;
    }

    // Validate status transition
    if (!isValidStatusTransition(order.status, newStatus)) {
      setError(`Invalid status transition from ${order.status} to ${newStatus}`);
      return;
    }

    // Show confirmation for critical actions
    if (newStatus === 'cancelled') {
      const confirmed = window.confirm(
        'Are you sure you want to cancel this order? This action cannot be undone.'
      );
      if (!confirmed) return;
    }

    if (newStatus === 'delivered') {
      const confirmed = window.confirm('Mark this order as delivered?');
      if (!confirmed) return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Prepare update payload
      const update = {
        status: newStatus,
      };

      // Add cancellation reason if cancelling
      if (newStatus === 'cancelled') {
        (update as any).cancellationReason = 'Cancelled by vendor';
      }

      // Call API to update status
      // Note: Backend automatically sends WhatsApp notification on status update
      const updatedOrder = await orderService.updateOrderStatus(order.id, update);
      
      // Update local state
      setOrder(updatedOrder);
    } catch (err: any) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error updating order status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewConversation = () => {
    if (order?.conversation?.id) {
      conversationModal.open();
    }
  };

  const handleOpenFullConversation = (convId: string) => {
    navigateToConversation(convId, navigate);
    conversationModal.close();
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-4">
        <div className="text-center py-8">
          <p className="text-red-600 mb-3">{error || 'Order not found'}</p>
          <Button onClick={() => navigate('/orders')}>Back to Orders</Button>
        </div>
      </div>
    );
  }

  // Backend always returns amounts in paise, so we keep it as-is
  // formatAmountWithSymbol will handle the conversion to rupees for display
  const totalAmountInPaise = order.totalAmount ?? 0;
  
  // Convert to rupees for parseOrderItems (which expects rupees)
  const totalAmountInRupees = totalAmountInPaise / 100;
  const items = parseOrderItems(order.items ?? [], totalAmountInRupees);
  const statusColor = statusColors[order.status] || 'default';
  const statusLabel = statusLabels[order.status] || order.status;
  const paymentStatus = order.payment?.status ?? 'pending';
  const paymentPaid = paymentStatus === 'captured' || paymentStatus === 'paid' || paymentStatus === 'partially_refunded';
  const refundedPaise = order.payment?.refundedPaise ?? 0;
  const capturedPaise = order.payment?.amountPaise ?? 0;
  const refundRemainderPaise = capturedPaise > 0 ? capturedPaise - refundedPaise : 0;
  const canRefund = paymentPaid && refundRemainderPaise > 0;

  const handleRefund = async () => {
    if (!order) return;
    const confirmed = window.confirm(
      `Refund ${formatAmountWithSymbol(refundRemainderPaise)} to the customer for this order?`
    );
    if (!confirmed) return;
    setRefundBusy(true);
    try {
      const result = await requestOrderRefund(order.id, refundRemainderPaise);
      if (result.status === 'awaiting_funding') {
        setAwaitingFundingRefundId(result.refundId);
        toast('Add funds to send this refund to the customer.');
      } else {
        toast.success('Refund submitted — the customer will be updated when it completes.');
        const refreshed = await orderService.getOrderDetails(order.id);
        setOrder(refreshed);
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setRefundBusy(false);
    }
  };

  const handleShopFunding = async () => {
    if (!awaitingFundingRefundId || !order) return;
    setRefundBusy(true);
    try {
      const intent = await createShopFundingIntent(awaitingFundingRefundId);
      await openRazorpayCheckout({
        keyId: intent.clientAction.keyId,
        orderId: intent.clientAction.orderId,
        amountPaise: intent.clientAction.amountPaise,
        description: 'Fund refund to customer'
      });
      toast.success('Payment received — finishing your refund…');
      setAwaitingFundingRefundId(null);
      const refreshed = await orderService.getOrderDetails(order.id);
      setOrder(refreshed);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <div className="p-1  max-w-7xl mx-auto h-full overflow-auto">
      {/* Order Header */}
      <div className="mb-3 sm:mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 mb-3">
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Order {order.orderNumber || 'N/A'}</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              Created {formatDateTime(order.createdAt)}
            </p>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3">
            <div className="text-base sm:text-lg font-semibold text-gray-900">
              Total: {formatAmountWithSymbol(totalAmountInPaise)}
            </div>
            <Badge variant={statusColor} className="text-xs sm:text-sm">{statusLabel}</Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Order Items */}
          <Card title="Order Items" className="!p-3 sm:!p-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1.5 px-2 sm:px-3 text-xs sm:text-sm font-medium text-gray-700">Product</th>
                    <th className="text-right py-1.5 px-2 sm:px-3 text-xs sm:text-sm font-medium text-gray-700">Quantity</th>
                    <th className="text-right py-1.5 px-2 sm:px-3 text-xs sm:text-sm font-medium text-gray-700 hidden sm:table-cell">Unit Price</th>
                    <th className="text-right py-1.5 px-2 sm:px-3 text-xs sm:text-sm font-medium text-gray-700">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 px-3 text-center text-xs sm:text-sm text-gray-500">
                        No items found
                      </td>
                    </tr>
                  ) : (
                    items.map((item, index) => (
                      <tr key={index} className="border-b border-gray-100">
                        <td className="py-2 px-2 sm:px-3">
                          <button
                            disabled
                            className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Product management coming soon"
                          >
                            {item.product || 'Unknown Product'}
                          </button>
                          {item.notes && (
                            <div className="text-[10px] sm:text-xs text-gray-400 italic mt-0.5">{item.notes}</div>
                          )}
                        </td>
                        <td className="text-right py-2 px-2 sm:px-3 text-xs sm:text-sm text-gray-900">
                          {item.quantity || 0} {item.unit || 'piece'}
                        </td>
                        <td className="text-right py-2 px-2 sm:px-3 text-xs sm:text-sm text-gray-900 hidden sm:table-cell">
                          {formatAmountWithSymbol(item.unitPrice * 100)}
                        </td>
                        <td className="text-right py-2 px-2 sm:px-3 text-xs sm:text-sm font-medium text-gray-900">
                          {formatAmountWithSymbol(item.totalPrice * 100)}
                        </td>
                      </tr>
                    ))
                  )}
                  <tr className="border-t-2 border-gray-300">
                    <td colSpan={2} className="py-2 px-2 sm:px-3 text-right font-semibold text-xs sm:text-sm text-gray-900 sm:hidden">
                      Total:
                    </td>
                    <td colSpan={3} className="py-2 px-2 sm:px-3 text-right font-semibold text-xs sm:text-sm text-gray-900 hidden sm:table-cell">
                      Total:
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-right font-bold text-base sm:text-lg text-gray-900">
                      {formatAmountWithSymbol(totalAmountInPaise)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Delivery Information */}
          <Card title="Delivery Information" className="!p-3 sm:!p-4">
            <div className="space-y-2">
              {order.deliveryAddress && (
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Address</h4>
                  <p className="text-xs sm:text-sm text-gray-900">{order.deliveryAddress}</p>
                </div>
              )}
              {order.deliveryInstructions && (
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Instructions</h4>
                  <p className="text-xs sm:text-sm text-gray-900">{order.deliveryInstructions}</p>
                </div>
              )}
              {order.specialRequests && (
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Special Requests</h4>
                  <p className="text-xs sm:text-sm text-gray-900">{order.specialRequests}</p>
                </div>
              )}
              {order.estimatedDelivery && (
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Estimated Delivery</h4>
                  <p className="text-xs sm:text-sm text-gray-900">
                    {formatDateTime(order.estimatedDelivery)}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Order Timeline */}
          <Card title="Order Timeline" className="!p-3 sm:!p-4">
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-start gap-2 sm:gap-2.5">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-900">Order Created</p>
                  <p className="text-[10px] sm:text-xs text-gray-500">{formatDateTime(order.createdAt)}</p>
                </div>
              </div>
              {order.confirmedAt && (
                <div className="flex items-start gap-2 sm:gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-900">Order Confirmed</p>
                    <p className="text-[10px] sm:text-xs text-gray-500">{formatDateTime(order.confirmedAt)}</p>
                  </div>
                </div>
              )}
              {order.estimatedDelivery && (
                <div className="flex items-start gap-2 sm:gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-gray-900">Estimated Delivery</p>
                    <p className="text-[10px] sm:text-xs text-gray-500">{formatDateTime(order.estimatedDelivery)}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-3 sm:space-y-4">
          {/* Customer Information */}
          <Card title="Customer Information" className="!p-3 sm:!p-4">
            <div className="space-y-2">
              {order.customer && (
                <>
                  <div>
                    <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Phone</h4>
                    <a
                      href={`tel:${order.customer.phone}`}
                      className="text-xs sm:text-sm text-blue-600 hover:text-blue-800"
                    >
                      {formatPhone(order.customer.phone)}
                    </a>
                  </div>
                  {order.conversation && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleViewConversation}
                      className="w-full text-xs sm:text-sm"
                    >
                      View Conversation
                    </Button>
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Payment Information */}
          <Card title="Payment Information" className="!p-3 sm:!p-4">
            <div className="space-y-2">
              <div>
                <Badge variant={paymentPaid ? 'success' : 'warning'} className="text-xs sm:text-sm">
                  {paymentPaid ? 'Paid' : paymentStatus === 'pending' ? 'Awaiting payment' : paymentStatus}
                </Badge>
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Amount</h4>
                <p className="text-xs sm:text-sm text-gray-900">{formatAmountWithSymbol(totalAmountInPaise)}</p>
              </div>
              {order.payment?.netMilli && (
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Settlement net</h4>
                  <p className="text-xs sm:text-sm text-gray-900">₹{(Number(order.payment.netMilli) / 1000).toFixed(2)}</p>
                  {order.payment.transferStatus && (
                    <p className="text-xs text-gray-500">Transfer: {order.payment.transferStatus}</p>
                  )}
                </div>
              )}
              {canRefund && (
                <div className="space-y-2 pt-1 border-t border-gray-100">
                  {refundedPaise > 0 && (
                    <p className="text-xs text-gray-500">
                      Refunded so far: {formatAmountWithSymbol(refundedPaise)}
                    </p>
                  )}
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={refundBusy}
                    onClick={() => void handleRefund()}
                    className="w-full text-xs sm:text-sm"
                  >
                    Refund customer
                  </Button>
                  {awaitingFundingRefundId && (
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={refundBusy}
                      onClick={() => void handleShopFunding()}
                      className="w-full text-xs sm:text-sm"
                    >
                      Add funds to send refund
                    </Button>
                  )}
                </div>
              )}
              {!paymentPaid && !paymentLink ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => paymentLinkModal.open()}
                  className="w-full text-xs sm:text-sm"
                >
                  Generate Payment Link
                </Button>
              ) : (
                <div className="space-y-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => paymentLinkModal.open()}
                    className="w-full text-xs sm:text-sm"
                  >
                    View Payment Link
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      // TODO: Send payment link via WhatsApp
                      console.log('Send payment link via WhatsApp');
                    }}
                    className="w-full text-xs sm:text-sm"
                  >
                    Send via WhatsApp
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Shipping Information */}
          <Card title="Shipping Information" className="!p-3 sm:!p-4">
            <div className="space-y-2">
              <div>
                <Badge variant={shippingStatus === 'delivered' ? 'success' : 'info'} className="text-xs sm:text-sm">
                  {shippingStatus === 'not_created' ? 'Not Created' :
                   shippingStatus === 'created' ? 'Created' :
                   shippingStatus === 'in_transit' ? 'In Transit' : 'Delivered'}
                </Badge>
              </div>
              {trackingNumber && (
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Tracking Number</h4>
                  <p className="text-xs sm:text-sm text-gray-900">{trackingNumber}</p>
                </div>
              )}
              {shippingPartner && (
                <div>
                  <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-0.5">Shipping Partner</h4>
                  <p className="text-xs sm:text-sm text-gray-900">{shippingPartner}</p>
                </div>
              )}
              {shippingStatus === 'not_created' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => shippingModal.open()}
                  className="w-full text-xs sm:text-sm"
                >
                  Create Shipment
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => shippingModal.open()}
                  className="w-full text-xs sm:text-sm"
                >
                  View Shipping Details
                </Button>
              )}
            </div>
          </Card>

          {/* Notification Settings */}
          <Card title="Notification Settings" className="!p-3 sm:!p-4">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm text-gray-700">
                Send WhatsApp notifications
              </label>
              <input
                type="checkbox"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
              />
            </div>
          </Card>

          {/* Action Buttons */}
          <Card title="Actions" className="!p-3 sm:!p-4">
            <div className="space-y-2">
              {order.status === 'awaiting_payment' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => paymentLinkModal.open()}
                    className="w-full text-xs sm:text-sm"
                  >
                    Send Payment Link
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to cancel this order?')) {
                        handleStatusUpdate('cancelled');
                      }
                    }}
                    className="w-full text-xs sm:text-sm"
                  >
                    Cancel Order
                  </Button>
                </>
              )}
              {order.status === 'pending' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleStatusUpdate('confirmed')}
                    className="w-full text-xs sm:text-sm"
                  >
                    Confirm Order
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to cancel this order?')) {
                        handleStatusUpdate('cancelled');
                      }
                    }}
                    className="w-full text-xs sm:text-sm"
                  >
                    Cancel Order
                  </Button>
                </>
              )}
              {order.status === 'confirmed' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleStatusUpdate('preparing')}
                    className="w-full text-xs sm:text-sm"
                  >
                    Start Preparing
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to cancel this order?')) {
                        handleStatusUpdate('cancelled');
                      }
                    }}
                    className="w-full text-xs sm:text-sm"
                  >
                    Cancel Order
                  </Button>
                </>
              )}
              {order.status === 'preparing' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleStatusUpdate('ready')}
                    className="w-full text-xs sm:text-sm"
                  >
                    Mark Ready
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to cancel this order?')) {
                        handleStatusUpdate('cancelled');
                      }
                    }}
                    className="w-full text-xs sm:text-sm"
                  >
                    Cancel Order
                  </Button>
                </>
              )}
              {order.status === 'ready' && (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleStatusUpdate('out_for_delivery')}
                    className="w-full text-xs sm:text-sm"
                  >
                    Out for Delivery
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to cancel this order?')) {
                        handleStatusUpdate('cancelled');
                      }
                    }}
                    className="w-full text-xs sm:text-sm"
                  >
                    Cancel Order
                  </Button>
                </>
              )}
              {order.status === 'out_for_delivery' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (window.confirm('Mark this order as delivered?')) {
                      handleStatusUpdate('delivered');
                    }
                  }}
                  className="w-full text-xs sm:text-sm"
                >
                  Mark Delivered
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modals */}
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

      <PaymentLinkModal
        orderId={order.id}
        orderAmount={totalAmountInPaise}
        customerPhone={order.customer?.phone || ''}
        paymentLink={paymentLink || undefined}
        isOpen={paymentLinkModal.isOpen}
        onClose={paymentLinkModal.close}
        onLinkGenerated={(link) => setPaymentLink(link)}
      />

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

