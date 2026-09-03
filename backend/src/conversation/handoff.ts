import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { humanHandoffService } from '../services/humanHandoffService.js';
import { notifyVendorOfPostSalesEvent, type PostSalesAlertCategory } from './postSalesAlert.js';

export interface TriggerHandoffInput {
  conversationId: string;
  vendorId: string;
  customerId: string;
  phoneNumberId: string;
  traceId: string;
  // Sourced from the `handoff` CartOp when the model has real context (a
  // complaint/return/in-progress-order-cancel) rather than a bare escalation.
  category?: PostSalesAlertCategory | null;
  details?: string | null;
  orderNumber?: string | null;
}

export interface TriggerHandoffResult {
  customerMessage: string;
}

/**
 * Handoff = pause AI + notify the vendor (spec §20, Q7). Ordering matters:
 * the customer's own reply (the canned message this returns) goes out as
 * this turn's normal pipeline reply; vendor notify is fire-and-forget,
 * *after* that — I5 says customer send must never be blocked on a notify.
 */
export async function triggerHandoff(input: TriggerHandoffInput): Promise<TriggerHandoffResult> {
  const { conversationId, vendorId, customerId, phoneNumberId, traceId, category, details, orderNumber } = input;

  // Reused as-is: sets Conversation.aiPaused = true and returns the canned
  // customer copy. Confirmed it does NOT notify the vendor — that half is
  // entirely new, built below.
  const result = await humanHandoffService.executeHandoff(conversationId, vendorId);

  if (result.success) {
    // Fire-and-forget: never await this in the request path (I5). Only
    // notify when the pause actually took effect — notifying the vendor
    // that a conversation is "paused, check your dashboard" when it isn't
    // actually paused (executeHandoff failed internally) would be
    // misleading, since the AI would still be replying to the customer.
    resolveOrderId(customerId, vendorId, orderNumber ?? null)
      .then((orderId) =>
        notifyVendorOfPostSalesEvent({
          vendorId,
          phoneNumberId,
          conversationId,
          traceId,
          orderId,
          orderNumber: orderNumber ?? null,
          category: category || 'other',
          detail: details || 'A customer conversation needs your attention.',
          aiPaused: true
        })
      )
      .catch((error) => {
        logger.error({ err: error, conversationId, vendorId, traceId }, 'Handoff vendor notify failed');
      });
  } else {
    logger.warn({ conversationId, vendorId, traceId }, 'Handoff did not take effect (aiPaused not set) — skipping vendor notify');
  }

  return { customerMessage: result.message };
}

/** Resolves a CartOp-supplied orderNumber to its id, scoped to this customer+vendor — never trust a bare id from the model. */
async function resolveOrderId(customerId: string, vendorId: string, orderNumber: string | null): Promise<string | null> {
  if (!orderNumber) return null;
  const order = await prisma.order.findFirst({ where: { orderNumber, customerId, vendorId }, select: { id: true } });
  return order?.id ?? null;
}
