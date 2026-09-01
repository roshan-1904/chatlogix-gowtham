import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { humanHandoffService } from '../services/humanHandoffService.js';

export interface TriggerHandoffInput {
  conversationId: string;
  vendorId: string;
  phoneNumberId: string;
  traceId: string;
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
  const { conversationId, vendorId, phoneNumberId, traceId } = input;

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
    notifyVendor({ conversationId, vendorId, phoneNumberId, traceId }).catch((error) => {
      logger.error({ err: error, conversationId, vendorId, traceId }, 'Handoff vendor notify failed');
    });
  } else {
    logger.warn({ conversationId, vendorId, traceId }, 'Handoff did not take effect (aiPaused not set) — skipping vendor notify');
  }

  return { customerMessage: result.message };
}

/**
 * Standalone vendor notify — NOT a call to
 * whatsappTemplateService.notifyVendorNewOrder, which is hardwired to an
 * orderId (prisma.order.findUnique) that doesn't exist for a handoff event.
 * Follows that function's *pattern* instead: resolve the vendor's own phone
 * as the destination, publish a plain text message to RESPONSE_QUEUE_URL.
 * `phoneNumberId` (the sending WABA number) is already available from the
 * inbound SQS payload, threaded through as an argument — no fresh lookup
 * needed for it, only the destination (vendor.phone) is looked up here.
 */
async function notifyVendor(input: { conversationId: string; vendorId: string; phoneNumberId: string; traceId: string }): Promise<void> {
  const { conversationId, vendorId, phoneNumberId, traceId } = input;

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { phone: true } });
  if (!vendor?.phone) {
    logger.warn({ vendorId, conversationId, traceId }, 'Cannot notify vendor of handoff: vendor has no phone on file');
    return;
  }

  await publishToQueue(env.RESPONSE_QUEUE_URL, {
    type: 'text',
    to: vendor.phone,
    text: 'A customer conversation needs your attention and AI has been paused. Please check your dashboard to respond.',
    vendorId,
    phoneNumberId,
    metadata: { notificationType: 'handoff_alert', conversationId, traceId }
  });

  logger.info({ vendorId, conversationId, traceId }, 'Vendor notified of handoff');
}
