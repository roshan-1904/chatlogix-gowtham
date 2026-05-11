import type { SQSHandler, SQSRecord, SQSEvent } from 'aws-lambda';
import { processResponseMessage } from '../../workers/responseProcessor.js';
import { logger, StepLogger, createOperationId } from '../../logger.js';

/**
 * AWS Lambda handler for processing response messages from SQS
 * This replaces the standalone response worker with a serverless solution
 */
export const handler = async (event: SQSEvent): Promise<void> => {
  const batchOperationId = createOperationId('lambda_response_processor_batch');
  const batchLogger = new StepLogger(batchOperationId, 'Lambda Response Processor Batch', {
    records: event.Records.length,
    environment: process.env.NODE_ENV || 'production'
  });

  try {
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
            stepLogger.warn('Record without body, skipping');
            return { success: false, reason: 'no_body' };
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

    // Analyze results
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));

    batchLogger.step('Batch processing completed', {
      totalRecords: event.Records.length,
      successful: successful.length,
      failed: failed.length,
      successRate: `${((successful.length / event.Records.length) * 100).toFixed(2)}%`
    });

    // Log failed records for debugging
    if (failed.length > 0) {
      batchLogger.warn('Some records failed processing', {
        failedCount: failed.length,
        failedRecords: failed.map(f => ({
          status: f.status,
          reason: f.status === 'fulfilled' ? f.value.reason : 'promise_rejected',
          error: f.status === 'fulfilled' ? f.value.error : f.reason
        }))
      });
    }

    // For SQS batch processing, we need to handle partial failures
    // If all records failed, throw an error to trigger retry
    if (failed.length === event.Records.length) {
      throw new Error(`All ${event.Records.length} records failed processing`);
    }

    // If some records failed, we could implement partial failure reporting
    // For now, we'll consider the batch successful if at least one record succeeded
    batchLogger.success({ 
      processed: successful.length,
      failed: failed.length,
      totalRecords: event.Records.length
    });

    // SQS handlers don't return HTTP responses, just void or SQSBatchResponse
    return;

  } catch (error) {
    batchLogger.error(error as Error, { 
      totalRecords: event.Records.length,
      lambdaContext: {
        memory: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
        timeout: process.env.AWS_LAMBDA_FUNCTION_TIMEOUT,
        region: process.env.AWS_REGION
      }
    });
    
    logger.error({ 
      error, 
      totalRecords: event.Records.length 
    }, 'Lambda response processor batch failed');
    
    throw error;
  }
};
