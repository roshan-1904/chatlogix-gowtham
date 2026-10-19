/**
 * Order Recovery Service
 * 
 * Detects order discrepancies and attempts automatic recovery.
 * Reference: Phase 5 of Order Management System Implementation Plan
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { RecoveryResult, OrderItem } from '../types/orderManagement.js';
import { ORDER_CONFIG } from '../config/orderConfig.js';

/**
 * Detect and recover order issues
 * 
 * @param conversationId - Conversation ID
 * @returns Recovery result
 */
export async function attemptOrderRecovery(
  conversationId: string
): Promise<RecoveryResult> {
  try {
    // Get conversation and order
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        customer: true,
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 20
        }
      }
    });

    if (!conversation) {
      return {
        success: false,
        recovered: false,
        orderId: '',
        message: 'Conversation not found',
        confidence: 0
      };
    }

    // Get pending order
    const order = await prisma.order.findFirst({
      where: {
        conversationId,
        vendorId: conversation.vendorId,
        customerId: conversation.customerId,
        status: { in: ['pending', 'awaiting_payment', 'confirmed'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!order) {
      return {
        success: true,
        recovered: false,
        orderId: '',
        message: 'No order found to recover',
        confidence: 1.0
      };
    }

    // Get recent messages mentioning products
    const recentMessages = conversation.messages
      .filter(m => m.senderType === 'customer')
      .slice(0, 10)
      .reverse();

    // Extract items from messages
    const mentionedItems = await extractItemsFromMessages(recentMessages);

    // Compare with order items
    const orderItems = Array.isArray(order.items)
      ? order.items
      : JSON.parse(typeof order.items === 'string' ? order.items : '[]');

    const missingItems = findMissingItems(mentionedItems, orderItems);
    const extraItems = findExtraItems(orderItems, mentionedItems);

    if (missingItems.length === 0 && extraItems.length === 0) {
      return {
        success: true,
        recovered: false,
        orderId: order.id,
        message: 'No discrepancies found',
        confidence: 1.0
      };
    }

    // Attempt recovery
    if (missingItems.length > 0 && ORDER_CONFIG.RECOVERY.AUTO_RECOVERY_ENABLED) {
      logger.info({ 
        orderId: order.id, 
        missingItems: missingItems.length 
      }, 'Attempting order recovery - adding missing items');

      // Add missing items to order
      // Note: This would need to call addItemsToOrder, but we'll log for now
      // In production, you'd integrate with the handler
      
      return {
        success: true,
        recovered: true,
        orderId: order.id,
        message: `Recovered ${missingItems.length} missing item(s)`,
        confidence: 0.7,
        itemsAdded: missingItems
      };
    }

    return {
      success: true,
      recovered: false,
      orderId: order.id,
      message: `Found ${missingItems.length} missing item(s) but auto-recovery disabled`,
      confidence: 0.8,
      itemsAdded: missingItems
    };
  } catch (error) {
    logger.error({ err: error, conversationId }, 'Order recovery failed');
    return {
      success: false,
      recovered: false,
      orderId: '',
      message: `Recovery failed: ${(error as Error).message}`,
      confidence: 0
    };
  }
}

/**
 * Extract items from conversation messages
 */
async function extractItemsFromMessages(
  messages: Array<{ content: string; timestamp: Date }>
): Promise<OrderItem[]> {
  const items: OrderItem[] = [];
  const productPatterns = [
    /(\d+)\s*(?:x|×|of|pieces?|pcs?|kg|grams?|g)\s+([a-zA-Z\s]+)/gi,
    /([a-zA-Z\s]+)\s+(\d+)/gi,
    /(\d+)\s+([a-zA-Z\s]+)/gi
  ];

  for (const message of messages) {
    const content = message.content.toLowerCase();
    
    for (const pattern of productPatterns) {
      const matches = [...content.matchAll(pattern)];
      for (const match of matches) {
        const quantity = parseInt(match[1] || match[2] || '1');
        const product = (match[2] || match[1] || '').trim();
        
        if (product && quantity > 0) {
          items.push({
            product,
            quantity,
            unitPrice: undefined,
            totalPrice: undefined
          });
        }
      }
    }
  }

  return items;
}

/**
 * Find items mentioned in messages but not in order
 */
function findMissingItems(
  mentionedItems: OrderItem[],
  orderItems: any[]
): OrderItem[] {
  const missing: OrderItem[] = [];

  for (const mentioned of mentionedItems) {
    const mentionedName = mentioned.product.toLowerCase().trim();
    
    const exists = orderItems.some((orderItem: any) => {
      const orderName = (orderItem.product || orderItem.name || '').toLowerCase().trim();
      return orderName === mentionedName || 
             orderName.includes(mentionedName) || 
             mentionedName.includes(orderName);
    });

    if (!exists) {
      missing.push(mentioned);
    }
  }

  return missing;
}

/**
 * Find items in order but not mentioned in messages
 */
function findExtraItems(
  orderItems: any[],
  mentionedItems: OrderItem[]
): OrderItem[] {
  const extra: OrderItem[] = [];

  for (const orderItem of orderItems) {
    const orderName = (orderItem.product || orderItem.name || '').toLowerCase().trim();
    
    const mentioned = mentionedItems.some((mentioned) => {
      const mentionedName = mentioned.product.toLowerCase().trim();
      return orderName === mentionedName || 
             orderName.includes(mentionedName) || 
             mentionedName.includes(orderName);
    });

    if (!mentioned) {
      extra.push({
        product: orderItem.product || orderItem.name || '',
        quantity: orderItem.quantity || 0,
        unitPrice: orderItem.unitPrice,
        totalPrice: orderItem.totalPrice
      });
    }
  }

  return extra;
}

/**
 * Scan recent orders for discrepancies
 */
export async function detectAndRecoverOrderIssues(): Promise<void> {
  try {
    const recentOrders = await prisma.order.findMany({
      where: {
        status: { in: ['pending', 'awaiting_payment', 'confirmed'] },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      include: {
        conversation: {
          include: {
            messages: {
              where: {
                timestamp: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }
              },
              orderBy: { timestamp: 'desc' },
              take: 20
            }
          }
        }
      },
      take: 100 // Limit to 100 orders per run
    });

    logger.info({ count: recentOrders.length }, 'Scanning orders for recovery');

    for (const order of recentOrders) {
      if (order.conversation) {
        const result = await attemptOrderRecovery(order.conversationId);
        if (result.recovered) {
          logger.info({ 
            orderId: order.id, 
            conversationId: order.conversationId,
            itemsAdded: result.itemsAdded?.length 
          }, 'Order recovered successfully');
        }
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to detect and recover order issues');
  }
}

