import { receiveMessages, deleteMessage } from '../queue/sqsClient.js';
import { getTextQueueUrl } from '../config/env.js';
import { logger } from '../logger.js';

async function processLoop() {
  logger.info('Text worker started');
  const queueUrl = getTextQueueUrl();
  while (true) {
    const messages = await receiveMessages(queueUrl, 10);
    if (messages.length === 0) {
      continue;
    }
    for (const m of messages) {
      try {
        if (!m.Body || !m.ReceiptHandle) continue;
        const body = JSON.parse(m.Body);
        // TODO: implement credit check, intent classification, and response generation
        logger.info({ eventType: body.type }, 'Processing message');
        await deleteMessage(queueUrl, m.ReceiptHandle);
      } catch (err) {
        logger.error({ err }, 'Failed to process message');
      }
    }
  }
}

processLoop().catch((err) => {
  logger.error({ err }, 'Worker crashed');
  process.exit(1);
});


