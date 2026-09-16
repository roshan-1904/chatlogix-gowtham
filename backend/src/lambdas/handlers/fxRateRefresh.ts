import { logger } from '../../logger.js';
import { refreshUsdInrRate } from '../../services/platformSettingsService.js';

/**
 * EventBridge-scheduled Lambda — fetches USD/INR from Frankfurter and writes
 * PlatformSettings + FxRateHistory. The schedule itself is provisioned
 * outside this repo (same as order-recovery). Do **not** add this function
 * to the five hardcoded names in `.github/workflows/deploy.yml`.
 *
 * Suggested EventBridge rule: `cron(30 18 * * ? *)` UTC = 00:00 IST.
 */
export const handler = async (): Promise<void> => {
  const result = await refreshUsdInrRate();
  logger.info(result, 'fxRateRefresh run complete');
};
