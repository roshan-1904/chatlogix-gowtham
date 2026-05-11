import { useState } from 'react';
import { Modal, Button } from '@chatlogix/ui';
import { formatAmountWithSymbol } from '../../../utils/currency';
import { paymentLinkService } from '../../../services/paymentLinks';

interface PaymentLinkModalProps {
  orderId: string;
  orderAmount: number;
  customerPhone: string;
  paymentLink?: string;
  isOpen: boolean;
  onClose: () => void;
  onLinkGenerated: (link: string) => void;
}

export function PaymentLinkModal({
  orderId,
  orderAmount,
  customerPhone,
  paymentLink,
  isOpen,
  onClose,
  onLinkGenerated,
}: PaymentLinkModalProps) {
  const [link, setLink] = useState<string | null>(paymentLink || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateLink = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await paymentLinkService.generatePaymentLink(
        orderId,
        orderAmount,
        customerPhone
      );
      if (result.success && result.paymentLink) {
        setLink(result.paymentLink);
        onLinkGenerated(result.paymentLink);
      } else {
        setError(result.error || 'Failed to generate payment link');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to generate payment link';
      setError(errorMessage);
      console.error('Failed to generate payment link:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleSendViaWhatsApp = async () => {
    if (!link) return;
    setIsSending(true);
    setError(null);
    try {
      const result = await paymentLinkService.sendPaymentLink(
        orderId,
        link,
        customerPhone
      );
      if (result.success) {
        // Show success message
        console.log('Payment link sent via WhatsApp');
        onClose(); // Close modal on success
      } else {
        setError(result.error || 'Failed to send payment link');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to send payment link';
      setError(errorMessage);
      console.error('Failed to send payment link:', error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Payment Link"
      size="md"
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {!link ? (
          <>
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Generate a payment link for this order. The customer will receive the link via WhatsApp.
              </p>
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="text-sm text-gray-700 mb-1">Order Amount</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatAmountWithSymbol(orderAmount)}
                </div>
              </div>
            </div>
            <Button
              variant="primary"
              onClick={handleGenerateLink}
              isLoading={isGenerating}
              className="w-full"
            >
              Generate Payment Link
            </Button>
          </>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Payment Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={link}
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
                />
                <Button
                  variant="secondary"
                  onClick={handleCopyLink}
                  size="sm"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* QR Code Placeholder */}
            <div className="bg-gray-100 p-8 rounded-lg text-center">
              <div className="text-gray-400 text-sm">QR Code Placeholder</div>
              <div className="text-xs text-gray-400 mt-2">
                QR code generation coming soon
              </div>
            </div>

            <div className="space-y-2">
              <Button
                variant="primary"
                onClick={handleSendViaWhatsApp}
                isLoading={isSending}
                className="w-full"
              >
                Send via WhatsApp
              </Button>
              <Button
                variant="secondary"
                onClick={onClose}
                className="w-full"
              >
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

