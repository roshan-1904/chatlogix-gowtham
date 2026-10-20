/**
 * Order Alert Service
 * 
 * Detects suspicious order changes and generates alerts for vendor review.
 * Reference: Phase 4.3 of Order Management System Implementation Plan
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { OrderChange } from './orderTrackingService.js';

export interface OrderAlert {
  id: string;
  orderId: string;
  type:
    | 'price_drop'
    | 'items_lost'
    | 'total_mismatch'
    | 'suspicious_change'
    | 'recovery_attempted'
    | 'payment_initiated';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  resolved: boolean;
  createdAt: Date;
}

/**
 * Detect suspicious changes and create alerts
 * 
 * @param orderId - Order ID
 * @param previousOrder - Previous order state
 * @param newOrder - New order state
 * @param changes - Order changes
 * @returns Array of created alerts
 */
export async function detectAndCreateAlerts(
  orderId: string,
  previousOrder: any,
  newOrder: any,
  changes: OrderChange
): Promise<OrderAlert[]> {
  const alerts: OrderAlert[] = [];

  try {
    // 1. Detect large price drops (>20%)
    if (changes.total) {
      const priceDrop = changes.total.old - changes.total.new;
      const priceDropPercent = changes.total.old > 0 
        ? (priceDrop / changes.total.old) * 100 
        : 0;

      if (priceDropPercent > 20) {
        const alert = await createAlert(
          orderId,
          'price_drop',
          priceDropPercent > 50 ? 'critical' : priceDropPercent > 30 ? 'high' : 'medium',
          `Large price drop detected: ${priceDropPercent.toFixed(1)}% decrease (₹${(priceDrop / 100).toFixed(2)}). Previous: ₹${(changes.total.old / 100).toFixed(2)}, New: ₹${(changes.total.new / 100).toFixed(2)}`
        );
        alerts.push(alert);
      }
    }

    // 2. Detect items lost (mentioned but not in order)
    if (changes.items?.removed && changes.items.removed.length > 0) {
      const alert = await createAlert(
        orderId,
        'items_lost',
        changes.items.removed.length > 2 ? 'high' : 'medium',
        `${changes.items.removed.length} item(s) removed from order: ${changes.items.removed.map((item: any) => item.product || item.name).join(', ')}`
      );
      alerts.push(alert);
    }

    // 3. Detect total mismatch (calculated vs provided)
    // This is handled in validation, but we can create an alert if it persists

    // 4. Detect suspicious changes (multiple rapid changes)
    const recentChanges = await prisma.orderAuditLog.count({
      where: {
        orderId,
        timestamp: {
          gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
        }
      }
    });

    if (recentChanges > 5) {
      const alert = await createAlert(
        orderId,
        'suspicious_change',
        'high',
        `Multiple rapid changes detected: ${recentChanges} changes in the last 5 minutes. This may indicate an issue.`
      );
      alerts.push(alert);
    }

    logger.info({ orderId, alertsCount: alerts.length }, 'Order alerts detected and created');
    return alerts;
  } catch (error) {
    logger.error({ err: error, orderId }, 'Failed to detect and create order alerts');
    return [];
  }
}

/**
 * Create an order alert
 * 
 * @param orderId - Order ID
 * @param type - Alert type
 * @param severity - Alert severity
 * @param message - Alert message
 * @returns Created alert
 */
export async function createAlert(
  orderId: string,
  type: OrderAlert['type'],
  severity: OrderAlert['severity'],
  message: string
): Promise<OrderAlert> {
  try {
    const alert = await prisma.orderAlert.create({
      data: {
        id: crypto.randomUUID(),
        orderId,
        type,
        severity,
        message,
        resolved: false,
        createdAt: new Date()
      }
    });

    logger.info({ orderId, type, severity }, 'Order alert created');
    return alert as OrderAlert;
  } catch (error) {
    logger.error({ err: error, orderId, type }, 'Failed to create order alert');
    throw error;
  }
}

/**
 * Get unresolved alerts for an order
 * 
 * @param orderId - Order ID
 * @returns Array of unresolved alerts
 */
export async function getUnresolvedAlerts(orderId: string): Promise<OrderAlert[]> {
  try {
    const alerts = await prisma.orderAlert.findMany({
      where: {
        orderId,
        resolved: false
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return alerts as OrderAlert[];
  } catch (error) {
    logger.error({ err: error, orderId }, 'Failed to fetch unresolved alerts');
    return [];
  }
}

/**
 * Resolve an alert
 * 
 * @param alertId - Alert ID
 */
export async function resolveAlert(alertId: string): Promise<void> {
  try {
    await prisma.orderAlert.update({
      where: { id: alertId },
      data: { resolved: true }
    });

    logger.info({ alertId }, 'Order alert resolved');
  } catch (error) {
    logger.error({ err: error, alertId }, 'Failed to resolve order alert');
    throw error;
  }
}

/**
 * Get all alerts for a vendor (for dashboard)
 * 
 * @param vendorId - Vendor ID
 * @param resolved - Filter by resolved status
 * @param limit - Maximum number of alerts to return
 * @returns Array of alerts
 */
export async function getVendorAlerts(
  vendorId: string,
  resolved?: boolean,
  limit: number = 100
): Promise<OrderAlert[]> {
  try {
    const orders = await prisma.order.findMany({
      where: { vendorId },
      select: { id: true }
    });

    const orderIds = orders.map(o => o.id);

    const alerts = await prisma.orderAlert.findMany({
      where: {
        orderId: { in: orderIds },
        ...(resolved !== undefined ? { resolved } : {})
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });

    return alerts as OrderAlert[];
  } catch (error) {
    logger.error({ err: error, vendorId }, 'Failed to fetch vendor alerts');
    return [];
  }
}

