import type { SQSHandler, SQSRecord, SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { processResponseMessage } from '../../workers/responseProcessor.js';
import { logger, StepLogger, createOperationId } from '../../logger.js';

/**
 * AWS Lambda handler for processing response messages from SQS.
 *
 * Implements ReportBatchItemFailures (matching src/conversation/handler.ts's
 * proven pattern) rather than the previous swallow-then-return-void
 * approach: that older code only retried the batch when EVERY record
 * failed, so a batch with some successes and some failures returned
 * successfully and SQS deleted the whole batch -- including the failed
 * sends, which never even reached the DLQ. Requires the SQS trigger's
 * event-source mapping to have FunctionResponseTypes: ['ReportBatchItemFailures']
 * enabled, or this return value is silently ignored by SQS.
 *
 * Keeps the existing Promise.allSettled parallelism (processing WhatsApp
 * sends concurrently) rather than switching to a sequential loop -- there's
 * no per-conversation lock contention concern on this side of the pipeline,
 * so there's no reason to serialize it.
 */
export const handler: SQSHandler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchOperationId = createOperationId('lambda_response_processor_batch');
  const batchLogger = new StepLogger(batchOperationId, 'Lambda Response Processor Batch', {
    records: event.Records.length,
    environment: process.env.NODE_ENV || 'production'
  });

  batchLogger.step('Starting batch processing', {
    recordCount: event.Records.length,
    lambdaMemory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    lambdaTimeout: process.env.AWS_LAMBDA_FUNCTION_TIMEOUT
  });

  const results = await Promise.allSettled(
    event.Records.map(async (record: SQSRecord, index: number) => {
      const operationId = createOperationId('lambda_response_processor');
      const stepLogger = new StepLogger(operationId, 'Lambda Response Processor', {
        messageId: record.messageId,
        recordIndex: index,
        receiptHandle: record.receiptHandle ? '[PRESENT]' : '[MISSING]'
      });

      try {
        stepLogger.step('Validating SQS record');

        if (!record.body) {
          // No body is unrecoverable on retry, but reporting it as a
          // failure (rather than silently treating it as "handled") lets
          // it retry to maxReceiveCount and land in the DLQ for a human to
          // see, instead of vanishing with only a log line.
          stepLogger.warn('Record without body');
          return { success: false, messageId: record.messageId, reason: 'no_body' };
        }

        stepLogger.step('Parsing message payload');
        const payload = JSON.parse(record.body);

        stepLogger.step('Processing response message');
        await processResponseMessage(payload, operationId);

        stepLogger.success({
          processed: true,
          messageId: record.messageId,
          payloadKeys: Object.keys(payload)
        });

        return { success: true, messageId: record.messageId };
      } catch (err) {
        stepLogger.error(err as Error, {
          messageId: record.messageId,
          recordIndex: index,
          errorType: err instanceof Error ? err.constructor.name : typeof err
        });

        logger.error({
          err,
          messageId: record.messageId,
          recordIndex: index
        }, 'Lambda response processor failed for individual record');

        return {
          success: false,
          messageId: record.messageId,
          error: err instanceof Error ? err.message : String(err)
        };
      }
    })
  );

  const batchItemFailures: SQSBatchItemFailure[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const record = event.Records[i];
    const succeeded = result.status === 'fulfilled' && result.value.success;
    if (!succeeded) {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  batchLogger.step('Batch processing completed', {
    totalRecords: event.Records.length,
    successful: event.Records.length - batchItemFailures.length,
    failed: batchItemFailures.length,
    successRate: `${(((event.Records.length - batchItemFailures.length) / event.Records.length) * 100).toFixed(2)}%`
  });

  if (batchItemFailures.length > 0) {
    batchLogger.warn('Some records failed processing — reporting as batch item failures for per-record retry', {
      failedCount: batchItemFailures.length,
      failedMessageIds: batchItemFailures.map((f) => f.itemIdentifier)
    });
  }

  batchLogger.success({
    processed: event.Records.length - batchItemFailures.length,
    failed: batchItemFailures.length,
    totalRecords: event.Records.length
  });

  return { batchItemFailures };
};
