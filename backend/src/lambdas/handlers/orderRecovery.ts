import { logger } from '../../logger.js';
import { detectAndRecoverOrderIssues } from '../../services/orderRecoveryService.js';

/**
 * EventBridge-scheduled Lambda — periodically scans recent pending/confirmed
 * orders for discrepancies and attempts recovery. The schedule itself
 * (EventBridge rule) is provisioned outside this repo, same as the SQS
 * trigger wiring for the other Lambdas here.
 *
 * Takes no meaningful input — EventBridge scheduled rules invoke with a
 * fixed "Scheduled Event" payload this handler doesn't need to inspect.
 */
export const handler = async (): Promise<void> => {
  await detectAndRecoverOrderIssues();
  logger.info('orderRecovery sweep run complete');
};
