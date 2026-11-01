import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Modal } from '@chatlogix/ui';
import {
  getVendorWhatsAppNumbers,
  mapVendorWhatsAppNumber,
  WhatsAppAlreadyMappedError,
  type AdminWhatsAppNumber,
} from '../../lib/vendors';

interface WhatsAppCardProps {
  vendorId: string;
  businessName: string;
}

function formatStatusBadge(status: string | null | undefined): {
  label: string;
  variant: 'default' | 'success' | 'warning' | 'info';
} {
  switch (status) {
    case 'live':
      return { label: 'Live', variant: 'success' };
    case 'credit_attached':
      return { label: 'Credit Attached', variant: 'info' };
    case 'meta_in_progress':
      return { label: 'In Progress', variant: 'info' };
    case 'not_started':
      return { label: 'Not Started', variant: 'default' };
    case 'disconnected':
      return { label: 'Disconnected', variant: 'default' };
    case 'error':
      return { label: 'Error', variant: 'warning' };
    default:
      return { label: status || 'Unknown', variant: 'default' };
  }
}

export function WhatsAppCard({ vendorId, businessName }: WhatsAppCardProps) {
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successFeedback, setSuccessFeedback] = useState<string | null>(null);

  // Collision state when HTTP 409 already_mapped is returned
  const [collisionInfo, setCollisionInfo] = useState<{
    currentVendorId?: string;
    currentVendorName?: string | null;
  } | null>(null);

  // Reset all state when vendor selection changes
  useEffect(() => {
    setIsModalOpen(false);
    setPhoneNumberId('');
    setWabaId('');
    setFormError(null);
    setSuccessFeedback(null);
    setCollisionInfo(null);
  }, [vendorId]);

  const numbersQuery = useQuery({
    queryKey: ['admin-vendor', vendorId, 'whatsapp-numbers'],
    queryFn: () => getVendorWhatsAppNumbers(vendorId),
  });

  const mapMutation = useMutation({
    mutationFn: async ({
      phoneId,
      waba,
      confirmMove,
    }: {
      phoneId: string;
      waba: string;
      confirmMove?: boolean;
    }) => {
      return mapVendorWhatsAppNumber(vendorId, {
        phoneNumberId: phoneId,
        wabaId: waba,
        confirmMove,
      });
    },
    onSuccess: (mappedNumber) => {
      setIsModalOpen(false);
      setPhoneNumberId('');
      setWabaId('');
      setFormError(null);
      setCollisionInfo(null);
      setSuccessFeedback(
        `Successfully mapped WhatsApp Phone Number ID ${mappedNumber.phoneNumberId} to ${businessName}.`
      );
      void queryClient.invalidateQueries({
        queryKey: ['admin-vendor', vendorId, 'whatsapp-numbers'],
      });
    },
    onError: (err: unknown) => {
      if (err instanceof WhatsAppAlreadyMappedError) {
        setCollisionInfo({
          currentVendorId: err.currentVendorId,
          currentVendorName: err.currentVendorName,
        });
        setFormError(null);
      } else {
        const message =
          err instanceof Error ? err.message : 'Failed to map WhatsApp number. Please retry.';
        setFormError(message);
      }
    },
  });

  const handleOpenModal = () => {
    setSuccessFeedback(null);
    setFormError(null);
    setCollisionInfo(null);
    setPhoneNumberId('');
    setWabaId('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (mapMutation.isPending) return;
    setIsModalOpen(false);
    setFormError(null);
    setCollisionInfo(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessFeedback(null);

    const trimmedPhoneId = phoneNumberId.trim();
    const trimmedWabaId = wabaId.trim();

    if (!trimmedPhoneId) {
      setFormError('Phone Number ID is required.');
      return;
    }
    if (!trimmedWabaId) {
      setFormError('WABA ID is required.');
      return;
    }

    mapMutation.mutate({
      phoneId: trimmedPhoneId,
      waba: trimmedWabaId,
      confirmMove: false,
    });
  };

  const handleConfirmMove = () => {
    const trimmedPhoneId = phoneNumberId.trim();
    const trimmedWabaId = wabaId.trim();

    if (!trimmedPhoneId || !trimmedWabaId) return;

    mapMutation.mutate({
      phoneId: trimmedPhoneId,
      waba: trimmedWabaId,
      confirmMove: true,
    });
  };

  const handleCancelMove = () => {
    setCollisionInfo(null);
  };

  const numbers = numbersQuery.data ?? [];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#072349]">WhatsApp integration</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            WhatsApp Cloud API credentials mapped to this vendor.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleOpenModal}>
          Map number
        </Button>
      </div>

      {successFeedback && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          {successFeedback}
        </div>
      )}

      {numbersQuery.isLoading && (
        <p className="mt-4 text-sm text-gray-500">Loading WhatsApp numbers…</p>
      )}

      {numbersQuery.isError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <span>Could not load WhatsApp numbers.</span>
          <button
            type="button"
            onClick={() => void numbersQuery.refetch()}
            className="ml-2 font-semibold underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      )}

      {!numbersQuery.isLoading && !numbersQuery.isError && numbers.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center">
          <p className="text-sm text-gray-500">No WhatsApp numbers connected yet.</p>
          <p className="mt-1 text-xs text-gray-400">
            Map a Meta WhatsApp Phone Number ID and WABA ID to route customer chats here.
          </p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={handleOpenModal}>
              Map number
            </Button>
          </div>
        </div>
      )}

      {numbers.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-100">
          {numbers.map((wa: AdminWhatsAppNumber) => {
            const badge = formatStatusBadge(wa.connectStatus);
            return (
              <li key={wa.id} className="py-3.5 first:pt-1 last:pb-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {wa.displayName || wa.displayPhone || 'WhatsApp Number'}
                      </span>
                      {wa.displayPhone && wa.displayName && (
                        <span className="text-xs text-gray-500">({wa.displayPhone})</span>
                      )}
                    </div>
                    <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-gray-600 sm:grid-cols-2">
                      <div className="flex items-center gap-1.5">
                        <dt className="text-gray-400">Phone Number ID:</dt>
                        <dd className="font-mono text-gray-800">{wa.phoneNumberId}</dd>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <dt className="text-gray-400">WABA ID:</dt>
                        <dd className="font-mono text-gray-800">{wa.wabaId}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                </div>

                {/* Connection details / timestamps */}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
                  {wa.connectedAt && (
                    <span>
                      Connected:{' '}
                      <time dateTime={wa.connectedAt}>
                        {new Date(wa.connectedAt).toLocaleString('en-IN')}
                      </time>
                    </span>
                  )}
                  {wa.liveAt && (
                    <span>
                      Live:{' '}
                      <time dateTime={wa.liveAt}>
                        {new Date(wa.liveAt).toLocaleString('en-IN')}
                      </time>
                    </span>
                  )}
                  {wa.connectPath && <span>Path: {wa.connectPath}</span>}
                </div>

                {/* Error details if present */}
                {(wa.lastErrorCode || wa.lastErrorMessage) && (
                  <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                    <p className="font-medium">
                      Meta Error {wa.lastErrorCode ? `(${wa.lastErrorCode})` : ''}:
                    </p>
                    <p className="mt-0.5 text-amber-700">
                      {wa.lastErrorMessage || 'An error occurred during WhatsApp connection.'}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Map WhatsApp Number Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={collisionInfo ? 'Confirm number move' : 'Map WhatsApp number'}
      >
        {collisionInfo ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <p className="font-semibold text-sm text-amber-900">
                Number already assigned to another shop
              </p>
              <p className="mt-2 text-sm text-amber-800">
                This number id is on{' '}
                <strong className="font-semibold text-amber-950">
                  {collisionInfo.currentVendorName || 'another shop'}
                </strong>
                . Move it here?
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Target shop: <span className="font-medium">{businessName}</span>
              </p>
            </div>

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancelMove}
                disabled={mapMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmMove}
                isLoading={mapMutation.isPending}
              >
                Confirm move
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-gray-500">
              Enter the Meta WhatsApp Phone Number ID and WhatsApp Business Account (WABA) ID for{' '}
              <strong className="font-medium text-gray-800">{businessName}</strong>.
            </p>

            <div>
              <label
                htmlFor="wa-phone-number-id"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                Phone Number ID
              </label>
              <input
                id="wa-phone-number-id"
                type="text"
                placeholder="e.g. 108923485729102"
                value={phoneNumberId}
                onChange={(e) => {
                  setPhoneNumberId(e.target.value);
                  setFormError(null);
                }}
                disabled={mapMutation.isPending}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 disabled:bg-gray-100"
              />
              <p className="mt-0.5 text-[11px] text-gray-400">
                Meta Graph API phone_number_id (numeric ID)
              </p>
            </div>

            <div>
              <label
                htmlFor="wa-waba-id"
                className="block text-xs font-semibold uppercase tracking-wider text-gray-500"
              >
                WABA ID
              </label>
              <input
                id="wa-waba-id"
                type="text"
                placeholder="e.g. 209384756192837"
                value={wabaId}
                onChange={(e) => {
                  setWabaId(e.target.value);
                  setFormError(null);
                }}
                disabled={mapMutation.isPending}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 disabled:bg-gray-100"
              />
              <p className="mt-0.5 text-[11px] text-gray-400">
                WhatsApp Business Account ID
              </p>
            </div>

            {formError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseModal}
                disabled={mapMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={mapMutation.isPending}
                disabled={mapMutation.isPending || !phoneNumberId.trim() || !wabaId.trim()}
              >
                Map number
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </Card>
  );
}
