import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { env } from '../config/env.js';
import { publishToQueue } from '../queue/sqsClient.js';

export type PostSalesAlertCategory = 'complaint' | 'return' | 'cancel_in_progress' | 'refund_denied' | 'other';

export interface NotifyVendorOfPostSalesEventInput {
  vendorId: string;
  phoneNumberId: string;
  conversationId: string;
  traceId: string;
  orderId: string | null; // null when no order could be resolved — alert is skipped, vendor still notified
  orderNumber: string | null;
  category: PostSalesAlertCategory;
  detail: string; // customer's own reason, or the eligibility rule's explanation
  // true only for an actual handoff (Conversation.aiPaused was set) — the
  // refund_denied/not_cancellable_at_this_stage callers from pipeline.ts
  // never pause the AI, it keeps replying normally, so the vendor message
  // must not tell them to "take over."
  aiPaused?: boolean;
}

const CATEGORY_COPY: Record<PostSalesAlertCategory, { header: string; severity: string; callToAction: string }> = {
  complaint: { header: '⚠️ *Customer Complaint*', severity: 'high', callToAction: 'Please follow up with the customer.' },
  return: { header: '📦 *Return Request*', severity: 'high', callToAction: 'Please arrange pickup and process the return.' },
  cancel_in_progress: {
    header: '🚫 *Cancellation Request (order already in progress)*',
    severity: 'high',
    callToAction: 'The order has already moved past pending/confirmed — please decide whether to accommodate.'
  },
  refund_denied: {
    header: '💰 *Refund Request (needs manual review)*',
    severity: 'high',
    callToAction: "Didn't qualify for an automatic refund — please review and decide."
  },
  other: { header: '💬 *Customer Needs Attention*', severity: 'medium', callToAction: 'Please check the conversation and respond.' }
};

/**
 * Writes an OrderAlert (when an order was resolved) and sends the vendor a
 * specific WhatsApp text — mirrors the working pattern already established
 * in services/dataExtractionService.ts's handlePostSalesIntent (order #,
 * reason, call to action) rather than a generic "check your dashboard".
 * Shared by handoff.ts (customer-initiated complaint/return/cancel_in_progress)
 * and pipeline.ts (CartEngine-computed refund_denied/not_cancellable outcomes)
 * so the message format and OrderAlert write only exist once.
 */
export async function notifyVendorOfPostSalesEvent(input: NotifyVendorOfPostSalesEventInput): Promise<void> {
  const { vendorId, phoneNumberId, conversationId, traceId, orderId, orderNumber, category, detail, aiPaused } = input;
  const copy = CATEGORY_COPY[category];

  try {
    if (orderId) {
      await prisma.orderAlert.create({
        data: { orderId, type: category, severity: copy.severity, message: detail }
      });
    }

    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { phone: true } });
    if (!vendor?.phone) {
      logger.warn({ vendorId, conversationId, traceId, category }, 'Cannot notify vendor of post-sales event: vendor has no phone on file');
      return;
    }

    const pausedNote = aiPaused ? 'AI has been paused for this conversation — please respond directly.' : 'AI is still handling this conversation; this just needs your call.';
    const text = [copy.header, '', `Order: ${orderNumber || 'No linked order'}`, `Details: ${detail}`, '', pausedNote, copy.callToAction].join('\n');

    await publishToQueue(env.RESPONSE_QUEUE_URL, {
      type: 'text',
      to: vendor.phone,
      text,
      vendorId,
      phoneNumberId,
      metadata: { notificationType: category, conversationId, traceId }
    });

    logger.info({ vendorId, conversationId, traceId, category, orderNumber }, 'Vendor notified of post-sales event');
  } catch (error) {
    // Fire-and-forget from every call site — never blocks the customer's own reply (I5).
    logger.error({ err: error, vendorId, conversationId, traceId, category }, 'Post-sales vendor notify failed');
  }
}
