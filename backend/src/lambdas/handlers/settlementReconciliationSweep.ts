import { logger } from '../../logger.js';
import {
  runSettlementDailySweep,
  runSettlementIntentSweep
} from '../../services/payments/paymentReconciliationService.js';

/**
 * EventBridge-scheduled Lambda — 15m intent sweep (unfinished transfers/refunds + link reminder)
 * and daily full reconciliation. Express `index.ts` runs the same loops in-process for PM2.
 */
export const intentSweepHandler = async (): Promise<void> => {
  const result = await runSettlementIntentSweep();
  logger.info(result, 'settlementIntentSweep complete');
};

export const dailySweepHandler = async (): Promise<void> => {
  const result = await runSettlementDailySweep();
  logger.info(result, 'settlementDailySweep complete');
};
