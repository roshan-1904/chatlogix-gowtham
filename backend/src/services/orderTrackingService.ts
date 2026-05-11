/**
 * Order Tracking Service
 * 
 * Tracks all order changes with audit logging for data integrity and debugging.
 * Reference: Phase 4.2 of Order Management System Implementation Plan
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { OrderIntent } from '../types/orderManagement.js';

export interface OrderChange {
  items?: {
    added?: any[];
    removed?: any[];
    changed?: Array<{product: string, oldQuantity: number, newQuantity: number}>;
  };
  total?: {
    old: number;
    new: number;
  };
  deliveryAddress?: {
    old?: string;
    new?: string;
  };
  deliveryInstructions?: {
    old?: string;
    new?: string;
  };
  specialRequests?: {
    old?: string;
    new?: string;
  };
}

/**
 * Log order change to audit log
 * 
 * @param orderId - Order ID
 * @param action - Action type (add_items, remove_items, change_quantity, replace_order, etc.)
 * @param changes - Changes made to the order
 * @param intent - Order intent that triggered the change
 * @param previousState - Previous order state (optional)
 * @param newState - New order state (optional)
 */
export async function logOrderChange(
  orderId: string,
  action: string,
  changes: OrderChange,
  intent?: OrderIntent | null,
  previousState?: any,
  newState?: any
): Promise<void> {
  try {
    await prisma.orderAuditLog.create({
      data: {
        id: crypto.randomUUID(),
        orderId,
        action,
        changes: changes as any,
        intent: intent?.type || null,
        previousState: previousState || null,
        newState: newState || null,
        timestamp: new Date()
      }
    });

    logger.debug({ orderId, action, intent: intent?.type }, 'Order change logged to audit log');
  } catch (error) {
    logger.error({ err: error, orderId, action }, 'Failed to log order change to audit log');
    // Don't throw - audit logging failure shouldn't break order updates
  }
}

/**
 * Get audit log for an order
 * 
 * @param orderId - Order ID
 * @param limit - Maximum number of logs to return
 * @returns Array of audit log entries
 */
export async function getOrderAuditLog(
  orderId: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const logs = await prisma.orderAuditLog.findMany({
      where: { orderId },
      orderBy: { timestamp: 'desc' },
      take: limit
    });

    return logs;
  } catch (error) {
    logger.error({ err: error, orderId }, 'Failed to fetch order audit log');
    return [];
  }
}

/**
 * Calculate order change diff
 * 
 * @param previousOrder - Previous order state
 * @param newOrder - New order state
 * @returns OrderChange object with differences
 */
export function calculateOrderChangeDiff(
  previousOrder: any,
  newOrder: any
): OrderChange {
  const changes: OrderChange = {};

  // Compare items
  const previousItems = Array.isArray(previousOrder.items)
    ? previousOrder.items
    : JSON.parse(previousOrder.items || '[]');
  const newItems = Array.isArray(newOrder.items)
    ? newOrder.items
    : JSON.parse(newOrder.items || '[]');

  // Find added items
  const addedItems = newItems.filter((newItem: any) => {
    const newProductName = (newItem.product || newItem.name || '').toLowerCase();
    return !previousItems.some((prevItem: any) => {
      const prevProductName = (prevItem.product || prevItem.name || '').toLowerCase();
      return prevProductName === newProductName;
    });
  });

  // Find removed items
  const removedItems = previousItems.filter((prevItem: any) => {
    const prevProductName = (prevItem.product || prevItem.name || '').toLowerCase();
    return !newItems.some((newItem: any) => {
      const newProductName = (newItem.product || newItem.name || '').toLowerCase();
      return newProductName === prevProductName;
    });
  });

  // Find changed quantities
  const changedItems: Array<{product: string, oldQuantity: number, newQuantity: number}> = [];
  previousItems.forEach((prevItem: any) => {
    const prevProductName = (prevItem.product || prevItem.name || '').toLowerCase();
    const newItem = newItems.find((item: any) => {
      const itemName = (item.product || item.name || '').toLowerCase();
      return itemName === prevProductName;
    });

    if (newItem && (prevItem.quantity || 0) !== (newItem.quantity || 0)) {
      changedItems.push({
        product: prevItem.product || prevItem.name || '',
        oldQuantity: prevItem.quantity || 0,
        newQuantity: newItem.quantity || 0
      });
    }
  });

  if (addedItems.length > 0 || removedItems.length > 0 || changedItems.length > 0) {
    changes.items = {
      added: addedItems.length > 0 ? addedItems : undefined,
      removed: removedItems.length > 0 ? removedItems : undefined,
      changed: changedItems.length > 0 ? changedItems : undefined
    };
  }

  // Compare totals
  const previousTotal = previousOrder.totalAmount || 0;
  const newTotal = newOrder.totalAmount || 0;
  if (previousTotal !== newTotal) {
    changes.total = {
      old: previousTotal,
      new: newTotal
    };
  }

  // Compare delivery address
  if (previousOrder.deliveryAddress !== newOrder.deliveryAddress) {
    changes.deliveryAddress = {
      old: previousOrder.deliveryAddress || undefined,
      new: newOrder.deliveryAddress || undefined
    };
  }

  // Compare delivery instructions
  if (previousOrder.deliveryInstructions !== newOrder.deliveryInstructions) {
    changes.deliveryInstructions = {
      old: previousOrder.deliveryInstructions || undefined,
      new: newOrder.deliveryInstructions || undefined
    };
  }

  // Compare special requests
  if (previousOrder.specialRequests !== newOrder.specialRequests) {
    changes.specialRequests = {
      old: previousOrder.specialRequests || undefined,
      new: newOrder.specialRequests || undefined
    };
  }

  return changes;
}

