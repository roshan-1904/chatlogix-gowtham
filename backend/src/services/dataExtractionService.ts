/**
 * Data Extraction & Database Update Service
 * 
 * Extracts structured data and updates database (Stage 8)
 * Uses fuzzy matching for product validation to handle typos and partial names
 * Reference: Phase 5.11: Stage 8 - Data Extraction & Database Update Service (Implementation Plan)
 * 
 * Performance: Optimized for high-throughput scenarios
 * - Uses cached product catalogs
 * - Vendor-agnostic field access
 * - Multi-language support
 * - Transaction safety for order updates
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import { updateConversationMemory } from './conversationMemoryService.js';
import { invalidateConversationCache, getCachedProductCatalog } from '../utils/cacheStrategy.js';
import { ValidationResult } from './dataValidationService.js';
import { OrderService } from './orderService.js';
import { CustomerInsightsService } from './customerInsightsService.js';
import { resolveVendorSendingNumber } from './whatsapp/vendorSendingNumber.js';
import { publishToQueue } from '../queue/sqsClient.js';
import { env } from '../config/env.js';
import {
  findBestProductMatch
} from '../utils/productMatcher.js';
import {
  PRODUCT_MATCHING_THRESHOLD,
  PRODUCT_MATCHING_ENABLE_FUZZY,
  PRODUCT_MATCHING_ENABLE_AI_MULTILANG
} from '../config/env.js';

const orderService = new OrderService();
const insightsService = new CustomerInsightsService();

/**
 * Get vendor-specific matching configuration
 * Performance: Results should be cached by caller
 * 
 * @param vendorId - Vendor ID
 * @returns Vendor matching config or null
 */
async function getVendorMatchingConfig(vendorId: string): Promise<Record<string, unknown> | null> {
  try {
    // Use raw query to access matchingConfig until Prisma client is regenerated
    // After running migration and `npx prisma generate`, this can be updated to use typed Prisma client
    const vendor = await prisma.$queryRawUnsafe<Array<{ matchingConfig: unknown }>>(
      'SELECT "matchingConfig" FROM "Vendor" WHERE id = $1',
      vendorId
    );
    
    if (vendor && vendor.length > 0 && vendor[0]?.matchingConfig) {
      const config = vendor[0].matchingConfig;
      return typeof config === 'string'
        ? JSON.parse(config)
        : config as Record<string, unknown>;
    }
  } catch (error) {
    // If column doesn't exist yet (migration not run), return null gracefully
    logger.debug({ err: error, vendorId }, 'Failed to fetch vendor matching config (may need migration)');
  }
  
  return null;
}

/**
 * Get vendor's order count for current month
 */
async function getVendorOrderCountForMonth(vendorId: string): Promise<number> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const count = await prisma.order.count({
    where: {
      vendorId,
      createdAt: { gte: startOfMonth }
    }
  });
  return count + 1; // Next order number
}

async function generateOrderNumber(vendorId: string): Promise<string> {
  // Fetch vendor to get orderPrefix
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { orderPrefix: true }
  });

  // Use orderPrefix from vendor, or default to 'ORDER' if not set
  const prefix = (vendor?.orderPrefix || 'ORDER').toUpperCase().substring(0, 5).padEnd(5, 'X');
  
  // Get current date components
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const yearMonth = `${year}${month}`;
  
  // Get order count for current month
  const orderCount = await getVendorOrderCountForMonth(vendorId);
  
  // Format: ORD-{prefix}-YYYYMM{4-digit-count}
  return `ORD-${prefix}-${yearMonth}${String(orderCount).padStart(4, '0')}`;
}

/**
 * Merge and summarize special requests from multiple sources
 * Combines arrays and strings, removes duplicates, and creates a clean summary
 */
function mergeSpecialRequests(existing: string | null | undefined, newRequests: string | string[] | null | undefined): string | undefined {
  if (!newRequests) return existing || undefined;
  
  // Convert new requests to array
  const newArray = Array.isArray(newRequests) 
    ? newRequests 
    : typeof newRequests === 'string' 
      ? newRequests.split(/[;,\n]/).map(s => s.trim()).filter(s => s.length > 0)
      : [];
  
  if (newArray.length === 0) return existing || undefined;
  
  // Convert existing to array
  const existingArray = existing 
    ? existing.split(/[;,\n]/).map(s => s.trim()).filter(s => s.length > 0)
    : [];
  
  // Combine and deduplicate (case-insensitive)
  const combined = [...existingArray];
  for (const newReq of newArray) {
    const normalized = newReq.toLowerCase().trim();
    if (!combined.some(existing => existing.toLowerCase().trim() === normalized)) {
      combined.push(newReq);
    }
  }
  
  return combined.length > 0 ? combined.join('; ') : undefined;
}

/**
 * Merge delivery instructions from multiple sources
 * Combines existing and new instructions intelligently
 */
function mergeDeliveryInstructions(existing: string | null | undefined, newInstructions: string | null | undefined): string | undefined {
  if (!newInstructions) return existing || undefined;
  if (!existing) return newInstructions;
  
  // If both exist, combine them (new instructions appended)
  // Remove duplicates if they're the same
  const existingNormalized = existing.toLowerCase().trim();
  const newNormalized = newInstructions.toLowerCase().trim();
  
  if (existingNormalized === newNormalized) {
    return existing; // No change needed
  }
  
  // Combine with separator
  return `${existing}. ${newInstructions}`;
}

/**
 * Normalize extracted fields to match database schema
 * Maps common variations to standard field names
 */
function normalizeExtractedFields(extractedData: any): any {
  const normalized: any = { ...extractedData };

  // Map customer name variations
  if (extractedData.customerName && !normalized.customerName) {
    normalized.customerName = extractedData.customerName;
  }
  
  // Ensure customerInfo.name is set if customerName exists
  if (normalized.customerName) {
    normalized.customerInfo = normalized.customerInfo || {};
    normalized.customerInfo.name = normalized.customerName;
  }

  // Map address variations to deliveryAddress
  if (extractedData.address && !extractedData.deliveryAddress) {
    normalized.deliveryAddress = extractedData.address;
  }
  
  // Also check deliveryAddress from extractedInfo
  if (extractedData.deliveryAddress && !normalized.deliveryAddress) {
    normalized.deliveryAddress = extractedData.deliveryAddress;
  }

  // Map sweetness/preferences to specialRequests
  if (extractedData.sweetness && !extractedData.specialRequests) {
    const sweetnessText = typeof extractedData.sweetness === 'string' 
      ? extractedData.sweetness 
      : `Sweetness: ${extractedData.sweetness}`;
    
    normalized.specialRequests = extractedData.specialRequests 
      ? `${extractedData.specialRequests}. ${sweetnessText}`
      : sweetnessText;
  }

  // Map other common variations
  if (extractedData.deliveryInfo && !extractedData.deliveryAddress) {
    normalized.deliveryAddress = extractedData.deliveryInfo;
  }

  if (extractedData.preferences && !extractedData.specialRequests) {
    normalized.specialRequests = extractedData.preferences;
  }

  return normalized;
}

/**
 * Update order with delivery information
 */
async function updateOrderWithDeliveryInfo(
  orderId: string,
  deliveryAddress?: string,
  deliveryInstructions?: string,
  specialRequests?: string
): Promise<void> {
  try {
    const updateData: any = {};
    
    if (deliveryAddress) {
      updateData.deliveryAddress = deliveryAddress;
    }
    
    if (deliveryInstructions) {
      updateData.deliveryInstructions = deliveryInstructions;
    }
    
    if (specialRequests) {
      // Append to existing special requests if any
      const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
        select: { specialRequests: true }
      });
      
      if (existingOrder?.specialRequests) {
        updateData.specialRequests = `${existingOrder.specialRequests}. ${specialRequests}`;
      } else {
        updateData.specialRequests = specialRequests;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.order.update({
        where: { id: orderId },
        data: updateData
      });
      logger.info({ orderId, updateData }, 'Updated order with delivery information');
    }
  } catch (error) {
    logger.error({ err: error, orderId }, 'Failed to update order with delivery info');
    throw error;
  }
}

/**
 * Persist confirm-order details from the latest customer message so
 * validation and subsequent turns don't re-ask for already provided data.
 */
async function persistConfirmOrderDetails(
  conversationId: string,
  vendorId: string,
  customerId: string,
  response: any,
  orderId?: string
): Promise<void> {
  const extractedData = response?.extractedData || {};
  const rawAddress = extractedData?.deliveryAddress;
  const rawName = extractedData?.customerInfo?.name || extractedData?.customerName;

  const deliveryAddress = typeof rawAddress === 'string' && rawAddress.trim().length >= 10
    ? rawAddress.trim()
    : undefined;
  const customerName = typeof rawName === 'string' && rawName.trim().length > 0
    ? rawName.trim()
    : undefined;

  if (orderId && deliveryAddress) {
    await updateOrderWithDeliveryInfo(orderId, deliveryAddress);
  }

  if (deliveryAddress || customerName) {
    const customerInfoUpdates: any = {};
    if (deliveryAddress) {
      customerInfoUpdates.deliveryAddress = deliveryAddress;
    }
    if (customerName) {
      customerInfoUpdates.name = customerName;
    }

    await updateCustomerInsights(
      conversationId,
      vendorId,
      customerId,
      customerInfoUpdates
    );
  }

  if (deliveryAddress) {
    await saveDeliveryInfo(conversationId, deliveryAddress, customerId, vendorId);
  }
}

/**
 * Notify vendor via WhatsApp queue message about a post-sales event.
 * Fire-and-forget — errors are caught and logged, not rethrown.
 */
async function notifyVendorPostSales(
  vendorId: string,
  alertType: string,
  severity: string,
  messageText: string
): Promise<void> {
  try {
    const [vendorWhatsApp, vendor] = await Promise.all([
      resolveVendorSendingNumber(vendorId),
      prisma.vendor.findUnique({ where: { id: vendorId }, select: { phone: true } })
    ]);

    // Kept from the old vendor-relation lookup: no sending number means the
    // ping has no sender account, so there is nothing to queue.
    const vendorPhone = vendorWhatsApp ? vendor?.phone : null;
    if (!vendorPhone) {
      logger.warn({ vendorId, alertType }, 'notifyVendorPostSales: no vendor phone configured');
      return;
    }

    await publishToQueue(env.RESPONSE_QUEUE_URL, {
      type: 'text' as const,
      to: vendorPhone,
      text: messageText,
      vendorId,
      phoneNumberId: vendorWhatsApp?.phoneNumberId || '',
      metadata: { notificationType: alertType, severity }
    });
  } catch (error) {
    logger.error({ err: error, vendorId, alertType }, 'Failed to notify vendor for post-sales event');
  }
}

/**
 * Handle complaint, refund_request, return_request, and feedback intents.
 * Creates an OrderAlert (if a linkable order exists) and notifies the vendor.
 */
async function handlePostSalesIntent(
  intent: string,
  response: any,
  conversationId: string,
  vendorId: string,
  customerId: string
): Promise<void> {
  const extractedData = response?.extractedData || {};

  // Find the most recent order for this customer+vendor (to attach alert)
  const recentOrder = await prisma.order.findFirst({
    where: { conversationId, vendorId, status: { not: 'cancelled' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, orderNumber: true }
  });

  try {
    if (intent === 'complaint') {
      const complaintType = extractedData.complaintType || 'other';
      const severity = ['quality', 'wrong_item', 'damaged', 'price_dispute'].includes(complaintType) ? 'high' : 'medium';
      const alertMessage = `Customer complaint (${complaintType}): ${response?.response || 'No details'}`;

      // Price dispute: recalculate order total using unit-aware pricing
      if (complaintType === 'price_dispute' && recentOrder) {
        try {
          const orderToFix = await prisma.order.findUnique({
            where: { id: recentOrder.id },
            select: { id: true, items: true, totalAmount: true, vendorId: true }
          });
          if (orderToFix && orderToFix.items) {
            const products = await prisma.product.findMany({
              where: { vendorId, isActive: true }
            });
            const vendorConfig = await getVendorMatchingConfig(vendorId);
            const priceField = (vendorConfig?.productPriceField as string) || 'basePrice';
            const orderItems = Array.isArray(orderToFix.items) ? orderToFix.items : [];

            let recalculatedTotal = 0;
            for (const item of orderItems as any[]) {
              const productName = item.product || item.name || '';
              const match = await findBestProductMatch(productName, products, {
                threshold: PRODUCT_MATCHING_THRESHOLD,
                enableFuzzy: PRODUCT_MATCHING_ENABLE_FUZZY,
                enableAIMatching: PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
                vendorId
              });
              if (match) {
                const price = match.product[priceField] || match.product.basePrice || 0;
                const baseQuantity = Number(match.product.baseQuantity) || 1;
                const unitPrice = price / baseQuantity;
                // Enrich item with corrected per-item pricing
                item.unitPrice = Math.round(unitPrice);
                item.totalPrice = Math.round(unitPrice * (item.quantity || 0));
                item.matchedProductId = match.product.id;
                recalculatedTotal += item.totalPrice;
              }
            }

            if (recalculatedTotal !== orderToFix.totalAmount) {
              await prisma.order.update({
                where: { id: recentOrder.id },
                data: { totalAmount: recalculatedTotal, items: orderItems as any }
              });
              logger.info({
                vendorId, customerId, orderId: recentOrder.id,
                previousTotal: orderToFix.totalAmount,
                recalculatedTotal
              }, 'Price dispute: order total recalculated');
            }
          }
        } catch (priceError) {
          logger.error({ err: priceError, orderId: recentOrder.id }, 'Price dispute recalculation failed');
        }
      }

      if (recentOrder) {
        await prisma.orderAlert.create({
          data: {
            orderId: recentOrder.id,
            type: 'complaint',
            severity,
            message: alertMessage
          }
        });
      }

      await notifyVendorPostSales(
        vendorId,
        'complaint',
        severity,
        `⚠️ *Customer Complaint*\n\nType: ${complaintType}\nOrder: ${recentOrder?.orderNumber || 'No linked order'}\n\nDetails: ${alertMessage}\n\nPlease follow up with the customer.`
      );

      logger.info({ vendorId, customerId, complaintType, orderId: recentOrder?.id }, 'Complaint recorded');

    } else if (intent === 'refund_request') {
      const refundReason = extractedData.refundReason || 'Not specified';
      const refundAmount = extractedData.refundAmount ? `₹${extractedData.refundAmount}` : 'Amount not specified';
      const alertMessage = `Refund requested — Reason: ${refundReason}, Amount: ${refundAmount}`;

      if (recentOrder) {
        await prisma.orderAlert.create({
          data: {
            orderId: recentOrder.id,
            type: 'refund_request',
            severity: 'high',
            message: alertMessage
          }
        });
      }

      await notifyVendorPostSales(
        vendorId,
        'refund_request',
        'high',
        `💰 *Refund Request*\n\nOrder: ${recentOrder?.orderNumber || 'No linked order'}\nReason: ${refundReason}\nAmount: ${refundAmount}\n\nPlease review and process the refund.`
      );

      logger.info({ vendorId, customerId, refundReason, orderId: recentOrder?.id }, 'Refund request recorded');

    } else if (intent === 'return_request') {
      const returnReason = extractedData.returnReason || extractedData.refundReason || 'Not specified';
      const alertMessage = `Return requested — Reason: ${returnReason}`;

      if (recentOrder) {
        await prisma.orderAlert.create({
          data: {
            orderId: recentOrder.id,
            type: 'return_request',
            severity: 'high',
            message: alertMessage
          }
        });
      }

      await notifyVendorPostSales(
        vendorId,
        'return_request',
        'high',
        `📦 *Return Request*\n\nOrder: ${recentOrder?.orderNumber || 'No linked order'}\nReason: ${returnReason}\n\nPlease arrange pickup and process the return.`
      );

      logger.info({ vendorId, customerId, returnReason, orderId: recentOrder?.id }, 'Return request recorded');

    } else if (intent === 'feedback') {
      const feedbackText = extractedData.feedbackText || response?.response || 'No feedback text';
      const feedbackEntry = `[Feedback ${new Date().toISOString()}]: ${feedbackText}`;

      // Upsert so feedback is stored even for first-time customers with no insights record yet
      const insights = await prisma.customerInsights.findUnique({
        where: { customerId_vendorId: { customerId, vendorId } },
        select: { id: true, preferences: true }
      });

      if (insights) {
        const existing = insights.preferences ? `${insights.preferences}\n` : '';
        await prisma.customerInsights.update({
          where: { id: insights.id },
          data: { preferences: `${existing}${feedbackEntry}` }
        });
      } else {
        await prisma.customerInsights.create({
          data: {
            customerId,
            vendorId,
            preferences: feedbackEntry
          }
        });
      }

      logger.info({ vendorId, customerId }, 'Customer feedback stored in CustomerInsights');
    }
  } catch (error) {
    // Non-critical: log but do not surface to customer
    logger.error({ err: error, intent, vendorId, customerId }, 'handlePostSalesIntent failed');
  }
}

/**
 * Extract and save data to database with conflict resolution
 * ENHANCEMENT: Added audit logging, alert detection, concurrency handling, and metrics tracking
 */
export async function extractAndSave(
  response: any,
  validationResult: ValidationResult,
  conversationId: string,
  vendorId: string,
  customerId: string,
  intent?: string,
  conversationHistory?: Array<{ content: string; senderType: string; timestamp: Date }>, // NEW: Optional conversation history from context
  intentResult?: any // NEW: Intent classification result for orderUpdateType
): Promise<void> {
  // Only proceed if validation passed
  if (!validationResult.isValid) {
    // Important for confirm_order: customer may have just provided name/address.
    // Persist those details even when overall confirmation validation fails.
    if (intent === 'confirm_order') {
      const pendingOrder = await prisma.order.findFirst({
        where: {
          conversationId,
          vendorId,
          status: 'pending'
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });

      await persistConfirmOrderDetails(
        conversationId,
        vendorId,
        customerId,
        response,
        pendingOrder?.id
      );
    }

    await handleValidationErrors(validationResult.errors, conversationId, intent);
    return;
  }
  
  // NEW: Special handling for confirm_order
  if (intent === 'confirm_order') {
    // Get pending order
    const pendingOrder = await prisma.order.findFirst({
      where: {
        conversationId,
        vendorId,
        status: 'pending'
      },
      orderBy: { createdAt: 'desc' }
    });
    
    if (pendingOrder) {
      await persistConfirmOrderDetails(
        conversationId,
        vendorId,
        customerId,
        response,
        pendingOrder.id
      );

      // Update order status to confirmed
      await prisma.order.update({
        where: { id: pendingOrder.id },
        data: {
          status: 'confirmed',
          confirmedAt: new Date(),
          ...(validationResult.validatedData?.estimatedDelivery && {
            estimatedDelivery: new Date(validationResult.validatedData.estimatedDelivery)
          })
        }
      });
      
      logger.info({ orderId: pendingOrder.id, orderNumber: pendingOrder.orderNumber }, 'Order confirmed');
    }
    
    // Don't proceed with other updates for confirm_order
    return;
  }
  
  // NEW: Special handling for cancel_order
  if (intent === 'cancel_order') {
    // Get order to cancel (validation already checked it exists and is cancellable)
    const orderToCancel = await prisma.order.findFirst({
      where: {
        conversationId,
        vendorId,
        customerId,
        status: { in: ['pending', 'confirmed'] }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    if (orderToCancel && validationResult.isValid) {
      // Update order status to cancelled
      const cancellationReason = response?.extractedData?.cancellationReason || 
                                 validationResult.validatedData?.cancellationReason || 
                                 'Customer requested cancellation';
      
      await prisma.order.update({
        where: { id: orderToCancel.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: cancellationReason
        }
      });
      
      logger.info({ orderId: orderToCancel.id, orderNumber: orderToCancel.orderNumber }, 'Order cancelled');
    }
    
    // Don't proceed with other updates for cancel_order
    return;
  }
  
  // Post-sales intent handlers: complaint, refund_request, return_request, feedback
  const postSalesIntents = ['complaint', 'refund_request', 'return_request', 'feedback'];
  if (intent && postSalesIntents.includes(intent)) {
    await handlePostSalesIntent(intent, response, conversationId, vendorId, customerId);
    return; // Do not proceed to order creation / update logic
  }

  // NEW: Special handling for repeat_order
  // Note: repeat_order creates a new order similar to order_new, so it will proceed with normal order creation flow
  // Validation ensures previous order exists and products are available

  // CRITICAL FIX: Use AI response as source of truth for orderItems
  // AI response contains the complete order context, not just current message
  const aiExtractedData = response?.extractedData || {};
  const validatedData = validationResult.validatedData || {};

  // Log differences for monitoring
  if (aiExtractedData.orderItems && validatedData.orderItems) {
    const aiItemsCount = aiExtractedData.orderItems.length;
    const validatedItemsCount = validatedData.orderItems.length;
    
    if (aiItemsCount !== validatedItemsCount) {
      logger.warn({
        conversationId,
        vendorId,
        aiItemsCount,
        validatedItemsCount,
        aiItems: aiExtractedData.orderItems,
        validatedItems: validatedData.orderItems
      }, 'AI extracted orderItems differ from validated orderItems - using AI as source of truth');
    }
  }

  // Merge: Use AI extracted data as primary source, validated data as fallback
  const extractedData = {
    ...validatedData,
    // CRITICAL: If AI extracted orderItems, use those (complete order context)
    // Otherwise fall back to validated data
    orderItems: aiExtractedData.orderItems && aiExtractedData.orderItems.length > 0
      ? aiExtractedData.orderItems  // AI has items - use as source of truth
      : (validatedData.orderItems || []),  // Fallback to validated if AI empty
    // Also merge other fields from AI response
    deliveryAddress: aiExtractedData.deliveryAddress || validatedData.deliveryAddress,
    specialRequests: aiExtractedData.specialRequests || validatedData.specialRequests,
    deliveryInstructions: aiExtractedData.deliveryInstructions || validatedData.deliveryInstructions,
    // Handle customerNotes from OrderUpdateEvent - merge with specialRequests
    customerNotes: aiExtractedData.customerNotes || validatedData.customerNotes,
    // Extract customerInfo from PrimaryAIResponse if present
    customerInfo: aiExtractedData.customerInfo || validatedData.customerInfo,
  };

  // Log if we had to use fallback
  if (!aiExtractedData.orderItems || aiExtractedData.orderItems.length === 0) {
    if (validatedData.orderItems && validatedData.orderItems.length > 0) {
      logger.info({
        conversationId,
        vendorId,
        validatedItems: validatedData.orderItems
      }, 'AI did not extract orderItems, using validated data as fallback');
    }
  }

  // Handle customerNotes - merge with specialRequests if present
  if (extractedData.customerNotes && !extractedData.specialRequests) {
    extractedData.specialRequests = extractedData.customerNotes;
  } else if (extractedData.customerNotes && extractedData.specialRequests) {
    // Merge customerNotes with specialRequests
    extractedData.specialRequests = mergeSpecialRequests(
      extractedData.specialRequests,
      extractedData.customerNotes
    );
  }

  // Handle customerNotes - merge with specialRequests if present
  if (extractedData.customerNotes && !extractedData.specialRequests) {
    extractedData.specialRequests = extractedData.customerNotes;
  } else if (extractedData.customerNotes && extractedData.specialRequests) {
    // Merge customerNotes with specialRequests
    extractedData.specialRequests = mergeSpecialRequests(
      extractedData.specialRequests,
      extractedData.customerNotes
    );
  }

  // Normalize field names (map extracted fields to schema)
  const normalizedData = normalizeExtractedFields(extractedData);

  try {
    // Check for existing pending order
    // Safety check: if intent is order_new but a recent pending order exists in this
    // conversation, override to order_update to prevent duplicate orders (e.g., customer
    // adding items to an existing order that the AI misclassified as a new order).
    let effectiveIntent = intent;
    if (intent === 'order_new') {
      const recentPendingOrder = await prisma.order.findFirst({
        where: {
          conversationId,
          vendorId,
          status: { in: ['pending', 'confirmed'] },
          createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) } // 30 min window
        },
        orderBy: { createdAt: 'desc' }
      });
      if (recentPendingOrder) {
        logger.warn({
          conversationId,
          vendorId,
          existingOrderId: recentPendingOrder.id,
          originalIntent: intent
        }, 'order_new intent but recent pending order exists — overriding to order_update/add_items');
        effectiveIntent = 'order_update';
      }
    }

    const existingOrder = effectiveIntent === 'order_new'
      ? null
      : await prisma.order.findFirst({
          where: {
            conversationId,
            vendorId,
            status: { in: ['pending', 'confirmed'] }
          },
          orderBy: { createdAt: 'desc' }
        });

    // Update order with delivery address/special requests even without orderItems.
    // For `order_new`, defer ALL writes to the newly-created row inside updateOrCreateOrder
    // to prevent cross-order contamination of specialRequests/deliveryAddress.
    if (existingOrder && (normalizedData.deliveryAddress || normalizedData.specialRequests || normalizedData.deliveryInstructions)) {
      await updateOrderWithDeliveryInfo(
        existingOrder.id,
        normalizedData.deliveryAddress,
        normalizedData.deliveryInstructions,
        normalizedData.specialRequests
      );
    }

    // Extract order information
    if (normalizedData.orderItems && Array.isArray(normalizedData.orderItems) && normalizedData.orderItems.length > 0) {
      // Same rule: skip lookup for order_new so we always create fresh.
      const currentOrder = effectiveIntent === 'order_new'
        ? null
        : await prisma.order.findFirst({
            where: {
              conversationId,
              vendorId,
              status: { in: ['pending', 'confirmed'] }
            },
            orderBy: { createdAt: 'desc' }
          });

      let orderUpdateType = normalizedData.orderUpdateType || intentResult?.extractedInfo?.orderUpdateType;
      const updateStartTime = Date.now();

      // CRITICAL FIX: If intent is order_update but orderUpdateType is null, default to 'add_items' (safest)
      // This prevents accidental order replacement when orderUpdateType is missing
      if (!orderUpdateType && effectiveIntent === 'order_update' && currentOrder) {
        logger.warn({
          conversationId,
          vendorId,
          intent,
          hasExistingOrder: !!currentOrder,
          normalizedOrderUpdateType: normalizedData.orderUpdateType,
          intentResultOrderUpdateType: intentResult?.extractedInfo?.orderUpdateType
        }, 'orderUpdateType is null for order_update intent - defaulting to add_items to prevent order replacement');
        orderUpdateType = 'add_items'; // Safest default - preserves existing items
      }

      // ENHANCEMENT: Use transaction with concurrency handling
      let previousOrderState: any = null;
      let newOrderState: any = null;
      let orderIntent: any = null;

      if (currentOrder) {
        // Store previous state for audit logging
        previousOrderState = {
          items: currentOrder.items,
          totalAmount: currentOrder.totalAmount,
          deliveryAddress: currentOrder.deliveryAddress,
          deliveryInstructions: currentOrder.deliveryInstructions,
          specialRequests: currentOrder.specialRequests
        };

        // Get order intent from intentResult
        if (intentResult?.extractedInfo) {
          orderIntent = {
            type: orderUpdateType === 'add_items' ? 'add' :
                  orderUpdateType === 'remove_items' ? 'remove' :
                  orderUpdateType === 'change_quantity' ? 'change' :
                  orderUpdateType === 'replace_order' ? 'replace' : 'add',
            confidence: intentResult.confidence || 0.8
          };
        }
      }

      try {
        if (orderUpdateType === 'add_items' && currentOrder) {
          // Add items to existing order with retry logic for transaction conflicts
          await addItemsToOrderWithRetry(currentOrder.id, normalizedData.orderItems, vendorId);
          // Record metrics
          const { recordHandlerCall } = await import('./orderMetricsService.js');
          recordHandlerCall('addItems', Date.now() - updateStartTime, false);
        } else if (orderUpdateType === 'remove_items' && currentOrder) {
          // Remove items from order
          await removeItemsFromOrder(currentOrder.id, normalizedData.itemsToRemove || [], vendorId);
          // Record metrics
          const { recordHandlerCall } = await import('./orderMetricsService.js');
          recordHandlerCall('removeItems', Date.now() - updateStartTime, false);
        } else if (orderUpdateType === 'change_quantity' && currentOrder) {
          // Update quantities
          await updateOrderQuantities(currentOrder.id, normalizedData.quantityChanges || [], vendorId);
          // Record metrics
          const { recordHandlerCall } = await import('./orderMetricsService.js');
          recordHandlerCall('changeQuantity', Date.now() - updateStartTime, false);
        } else if (orderUpdateType === 'replace_order' && currentOrder) {
          // Replace entire order
          await replaceOrder(currentOrder.id, normalizedData.orderItems, vendorId);
          // Record metrics
          const { recordHandlerCall } = await import('./orderMetricsService.js');
          recordHandlerCall('replaceOrder', Date.now() - updateStartTime, false);
        } else {
          // Default: update or create order
          await updateOrCreateOrder(conversationId, vendorId, customerId, normalizedData, intent);
        }

        // Record transaction success
        const { recordTransaction, recordOrderUpdate } = await import('./orderMetricsService.js');
        recordTransaction(true);
        recordOrderUpdate(Date.now() - updateStartTime);

        // ENHANCEMENT: Get updated order state for audit logging
        if (currentOrder) {
          const updatedOrder = await prisma.order.findUnique({
            where: { id: currentOrder.id }
          });

          if (updatedOrder) {
            newOrderState = {
              items: updatedOrder.items,
              totalAmount: updatedOrder.totalAmount,
              deliveryAddress: updatedOrder.deliveryAddress,
              deliveryInstructions: updatedOrder.deliveryInstructions,
              specialRequests: updatedOrder.specialRequests
            };

            // ENHANCEMENT: Log order change to audit log
            const { logOrderChange, calculateOrderChangeDiff } = await import('./orderTrackingService.js');
            const changes = calculateOrderChangeDiff(previousOrderState, newOrderState);
            await logOrderChange(
              currentOrder.id,
              orderUpdateType || 'update',
              changes,
              orderIntent,
              previousOrderState,
              newOrderState
            );

            // ENHANCEMENT: Detect and create alerts for suspicious changes
            const { detectAndCreateAlerts } = await import('./orderAlertService.js');
            await detectAndCreateAlerts(
              currentOrder.id,
              previousOrderState,
              newOrderState,
              changes
            );

            // CRITICAL: Data consistency check - verify database matches AI understanding
            const aiItemsCount = extractedData.orderItems?.length || 0;
            const dbItemsCount = Array.isArray(updatedOrder.items) ? updatedOrder.items.length : 0;
            const previousItemsCount = Array.isArray(previousOrderState.items) ? previousOrderState.items.length : 0;
            
            // Check for data loss scenarios
            if (orderUpdateType === 'add_items' && previousItemsCount > 0) {
              // For add_items, database should have MORE items than before
              if (dbItemsCount < previousItemsCount) {
                logger.error({
                  conversationId,
                  vendorId,
                  orderId: currentOrder.id,
                  orderUpdateType,
                  previousItemsCount,
                  dbItemsCount,
                  aiItemsCount,
                  previousItems: previousOrderState.items,
                  dbItems: updatedOrder.items,
                  aiItems: extractedData.orderItems
                }, 'CRITICAL ALERT: Items lost during add_items operation - database has fewer items than before!');
              }
            }
            
            // Check if AI extracted more items than what's in database
            if (aiItemsCount > 0 && dbItemsCount < aiItemsCount && orderUpdateType !== 'remove_items') {
              logger.warn({
                conversationId,
                vendorId,
                orderId: currentOrder.id,
                orderUpdateType,
                aiItemsCount,
                dbItemsCount,
                aiItems: extractedData.orderItems,
                dbItems: updatedOrder.items
              }, 'WARNING: Database order has fewer items than AI extracted - possible data loss');
            }
            
            // Check for unexpected item replacement
            if (orderUpdateType === 'add_items' && previousItemsCount > 0 && dbItemsCount === aiItemsCount) {
              // If we're adding items but DB count equals AI count, items might have been replaced
              const previousItemNames = (previousOrderState.items as any[]).map((i: any) => 
                (i.product || i.name || '').toLowerCase().trim()
              );
              const dbItemNames = (updatedOrder.items as any[]).map((i: any) => 
                (i.product || i.name || '').toLowerCase().trim()
              );
              const itemsPreserved = previousItemNames.filter(name => dbItemNames.includes(name)).length;
              
              if (itemsPreserved < previousItemsCount * 0.5) {
                logger.error({
                  conversationId,
                  vendorId,
                  orderId: currentOrder.id,
                  orderUpdateType,
                  previousItemsCount,
                  dbItemsCount,
                  itemsPreserved,
                  previousItems: previousOrderState.items,
                  dbItems: updatedOrder.items
                }, 'CRITICAL ALERT: Most existing items replaced during add_items operation - possible bug!');
              }
            }
          }
        }
      } catch (error) {
        // Record transaction failure
        const { recordTransaction, recordHandlerCall } = await import('./orderMetricsService.js');
        recordTransaction(false);
        
        // Record handler error
        if (orderUpdateType === 'add_items') {
          recordHandlerCall('addItems', Date.now() - updateStartTime, true);
        } else if (orderUpdateType === 'remove_items') {
          recordHandlerCall('removeItems', Date.now() - updateStartTime, true);
        } else if (orderUpdateType === 'change_quantity') {
          recordHandlerCall('changeQuantity', Date.now() - updateStartTime, true);
        } else if (orderUpdateType === 'replace_order') {
          recordHandlerCall('replaceOrder', Date.now() - updateStartTime, true);
        }
        
        throw error;
      }
    }

    // OPTIMIZATION: Parallelize independent database operations
    const [historyToUse, finalOrder] = await Promise.all([
      // Fetch conversation history (reuse from context if available)
      conversationHistory || prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'desc' },
        take: 30,
        select: {
          content: true,
          senderType: true,
          timestamp: true
        }
      }),
      // Get final order state from database (after all updates)
      prisma.order.findFirst({
        where: {
          conversationId,
          vendorId,
          status: { in: ['pending', 'confirmed'] }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    // Get latest customer message as current message
    const latestCustomerMessage = historyToUse
      .reverse()
      .find(msg => msg.senderType === 'customer')?.content || '';

    // CRITICAL FIX: Generate lastOrderSummary from actual order in database, not just extracted data
    let finalOrderSummary = '';
    
    if (finalOrder?.items) {
      // Use actual order items from database (complete order state)
      finalOrderSummary = extractOrderSummary({ orderItems: finalOrder.items });
    } else {
      // Fallback: use extracted data if no order found
      finalOrderSummary = extractOrderSummary(extractedData);
    }

    // Update conversation memory (keyFacts will be auto-extracted using AI)
    // This also returns extracted customer information
    const memoryUpdateResult = await updateConversationMemory(conversationId, vendorId, {
      conversationHistory: historyToUse.reverse(), // Chronological order
      currentMessage: latestCustomerMessage,
      ongoingTopics: extractOngoingTopics(response),
      lastOrderSummary: finalOrderSummary, // Use final order state from database
      incrementTurn: true
    });

    // Build customer info from multiple sources
    // Start with normalizedData.customerInfo, then merge from PrimaryAIResponse, then memory extraction
    let customerInfoToUpdate: any = normalizedData.customerInfo || {};
    
    // Also check if customerInfo was extracted in the merged extractedData
    if (extractedData.customerInfo && !customerInfoToUpdate.name) {
      customerInfoToUpdate = { ...customerInfoToUpdate, ...extractedData.customerInfo };
    }

    // 1. Extract from memory extraction (customerInformation)
    if (memoryUpdateResult.customerInformation) {
      const memInfo = memoryUpdateResult.customerInformation;
      if (memInfo.name && !customerInfoToUpdate.name && !customerInfoToUpdate.customerName) {
        customerInfoToUpdate.name = memInfo.name;
        logger.info({ conversationId, customerName: memInfo.name }, 'Extracted customer name from memory');
      }
      if (memInfo.email && !customerInfoToUpdate.email) {
        customerInfoToUpdate.email = memInfo.email;
      }
      if (memInfo.phoneNumber && !customerInfoToUpdate.phone && !customerInfoToUpdate.alternativePhoneNumber) {
        customerInfoToUpdate.phone = memInfo.phoneNumber;
      }
      // Handle addresses array
      if (Array.isArray(memInfo.addresses) && memInfo.addresses.length > 0) {
        const firstAddress = memInfo.addresses[0];
        if (firstAddress && !customerInfoToUpdate.deliveryAddress && !customerInfoToUpdate.address) {
          customerInfoToUpdate.deliveryAddress = firstAddress;
        }
      }
    }

    // 1.5. Also extract from PrimaryAIResponse customerInfo if present
    if (response?.extractedData?.customerInfo) {
      const primaryCustomerInfo = response.extractedData.customerInfo;
      if (primaryCustomerInfo.name && !customerInfoToUpdate.name && !customerInfoToUpdate.customerName) {
        customerInfoToUpdate.name = primaryCustomerInfo.name;
        logger.info({ conversationId, customerName: primaryCustomerInfo.name }, 'Extracted customer name from PrimaryAIResponse');
      }
      if (primaryCustomerInfo.email && !customerInfoToUpdate.email) {
        customerInfoToUpdate.email = primaryCustomerInfo.email;
      }
      if (primaryCustomerInfo.phone && !customerInfoToUpdate.phone && !customerInfoToUpdate.alternativePhoneNumber) {
        customerInfoToUpdate.alternativePhoneNumber = primaryCustomerInfo.phone;
      }
    }

    // 2. Extract special requests and delivery instructions from customerPreferences
    if (memoryUpdateResult.customerPreferences) {
      const prefs = memoryUpdateResult.customerPreferences;
      
      // Extract special requests (can be array or string)
      if (prefs.specialRequests) {
        const existingSpecialRequests = customerInfoToUpdate.specialRequests;
        customerInfoToUpdate.specialRequests = mergeSpecialRequests(
          existingSpecialRequests,
          prefs.specialRequests
        );
        if (customerInfoToUpdate.specialRequests) {
          logger.info({ 
            conversationId, 
            specialRequests: customerInfoToUpdate.specialRequests 
          }, 'Extracted special requests from memory');
        }
      }
      
      // Extract delivery instructions
      if (prefs.deliveryInstructions) {
        const existingInstructions = customerInfoToUpdate.deliveryInstructions;
        customerInfoToUpdate.deliveryInstructions = mergeDeliveryInstructions(
          existingInstructions,
          prefs.deliveryInstructions
        );
        if (customerInfoToUpdate.deliveryInstructions) {
          logger.info({ 
            conversationId, 
            deliveryInstructions: customerInfoToUpdate.deliveryInstructions 
          }, 'Extracted delivery instructions from memory');
        }
      }
      
      // Extract delivery location if available
      if (prefs.deliveryLocation && !customerInfoToUpdate.deliveryAddress) {
        customerInfoToUpdate.deliveryAddress = prefs.deliveryLocation;
      }
    }

    // 3. Also check conversation memory for existing special requests and merge
    const currentMemory = await prisma.conversationMemory.findUnique({
      where: { conversationId },
      select: { customerPreferences: true }
    });

    if (currentMemory?.customerPreferences) {
      const memPrefs = currentMemory.customerPreferences as any;
      
      // Merge special requests from stored memory
      if (memPrefs.preferences?.specialRequests) {
        customerInfoToUpdate.specialRequests = mergeSpecialRequests(
          customerInfoToUpdate.specialRequests,
          memPrefs.preferences.specialRequests
        );
      }
      
      // Merge delivery instructions from stored memory
      if (memPrefs.preferences?.deliveryInstructions) {
        customerInfoToUpdate.deliveryInstructions = mergeDeliveryInstructions(
          customerInfoToUpdate.deliveryInstructions,
          memPrefs.preferences.deliveryInstructions
        );
      }
    }

    // 4. Get existing customer insights to merge with
    const existingInsights = await prisma.customerInsights.findUnique({
      where: {
        customerId_vendorId: {
          customerId,
          vendorId
        }
      },
      select: {
        specialRequests: true,
        deliveryInstructions: true,
        customerName: true
      }
    });

    // Merge with existing insights
    if (existingInsights) {
      if (existingInsights.specialRequests && customerInfoToUpdate.specialRequests) {
        customerInfoToUpdate.specialRequests = mergeSpecialRequests(
          existingInsights.specialRequests,
          customerInfoToUpdate.specialRequests
        );
      } else if (existingInsights.specialRequests && !customerInfoToUpdate.specialRequests) {
        customerInfoToUpdate.specialRequests = existingInsights.specialRequests;
      }

      if (existingInsights.deliveryInstructions && customerInfoToUpdate.deliveryInstructions) {
        customerInfoToUpdate.deliveryInstructions = mergeDeliveryInstructions(
          existingInsights.deliveryInstructions,
          customerInfoToUpdate.deliveryInstructions
        );
      } else if (existingInsights.deliveryInstructions && !customerInfoToUpdate.deliveryInstructions) {
        customerInfoToUpdate.deliveryInstructions = existingInsights.deliveryInstructions;
      }
    }

    // OPTIMIZATION: Parallelize independent updates
    await Promise.all([
      // Update customer insights (if we have any customer info to update)
      Object.keys(customerInfoToUpdate).length > 0
        ? updateCustomerInsights(conversationId, vendorId, customerId, customerInfoToUpdate)
        : Promise.resolve(),
      
      // Save delivery info (if needed)
      normalizedData.deliveryAddress
        ? saveDeliveryInfo(conversationId, normalizedData.deliveryAddress, customerId, vendorId)
        : Promise.resolve(),
      
      // Invalidate caches (non-blocking)
      invalidateConversationCache(conversationId).catch(err => 
        logger.warn({ err, conversationId }, 'Cache invalidation failed, continuing')
      )
    ]);
  } catch (error) {
    logger.error({ err: error, conversationId, vendorId }, 'Failed to extract and save data');
    throw error;
  }
}

/**
 * Add items to existing order with retry logic for transaction conflicts
 * Handles race conditions when multiple updates happen simultaneously
 * 
 * @param orderId - Order ID
 * @param items - Items to add
 * @param vendorId - Vendor ID for product matching
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 */
async function addItemsToOrderWithRetry(
  orderId: string, 
  items: any[], 
  vendorId: string, 
  maxRetries: number = 3
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await addItemsToOrder(orderId, items, vendorId);
    } catch (error: any) {
      // Prisma transaction conflict error code
      const isTransactionConflict = error?.code === 'P2034' || 
                                    error?.message?.includes('transaction') ||
                                    error?.message?.includes('concurrent');
      
      if (isTransactionConflict && attempt < maxRetries) {
        const backoffMs = 100 * attempt; // Exponential backoff: 100ms, 200ms, 300ms
        logger.warn({
          orderId,
          attempt,
          maxRetries,
          backoffMs,
          errorCode: error?.code,
          errorMessage: error?.message
        }, 'Transaction conflict detected, retrying addItemsToOrder...');
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      // Not a transaction conflict or max retries reached - throw error
      throw error;
    }
  }
}

/**
 * Add items to existing order with fuzzy matching
 * Performance: Uses cached products, vendor-agnostic field access
 * 
 * @param orderId - Order ID
 * @param items - Items to add
 * @param vendorId - Vendor ID for product matching
 */
async function addItemsToOrder(orderId: string, items: any[], vendorId: string): Promise<void> {
  // Validation: Check items array is not empty
  if (!items || items.length === 0) {
    throw new Error('Cannot add items: items array is empty');
  }

  // Validation: Check each item has product name and valid quantity
  for (const item of items) {
    const productName = item.product || item.name || '';
    const quantity = item.quantity || 0;
    
    if (!productName.trim()) {
      throw new Error('Cannot add item: product name is required');
    }
    
    if (quantity <= 0) {
      throw new Error(`Cannot add item "${productName}": quantity must be greater than 0`);
    }
  }

  // Wrap in transaction for atomicity
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Get current items
    const currentItems = (order.items as any[]) || [];

    // CRITICAL FIX: Check for duplicates before adding items
    // Merge quantities if same product exists, otherwise add new item
    const updatedItems = [...currentItems];

    for (const newItem of items) {
      const productName = (newItem.product || newItem.name || '').toLowerCase().trim();
      
      if (!productName) {
        logger.warn({ newItem }, 'Skipping item with no product name');
        continue;
      }
      
      // Find existing item with same product (fuzzy match)
      const existingIndex = updatedItems.findIndex(item => {
        const itemName = (item.product || item.name || '').toLowerCase().trim();
        if (!itemName) return false;
        
        // Exact match
        if (itemName === productName) return true;
        
        // Fuzzy match: check if one contains the other
        if (itemName.includes(productName) || productName.includes(itemName)) return true;
        
        return false;
      });
      
      if (existingIndex >= 0) {
        // Merge quantities instead of adding duplicate
        const existingQuantity = updatedItems[existingIndex].quantity || 0;
        const newQuantity = newItem.quantity || 0;
        updatedItems[existingIndex].quantity = existingQuantity + newQuantity;
        
        logger.debug({ 
          productName, 
          existingQuantity, 
          newQuantity, 
          mergedQuantity: existingQuantity + newQuantity 
        }, 'Merged duplicate item quantities');
      } else {
        // Add new item
        updatedItems.push(newItem);
      }
    }

    // Performance: Use cached products when available
    let products = await tx.product.findMany({
      where: { vendorId, isActive: true }
    });

    try {
      const cached = await getCachedProductCatalog(vendorId);
      if (cached && cached.length > 0) {
        products = cached;
      }
    } catch (error) {
      logger.debug({ err: error, vendorId }, 'Using DB products instead of cache');
    }

    // Get vendor config for field names (vendor-agnostic)
    const vendorConfig = await getVendorMatchingConfig(vendorId);
    const priceField = (vendorConfig?.productPriceField as string) || 'basePrice';

    // OPTIMIZATION: Parallelize product matching for all items
    const matchingPromises = updatedItems.map(async (item) => {
      const productName = item.product || item.name || '';
      
      if (!productName) {
        return { item, match: null };
      }
      
      // Use fuzzy matching (async)
      const match = await findBestProductMatch(productName, products, {
        threshold: PRODUCT_MATCHING_THRESHOLD,
        enableFuzzy: PRODUCT_MATCHING_ENABLE_FUZZY,
        enableAIMatching: PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
        vendorId
      });
      
      return { item, match };
    });
    
    const matchedResults = await Promise.all(matchingPromises);
    
    // Recalculate total using matched products
    let newTotal = 0;
    for (const { item, match } of matchedResults) {
      if (match) {
        // Auto-correct product name
        item.product = match.matchedName;
        // Use configurable price field (vendor-agnostic) with unit-aware pricing
        const price = match.product[priceField] || match.product.price || match.product.basePrice || 0;
        const baseQuantity = Number(match.product.baseQuantity) || 1;
        const unitPrice = price / baseQuantity;
        // Enrich item with per-item pricing for UI display
        item.unitPrice = Math.round(unitPrice);
        item.totalPrice = Math.round(unitPrice * (item.quantity || 0));
        item.matchedProductId = match.product.id;
        if (!item.unit) {
          item.unit = (match.product as any).baseUnit || undefined;
        }
        newTotal += item.totalPrice;
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        items: updatedItems as any,
        totalAmount: newTotal
      }
    });
  }, {
    isolationLevel: 'ReadCommitted',
    maxWait: 5000,
    timeout: 10000
  }).catch((error) => {
    logger.error({ err: error, orderId }, 'Failed to add items to order');
    throw error;
  });
}

/**
 * Remove items from order using fuzzy matching
 * Performance: Uses cached products, fuzzy matching for removal
 * 
 * @param orderId - Order ID
 * @param itemsToRemove - Product names to remove (may contain typos)
 * @param vendorId - Vendor ID for product matching
 */
async function removeItemsFromOrder(orderId: string, itemsToRemove: string[], vendorId: string): Promise<void> {
  // Validation: Check itemsToRemove array is not empty
  if (!itemsToRemove || itemsToRemove.length === 0) {
    throw new Error('Cannot remove items: itemsToRemove array is empty');
  }

  // Wrap in transaction for atomicity
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const currentItems = (order.items as any[]) || [];
    
    // Validation: Ensure at least one item remains after removal
    if (currentItems.length <= itemsToRemove.length) {
      throw new Error('Cannot remove all items from order. Order must have at least one item.');
    }

    // Performance: Use cached products when available
    let products = await tx.product.findMany({
      where: { vendorId, isActive: true }
    });

    try {
      const cached = await getCachedProductCatalog(vendorId);
      if (cached && cached.length > 0) {
        products = cached;
      }
    } catch (error) {
      logger.debug({ err: error, vendorId }, 'Using DB products instead of cache');
    }
    
    // Use fuzzy matching to find items to remove
    const itemsToRemoveMatches = await Promise.all(
      itemsToRemove.map(async (removeName) => {
        const match = await findBestProductMatch(removeName, products, {
          threshold: PRODUCT_MATCHING_THRESHOLD,
          enableFuzzy: PRODUCT_MATCHING_ENABLE_FUZZY,
          enableAIMatching: PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
          vendorId
        });
        return match?.matchedName || removeName;
      })
    );

    // Filter items using matched names
    const updatedItems = currentItems.filter(item => {
      const itemName = (item.product || item.name || '').toLowerCase();
      return !itemsToRemoveMatches.some(removeName =>
        itemName === removeName.toLowerCase() ||
        itemName.includes(removeName.toLowerCase()) ||
        removeName.toLowerCase().includes(itemName)
      );
    });

    // Validation: Double-check at least one item remains
    if (updatedItems.length === 0) {
      throw new Error('Cannot remove all items from order. Order must have at least one item.');
    }

    // Get vendor config for field names (vendor-agnostic)
    const vendorConfig = await getVendorMatchingConfig(vendorId);
    const priceField = (vendorConfig?.productPriceField as string) || 'basePrice';

    // Recalculate total using fuzzy matching
    let newTotal = 0;
    for (const item of updatedItems) {
      const productName = item.product || item.name || '';
      
      // Use fuzzy matching (async)
      const match = await findBestProductMatch(productName, products, {
        threshold: PRODUCT_MATCHING_THRESHOLD,
        enableFuzzy: PRODUCT_MATCHING_ENABLE_FUZZY,
        enableAIMatching: PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
        vendorId
      });
      
      if (match) {
        // Use configurable price field (vendor-agnostic) with unit-aware pricing
        const price = match.product[priceField] || match.product.price || match.product.basePrice || 0;
        const baseQuantity = Number(match.product.baseQuantity) || 1;
        const unitPrice = price / baseQuantity;
        // Enrich item with per-item pricing for UI display
        item.unitPrice = Math.round(unitPrice);
        item.totalPrice = Math.round(unitPrice * (item.quantity || 0));
        item.matchedProductId = match.product.id;
        if (!item.unit) {
          item.unit = (match.product as any).baseUnit || undefined;
        }
        newTotal += item.totalPrice;
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        items: updatedItems as any,
        totalAmount: newTotal
      }
    });
  }, {
    isolationLevel: 'ReadCommitted',
    maxWait: 5000,
    timeout: 10000
  }).catch((error) => {
    logger.error({ err: error, orderId }, 'Failed to remove items from order');
    throw error;
  });
}

/**
 * Update order quantities using fuzzy matching
 * Performance: Uses cached products, fuzzy matching for product identification
 * 
 * @param orderId - Order ID
 * @param quantityChanges - Array of product name and new quantity pairs
 * @param vendorId - Vendor ID for product matching
 */
async function updateOrderQuantities(orderId: string, quantityChanges: Array<{ product: string, newQuantity: number }>, vendorId: string): Promise<void> {
  // Validation: Check quantityChanges array is not empty
  if (!quantityChanges || quantityChanges.length === 0) {
    throw new Error('Cannot update quantities: quantityChanges array is empty');
  }

  // Validation: Check all quantities are valid
  for (const change of quantityChanges) {
    if (!change.product || !change.product.trim()) {
      throw new Error('Cannot update quantity: product name is required');
    }
    
    if (change.newQuantity <= 0) {
      throw new Error(`Cannot update quantity for "${change.product}": quantity must be greater than 0`);
    }
  }

  // Wrap in transaction for atomicity
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    const currentItems = (order.items as any[]) || [];
    
    // Validation: Check products exist in order
    const productNames = currentItems.map(item => (item.product || item.name || '').toLowerCase());
    const changesToApply = quantityChanges.filter(change => {
      const changeProduct = change.product.toLowerCase();
      return productNames.some(name => name === changeProduct || name.includes(changeProduct) || changeProduct.includes(name));
    });
    
    if (changesToApply.length === 0) {
      throw new Error('Cannot update quantities: none of the specified products exist in the order');
    }

    // Performance: Use cached products when available
    let products = await tx.product.findMany({
      where: { vendorId, isActive: true }
    });

    try {
      const cached = await getCachedProductCatalog(vendorId);
      if (cached && cached.length > 0) {
        products = cached;
      }
    } catch (error) {
      logger.debug({ err: error, vendorId }, 'Using DB products instead of cache');
    }
    
    // Use fuzzy matching to find products to update
    const updatedItems = await Promise.all(
      currentItems.map(async (item) => {
        const itemName = item.product || item.name || '';
        
        // Find matching quantity change using fuzzy matching
        for (const change of quantityChanges) {
          const match = await findBestProductMatch(change.product, products, {
            threshold: PRODUCT_MATCHING_THRESHOLD,
            enableFuzzy: PRODUCT_MATCHING_ENABLE_FUZZY,
            enableAIMatching: PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
            vendorId
          });
          
          if (match && (itemName.toLowerCase() === match.matchedName.toLowerCase() || 
                       itemName.toLowerCase().includes(match.matchedName.toLowerCase()))) {
            return { ...item, quantity: change.newQuantity };
          }
        }
        
        return item;
      })
    );

    // Get vendor config for field names (vendor-agnostic)
    const vendorConfig = await getVendorMatchingConfig(vendorId);
    const priceField = (vendorConfig?.productPriceField as string) || 'basePrice';

    // Recalculate total using fuzzy matching
    let newTotal = 0;
    for (const item of updatedItems) {
      const productName = item.product || item.name || '';
      
      // Use fuzzy matching (async)
      const match = await findBestProductMatch(productName, products, {
        threshold: PRODUCT_MATCHING_THRESHOLD,
        enableFuzzy: PRODUCT_MATCHING_ENABLE_FUZZY,
        enableAIMatching: PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
        vendorId
      });
      
      if (match) {
        // Use configurable price field (vendor-agnostic) with unit-aware pricing
        const price = match.product[priceField] || match.product.price || match.product.basePrice || 0;
        const baseQuantity = Number(match.product.baseQuantity) || 1;
        const unitPrice = price / baseQuantity;
        // Enrich item with per-item pricing for UI display
        item.unitPrice = Math.round(unitPrice);
        item.totalPrice = Math.round(unitPrice * (item.quantity || 0));
        item.matchedProductId = match.product.id;
        if (!item.unit) {
          item.unit = (match.product as any).baseUnit || undefined;
        }
        newTotal += item.totalPrice;
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        items: updatedItems as any,
        totalAmount: newTotal
      }
    });
  }, {
    isolationLevel: 'ReadCommitted',
    maxWait: 5000,
    timeout: 10000
  }).catch((error) => {
    logger.error({ err: error, orderId }, 'Failed to update order quantities');
    throw error;
  });
}

/**
 * Replace entire order with new items using fuzzy matching
 * Performance: Uses cached products, fuzzy matching for product identification
 * 
 * @param orderId - Order ID
 * @param items - New items to replace order with
 * @param vendorId - Vendor ID for product matching
 */
async function replaceOrder(orderId: string, items: any[], vendorId: string): Promise<void> {
  // Validation: Check items array is not empty
  if (!items || items.length === 0) {
    throw new Error('Cannot replace order: items array is empty');
  }

  // Validation: Check each item has product name and valid quantity
  for (const item of items) {
    const productName = item.product || item.name || '';
    const quantity = item.quantity || 0;
    
    if (!productName.trim()) {
      throw new Error('Cannot replace order: all items must have a product name');
    }
    
    if (quantity <= 0) {
      throw new Error(`Cannot replace order: item "${productName}" has invalid quantity (${quantity})`);
    }
  }

  // Wrap in transaction for atomicity
  return await prisma.$transaction(async (tx) => {
    // Performance: Use cached products when available
    let products = await tx.product.findMany({
      where: { vendorId, isActive: true }
    });

    try {
      const cached = await getCachedProductCatalog(vendorId);
      if (cached && cached.length > 0) {
        products = cached;
      }
    } catch (error) {
      logger.debug({ err: error, vendorId }, 'Using DB products instead of cache');
    }

    // Get vendor config for field names (vendor-agnostic)
    const vendorConfig = await getVendorMatchingConfig(vendorId);
    const priceField = (vendorConfig?.productPriceField as string) || 'basePrice';

    // Recalculate total using fuzzy matching
    let newTotal = 0;
    for (const item of items) {
      const productName = item.product || item.name || '';
      
      // Use fuzzy matching (async)
      const match = await findBestProductMatch(productName, products, {
        threshold: PRODUCT_MATCHING_THRESHOLD,
        enableFuzzy: PRODUCT_MATCHING_ENABLE_FUZZY,
        enableAIMatching: PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
        vendorId
      });
      
      if (match) {
        // Auto-correct product name
        item.product = match.matchedName;
        // Use configurable price field (vendor-agnostic) with unit-aware pricing
        const price = match.product[priceField] || match.product.price || match.product.basePrice || 0;
        const baseQuantity = Number(match.product.baseQuantity) || 1;
        const unitPrice = price / baseQuantity;
        // Enrich item with per-item pricing for UI display
        item.unitPrice = Math.round(unitPrice);
        item.totalPrice = Math.round(unitPrice * (item.quantity || 0));
        item.matchedProductId = match.product.id;
        if (!item.unit) {
          item.unit = (match.product as any).baseUnit || undefined;
        }
        newTotal += item.totalPrice;
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        items: items as any,
        totalAmount: newTotal
      }
    });
  }, {
    isolationLevel: 'ReadCommitted',
    maxWait: 5000,
    timeout: 10000
  }).catch((error) => {
    logger.error({ err: error, orderId }, 'Failed to replace order');
    throw error;
  });
}

/**
 * Update or create order using fuzzy matching
 * Performance: Uses cached products, transaction safety, vendor-agnostic
 * 
 * @param conversationId - Conversation ID
 * @param vendorId - Vendor ID
 * @param customerId - Customer ID
 * @param extractedData - Extracted order data
 */
async function updateOrCreateOrder(
  conversationId: string,
  vendorId: string,
  customerId: string,
  extractedData: any,
  intent?: string
): Promise<void> {
  // Wrap in transaction for atomicity
  return await prisma.$transaction(async (tx) => {
    // CRITICAL: When intent is `order_new`, NEVER look up an existing row — we must
    // always create a brand-new order so previous pending orders are not mutated or
    // overwritten. For all other intents, fall back to the prior "update-if-pending"
    // behaviour.
    const existingOrder = intent === 'order_new'
      ? null
      : await tx.order.findFirst({
          where: {
            conversationId,
            vendorId,
            status: { in: ['pending', 'confirmed'] }
          },
          orderBy: { createdAt: 'desc' }
        });

    // Performance: Use cached products when available
    let products = await tx.product.findMany({
      where: { vendorId, isActive: true }
    });

    try {
      const cached = await getCachedProductCatalog(vendorId);
      if (cached && cached.length > 0) {
        products = cached;
      }
    } catch (error) {
      logger.debug({ err: error, vendorId }, 'Using DB products instead of cache');
    }

    // Get vendor config for field names (vendor-agnostic)
    const vendorConfig = await getVendorMatchingConfig(vendorId);
    const priceField = (vendorConfig?.productPriceField as string) || 'basePrice';

    // Calculate total using fuzzy matching
    let totalAmount = 0;
    const items = extractedData.orderItems || [];
    for (const item of items) {
      const productName = item.product || item.name || '';

      // Use fuzzy matching (async)
      const match = await findBestProductMatch(productName, products, {
        threshold: PRODUCT_MATCHING_THRESHOLD,
        enableFuzzy: PRODUCT_MATCHING_ENABLE_FUZZY,
        enableAIMatching: PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
        vendorId
      });

      if (match) {
        // Auto-correct product name
        item.product = match.matchedName;

        // Unit validation: if the AI-extracted item.unit disagrees with the product's
        // canonical baseUnit, log a warning and fall back to the product's base pricing.
        const productBaseUnit = (match.product as any).baseUnit;
        if (item.unit && productBaseUnit && String(item.unit).toLowerCase() !== String(productBaseUnit).toLowerCase()) {
          logger.warn({
            conversationId,
            vendorId,
            productName: match.matchedName,
            extractedUnit: item.unit,
            productBaseUnit
          }, 'Order item unit mismatch — falling back to product base unit');
          item.unit = productBaseUnit;
        } else if (!item.unit && productBaseUnit) {
          // Auto-populate unit from the product catalog when the AI omitted it
          item.unit = productBaseUnit;
        }

        // Use configurable price field (vendor-agnostic)
        const price = match.product[priceField] || match.product.price || match.product.basePrice || 0;
        // Unit-aware pricing: basePrice is per baseQuantity of baseUnit
        // e.g., if basePrice=60000 (Rs 600) per baseQuantity=1 kg, then 0.5kg = Rs 300
        const baseQuantity = Number(match.product.baseQuantity) || 1;
        const unitPrice = price / baseQuantity; // price per 1 unit of baseUnit

        // Warn if product is not divisible but customer ordered a fractional quantity
        const isDivisible = (match.product as any).isDivisible;
        if (!isDivisible && item.quantity && item.quantity % 1 !== 0) {
          logger.warn({
            conversationId,
            vendorId,
            productName: match.matchedName,
            quantity: item.quantity,
            isDivisible
          }, 'Fractional quantity ordered for non-divisible product');
        }

        // Enrich item with per-item pricing for UI display
        item.unitPrice = Math.round(unitPrice);
        item.totalPrice = Math.round(unitPrice * (item.quantity || 0));
        item.matchedProductId = match.product.id;
        totalAmount += item.totalPrice;
      }
    }

    // Delivery address fallback: if not extracted from conversation, try customer profile
    let resolvedDeliveryAddress = extractedData.deliveryAddress || null;
    if (!resolvedDeliveryAddress) {
      try {
        const insights = await tx.customerInsights.findFirst({
          where: { customerId, vendorId },
          select: { primaryDeliveryAddress: true, deliveryAddress: true }
        });
        resolvedDeliveryAddress = insights?.primaryDeliveryAddress || insights?.deliveryAddress || null;
        if (resolvedDeliveryAddress) {
          logger.info({ conversationId, customerId }, 'Using delivery address from customer profile');
        }
      } catch (addrError) {
        logger.debug({ err: addrError, customerId }, 'Could not fetch customer delivery address fallback');
      }
    }

    if (existingOrder) {
      // Update existing order
      await tx.order.update({
        where: { id: existingOrder.id },
        data: {
          items: items as any,
          totalAmount,
          deliveryAddress: resolvedDeliveryAddress || existingOrder.deliveryAddress,
          deliveryInstructions: extractedData.deliveryInstructions || existingOrder.deliveryInstructions,
          specialRequests: extractedData.specialRequests || existingOrder.specialRequests
        }
      });
    } else {
      // Generate order number
      const orderNumber = await generateOrderNumber(vendorId);

      // Create new order
      await tx.order.create({
        data: {
          id: crypto.randomUUID(),
          conversationId,
          vendorId,
          customerId,
          orderNumber,
          items: items as any,
          totalAmount,
          status: 'pending',
          deliveryAddress: resolvedDeliveryAddress,
          deliveryInstructions: extractedData.deliveryInstructions,
          specialRequests: extractedData.specialRequests
        }
      });
    }
  }, {
    isolationLevel: 'ReadCommitted',
    maxWait: 5000,
    timeout: 10000
  }).catch((error) => {
    logger.error({ err: error, conversationId, vendorId }, 'Failed to update or create order');
    throw error;
  });
}

async function updateCustomerInsights(
  conversationId: string,
  vendorId: string,
  customerId: string,
  customerInfo: any
): Promise<void> {
  try {
    // Use CustomerInsightsService to update all fields properly
    const updates: any = {};
    
    // Customer Basic Information
    if (customerInfo.name || customerInfo.customerName) {
      updates.customerName = customerInfo.name || customerInfo.customerName;
    }
    if (customerInfo.phone || customerInfo.alternativePhoneNumber) {
      updates.alternativePhoneNumber = customerInfo.phone || customerInfo.alternativePhoneNumber;
    }
    if (customerInfo.email) {
      updates.email = customerInfo.email;
    }
    if (customerInfo.preferredLanguage || customerInfo.language) {
      updates.preferredLanguage = customerInfo.preferredLanguage || customerInfo.language;
    }
    
    // Customer Summary Fields
    if (customerInfo.basicDetails) {
      updates.basicDetails = customerInfo.basicDetails;
    }
    if (customerInfo.purchaseHistory) {
      updates.purchaseHistory = customerInfo.purchaseHistory;
    }
    if (customerInfo.preferences) {
      // Handle both string and object formats
      updates.preferences = typeof customerInfo.preferences === 'string' 
        ? customerInfo.preferences 
        : JSON.stringify(customerInfo.preferences);
    }
    if (customerInfo.communicationStyle) {
      updates.communicationStyle = customerInfo.communicationStyle;
    }
    if (customerInfo.currentOrder) {
      updates.currentOrder = customerInfo.currentOrder;
    }
    
    // Delivery Information
    if (customerInfo.deliveryAddress || customerInfo.address) {
      updates.deliveryAddress = customerInfo.deliveryAddress || customerInfo.address;
      // Also update primaryDeliveryAddress if it's the first address
      if (!customerInfo.primaryDeliveryAddress) {
        updates.primaryDeliveryAddress = customerInfo.deliveryAddress || customerInfo.address;
      }
    }
    if (customerInfo.primaryDeliveryAddress) {
      updates.primaryDeliveryAddress = customerInfo.primaryDeliveryAddress;
    }
    if (customerInfo.deliveryInstructions) {
      updates.deliveryInstructions = customerInfo.deliveryInstructions;
    }
    if (customerInfo.whatsappLocation) {
      updates.whatsappLocation = customerInfo.whatsappLocation;
    }
    
    // Special Information
    if (customerInfo.specialRequests) {
      updates.specialRequests = customerInfo.specialRequests;
    }
    if (customerInfo.specialOccasions) {
      updates.specialOccasions = customerInfo.specialOccasions;
    }
    if (customerInfo.dietaryRestrictions) {
      updates.dietaryRestrictions = customerInfo.dietaryRestrictions;
    }
    
    // Payment & Preferences
    if (customerInfo.paymentPreferences || customerInfo.paymentPreference) {
      updates.paymentPreferences = customerInfo.paymentPreferences || customerInfo.paymentPreference;
    }
    
    // Update using CustomerInsightsService which handles all fields properly
    if (Object.keys(updates).length > 0) {
      await insightsService.updateInsights(customerId, vendorId, updates);
    }
  } catch (error) {
    logger.error({ err: error, customerId, vendorId }, 'Failed to update customer insights');
    // Don't throw - insights update is not critical
  }
}

async function saveDeliveryInfo(conversationId: string, address: string, customerId: string, vendorId: string): Promise<void> {
  try {
    // Update customer insights with delivery address
    await prisma.customerInsights.update({
      where: {
        customerId_vendorId: {
          customerId,
          vendorId
        }
      },
      data: {
        primaryDeliveryAddress: address
      }
    });
  } catch (error) {
    logger.error({ err: error, conversationId }, 'Failed to save delivery info');
    // Don't throw - delivery info update is not critical
  }
}

function extractKeyFacts(extractedData: any): string[] {
  const facts: string[] = [];

  // Use AI-extracted facts if available
  if (extractedData.newFacts && Array.isArray(extractedData.newFacts)) {
    facts.push(...extractedData.newFacts);
  }

  // Fallback/Legacy extraction logic
  if (extractedData.deliveryAddress) {
    facts.push(`Delivery address: ${extractedData.deliveryAddress}`);
  }
  if (extractedData.specialRequests) {
    facts.push(`Special requests: ${extractedData.specialRequests}`);
  }

  return [...new Set(facts)]; // Remove duplicates
}

function extractOngoingTopics(response: any): string[] {
  const topics: string[] = [];

  // Use AI-extracted topics if available
  if (response.extractedData?.ongoingTopics && Array.isArray(response.extractedData.ongoingTopics)) {
    topics.push(...response.extractedData.ongoingTopics);
  }

  if (response.conversationFlow?.nextStage) {
    topics.push(response.conversationFlow.nextStage);
  }

  return [...new Set(topics)]; // Remove duplicates
}

function extractOrderSummary(extractedData: any): string {
  if (extractedData.orderItems && Array.isArray(extractedData.orderItems)) {
    const itemCount = extractedData.orderItems.length;
    const items = extractedData.orderItems
      .map((item: any) => `${item.quantity || 1}x ${item.product || item.name || 'item'}`)
      .join(', ');
    return `Ordered ${itemCount} item(s): ${items}`;
  }
  return '';
}

async function handleValidationErrors(
  errors: any[], 
  conversationId: string,
  intent?: string
): Promise<void> {
  logger.warn({ errors, conversationId, intent }, 'Validation errors detected - skipping data extraction');
  // Log errors for monitoring
}

