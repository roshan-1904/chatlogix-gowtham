/**
 * Order Recovery Worker
 * 
 * Background worker to scan for order discrepancies and attempt recovery.
 * Reference: Phase 5 of Order Management System Implementation Plan
 */

import { logger } from '../logger.js';
import { detectAndRecoverOrderIssues } from '../services/orderRecoveryService.js';
import { ORDER_CONFIG } from '../config/orderConfig.js';

let recoveryInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start the recovery worker
 */
export function startOrderRecoveryWorker(): void {
  if (recoveryInterval) {
    logger.warn('Order recovery worker already running');
    return;
  }

  logger.info({ 
    interval: ORDER_CONFIG.RECOVERY.RECOVERY_CHECK_INTERVAL 
  }, 'Starting order recovery worker');

  // Run immediately on start
  runRecoveryCycle();

  // Schedule periodic runs
  recoveryInterval = setInterval(() => {
    runRecoveryCycle();
  }, ORDER_CONFIG.RECOVERY.RECOVERY_CHECK_INTERVAL);
}

/**
 * Stop the recovery worker
 */
export function stopOrderRecoveryWorker(): void {
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
    logger.info('Order recovery worker stopped');
  }
}

/**
 * Run a single recovery cycle
 */
async function runRecoveryCycle(): Promise<void> {
  if (isRunning) {
    logger.debug('Recovery cycle already running, skipping');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    await detectAndRecoverOrderIssues();
    
    const duration = Date.now() - startTime;
    logger.debug({ duration }, 'Recovery cycle completed');
  } catch (error) {
    logger.error({ err: error }, 'Recovery cycle failed');
  } finally {
    isRunning = false;
  }
}

/**
 * Get worker status
 */
export function getRecoveryWorkerStatus(): {
  running: boolean;
  interval: number;
  isActive: boolean;
} {
  return {
    running: isRunning,
    interval: ORDER_CONFIG.RECOVERY.RECOVERY_CHECK_INTERVAL,
    isActive: recoveryInterval !== null
  };
}

