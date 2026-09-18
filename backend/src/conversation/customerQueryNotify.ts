import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { getRedisClient } from '../utils/redis.js';
import { logCount } from './metrics.js';
import {
  pickVendorSendingNumber,
  VENDOR_SENDING_NUMBER_SELECT
} from '../services/whatsapp/vendorSendingNumber.js';

const THROTTLE_SECONDS = 15 * 60;

export async function notifyVendorOfKnowledgeGap(input: {
  vendorId: string;
  conversationId: string;
  queryId: string;
  questionEn: string;
  customerPhone?: string | null;
}): Promise<void> {
  try {
    const redis = getRedisClient();
    if (redis) {
      const allowed = await redis.set(`customer_query_notify:${input.vendorId}`, '1', 'EX', THROTTLE_SECONDS, 'NX');
      if (allowed !== 'OK') {
        logger.info({ vendorId: input.vendorId, queryId: input.queryId }, 'CustomerQuery vendor ping throttled');
        return;
      }
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: input.vendorId },
      select: {
        phone: true,
        whatsappNumbers: {
          select: VENDOR_SENDING_NUMBER_SELECT
        }
      }
    });

    if (!vendor?.phone) {
      logger.info({ vendorId: input.vendorId, queryId: input.queryId }, 'CustomerQuery notify skipped — vendor has no phone');
      return;
    }

    const who = input.customerPhone ? `Customer ${input.customerPhone}` : 'A customer';
    const text = [
      `${who} asked: ${input.questionEn}`,
      '',
      'AI is still on; answer from Queries or the chat when you can.'
    ].join('\n');

    await publishToQueue(env.RESPONSE_QUEUE_URL, {
      type: 'text',
      to: vendor.phone,
      text,
      vendorId: input.vendorId,
      conversationId: input.conversationId,
      phoneNumberId: pickVendorSendingNumber(vendor.whatsappNumbers)?.phoneNumberId,
      metadata: { notificationType: 'customer_query', queryId: input.queryId }
    });
  } catch (error) {
    logCount('CustomerQueryNotifyFail', { vendorId: input.vendorId });
    logger.error(
      { err: error, vendorId: input.vendorId, conversationId: input.conversationId, queryId: input.queryId },
      'CustomerQuery vendor ping failed'
    );
  }
}
