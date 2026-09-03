import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { publishToQueue } from '../../queue/sqsClient.js';
import { env } from '../../config/env.js';
import { logger, StepLogger, createOperationId } from '../../logger.js';
import { processJob, MediaFetchJob } from '../../services/mediaFetchProcessor.js';

/**
 * AWS Lambda handler for fetching customer-sent WhatsApp media (audio/image/
 * video/document/sticker): downloads from the WhatsApp Graph API, uploads to
 * S3, transcribes audio via Whisper. SQS-triggered off MEDIA_FETCH_QUEUE_URL,
 * the same queue backend/src/workers/mediaWorker.ts polls for local dev.
 * Shares processJob() with that worker via services/mediaFetchProcessor.ts.
 */
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const batchOperationId = createOperationId('lambda_media_fetcher_batch');
  const batchLogger = new StepLogger(batchOperationId, 'Lambda Media Fetcher Batch', {
    records: event.Records.length
  });

  const batchItemFailures: SQSBatchItemFailure[] = [];

  if (!env.MEDIA_FETCH_QUEUE_URL) {
    batchLogger.error(new Error('MEDIA_FETCH_QUEUE_URL not configured'), {
      records: event.Records.length
    });
    // Nothing we can do without the queue URL (needed for retry re-enqueue) —
    // fail the whole batch so SQS redelivers once config is fixed.
    return {
      batchItemFailures: event.Records.map((r) => ({ itemIdentifier: r.messageId }))
    };
  }

  for (const record of event.Records) {
    const operationId = createOperationId('lambda_media_fetcher');

    let job: MediaFetchJob;
    try {
      job = JSON.parse(record.body) as MediaFetchJob;
    } catch (err) {
      // Malformed body — retrying won't help, drop it (matches mediaWorker.ts).
      logger.warn({ err, messageId: record.messageId }, 'Failed to parse media job body');
      continue;
    }

    const stepLogger = new StepLogger(operationId, 'Lambda Media Fetcher', {
      messageId: job.messageId,
      whatsappMediaId: job.whatsappMediaId,
      vendorId: job.vendorId
    });

    try {
      const outcome = await processJob(job, stepLogger);

      if (typeof outcome === 'object' && 'retryAfterSeconds' in outcome) {
        const nextAttemptIndex = (job.attemptIndex ?? 0) + 1;
        const retryJob: MediaFetchJob = { ...job, attemptIndex: nextAttemptIndex };
        try {
          await publishToQueue(env.MEDIA_FETCH_QUEUE_URL, retryJob, {
            delaySeconds: outcome.retryAfterSeconds
          });
          stepLogger.step('Re-enqueued media job with backoff', {
            delaySeconds: outcome.retryAfterSeconds,
            attemptIndex: nextAttemptIndex
          });
        } catch (enqueueErr) {
          // Re-enqueue failed — report as a batch item failure so SQS's own
          // visibility-timeout redelivery is the fallback (same fallback
          // mediaWorker.ts uses by leaving the message undeleted).
          stepLogger.error(enqueueErr as Error, { step: 'media_retry_enqueue_failed' });
          batchItemFailures.push({ itemIdentifier: record.messageId });
          continue;
        }
      }

      stepLogger.success({ messageId: job.messageId, outcome });
    } catch (err) {
      // Unexpected error outside processJob's own retry envelope — report as
      // a batch item failure so SQS retries this record via visibility timeout.
      stepLogger.error(err as Error, { step: 'media_fetch_unexpected_failure' });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  batchLogger.success({
    totalRecords: event.Records.length,
    failed: batchItemFailures.length
  });

  return { batchItemFailures };
};
