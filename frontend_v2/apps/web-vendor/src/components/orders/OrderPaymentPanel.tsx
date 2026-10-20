import { useEffect, useState } from 'react';
import { Badge, Button, Card } from '@chatlogix/ui';
import toast from 'react-hot-toast';
import type { Order } from '../conversations/types';
import { formatAmountWithSymbol, formatWalletAmount } from '../../utils/currency';
import { formatDateTime } from '../../utils/dateFormatting';
import { getErrorMessage } from '../../utils/errorHandling';
import {
  derivePaymentBadge,
  isCashBadge,
  isCashCollected,
  orderCashCollectedAt,
  orderPaymentReference,
  orderUpiPayeeName,
  orderUpiSentAt,
  paymentBadgeLabel,
  paymentBadgeVariant,
  type PaymentBadge,
} from '../../utils/orderPayment';
import { orderService } from '../../services/orderService';
import { orderPayments } from '../../services/orderPayments';
import { paymentLinkService } from '../../services/paymentLinks';
import { createShopFundingIntent, requestOrderRefund } from '../../lib/refunds';
import { openRazorpayCheckout } from '../../lib/razorpayCheckout';
import { CollectPaymentChoices, type PayChoice } from './CollectPaymentChoices';

export interface ShopPaySettings {
  paymentsManagedByChatlogix: boolean;
  upiVpa: string | null;
  upiPayeeName: string | null;
}

interface OrderPaymentPanelProps {
  order: Order;
  settings: ShopPaySettings | null;
  settingsLoaded: boolean;
  onOrderUpdated: (order: Order) => void;
  onViewConversation?: () => void;
}

interface UpiSendResult {
  payeeName: string;
  upiVpa: string;
  amountPaise: number;
  tapToPayUrl?: string;
}

function defaultChoice(order: Order, settings: ShopPaySettings | null): PayChoice {
  const badge = derivePaymentBadge(order);
  const razorpayReady = !!settings?.paymentsManagedByChatlogix;
  const gpayReady = !!(settings?.upiVpa?.trim() && settings?.upiPayeeName?.trim());
  if (badge === 'upi_sent' || orderUpiSentAt(order)) return 'gpay';
  if ((badge === 'link_sent' || order.payment?.paymentLinkUrl) && razorpayReady) return 'razorpay';
  if (isCashBadge(badge) || (order.paymentMethod ?? '').toLowerCase() === 'cod') return 'cash';
  if (razorpayReady) return 'razorpay';
  if (gpayReady) return 'gpay';
  return 'cash';
}

function paidOnline(order: Order): boolean {
  return derivePaymentBadge(order) === 'paid_online';
}

function paymentStatusHint(badge: PaymentBadge): string | null {
  switch (badge) {
    case 'unpaid':
      return 'Choose how the customer pays below.';
    case 'link_sent':
      return 'Waiting for payment on the Razorpay link.';
    case 'upi_sent':
      return 'Waiting for payment to your UPI. Confirm when it lands in your account.';
    case 'payment_initiated':
      return 'Customer may have paid — verify and confirm below.';
    case 'cod':
    case 'cash_on_delivery':
      return 'Collect cash from the customer, then confirm below.';
    default:
      return null;
  }
}

function confirmPaymentButtonLabel(choice: PayChoice): string {
  if (choice === 'cash') return 'Confirm cash collected';
  return 'Confirm UPI payment received';
}

export function OrderPaymentPanel({
  order,
  settings,
  settingsLoaded,
  onOrderUpdated,
  onViewConversation,
}: OrderPaymentPanelProps) {
  const [choice, setChoice] = useState<PayChoice>('cash');
  const [busyAction, setBusyAction] = useState<'send' | 'receive' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [lastUpi, setLastUpi] = useState<UpiSendResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedTap, setCopiedTap] = useState(false);
  const [tapToPayUrl, setTapToPayUrl] = useState<string | null>(null);
  const [receivedOpen, setReceivedOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [dismissedAlertId, setDismissedAlertId] = useState<string | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);
  const [awaitingFundingRefundId, setAwaitingFundingRefundId] = useState<string | null>(null);

  useEffect(() => {
    if (!settingsLoaded) return;
    setChoice(defaultChoice(order, settings));
    setReceivedOpen(false);
    setReference('');
    setDismissedAlertId(null);
    setLastLink(null);
    setLastUpi(null);
    setTapToPayUrl(null);
    setError(null);
    // Re-seed only when opening a different order, or when settings first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, settingsLoaded]);

  const badge = derivePaymentBadge(order);
  const amountLabel = formatAmountWithSymbol(order.totalAmount ?? 0);
  const razorpayReady = !!settings?.paymentsManagedByChatlogix;
  const gpayReady = !!(settings?.upiVpa?.trim() && settings?.upiPayeeName?.trim());
  const collected = isCashCollected(order);
  const online = paidOnline(order);
  const linkUrl = order.payment?.paymentLinkUrl || lastLink;
  const showLink = Boolean(linkUrl) && !online && !collected;
  const upiSentAt = orderUpiSentAt(order);
  const showUpi =
    !online && !collected && (badge === 'upi_sent' || !!upiSentAt || !!lastUpi);

  useEffect(() => {
    if (!showUpi || tapToPayUrl || lastUpi?.tapToPayUrl) return;
    let cancelled = false;
    void orderPayments.getTapToPayUrl(order.id).then(
      (res) => {
        if (!cancelled) setTapToPayUrl(res.tapToPayUrl);
      },
      () => {
        /* order may no longer be eligible */
      }
    );
    return () => {
      cancelled = true;
    };
  }, [order.id, showUpi, tapToPayUrl, lastUpi?.tapToPayUrl]);

  const payeeName = lastUpi?.payeeName || orderUpiPayeeName(order) || settings?.upiPayeeName || null;
  const upiVpa = lastUpi?.upiVpa || settings?.upiVpa || null;
  const alert = order.paymentInitiatedAlert;
  const showAlert = !!alert && dismissedAlertId !== alert.id && !online && !collected;
  const cashAlready = isCashBadge(badge) || (order.paymentMethod ?? '').toLowerCase() === 'cod';
  const openLink = showLink;

  const refresh = async () => {
    const fresh = await orderService.getOrderDetails(order.id);
    onOrderUpdated(fresh);
  };

  const handleDismissAlert = async (alertId: string) => {
    setBusyAction('dismiss');
    setError(null);
    try {
      await orderPayments.dismissPaymentAlert(order.id, alertId);
      setDismissedAlertId(alertId);
      await refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const send = async () => {
    if (choice !== 'razorpay' && openLink) {
      const confirmed = window.confirm('The open Razorpay link will be cancelled. Continue?');
      if (!confirmed) return;
    }

    setBusyAction('send');
    setError(null);
    try {
      if (choice === 'razorpay') {
        const result = await paymentLinkService.generatePaymentLink(order.id, true);
        if (!result.success || !result.paymentLink) {
          setError(result.success ? 'Failed to generate payment link' : result.error);
          return;
        }
        setLastLink(result.paymentLink);
        setLastUpi(null);
      } else if (choice === 'gpay') {
        const result = await orderPayments.sendUpiQr(order.id);
        setLastUpi({
          payeeName: result.payeeName,
          upiVpa: result.upiVpa,
          amountPaise: result.amountPaise,
          tapToPayUrl: result.tapToPayUrl,
        });
        setTapToPayUrl(result.tapToPayUrl);
        setLastLink(null);
      } else {
        await orderPayments.switchToCod(order.id);
        setLastLink(null);
      }
      await refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const markReceived = async () => {
    setBusyAction('receive');
    setError(null);
    try {
      const trimmed = reference.trim();
      const vendorCollected = choice === 'gpay';
      await orderPayments.markCashCollected(order.id, {
        ...(vendorCollected ? { paymentMethod: 'vendor_collected' as const } : {}),
        ...(trimmed ? { reference: trimmed } : {}),
      });
      setReceivedOpen(false);
      setReference('');
      await refresh();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  const copyLink = async () => {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy the payment link.');
    }
  };

  const activeTapUrl = tapToPayUrl || lastUpi?.tapToPayUrl || null;

  const copyTapToPay = async () => {
    if (!activeTapUrl) return;
    try {
      await navigator.clipboard.writeText(activeTapUrl);
      setCopiedTap(true);
      window.setTimeout(() => setCopiedTap(false), 2000);
    } catch {
      setError('Could not copy tap-to-pay link.');
    }
  };

  const refundedPaise = order.payment?.refundedPaise ?? 0;
  const capturedPaise = order.payment?.amountPaise ?? 0;
  const refundRemainderPaise = capturedPaise > 0 ? capturedPaise - refundedPaise : 0;
  const canRefund = online && refundRemainderPaise > 0;

  const handleRefund = async () => {
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
        setAwaitingFundingRefundId(null);
        await refresh();
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setRefundBusy(false);
    }
  };

  const handleShopFunding = async () => {
    if (!awaitingFundingRefundId) return;
    setRefundBusy(true);
    try {
      const intent = await createShopFundingIntent(awaitingFundingRefundId);
      await openRazorpayCheckout({
        keyId: intent.clientAction.keyId,
        orderId: intent.clientAction.orderId,
        amountPaise: intent.clientAction.amountPaise,
        description: 'Fund refund to customer',
      });
      toast.success('Payment received — finishing your refund…');
      setAwaitingFundingRefundId(null);
      await refresh();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err));
    } finally {
      setRefundBusy(false);
    }
  };

  const loadingReason = settingsLoaded ? undefined : 'Loading payment settings…';
  const options = [
    {
      id: 'razorpay' as const,
      title: 'Razorpay link',
      description: 'Customer pays ChatLogix. The order marks itself paid.',
      disabled: !settingsLoaded || !razorpayReady,
      disabledReason: !settingsLoaded
        ? loadingReason
        : razorpayReady
          ? undefined
          : 'ChatLogix collection is off.',
      linkToSettings: settingsLoaded && !razorpayReady,
    },
    {
      id: 'gpay' as const,
      title: 'GPay / UPI',
      description: 'Customer pays your UPI. You mark it received.',
      disabled: !settingsLoaded || !gpayReady,
      disabledReason: !settingsLoaded
        ? loadingReason
        : gpayReady
          ? undefined
          : 'Add a UPI ID and the name shown in GPay.',
      linkToSettings: settingsLoaded && !gpayReady,
    },
    {
      id: 'cash' as const,
      title: 'Cash on delivery',
      description: 'No link. You mark the cash collected.',
      disabled: false,
    },
  ];

  const selected = options.find((option) => option.id === choice);
  const sending = busyAction === 'send';
  const receiving = busyAction === 'receive';
  const upiAlreadySent = showUpi || !!upiSentAt || badge === 'upi_sent';
  const sendLabel =
    choice === 'razorpay'
      ? showLink
        ? 'Resend link on WhatsApp'
        : 'Send payment link on WhatsApp'
      : choice === 'gpay'
        ? upiAlreadySent
          ? 'Resend QR & tap-to-pay on WhatsApp'
          : 'Send QR & tap-to-pay on WhatsApp'
        : 'Switch order to cash on delivery';
  const showSend = !(choice === 'cash' && cashAlready);
  const showReceived = !online && !collected && (choice === 'gpay' || choice === 'cash');
  const collectedHeading =
    (order.paymentMethod ?? '').toLowerCase() === 'cod' || isCashBadge(badge) ? 'Cash collected' : 'Paid to shop';
  const collectedAt = orderCashCollectedAt(order);
  const collectedReference = orderPaymentReference(order);
  const statusHint = paymentStatusHint(badge);

  return (
    <Card title="Payment" className="!p-3 sm:!p-4">
      <div className="space-y-3">
        {online ? (
          <PaidOnline
            order={order}
            amountLabel={amountLabel}
            refundedPaise={refundedPaise}
            canRefund={canRefund}
            refundBusy={refundBusy}
            awaitingFunding={!!awaitingFundingRefundId}
            onRefund={() => void handleRefund()}
            onFund={() => void handleShopFunding()}
          />
        ) : collected ? (
          <div className="space-y-1">
            <p className="text-sm font-medium text-gray-900">
              {collectedHeading} · {amountLabel}
            </p>
            {collectedAt && <p className="text-xs text-gray-500">{formatDateTime(collectedAt)}</p>}
            {collectedReference && (
              <p className="text-xs text-gray-500">Reference: {collectedReference}</p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={paymentBadgeVariant(badge)}>{paymentBadgeLabel(badge)}</Badge>
                <span className="text-base font-semibold text-gray-900 tabular-nums">{amountLabel}</span>
              </div>
              {statusHint && <p className="text-xs text-gray-500">{statusHint}</p>}
            </div>

            {showReceived && !receivedOpen && (
              <Button
                variant="secondary"
                className="w-full"
                disabled={busyAction !== null}
                onClick={() => setReceivedOpen(true)}
              >
                {confirmPaymentButtonLabel(choice)}
              </Button>
            )}

            {showReceived && receivedOpen && (
              <form
                className="space-y-2 rounded-lg border border-gray-200 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void markReceived();
                }}
              >
                <label className="block text-sm">
                  <span className="text-gray-700">Amount</span>
                  <input
                    readOnly
                    value={amountLabel}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700">
                    Reference <span className="text-gray-500">(optional)</span>
                  </span>
                  <input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    maxLength={80}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <Button
                  variant="primary"
                  type="submit"
                  className="w-full"
                  disabled={busyAction !== null}
                  isLoading={receiving}
                >
                  {confirmPaymentButtonLabel(choice)}
                </Button>
              </form>
            )}

            {showAlert && alert && (
              <div className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2">
                <p className="text-sm font-medium text-warning-800">Customer sent a payment screenshot</p>
                <p className="mt-0.5 text-xs text-warning-800">{formatDateTime(alert.createdAt)}</p>
                <div className="mt-2 flex gap-3">
                  {onViewConversation && (
                    <button
                      type="button"
                      className="text-sm font-medium text-primary-500 hover:underline"
                      onClick={onViewConversation}
                    >
                      View conversation
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-sm text-gray-600 hover:text-gray-900"
                    disabled={busyAction === 'dismiss'}
                    onClick={() => void handleDismissAlert(alert.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {showLink && linkUrl && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <p className="text-xs font-medium text-gray-700">Payment link</p>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    readOnly
                    value={linkUrl}
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900"
                  />
                  <Button type="button" variant="ghost" size="sm" className="shrink-0 border border-gray-300" onClick={() => void copyLink()}>
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            )}

            {showUpi && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                <p className="font-medium text-gray-900">GPay QR sent</p>
                <p>{formatAmountWithSymbol(lastUpi?.amountPaise ?? order.totalAmount ?? 0)}</p>
                {payeeName && <p>{payeeName}</p>}
                {upiVpa && <p className="text-xs text-gray-500">{upiVpa}</p>}
                {upiSentAt && <p className="text-xs text-gray-500">{formatDateTime(upiSentAt)}</p>}
                {activeTapUrl && (
                  <div className="mt-2 border-t border-gray-200 pt-2">
                    <p className="text-xs font-medium text-gray-700">Tap-to-pay link (customer chooses UPI app)</p>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        readOnly
                        value={activeTapUrl}
                        className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 border border-gray-300"
                        onClick={() => void copyTapToPay()}
                      >
                        {copiedTap ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <CollectPaymentChoices
              name={`collect-${order.id}`}
              value={choice}
              options={options}
              onChange={setChoice}
            />

            {choice !== 'razorpay' && openLink && (
              <p className="text-xs text-gray-500">Sending this cancels the open Razorpay link.</p>
            )}

            {showSend && (
              <Button
                variant={choice === 'gpay' && upiAlreadySent ? 'ghost' : 'primary'}
                className={
                  choice === 'gpay' && upiAlreadySent
                    ? 'w-full border border-primary-500 text-primary-500 hover:bg-primary-50'
                    : 'w-full'
                }
                disabled={!selected || selected.disabled || busyAction !== null}
                isLoading={sending}
                onClick={() => void send()}
              >
                {sendLabel}
              </Button>
            )}

          </>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Card>
  );
}

function PaidOnline({
  order,
  amountLabel,
  refundedPaise,
  canRefund,
  refundBusy,
  awaitingFunding,
  onRefund,
  onFund,
}: {
  order: Order;
  amountLabel: string;
  refundedPaise: number;
  canRefund: boolean;
  refundBusy: boolean;
  awaitingFunding: boolean;
  onRefund: () => void;
  onFund: () => void;
}) {
  const net = order.payment?.netMilli;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-900">Paid online · {amountLabel}</p>
      {net != null && net !== '' && (
        <p className="text-sm text-gray-700">Settlement net {formatWalletAmount(Number(net))}</p>
      )}
      {order.payment?.transferStatus && (
        <p className="text-xs text-gray-500">
          Transfer: {order.payment.transferStatus.replaceAll('_', ' ')}
        </p>
      )}
      {refundedPaise > 0 && (
        <p className="text-xs text-gray-500">Refunded so far: {formatAmountWithSymbol(refundedPaise)}</p>
      )}
      {canRefund && (
        <button
          type="button"
          disabled={refundBusy}
          onClick={onRefund}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {refundBusy ? 'Working…' : 'Refund customer'}
        </button>
      )}
      {awaitingFunding && (
        <Button variant="primary" className="w-full" disabled={refundBusy} onClick={onFund}>
          Add funds to send refund
        </Button>
      )}
    </div>
  );
}
