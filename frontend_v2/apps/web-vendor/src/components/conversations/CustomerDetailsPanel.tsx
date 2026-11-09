import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@chatlogix/ui';
import { formatPhone } from '../../lib/format';
import { formatAmountWithSymbol } from '../../utils/currency';
import type { Conversation, CustomerInsights, Order } from './types';
import { OrderQuickDetailsModal } from './modals/OrderQuickDetailsModal';
import { useModal } from '../../hooks/useModal';
import { navigateToOrderDetails } from '../../utils/navigation';

function formatPreferredLanguage(code: string): string {
  const labels: Record<string, string> = {
    en: 'English',
    hi: 'Hindi',
    ta: 'Tamil',
    te: 'Telugu',
    kn: 'Kannada',
    ml: 'Malayalam',
    bn: 'Bengali',
    mr: 'Marathi',
    gu: 'Gujarati',
  };
  return labels[code.toLowerCase()] ?? code;
}

const DEFAULT_QUICK_REPLIES = [
  'Thanks for your order! It has been confirmed.',
  'Your order is prepared and on the way.',
  'We have received your payment. Thank you!',
  'Please share your delivery address / location.',
];

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

  const noteStorageKey = `chatlogix:vendor_note:${conversation.customerId || conversation.id}`;
  const [note, setNote] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return window.localStorage.getItem(noteStorageKey) || '';
      } catch {
        return '';
      }
    }
    return '';
  });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(noteStorageKey) || '';
      setNote(stored);
      setSaveStatus('idle');
    } catch {
      // ignore
    }
  }, [noteStorageKey]);

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNote(val);
    setSaveStatus('saving');
  };

  useEffect(() => {
    if (saveStatus !== 'saving') return;
    const timer = setTimeout(() => {
      try {
        window.localStorage.setItem(noteStorageKey, note);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('idle');
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [note, saveStatus, noteStorageKey]);

  useEffect(() => {
    if (saveStatus !== 'saved') return;
    const hideTimer = setTimeout(() => {
      setSaveStatus('idle');
    }, 2000);
    return () => clearTimeout(hideTimer);
  }, [saveStatus]);

  const handleCopyQuickReply = async (text: string, idx: number) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopiedIndex(idx);
      toast.success('Quick reply copied to clipboard');
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      toast.error('Failed to copy quick reply');
    }
  };

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
  const activeOrderStatuses = new Set([
    'pending',
    'awaiting_payment',
    'confirmed',
    'preparing',
    'ready',
    'out_for_delivery'
  ]);
  const currentPendingOrders = customerOrders.filter(order => 
    activeOrderStatuses.has(order.status.toLowerCase())
  );
  const recentOrders = customerOrders.filter(order => 
    !activeOrderStatuses.has(order.status.toLowerCase())
  );

  const primaryAddress =
    customerInsights?.deliveryAddress || customerInsights?.primaryDeliveryAddress;

  return (
    <div className="flex h-full min-w-[260px] w-full flex-col overflow-y-auto border-l border-[#d1d7db] bg-white">
      <div className="border-b border-[#d1d7db] bg-[#f0f2f5] px-5 py-3">
        <h3 className="text-sm font-semibold text-[#111b21]">Customer Details</h3>
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
                  {formatPreferredLanguage(customerInsights.preferredLanguage)}
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

        {/* Vendor Notes */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Vendor Notes
            </h4>
            <span
              className={`text-[10px] font-medium transition-colors ${
                saveStatus === 'saved'
                  ? 'text-emerald-600'
                  : saveStatus === 'saving'
                  ? 'text-amber-600'
                  : 'text-gray-400'
              }`}
            >
              {saveStatus === 'saved'
                ? '✓ Saved'
                : saveStatus === 'saving'
                ? 'Saving…'
                : 'Private store notes'}
            </span>
          </div>
          <textarea
            value={note}
            onChange={handleNoteChange}
            rows={3}
            placeholder="Add private notes about this customer (e.g. preferred delivery time, dietary restrictions)..."
            className="w-full text-xs text-gray-800 bg-white border border-gray-200 rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-gray-400 resize-none shadow-2xs"
            aria-label="Vendor notes"
          />
        </section>

        {/* Quick Replies */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Quick Replies
            </h4>
            <span className="text-[10px] text-gray-400">Click to copy</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {DEFAULT_QUICK_REPLIES.map((reply, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleCopyQuickReply(reply, idx)}
                className={`text-left text-xs px-2.5 py-1.5 rounded-lg border transition-all flex items-center justify-between gap-2 group ${
                  copiedIndex === idx
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800 font-medium'
                    : 'bg-gray-50/80 hover:bg-gray-100/80 border-gray-200 text-gray-700'
                }`}
                title="Click to copy into composer"
              >
                <span className="truncate">{reply}</span>
                <span className="text-[10px] text-gray-400 group-hover:text-primary-600 shrink-0 font-mono">
                  {copiedIndex === idx ? '✓ Copied' : 'Copy'}
                </span>
              </button>
            ))}
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

