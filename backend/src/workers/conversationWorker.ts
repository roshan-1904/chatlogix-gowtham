import { getTextQueueUrl } from '../config/env.js';
import { receiveMessages, deleteMessage } from '../queue/sqsClient.js';
import { logger } from '../logger.js';
import { processMessage } from '../conversation/pipeline.js';

interface TextMessagePayload {
  type: string;
  vendorId?: string | null;
  customerPhone: string;
  content: string;
  phoneNumberId: string;
  whatsappMessageId: string;
}

// A burst-merge + lock-retry + LLM sequence can approach 15-30s at p99;
// sqsClient.ts's previous hardcoded 30s default (fixed in Step 8 to be an
// overridable param) was already tight for that. Text-only, this worker
// never polls audio/image queues (§5/§25) — unlike multiStageAIWorker.ts.
const LOCAL_VISIBILITY_TIMEOUT_SECONDS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Local worker entrypoint (spec §25: "a worker loop can call the same
 * pipeline.ts against LocalStack TEXT_QUEUE_URL"). Mirrors
 * multiStageAIWorker.ts's polling-loop *shape* (receive -> process ->
 * delete-on-success -> sleep if empty -> outer catch sleeps longer on
 * error), but calls pipeline.processMessage directly instead of the old
 * orchestrator+fallback chain, and only ever polls the text queue.
 */
async function loop(): Promise<void> {
  const queueUrl = getTextQueueUrl();
  logger.info({ queueUrl }, 'conversationWorker: starting text-queue poll loop');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const messages = await receiveMessages(queueUrl, 10, LOCAL_VISIBILITY_TIMEOUT_SECONDS);

      if (messages.length === 0) {
        await sleep(1000);
        continue;
      }

      for (const message of messages) {
        if (!message.Body || !message.ReceiptHandle) continue;

        try {
          const body = JSON.parse(message.Body) as TextMessagePayload;
          if (body.type !== 'TextMessage') {
            await deleteMessage(queueUrl, message.ReceiptHandle);
            continue;
          }

          await processMessage({
            vendorId: body.vendorId,
            phoneNumberId: body.phoneNumberId,
            customerPhone: body.customerPhone,
            content: body.content,
            whatsappMessageId: body.whatsappMessageId
          });

          await deleteMessage(queueUrl, message.ReceiptHandle);
        } catch (error) {
          logger.error({ err: error, messageId: message.MessageId }, 'conversationWorker: message failed, leaving for SQS retry');
          // Do not delete — the message becomes visible again after the
          // visibility timeout and gets retried, same as the Lambda path.
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'conversationWorker: unexpected loop error');
      await sleep(5000);
    }
  }
}

loop().catch((err) => {
  logger.error({ err }, 'conversationWorker: fatal error, exiting');
  process.exit(1);
});
