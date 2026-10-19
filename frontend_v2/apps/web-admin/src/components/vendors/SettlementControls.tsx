import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@chatlogix/ui';
import {
  formatSettlementMilli,
  freezeVendorReleases,
  getAdminSettlementView,
  setVendorRollingReserve,
  unfreezeVendorReleases,
} from '../../lib/vendors';

interface SettlementControlsProps {
  vendorId: string;
}

export function SettlementControls({ vendorId }: SettlementControlsProps) {
  const queryClient = useQueryClient();
  const [freezeReason, setFreezeReason] = useState('');
  const [reserveBps, setReserveBps] = useState('');

  const viewQuery = useQuery({
    queryKey: ['admin-settlement', vendorId],
    queryFn: () => getAdminSettlementView(vendorId),
  });

  const freezeMutation = useMutation({
    mutationFn: () => freezeVendorReleases(vendorId, freezeReason),
    onSuccess: () => {
      setFreezeReason('');
      void queryClient.invalidateQueries({ queryKey: ['admin-settlement', vendorId] });
    },
  });

  const unfreezeMutation = useMutation({
    mutationFn: () => unfreezeVendorReleases(vendorId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-settlement', vendorId] }),
  });

  const reserveMutation = useMutation({
    mutationFn: () => setVendorRollingReserve(vendorId, Number(reserveBps)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-settlement', vendorId] }),
  });

  const position = viewQuery.data?.position;

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-[#072349]">Order settlement (Route)</h3>
      {viewQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {position && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">On hold</dt>
            <dd className="mt-1 text-lg font-semibold text-[#072349]">{formatSettlementMilli(position.heldMilli)}</dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">In reserve</dt>
            <dd className="mt-1 text-lg font-semibold text-[#072349]">
              {formatSettlementMilli(position.reserveMilli)}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Released to bank</dt>
            <dd className="mt-1 text-lg font-semibold text-[#072349]">
              {formatSettlementMilli(position.releasedMilli)}
            </dd>
          </div>
          <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3 sm:col-span-2">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Shop owes ChatLogix</dt>
            <dd className="mt-1 text-lg font-semibold text-red-700">{formatSettlementMilli(position.owedMilli)}</dd>
          </div>
          <div className="rounded-lg border border-primary-100 bg-primary-50/50 p-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Rolling reserve</dt>
            <dd className="mt-1 text-lg font-semibold text-[#072349]">
              {(viewQuery.data?.rollingReserveBps ?? 0) / 100}%
            </dd>
          </div>
        </dl>
      )}
      {viewQuery.data?.releasesFrozenAt && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Releases frozen: {viewQuery.data.releasesFrozenReason ?? 'no reason'}
        </p>
      )}
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm flex-1 min-w-[12rem]">
          <span className="text-gray-600">Freeze reason</span>
          <input
            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5"
            value={freezeReason}
            onChange={(e) => setFreezeReason(e.target.value)}
          />
        </label>
        <Button type="button" size="sm" disabled={!freezeReason.trim()} onClick={() => freezeMutation.mutate()}>
          Freeze releases
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => unfreezeMutation.mutate()}>
          Unfreeze
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="text-sm">
          <span className="text-gray-600">Rolling reserve (bps)</span>
          <input
            className="mt-1 w-28 border border-gray-300 rounded-lg px-2 py-1.5"
            value={reserveBps}
            onChange={(e) => setReserveBps(e.target.value)}
            placeholder={String(viewQuery.data?.rollingReserveBps ?? 0)}
          />
        </label>
        <Button type="button" size="sm" onClick={() => reserveMutation.mutate()}>
          Set reserve
        </Button>
      </div>
    </div>
  );
}
