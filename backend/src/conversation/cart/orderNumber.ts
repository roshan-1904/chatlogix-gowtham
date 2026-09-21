import { Prisma } from '@prisma/client';

/**
 * How many times CartEngine.apply re-runs its transaction after a P2002 on
 * `Order.orderNumber`. Postgres aborts the transaction on unique violation,
 * so the retry has to be a fresh `$transaction`, not an inner recreate.
 */
export const MAX_ORDER_NUMBER_ALLOCATION_ATTEMPTS = 5;

const ORDER_NUMBER_SEQ_WIDTH = 4;

type OrderNumberDb = {
  vendor: {
    findUnique: (args: {
      where: { id: string };
      select: { orderPrefix: true };
    }) => Promise<{ orderPrefix: string | null } | null>;
  };
  order: {
    findFirst: (args: {
      where: { orderNumber: { startsWith: string } };
      orderBy: { orderNumber: 'desc' };
      select: { orderNumber: true };
    }) => Promise<{ orderNumber: string } | null>;
  };
};

export function formatVendorPrefix(orderPrefix: string | null | undefined): string {
  return (orderPrefix || 'ORDER').toUpperCase().substring(0, 5).padEnd(5, 'X');
}

export function orderNumberStem(prefix: string, at: Date = new Date()): string {
  const yearMonth = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}`;
  return `ORD-${prefix}-${yearMonth}`;
}

/**
 * Next `ORD-{prefix}-YYYYMM####` after `latestOrderNumber`. Sequence is
 * global for the stem because `Order.orderNumber` is globally unique —
 * counting this vendor's rows for the month collides when another vendor
 * shares the prefix (the default `ORDER` padding is the common case).
 */
export function nextOrderNumber(stem: string, latestOrderNumber: string | null | undefined): string {
  let seq = 1;
  if (latestOrderNumber && latestOrderNumber.startsWith(stem)) {
    const parsed = Number.parseInt(latestOrderNumber.slice(stem.length), 10);
    if (Number.isFinite(parsed) && parsed >= 0) seq = parsed + 1;
  }
  return `${stem}${String(seq).padStart(ORDER_NUMBER_SEQ_WIDTH, '0')}`;
}

export async function allocateOrderNumber(db: OrderNumberDb, vendorId: string): Promise<string> {
  const vendor = await db.vendor.findUnique({ where: { id: vendorId }, select: { orderPrefix: true } });
  const stem = orderNumberStem(formatVendorPrefix(vendor?.orderPrefix));
  const latest = await db.order.findFirst({
    where: { orderNumber: { startsWith: stem } },
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true }
  });
  return nextOrderNumber(stem, latest?.orderNumber);
}

export function isOrderNumberConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  if (target == null) return true;
  const fields = Array.isArray(target) ? target : [String(target)];
  return fields.some((field) => String(field) === 'orderNumber' || String(field).includes('orderNumber'));
}
