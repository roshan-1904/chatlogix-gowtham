import { receiveMessages, deleteMessage } from '../queue/sqsClient.js';
import { env } from '../config/env.js';
import { logger, StepLogger, createOperationId } from '../logger.js';
import { processResponseMessage, ResponseQueueMessage } from './responseProcessor.js';

// Validate environment on startup
try {
  if (!env.RESPONSE_QUEUE_URL) {
    throw new Error('RESPONSE_QUEUE_URL environment variable is required');
  }
  logger.info({ queueUrl: env.RESPONSE_QUEUE_URL }, 'Response worker starting');
} catch (error) {
  console.error('❌ Environment validation failed:', error);
  console.error('Please ensure all required environment variables are set in .env file');
  process.exit(1);
}

async function loop() {
  while (true) {
    const messages = await receiveMessages(env.RESPONSE_QUEUE_URL, 10);
    for (const m of messages) {
      const operationId = createOperationId('response_worker');
      const stepLogger = new StepLogger(operationId, 'Response Worker Processing', {
        messageId: m.MessageId,
        receiptHandle: m.ReceiptHandle ? '[PRESENT]' : '[MISSING]'
      });

      try {
        if (!m.Body || !m.ReceiptHandle) {
          stepLogger.warn('Skipping message without body or receipt handle');
          continue;
        }

        stepLogger.step('Parsing message body');
        const body = JSON.parse(m.Body) as ResponseQueueMessage;
        
        try {
          await processResponseMessage(body, operationId);
          stepLogger.step('Message processed successfully - WhatsApp sent, database operations async');
        } catch (processError) {
          stepLogger.error(processError as Error, { messageId: m.MessageId });
          logger.error({ err: processError }, 'Failed processing response message');
          
          // CRITICAL: Only retry if WhatsApp sending failed
          // Database failures are now handled asynchronously and don't block SQS deletion
          stepLogger.warn('WhatsApp message sending failed - message will be retried');
          continue; // Don't delete message - let SQS retry
        }

        // CRITICAL: Always delete message from SQS after successful WhatsApp sending
        // Database operations are now async and don't block this deletion
        stepLogger.step('Deleting processed message from SQS');
        await deleteMessage(env.RESPONSE_QUEUE_URL, m.ReceiptHandle);
        stepLogger.success({ 
          processed: true, 
          messageDeleted: true,
          whatsappSent: true,
          databaseAsync: true
        });
      } catch (err) {
        stepLogger.error(err as Error, { messageId: m.MessageId });
        logger.error({ err }, 'Response worker failed');
        // Message will remain in queue for retry
      }
    }
  }
}

loop().catch((err) => {
  logger.error({ 
    err, 
    errorMessage: err instanceof Error ? err.message : String(err),
    errorStack: err instanceof Error ? err.stack : undefined,
    errorName: err instanceof Error ? err.name : typeof err
  }, 'Response worker crashed');
  console.error('Response worker error:', err);
  process.exit(1);
});


