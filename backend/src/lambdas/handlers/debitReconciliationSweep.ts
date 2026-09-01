import { logger } from '../../logger.js';
import { reconcileStuckDebits } from '../../conversation/billing.js';

/**
 * EventBridge-scheduled Lambda (spec §19.1) — runs every 5 minutes, retries
 * the debit for any MessageProcessing row that reached 'queued' but was
 * never successfully debited. The schedule itself (EventBridge rule) is
 * provisioned outside this repo, the same as the SQS trigger wiring for the
 * other Lambdas here — there's no serverless.yml/CDK/Terraform in this repo.
 *
 * Takes no meaningful input — EventBridge scheduled rules invoke with a
 * fixed "Scheduled Event" payload this handler doesn't need to inspect.
 */
export const handler = async (): Promise<void> => {
  const result = await reconcileStuckDebits();
  logger.info(result, 'debitReconciliationSweep run complete');
};
