import { useEffect, useRef, useState } from 'react';
import { Badge } from '@chatlogix/ui';
import { IconChevronDown } from '../icons';
import type { Order } from '../conversations/types';
import { formatPhone } from '../../lib/format';
import { formatAmountWithSymbol } from '../../utils/currency';
import { formatDateTime, formatOrderWhen } from '../../utils/dateFormatting';
import { getItemsSummary } from '../../utils/orderParsing';
import { statusColors, statusLabels } from '../../utils/orderConstants';
import {
  canCancelOrder,
  derivePaymentBadge,
  listNextStep,
  paymentBadgeLabel,
  paymentBadgeVariant,
} from '../../utils/orderPayment';

interface OrderTableProps {
  orders: Order[];
  viewMode: 'table' | 'card';
  busyOrderId: string | null;
  onOpen: (orderId: string) => void;
  onAdvance: (orderId: string, nextStatus: string) => void;
  onCancel: (orderId: string) => void;
}

export function OrderTable({ orders, viewMode, busyOrderId, onOpen, onAdvance, onCancel }: OrderTableProps) {
  if (viewMode === 'card') {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            busy={busyOrderId === order.id}
            onOpen={onOpen}
            onAdvance={onAdvance}
            onCancel={onCancel}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[80rem] table-fixed text-sm">
        <caption className="sr-only">Orders</caption>
        <colgroup>
          <col style={{ width: '22%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '13%' }} />
        </colgroup>
        <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
          <tr>
            <th scope="col" className="px-3 py-2">Order</th>
            <th scope="col" className="px-3 py-2">Customer</th>
            <th scope="col" className="px-3 py-2">Payment</th>
            <th scope="col" className="px-3 py-2">Fulfillment</th>
            <th scope="col" className="px-3 py-2">Amount</th>
            <th scope="col" className="px-3 py-2">When</th>
            <th scope="col" className="px-3 py-2">
              <span className="sr-only">Next step</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              busy={busyOrderId === order.id}
              onOpen={onOpen}
              onAdvance={onAdvance}
              onCancel={onCancel}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrderRow({
  order,
  busy,
  onOpen,
  onAdvance,
  onCancel,
}: {
  order: Order;
  busy: boolean;
  onOpen: (orderId: string) => void;
  onAdvance: (orderId: string, nextStatus: string) => void;
  onCancel: (orderId: string) => void;
}) {
  const summary = getItemsSummary(order.items, 2);
  const payment = derivePaymentBadge(order);

  return (
    <tr className="cursor-pointer hover:bg-gray-50" onClick={() => onOpen(order.id)}>
      <td className="overflow-hidden px-3 py-3 align-middle">
        <div className="truncate font-medium text-gray-900">#{order.orderNumber}</div>
        <div className="truncate text-xs text-gray-500" title={summary}>
          {summary}
        </div>
      </td>
      <td className="overflow-hidden px-3 py-3 align-middle whitespace-nowrap">
        {order.customer?.phone ? (
          <a
            href={`tel:${order.customer.phone}`}
            className="text-primary-500 hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {formatPhone(order.customer.phone)}
          </a>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-3 py-3 align-middle whitespace-nowrap">
        <Badge variant={paymentBadgeVariant(payment)}>{paymentBadgeLabel(payment)}</Badge>
      </td>
      <td className="px-3 py-3 align-middle whitespace-nowrap">
        <Badge variant={statusColors[order.status] || 'default'}>
          {statusLabels[order.status] || order.status}
        </Badge>
      </td>
      <td className="px-3 py-3 align-middle whitespace-nowrap font-medium text-gray-900">
        {formatAmountWithSymbol(order.totalAmount ?? 0)}
      </td>
      <td className="px-3 py-3 align-middle whitespace-nowrap text-gray-600" title={formatDateTime(order.createdAt)}>
        {formatOrderWhen(order.createdAt)}
      </td>
      <td className="px-3 py-3 text-right align-middle whitespace-nowrap" onClick={(event) => event.stopPropagation()}>
        <NextStepControl order={order} busy={busy} onOpen={onOpen} onAdvance={onAdvance} onCancel={onCancel} />
      </td>
    </tr>
  );
}

function OrderCard({
  order,
  busy,
  onOpen,
  onAdvance,
  onCancel,
}: {
  order: Order;
  busy: boolean;
  onOpen: (orderId: string) => void;
  onAdvance: (orderId: string, nextStatus: string) => void;
  onCancel: (orderId: string) => void;
}) {
  const summary = getItemsSummary(order.items, 2);
  const payment = derivePaymentBadge(order);

  return (
    <article
      className="cursor-pointer rounded-xl border border-gray-200 bg-white p-4 hover:border-gray-300"
      onClick={() => onOpen(order.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="truncate font-medium text-gray-900">#{order.orderNumber}</p>
        <p className="shrink-0 text-sm font-semibold text-gray-900">
          {formatAmountWithSymbol(order.totalAmount ?? 0)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant={paymentBadgeVariant(payment)}>{paymentBadgeLabel(payment)}</Badge>
        <Badge variant={statusColors[order.status] || 'default'}>
          {statusLabels[order.status] || order.status}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-gray-700">
        {order.customer?.phone ? formatPhone(order.customer.phone) : '—'}
      </p>
      <p className="mt-1 truncate text-sm text-gray-500" title={summary}>
        {summary}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2" onClick={(event) => event.stopPropagation()}>
        <p className="text-xs text-gray-500">{formatOrderWhen(order.createdAt)}</p>
        <NextStepControl order={order} busy={busy} onOpen={onOpen} onAdvance={onAdvance} onCancel={onCancel} />
      </div>
    </article>
  );
}

function NextStepControl({
  order,
  busy,
  onOpen,
  onAdvance,
  onCancel,
}: {
  order: Order;
  busy: boolean;
  onOpen: (orderId: string) => void;
  onAdvance: (orderId: string, nextStatus: string) => void;
  onCancel: (orderId: string) => void;
}) {
  const step = listNextStep(order);
  const cancellable = canCancelOrder(order.status);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  if (!step && !cancellable) return null;

  const openMenu = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) {
      const top = window.innerHeight - rect.bottom < 72 ? rect.top - 44 : rect.bottom + 4;
      setCoords({ top, left: Math.max(8, rect.right - 160) });
    }
    setOpen((current) => !current);
  };

  return (
    <div className="inline-flex items-center justify-end gap-0.5">
      {step && (
        <button
          type="button"
          disabled={busy}
          className="text-sm font-medium text-primary-500 hover:underline disabled:opacity-50"
          onClick={() => {
            if (step.kind === 'collect') onOpen(order.id);
            else onAdvance(order.id, step.nextStatus);
          }}
        >
          {step.label}
        </button>
      )}
      {cancellable && (
        <>
          <button
            ref={anchorRef}
            type="button"
            aria-label="More actions"
            aria-expanded={open}
            disabled={busy}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
            onClick={openMenu}
          >
            <IconChevronDown className="h-4 w-4" />
          </button>
          {open && (
            <div
              ref={panelRef}
              className="fixed z-30 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-sm"
              style={{ top: coords.top, left: coords.left }}
            >
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
                onClick={() => {
                  setOpen(false);
                  onCancel(order.id);
                }}
              >
                Cancel order
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
