/**
 * Order Metrics Service
 * 
 * Tracks and monitors order management performance metrics.
 * Reference: Phase 9 of Order Management System Implementation Plan
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';

export interface OrderMetrics {
  intentDetectionAccuracy: number; // % correct orderUpdateType detection
  handlerPerformance: {
    addItems: { count: number; avgLatency: number; errors: number };
    removeItems: { count: number; avgLatency: number; errors: number };
    changeQuantity: { count: number; avgLatency: number; errors: number };
    replaceOrder: { count: number; avgLatency: number; errors: number };
  };
  recoverySuccessRate: number; // % successful recoveries
  orderAccuracy: number; // % orders with items matching AI response
  falseReplacementRate: number; // % unnecessary replacements
  transactionFailureRate: number; // % transaction failures
  averageOrderUpdateTime: number; // milliseconds
}

// In-memory metrics storage (in production, use Redis or database)
const metricsStore: {
  intentDetections: Array<{ correct: boolean; timestamp: Date }>;
  handlerCalls: Map<string, Array<{ latency: number; error: boolean; timestamp: Date }>>;
  recoveries: Array<{ success: boolean; timestamp: Date }>;
  transactions: Array<{ success: boolean; timestamp: Date }>;
  orderUpdates: Array<{ duration: number; timestamp: Date }>;
} = {
  intentDetections: [],
  handlerCalls: new Map(),
  recoveries: [],
  transactions: [],
  orderUpdates: []
};

/**
 * Record intent detection result
 */
export function recordIntentDetection(correct: boolean): void {
  metricsStore.intentDetections.push({
    correct,
    timestamp: new Date()
  });

  // Keep only last 1000 records
  if (metricsStore.intentDetections.length > 1000) {
    metricsStore.intentDetections = metricsStore.intentDetections.slice(-1000);
  }
}

/**
 * Record handler performance
 */
export function recordHandlerCall(
  handlerType: 'addItems' | 'removeItems' | 'changeQuantity' | 'replaceOrder',
  latency: number,
  error: boolean = false
): void {
  if (!metricsStore.handlerCalls.has(handlerType)) {
    metricsStore.handlerCalls.set(handlerType, []);
  }

  const calls = metricsStore.handlerCalls.get(handlerType)!;
  calls.push({
    latency,
    error,
    timestamp: new Date()
  });

  // Keep only last 500 records per handler
  if (calls.length > 500) {
    calls.splice(0, calls.length - 500);
  }
}

/**
 * Record recovery attempt
 */
export function recordRecovery(success: boolean): void {
  metricsStore.recoveries.push({
    success,
    timestamp: new Date()
  });

  // Keep only last 500 records
  if (metricsStore.recoveries.length > 500) {
    metricsStore.recoveries = metricsStore.recoveries.slice(-500);
  }
}

/**
 * Record transaction result
 */
export function recordTransaction(success: boolean): void {
  metricsStore.transactions.push({
    success,
    timestamp: new Date()
  });

  // Keep only last 1000 records
  if (metricsStore.transactions.length > 1000) {
    metricsStore.transactions = metricsStore.transactions.slice(-1000);
  }
}

/**
 * Record order update duration
 */
export function recordOrderUpdate(duration: number): void {
  metricsStore.orderUpdates.push({
    duration,
    timestamp: new Date()
  });

  // Keep only last 1000 records
  if (metricsStore.orderUpdates.length > 1000) {
    metricsStore.orderUpdates = metricsStore.orderUpdates.slice(-1000);
  }
}

/**
 * Get current metrics
 */
export function getOrderMetrics(): OrderMetrics {
  // Calculate intent detection accuracy
  const recentIntentDetections = metricsStore.intentDetections.filter(
    d => d.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours
  );
  const intentDetectionAccuracy = recentIntentDetections.length > 0
    ? (recentIntentDetections.filter(d => d.correct).length / recentIntentDetections.length) * 100
    : 0;

  // Calculate handler performance
  const handlerPerformance = {
    addItems: calculateHandlerMetrics('addItems'),
    removeItems: calculateHandlerMetrics('removeItems'),
    changeQuantity: calculateHandlerMetrics('changeQuantity'),
    replaceOrder: calculateHandlerMetrics('replaceOrder')
  };

  // Calculate recovery success rate
  const recentRecoveries = metricsStore.recoveries.filter(
    r => r.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000
  );
  const recoverySuccessRate = recentRecoveries.length > 0
    ? (recentRecoveries.filter(r => r.success).length / recentRecoveries.length) * 100
    : 0;

  // Calculate transaction failure rate
  const recentTransactions = metricsStore.transactions.filter(
    t => t.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000
  );
  const transactionFailureRate = recentTransactions.length > 0
    ? (recentTransactions.filter(t => !t.success).length / recentTransactions.length) * 100
    : 0;

  // Calculate average order update time
  const recentOrderUpdates = metricsStore.orderUpdates.filter(
    u => u.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000
  );
  const averageOrderUpdateTime = recentOrderUpdates.length > 0
    ? recentOrderUpdates.reduce((sum, u) => sum + u.duration, 0) / recentOrderUpdates.length
    : 0;

  return {
    intentDetectionAccuracy,
    handlerPerformance,
    recoverySuccessRate,
    orderAccuracy: 0, // Would need to compare orders with AI responses
    falseReplacementRate: 0, // Would need to track replacements vs adds
    transactionFailureRate,
    averageOrderUpdateTime
  };
}

/**
 * Calculate handler metrics
 */
function calculateHandlerMetrics(handlerType: string): {
  count: number;
  avgLatency: number;
  errors: number;
} {
  const calls = metricsStore.handlerCalls.get(handlerType as any) || [];
  const recentCalls = calls.filter(
    c => c.timestamp.getTime() > Date.now() - 24 * 60 * 60 * 1000
  );

  return {
    count: recentCalls.length,
    avgLatency: recentCalls.length > 0
      ? recentCalls.reduce((sum, c) => sum + c.latency, 0) / recentCalls.length
      : 0,
    errors: recentCalls.filter(c => c.error).length
  };
}

/**
 * Get metrics summary for logging
 */
export function getMetricsSummary(): string {
  const metrics = getOrderMetrics();
  
  return `
Order Management Metrics (Last 24 hours):
- Intent Detection Accuracy: ${metrics.intentDetectionAccuracy.toFixed(1)}%
- Recovery Success Rate: ${metrics.recoverySuccessRate.toFixed(1)}%
- Transaction Failure Rate: ${metrics.transactionFailureRate.toFixed(1)}%
- Average Update Time: ${metrics.averageOrderUpdateTime.toFixed(0)}ms
- Handler Calls:
  - Add Items: ${metrics.handlerPerformance.addItems.count} (${metrics.handlerPerformance.addItems.errors} errors)
  - Remove Items: ${metrics.handlerPerformance.removeItems.count} (${metrics.handlerPerformance.removeItems.errors} errors)
  - Change Quantity: ${metrics.handlerPerformance.changeQuantity.count} (${metrics.handlerPerformance.changeQuantity.errors} errors)
  - Replace Order: ${metrics.handlerPerformance.replaceOrder.count} (${metrics.handlerPerformance.replaceOrder.errors} errors)
`.trim();
}

/**
 * Log metrics periodically
 */
export function logMetrics(): void {
  const summary = getMetricsSummary();
  logger.info({ metrics: getOrderMetrics() }, summary);
}

