import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger.js';
import type { CartOp, CartLine, CartSnapshot, PostSalesOutcome } from '../types.js';
import { parseOrderItems, computeMissing } from './snapshot.js';
import { resolveProduct, resolveVariant, computeUnitPricePaise } from './productResolve.js';
import { checkAvailability } from './availability.js';
import { checkRefundEligibility } from './refund.js';
import {
  allocateOrderNumber,
  isOrderNumberConflict,
  MAX_ORDER_NUMBER_ALLOCATION_ATTEMPTS
} from './orderNumber.js';

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
  // Set by a `cancel`/`refund_request` op that targeted a *historical* order
  // (or failed to, past the pending/confirmed stage) — CartEngine only
  // reports state, pipeline.ts turns this into the actual customer reply
  // and vendor alert (see postSalesAlert.ts).
  postSalesOutcome?: PostSalesOutcome;
}

const CANCELLABLE_STATUSES = ['pending', 'confirmed'];

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

  // `Order.orderNumber` is globally unique. Allocation can still race two
  // concurrent first-item carts (or two vendors sharing a prefix); Postgres
  // aborts the transaction on P2002, so the retry is a fresh $transaction.
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ORDER_NUMBER_ALLOCATION_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
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

        // Retry guard: if an SQS redelivery re-invokes apply() for a
        // whatsappMessageId whose ops were already committed to this order
        // (e.g. LLM-2 or a DB blip threw AFTER apply()'s own transaction
        // committed but BEFORE the pipeline's idempotency marker was
        // written), re-running the ops loop would double-apply an additive
        // op like `add` (2 pizzas -> 4). `traceId` is already written into
        // every mutating turn's OrderAuditLog row (below), so its presence
        // for this order is a reliable "already applied" signal.
        if (order) {
          const alreadyApplied = await tx.orderAuditLog.findFirst({
            where: { orderId: order.id, changes: { path: ['traceId'], equals: traceId } }
          });
          if (alreadyApplied) {
            logger.info(
              { traceId, vendorId, conversationId, orderId: order.id },
              'CartEngine.apply: ops for this traceId already applied to this order — skipping re-apply (SQS retry)'
            );
            const missing = computeMissing(lines, customerName, deliveryAddress);
            return {
              snapshot: {
                orderId: order.id,
                status,
                items: lines,
                totalPaise: Math.round(lines.reduce((sum, line) => sum + line.lineTotalPaise, 0)),
                customerName,
                address: deliveryAddress,
                missing
              },
              mutated: false,
              rejectedOps: []
            };
          }
        }

        const rejectedOps: Array<{ op: CartOp; reason: string }> = [];
        let mutated = false;
        let postSalesOutcome: PostSalesOutcome | undefined;
        // Set when a cancel/refund directly updated an order OTHER than the
        // conversation's own `order` — that write already happened inline
        // (not through the shared lines/order persistence below), but the
        // caller-facing `mutated` flag should still reflect that something changed.
        let historicalOrderChanged = false;

        // Historical-order cancel/refund updates a DIFFERENT order than the
        // conversation's own (`order`), so it can't go through the shared
        // `mutated`-gated audit-log write below (that write is scoped to
        // `order` only) -- without this, a real cancellation/refund on a
        // past order left zero OrderAuditLog trace.
        async function writeHistoricalAuditLog(
          targetOrderId: string,
          action: string,
          previousStatus: string,
          newStatus: string,
          op: CartOp
        ): Promise<void> {
          await tx.orderAuditLog.create({
            data: {
              id: crypto.randomUUID(),
              orderId: targetOrderId,
              action,
              changes: { traceId, ops: [op] } as unknown as Prisma.InputJsonValue,
              previousState: { status: previousStatus } as unknown as Prisma.InputJsonValue,
              newState: { status: newStatus } as unknown as Prisma.InputJsonValue,
              timestamp: new Date()
            }
          });
        }

        function notCancellableOutcome(orderId: string, orderNumber: string, status: string): PostSalesOutcome {
          return {
            type: 'not_cancellable_at_this_stage',
            orderId,
            orderNumber,
            detail: `Order is already ${status} and can no longer be cancelled automatically.`
          };
        }

        /**
         * Resolves the order a `cancel`/`refund_request` op targets:
         * `op.orderNumber` (a past order from RECENT ORDERS) when given,
         * else the conversation's own live order, else — matching the
         * legacy pipeline's default (dataExtractionService.ts's
         * handlePostSalesIntent) — the customer's most recent non-cancelled
         * order. Always scoped to customerId+vendorId: never trust a bare
         * orderNumber from the model without that check (I4).
         */
        async function resolveTargetOrder(orderNumber: string | null | undefined) {
          if (orderNumber) {
            return tx.order.findFirst({ where: { orderNumber, customerId, vendorId } });
          }
          if (order) return order;
          return tx.order.findFirst({
            where: { customerId, vendorId, status: { not: 'cancelled' } },
            orderBy: { createdAt: 'desc' }
          });
        }

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
                // Rounded: qty is a raw float for divisible products, and
                // newQty accumulates plain floating-point addition across
                // turns (e.g. 0.1 + 0.2) -- an unrounded result here can be a
                // non-integer paise value, which Order.totalAmount (an Int
                // column) rejects, aborting the whole transaction and leaving
                // the cart permanently stuck on retry (same bad qty is
                // already stored).
                existingLine.lineTotalPaise = Math.round(unitPricePaise * newQty);
                if (op.notes) existingLine.notes = op.notes;
              } else {
                lines.push({
                  productId: product.id,
                  name: product.name,
                  quantity: op.qty,
                  unit: variant?.unit || product.baseUnit,
                  unitPricePaise,
                  lineTotalPaise: Math.round(unitPricePaise * op.qty),
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
                existingLine.lineTotalPaise = Math.round(unitPricePaise * op.qty); // see the `add` case for why this is rounded
              } else {
                lines.push({
                  productId: product.id,
                  name: product.name,
                  quantity: op.qty,
                  unit: variant?.unit || product.baseUnit,
                  unitPricePaise,
                  lineTotalPaise: Math.round(unitPricePaise * op.qty),
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
              if (!op.orderNumber) {
                // No target specified — the conversation's own live order only.
                // Unchanged from before historical-order cancel existed.
                if (!order) {
                  rejectedOps.push({ op, reason: 'no_order_to_cancel' });
                  break;
                }
                if (status === 'pending' || status === 'confirmed') {
                  status = 'cancelled';
                  mutated = true;
                } else {
                  rejectedOps.push({ op, reason: 'not_cancellable_at_this_stage' });
                  postSalesOutcome = notCancellableOutcome(order.id, order.orderNumber, status);
                }
                break;
              }

              // Targeting a specific order by number — may be the live draft
              // or a past (e.g. already-confirmed) one from RECENT ORDERS.
              const targetOrder = await resolveTargetOrder(op.orderNumber);
              if (!targetOrder) {
                rejectedOps.push({ op, reason: 'no_order_to_cancel' });
                break;
              }
              if (!CANCELLABLE_STATUSES.includes(targetOrder.status)) {
                rejectedOps.push({ op, reason: 'not_cancellable_at_this_stage' });
                postSalesOutcome = notCancellableOutcome(targetOrder.id, targetOrder.orderNumber, targetOrder.status);
                break;
              }
              if (order && targetOrder.id === order.id) {
                status = 'cancelled';
                mutated = true;
              } else {
                // A different order than the one this conversation has loaded —
                // apply directly; the shared lines/order persistence below is
                // scoped to `order` only and must not touch this one.
                await tx.order.update({
                  where: { id: targetOrder.id },
                  data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: 'Cancelled via AI assistant' }
                });
                await writeHistoricalAuditLog(targetOrder.id, 'cancel', targetOrder.status, 'cancelled', op);
                historicalOrderChanged = true;
              }
              postSalesOutcome = { type: 'order_cancelled', orderId: targetOrder.id, orderNumber: targetOrder.orderNumber, detail: 'Cancelled as requested.' };
              break;
            }

            case 'refund_request': {
              const targetOrder = await resolveTargetOrder(op.orderNumber);
              if (!targetOrder) {
                rejectedOps.push({ op, reason: 'no_order_to_refund' });
                break;
              }
              const eligibility = checkRefundEligibility(targetOrder);
              if (!eligibility.eligible) {
                postSalesOutcome = { type: 'refund_denied', orderId: targetOrder.id, orderNumber: targetOrder.orderNumber, detail: eligibility.reason };
                break;
              }
              if (order && targetOrder.id === order.id) {
                status = 'cancelled';
                mutated = true;
              } else {
                await tx.order.update({
                  where: { id: targetOrder.id },
                  data: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: op.reason || 'Refund approved' }
                });
                await writeHistoricalAuditLog(targetOrder.id, 'refund_request', targetOrder.status, 'cancelled', op);
                historicalOrderChanged = true;
              }
              postSalesOutcome = {
                type: 'refund_approved',
                orderId: targetOrder.id,
                orderNumber: targetOrder.orderNumber,
                detail: `₹${(targetOrder.totalAmount / 100).toFixed(2)} will be refunded within 3-5 business days.`
              };
              break;
            }

            case 'handoff':
            case 'knowledge_gap':
            case 'send_product_media':
            case 'noop':
              // Handled outside CartEngine — handoff.ts reacts to 'handoff';
              // customerQuery.ts reacts to 'knowledge_gap'; 'noop' is a no-op.
              break;
          }
        }

        // Defensive round (Order.totalAmount is an Int column) -- every
        // lineTotalPaise contributing here is already rounded at the point
        // it's set, this just guards the sum itself.
        const totalPaise = Math.round(lines.reduce((sum, line) => sum + line.lineTotalPaise, 0));

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
          } else if (lines.length > 0) {
            // Never create an Order with no items — a set_field-only turn (e.g. the
            // customer volunteers their address while asking about an order that
            // doesn't exist) must not spawn a ₹0 phantom order. customerName/address
            // still reach CustomerInsights via persist.ts regardless (it reads
            // snapshot.customerName/.address unconditionally, not through Order).
            order = await tx.order.create({
              data: {
                vendorId,
                customerId,
                conversationId,
                orderNumber: await allocateOrderNumber(tx, vendorId),
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

        const reportedMutated = mutated || historicalOrderChanged;

        logger.info(
          { traceId, vendorId, conversationId, orderId: snapshot.orderId, mutated: reportedMutated, rejectedCount: rejectedOps.length, postSalesOutcome: postSalesOutcome?.type },
          'CartEngine.apply complete'
        );

        return { snapshot, mutated: reportedMutated, rejectedOps, postSalesOutcome };
      },
      { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 }
    );
    } catch (error) {
      lastError = error;
      if (isOrderNumberConflict(error) && attempt < MAX_ORDER_NUMBER_ALLOCATION_ATTEMPTS) {
        logger.warn(
          { err: error, traceId, vendorId, conversationId, attempt },
          'CartEngine.apply: orderNumber unique conflict — retrying allocation'
        );
        continue;
      }
      logger.error({ err: error, traceId, vendorId, conversationId }, 'CartEngine.apply failed');
      throw error;
    }
  }
  logger.error({ err: lastError, traceId, vendorId, conversationId }, 'CartEngine.apply failed');
  throw lastError;
}
