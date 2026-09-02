import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger.js';
import type { CartOp, CartLine, CartSnapshot } from '../types.js';
import { parseOrderItems, computeMissing } from './snapshot.js';
import { resolveProduct, resolveVariant, computeUnitPricePaise } from './productResolve.js';
import { checkAvailability } from './availability.js';

export interface ApplyOpsInput {
  vendorId: string;
  conversationId: string;
  customerId: string;
  orderId: string | null; // null → engine creates a new Order on first mutating op
  ops: CartOp[];
  traceId: string; // whatsappMessageId, written into OrderAuditLog
}

export interface ApplyOpsResult {
  snapshot: CartSnapshot;
  mutated: boolean;
  rejectedOps: Array<{ op: CartOp; reason: string }>;
}

type TxClient = Prisma.TransactionClient;

/**
 * Format: ORD-{prefix}-YYYYMM{4-digit-count}, matching orderService.ts's
 * existing `generateOrderNumber` convention. Reimplemented locally (that
 * function is private and duplicated across 4 files already) rather than
 * importing from a file this rewrite is replacing.
 */
async function generateOrderNumber(tx: TxClient, vendorId: string): Promise<string> {
  const vendor = await tx.vendor.findUnique({ where: { id: vendorId }, select: { orderPrefix: true } });
  const prefix = (vendor?.orderPrefix || 'ORDER').toUpperCase().substring(0, 5).padEnd(5, 'X');

  const now = new Date();
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const count = await tx.order.count({ where: { vendorId, createdAt: { gte: startOfMonth } } });

  return `ORD-${prefix}-${yearMonth}${String(count + 1).padStart(4, '0')}`;
}

/**
 * Applies LLM-1's cart ops inside one Postgres transaction (spec §14). The
 * model never writes Order.items directly — it proposes ops, this function
 * applies them deterministically, and the WhatsApp reply is always rendered
 * from the resulting snapshot afterward (I1: Postgres cart is the only
 * source of truth).
 *
 * Variant-aware: `add`/`set_qty`/`remove` ops may carry a `variantSku`
 * naming one row of Product.variants (Json). A product that has variants has
 * no meaningful single basePrice, so such ops must resolve to a specific
 * variant to be priced or matched to a line at all — an unrecognized
 * `variantSku` is rejected (I4: fail closed) rather than silently priced
 * from basePrice, and two different variants of the same product are always
 * distinct lines (see the `productId`+`variantSku` matching below).
 */
export async function apply(input: ApplyOpsInput): Promise<ApplyOpsResult> {
  const { vendorId, conversationId, customerId, orderId, ops, traceId } = input;

  return await prisma
    .$transaction(
      async (tx) => {
        let order = orderId
          ? await tx.order.findFirst({ where: { id: orderId, vendorId } })
          : await tx.order.findFirst({
              where: { conversationId, vendorId, status: 'pending' },
              orderBy: { createdAt: 'desc' }
            });

        let lines: CartLine[] = order ? parseOrderItems(order.items) : [];
        let deliveryAddress = order?.deliveryAddress ?? null;
        let specialRequests = order?.specialRequests ?? null;
        let deliveryInstructions = order?.deliveryInstructions ?? null;
        let status = order?.status ?? 'pending';

        // `name` has no Order column — it lives on CustomerInsights, one row
        // per customer+vendor. persist.ts owns writing it after apply (spec
        // §19 step 8); we only read it here to validate `confirm` and to
        // reflect it in this turn's snapshot.
        const insights = await tx.customerInsights.findUnique({
          where: { customerId_vendorId: { customerId, vendorId } },
          select: { customerName: true }
        });
        let customerName = insights?.customerName ?? null;

        const rejectedOps: Array<{ op: CartOp; reason: string }> = [];
        let mutated = false;

        for (const op of ops) {
          switch (op.type) {
            case 'add': {
              const product = await resolveProduct(tx, vendorId, op.productId);
              if (!product) {
                rejectedOps.push({ op, reason: 'product_not_found' });
                break;
              }
              let variant = null;
              if (op.variantSku) {
                variant = resolveVariant(product, op.variantSku);
                if (!variant) {
                  rejectedOps.push({ op, reason: 'variant_not_found' });
                  break;
                }
              }
              const existingLine = lines.find((l) => l.productId === op.productId && (l.variantSku ?? null) === (op.variantSku ?? null));
              const newQty = (existingLine?.quantity ?? 0) + op.qty;
              const availability = checkAvailability(product, newQty);
              if (!availability.allowed) {
                rejectedOps.push({ op, reason: availability.reason ?? 'unavailable' });
                break;
              }
              const unitPricePaise = computeUnitPricePaise(product, variant);
              if (existingLine) {
                existingLine.quantity = newQty;
                existingLine.unitPricePaise = unitPricePaise;
                existingLine.lineTotalPaise = unitPricePaise * newQty;
                if (op.notes) existingLine.notes = op.notes;
              } else {
                lines.push({
                  productId: product.id,
                  name: product.name,
                  quantity: op.qty,
                  unit: variant?.unit || product.baseUnit,
                  unitPricePaise,
                  lineTotalPaise: unitPricePaise * op.qty,
                  notes: op.notes,
                  variantSku: variant?.sku ?? null,
                  variantLabel: variant?.label ?? null
                });
              }
              mutated = true;
              break;
            }

            case 'set_qty': {
              const matchesLine = (l: CartLine) => l.productId === op.productId && (l.variantSku ?? null) === (op.variantSku ?? null);
              if (op.qty <= 0) {
                const before = lines.length;
                lines = lines.filter((l) => !matchesLine(l));
                if (lines.length !== before) mutated = true;
                else rejectedOps.push({ op, reason: 'line_not_found' });
                break;
              }
              const product = await resolveProduct(tx, vendorId, op.productId);
              if (!product) {
                rejectedOps.push({ op, reason: 'product_not_found' });
                break;
              }
              let variant = null;
              if (op.variantSku) {
                variant = resolveVariant(product, op.variantSku);
                if (!variant) {
                  rejectedOps.push({ op, reason: 'variant_not_found' });
                  break;
                }
              }
              const availability = checkAvailability(product, op.qty);
              if (!availability.allowed) {
                rejectedOps.push({ op, reason: availability.reason ?? 'unavailable' });
                break;
              }
              const unitPricePaise = computeUnitPricePaise(product, variant);
              const existingLine = lines.find(matchesLine);
              if (existingLine) {
                existingLine.quantity = op.qty;
                existingLine.unitPricePaise = unitPricePaise;
                existingLine.lineTotalPaise = unitPricePaise * op.qty;
              } else {
                lines.push({
                  productId: product.id,
                  name: product.name,
                  quantity: op.qty,
                  unit: variant?.unit || product.baseUnit,
                  unitPricePaise,
                  lineTotalPaise: unitPricePaise * op.qty,
                  variantSku: variant?.sku ?? null,
                  variantLabel: variant?.label ?? null
                });
              }
              mutated = true;
              break;
            }

            case 'remove': {
              const before = lines.length;
              lines = lines.filter((l) => !(l.productId === op.productId && (l.variantSku ?? null) === (op.variantSku ?? null)));
              if (lines.length !== before) mutated = true;
              else rejectedOps.push({ op, reason: 'line_not_found' });
              break;
            }

            case 'set_field': {
              switch (op.field) {
                case 'address':
                  deliveryAddress = op.value;
                  break;
                case 'name':
                  customerName = op.value; // persisted to CustomerInsights by persist.ts, not here
                  break;
                case 'notes':
                  specialRequests = op.value;
                  break;
                case 'delivery_date':
                  // Advisory prep-timing copy only (Q13) — never a promised date,
                  // never Order.estimatedDelivery.
                  deliveryInstructions = op.value;
                  break;
              }
              mutated = true;
              break;
            }

            case 'confirm': {
              const missing = computeMissing(lines, customerName, deliveryAddress);
              if (missing.length > 0) {
                rejectedOps.push({ op, reason: `missing_${missing.join('_')}` });
                break;
              }
              // Q13: customer confirm stays 'pending' (awaiting vendor). AI never
              // sets estimatedDelivery — only the vendor (or a later job) does.
              status = 'pending';
              mutated = true;
              break;
            }

            case 'cancel': {
              if (!order) {
                rejectedOps.push({ op, reason: 'no_order_to_cancel' });
                break;
              }
              if (status === 'pending' || status === 'confirmed') {
                status = 'cancelled';
                mutated = true;
              } else {
                rejectedOps.push({ op, reason: 'not_cancellable' });
              }
              break;
            }

            case 'handoff':
            case 'noop':
              // Handled outside CartEngine — handoff.ts reacts to 'handoff';
              // 'noop' is a no-op by definition.
              break;
          }
        }

        const totalPaise = lines.reduce((sum, line) => sum + line.lineTotalPaise, 0);

        if (mutated) {
          const itemsJson = lines as unknown as Prisma.InputJsonValue;

          if (order) {
            order = await tx.order.update({
              where: { id: order.id },
              data: {
                items: itemsJson,
                totalAmount: totalPaise,
                deliveryAddress,
                specialRequests,
                deliveryInstructions,
                status
              }
            });
          } else if (lines.length > 0 || deliveryAddress || specialRequests || deliveryInstructions) {
            order = await tx.order.create({
              data: {
                vendorId,
                customerId,
                conversationId,
                orderNumber: await generateOrderNumber(tx, vendorId),
                status,
                items: itemsJson,
                totalAmount: totalPaise,
                deliveryAddress,
                specialRequests,
                deliveryInstructions
              }
            });
          }

          if (order) {
            await tx.orderAuditLog.create({
              data: {
                id: crypto.randomUUID(),
                orderId: order.id,
                action: ops.map((o) => o.type).join(','),
                changes: { traceId, ops, resultingItems: lines } as unknown as Prisma.InputJsonValue,
                previousState: Prisma.JsonNull,
                newState: { status, items: lines, totalPaise } as unknown as Prisma.InputJsonValue,
                timestamp: new Date()
              }
            });
          }
        }

        const missing = computeMissing(lines, customerName, deliveryAddress);
        const snapshot: CartSnapshot = {
          orderId: order?.id ?? null,
          status,
          items: lines,
          totalPaise,
          customerName,
          address: deliveryAddress,
          missing
        };

        logger.info(
          { traceId, vendorId, conversationId, orderId: snapshot.orderId, mutated, rejectedCount: rejectedOps.length },
          'CartEngine.apply complete'
        );

        return { snapshot, mutated, rejectedOps };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 }
    )
    .catch((error) => {
      logger.error({ err: error, traceId, vendorId, conversationId }, 'CartEngine.apply failed');
      throw error;
    });
}
