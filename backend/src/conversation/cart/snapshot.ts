import type { CartLine, CartSnapshot } from '../types.js';

/**
 * Parses `Order.items` JSON into CartLine[]. Reads both the new CartEngine key
 * names and the legacy `dataExtractionService.ts` key names, since orders
 * written before this rewrite's cutover use {product, unitPrice, totalPrice,
 * matchedProductId} instead of {name, unitPricePaise, lineTotalPaise, productId}.
 * There is no migration or discriminator field for this — old and new shapes
 * coexist in the same untyped Json column (accepted for this dev/test
 * environment, see docs/CONVERSATION_PROCESSOR_IMPLEMENTATION_PLAN.md Step 3).
 */
export function parseOrderItems(items: unknown): CartLine[] {
  if (!Array.isArray(items)) return [];
  return items.map((raw: any) => {
    const quantity = Number(raw?.quantity ?? 0);
    const unitPricePaise = Number(raw?.unitPricePaise ?? raw?.unitPrice ?? 0);
    const lineTotalPaise = Number(raw?.lineTotalPaise ?? raw?.totalPrice ?? unitPricePaise * quantity);
    return {
      productId: raw?.productId ?? raw?.matchedProductId ?? '',
      name: raw?.name ?? raw?.product ?? '',
      quantity,
      unit: raw?.unit ?? '',
      unitPricePaise,
      lineTotalPaise,
      notes: raw?.notes ?? undefined
    };
  });
}

/** Cart is missing what's required for `confirm` (spec §16: name + address + non-empty cart). */
export function computeMissing(
  items: CartLine[],
  customerName: string | null,
  address: string | null
): Array<'name' | 'address' | 'items'> {
  const missing: Array<'name' | 'address' | 'items'> = [];
  if (!customerName) missing.push('name');
  if (!address) missing.push('address');
  if (items.length === 0) missing.push('items');
  return missing;
}

/**
 * Builds the CartSnapshot rendered into the WhatsApp reply. `customerName`/
 * `address` are passed in separately from `order` because neither lives
 * directly as a single source on the Order model in the same way — name is
 * read from CustomerInsights, address from Order.deliveryAddress (see
 * cart/engine.ts for where each is read/written during apply).
 */
export function toCartSnapshot(
  order: { id: string; status: string; items: unknown } | null,
  customerName: string | null,
  address: string | null
): CartSnapshot {
  const items = order ? parseOrderItems(order.items) : [];
  const totalPaise = items.reduce((sum, line) => sum + line.lineTotalPaise, 0);

  return {
    orderId: order?.id ?? null,
    status: order?.status ?? 'none',
    items,
    totalPaise,
    customerName,
    address,
    missing: computeMissing(items, customerName, address)
  };
}
