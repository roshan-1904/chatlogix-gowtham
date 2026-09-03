import { receiveMessages, deleteMessage, publishToQueue } from '../queue/sqsClient.js';
import { env } from '../config/env.js';
import { logger, StepLogger, createOperationId } from '../logger.js';
import { processJob, MediaFetchJob } from '../services/mediaFetchProcessor.js';

/**
 * Local-dev / manual-fallback runner for media fetch jobs. Production traffic
 * is served by the chatlogix-media-fetcher Lambda (SQS-triggered off the same
 * MEDIA_FETCH_QUEUE_URL), which shares this file's processJob() logic via
 * services/mediaFetchProcessor.ts.
 */
async function loop() {
  if (!env.MEDIA_FETCH_QUEUE_URL) {
    logger.error('MEDIA_FETCH_QUEUE_URL not configured; media worker exiting');
    process.exit(1);
  }

  while (true) {
    const messages = await receiveMessages(env.MEDIA_FETCH_QUEUE_URL, 10);
    if (messages.length === 0) continue;

    for (const m of messages) {
      if (!m.Body || !m.ReceiptHandle) continue;
      const operationId = createOperationId('media_worker');
      let job: MediaFetchJob | null = null;
      try {
        job = JSON.parse(m.Body) as MediaFetchJob;
      } catch (err) {
        logger.warn({ err, messageId: m.MessageId }, 'Failed to parse media job body');
        // Delete malformed messages; retrying won't help.
        try {
          await deleteMessage(env.MEDIA_FETCH_QUEUE_URL, m.ReceiptHandle);
        } catch {}
        continue;
      }

      const stepLogger = new StepLogger(operationId, 'Media Worker', {
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
            // If re-enqueue fails, fall back to the visibility-timeout path:
            // skip the delete so SQS redelivers the original message.
            stepLogger.error(enqueueErr as Error, {
              step: 'media_retry_enqueue_failed'
            });
            continue;
          }
        }
        // Always delete the in-flight message after we've decided what to do —
        // success, terminal failure, no-op, or a queued retry copy.
        await deleteMessage(env.MEDIA_FETCH_QUEUE_URL, m.ReceiptHandle);
        stepLogger.success({ messageId: job.messageId, outcome });
      } catch (err) {
        // Unexpected error outside processJob's own retry envelope. Leave the
        // SQS message visible so it gets retried via visibility timeout.
        stepLogger.warn('Media job crashed, leaving message visible for retry', {
          err: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }
}

loop().catch((err) => {
  logger.error({ err }, 'Media worker crashed');
  process.exit(1);
});
