import { useState } from 'react';
import { Modal, Button } from '@chatlogix/ui';
import type { Order } from '../../conversations/types';
import { shippingService, type ShippingData } from '../../../services/shipping';

interface ShippingModalProps {
  orderId: string;
  order: Order;
  isOpen: boolean;
  onClose: () => void;
  onShipmentCreated: (shipmentId: string, trackingNumber: string) => void;
}

export function ShippingModal({
  orderId,
  order,
  isOpen,
  onClose,
  onShipmentCreated,
}: ShippingModalProps) {
  const [shippingPartner, setShippingPartner] = useState<'shiprocket' | 'delhivery' | 'self'>('shiprocket');
  const [weight, setWeight] = useState<string>('1');
  const [isCreating, setIsCreating] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreateShipment = async () => {
    setIsCreating(true);
    setError(null);
    try {
      const shippingData: ShippingData = {
        deliveryAddress: order.deliveryAddress || '',
        customerPhone: order.customer?.phone || '',
        customerName: order.customer?.id,
        weight: parseFloat(weight) || 1,
        shippingPartner,
      };

      const result = await shippingService.createShipment(orderId, shippingData);
      if (result.success && result.trackingNumber) {
        setTrackingNumber(result.trackingNumber);
        onShipmentCreated(result.shipmentId || '', result.trackingNumber);
      } else {
        setError(result.error || 'Failed to create shipment');
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to create shipment';
      setError(errorMessage);
      console.error('Failed to create shipment:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Shipment"
      size="lg"
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
        {!trackingNumber ? (
          <>
            {/* Shipping Partner Selection */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Shipping Partner
              </label>
              <div className="space-y-2">
                <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="partner"
                    value="shiprocket"
                    checked={shippingPartner === 'shiprocket'}
                    onChange={(e) => setShippingPartner(e.target.value as 'shiprocket')}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Shiprocket</div>
                    <div className="text-xs text-gray-500">Recommended for most orders</div>
                  </div>
                </label>
                <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="partner"
                    value="delhivery"
                    checked={shippingPartner === 'delhivery'}
                    onChange={(e) => setShippingPartner(e.target.value as 'delhivery')}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Delhivery</div>
                    <div className="text-xs text-gray-500">Alternative shipping partner</div>
                  </div>
                </label>
                <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="radio"
                    name="partner"
                    value="self"
                    checked={shippingPartner === 'self'}
                    onChange={(e) => setShippingPartner(e.target.value as 'self')}
                    className="mr-3"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Self Delivery</div>
                    <div className="text-xs text-gray-500">Handle delivery yourself</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Delivery Address */}
            {order.deliveryAddress && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Delivery Address
                </label>
                <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-900">
                  {order.deliveryAddress}
                </div>
              </div>
            )}

            {/* Package Weight */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Package Weight (kg)
              </label>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                min="0.1"
                step="0.1"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="1.0"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <Button
                variant="primary"
                onClick={handleCreateShipment}
                isLoading={isCreating}
                className="flex-1"
              >
                Create Shipment
              </Button>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="text-sm font-medium text-green-900 mb-2">
                Shipment Created Successfully!
              </div>
              <div className="text-sm text-green-700">
                Tracking Number: <span className="font-mono font-semibold">{trackingNumber}</span>
              </div>
            </div>
            <Button variant="primary" onClick={onClose} className="w-full">
              Close
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}

