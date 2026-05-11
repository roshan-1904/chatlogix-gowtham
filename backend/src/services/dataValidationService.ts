/**
 * Data Validation Service
 * 
 * Validates extracted data before database updates (Stage 7.5)
 * Uses fuzzy matching for product validation to handle typos and partial names
 * Reference: Phase 5.10: Stage 7.5 - Data Validation Service (Implementation Plan)
 * 
 * Performance: Optimized for high-throughput scenarios
 * - Uses cached product catalogs
 * - Parallel product matching
 * - Early validation exits
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import {
  findBestProductMatch,
  sanitizeExtractedData
} from '../utils/productMatcher.js';
import {
  PRODUCT_MATCHING_THRESHOLD,
  PRODUCT_MATCHING_ENABLE_FUZZY,
  PRODUCT_MATCHING_ENABLE_AI_MULTILANG
} from '../config/env.js';
import { validateCustomerName } from '../utils/validationHelpers.js';

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    field: string;
    error: string;
    severity: 'error' | 'warning';
  }>;
  validatedData: any;
  matchStats?: {
    exactMatches: number;
    partialMatches: number;
    fuzzyMatches: number;
    keywordMatches: number;
    noMatches: number;
  };
}

/**
 * Get customer language from conversation or recent messages
 * Performance: Cached result, fast regex-based detection
 * 
 * @param conversationId - Conversation ID
 * @returns Language code (default: 'en')
 */
async function getCustomerLanguage(conversationId: string): Promise<string> {
  try {
    // Try to get from recent customer messages
    const recentMessages = await prisma.message.findMany({
      where: { conversationId, senderType: 'customer' },
      orderBy: { timestamp: 'desc' },
      take: 5,
      select: { content: true }
    });
    
    if (recentMessages.length > 0) {
      // Simple language detection from recent messages
      const combinedText = recentMessages.map(m => m.content).join(' ');
      return detectLanguageFromText(combinedText);
    }
  } catch (error) {
    logger.debug({ err: error, conversationId }, 'Failed to detect customer language');
  }
  
  return 'en'; // Default to English
}

/**
 * Detect language from text (simple heuristic, can be enhanced)
 * Performance: Fast regex-based detection
 * 
 * @param text - Text to analyze
 * @returns Language code (default: 'en')
 */
function detectLanguageFromText(text: string): string {
  if (!text || text.length === 0) return 'en';
  
  // Unicode ranges for different languages (performance: ordered by frequency)
  if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Hindi
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'; // Tamil
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te'; // Telugu
  if (/[\u0980-\u09FF]/.test(text)) return 'bn'; // Bengali
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa'; // Punjabi
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu'; // Gujarati
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or'; // Odia
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml'; // Malayalam
  if (/[\u0D80-\u0DFF]/.test(text)) return 'si'; // Sinhala
  
  return 'en'; // Default to English
}

/**
 * Validate extracted data before database updates
 * Uses fuzzy matching for product validation to handle typos and partial names
 * Performance: Optimized with caching, parallel matching, early exits
 * 
 * @param extractedData - Data extracted from AI response
 * @param vendorId - Vendor ID
 * @param conversationId - Conversation ID for language detection
 * @returns Validation result with match statistics
 */
export async function validateExtractedData(
  extractedData: any,
  vendorId: string,
  conversationId: string,
  intent?: string
): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = [];
  
  // Performance: Sanitize data first to remove invalid placeholders
  const sanitizedData = sanitizeExtractedData(extractedData, conversationId);
  
  // Log if sanitization filtered out items
  const originalItemsCount = extractedData?.orderItems?.length || 0;
  const sanitizedItemsCount = sanitizedData?.orderItems?.length || 0;
  if (originalItemsCount > sanitizedItemsCount) {
    logger.warn({
      conversationId,
      vendorId,
      originalCount: originalItemsCount,
      sanitizedCount: sanitizedItemsCount,
      removedCount: originalItemsCount - sanitizedItemsCount
    }, 'Sanitization filtered out invalid order items');
  }
  
  // Validate order items against product catalog with fuzzy matching
  if (sanitizedData.orderItems && Array.isArray(sanitizedData.orderItems)) {
    try {
      // Performance: Fetch products with only required fields
      const products = await prisma.product.findMany({
        where: { vendorId, isActive: true },
        select: {
          id: true,
          name: true,
          basePrice: true,
          inStock: true,
          keywords: true,
          minOrderQuantity: true
        }
      });
      
      // Performance: Get customer language for multi-language matching
      const customerLanguage = await getCustomerLanguage(conversationId);
      
      // Match statistics for monitoring
      const matchStats = {
        exactMatches: 0,
        partialMatches: 0,
        fuzzyMatches: 0,
        keywordMatches: 0,
        noMatches: 0
      };
      
      // Performance: Process items sequentially (validation needs to be deterministic)
      for (const item of sanitizedData.orderItems) {
        const productName = item.product || item.name || '';
        
        // Use fuzzy matching with vendor-specific config and multi-language support
        const match = await findBestProductMatch(productName, products, {
          threshold: PRODUCT_MATCHING_THRESHOLD,
          enableFuzzy: PRODUCT_MATCHING_ENABLE_FUZZY,
          enableAIMatching: PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
          customerLanguage,
          vendorId
        });
        
        if (!match) {
          matchStats.noMatches++;
          errors.push({
            field: 'orderItems',
            error: `Product "${productName}" not found in catalog`,
            severity: 'error'
          });
        } else {
          // Track match statistics
          switch (match.matchType) {
            case 'exact':
              matchStats.exactMatches++;
              break;
            case 'partial':
              matchStats.partialMatches++;
              break;
            case 'fuzzy':
              matchStats.fuzzyMatches++;
              break;
            case 'keyword':
              matchStats.keywordMatches++;
              break;
          }
          
          // Performance: Auto-correct product name for consistency
          item.product = match.matchedName;
          item.matchedProductId = match.product.id || match.product.productId || null;
          
          // Check stock status (vendor-agnostic field access)
          let stockField: string | null = null;
          if (match.product.inStock !== undefined) {
            stockField = 'inStock';
          } else if (match.product.stock !== undefined) {
            stockField = 'stock';
          } else if (match.product.available !== undefined) {
            stockField = 'available';
          }
          
          if (stockField && match.product[stockField] === false) {
            errors.push({
              field: 'orderItems',
              error: `Product "${match.matchedName}" is out of stock`,
              severity: 'error'
            });
          }
          
          const quantity = item.quantity || 0;
          if (quantity <= 0) {
            errors.push({
              field: 'orderItems',
              error: `Invalid quantity (${quantity}) for "${match.matchedName}"`,
              severity: 'error'
            });
          }
          
          // Check minimum order quantity
          if (match.product.minOrderQuantity && quantity < Number(match.product.minOrderQuantity)) {
            errors.push({
              field: 'orderItems',
              error: `Minimum order quantity for "${match.matchedName}" is ${match.product.minOrderQuantity}. You ordered ${quantity}.`,
              severity: 'error'
            });
          }
        }
      }
      
      // Log match statistics for monitoring
      logger.debug({ conversationId, matchStats, vendorId }, 'Product matching statistics');
      
      // Log if validation errors filtered out items
      const validationErrors = errors.filter(e => e.field === 'orderItems' && e.severity === 'error');
      if (validationErrors.length > 0) {
        logger.warn({
          conversationId,
          vendorId,
          validationErrorCount: validationErrors.length,
          sanitizedItemsCount,
          errors: validationErrors.map(e => e.error)
        }, 'Validation errors detected for order items - items may be filtered out');
      }
    } catch (error) {
      logger.error({ err: error, vendorId }, 'Failed to fetch products for validation');
      // Don't fail validation if product fetch fails
    }
  }
  
  // Validate delivery address format
  if (extractedData.deliveryAddress) {
    if (!isValidAddressFormat(extractedData.deliveryAddress)) {
      errors.push({
        field: 'deliveryAddress',
        error: 'Invalid address format (too short)',
        severity: 'warning'
      });
    }
  }
  
  // Validate prices
  if (extractedData.orderItems && extractedData.totalAmount) {
    try {
      const calculatedTotal = calculateTotal(extractedData.orderItems);
      const providedTotal = extractedData.totalAmount;
      const difference = Math.abs(calculatedTotal - providedTotal);
      
      // Allow 10% tolerance for price differences
      if (difference > (calculatedTotal * 0.1) && difference > 10) {
        errors.push({
          field: 'totalAmount',
          error: `Price mismatch detected: calculated ${calculatedTotal} but provided ${providedTotal}`,
          severity: 'warning'
        });
      }
    } catch (error) {
      logger.warn({ err: error }, 'Price validation failed');
    }
  }
  
  // Intent-specific validations
  if (intent === 'order_new') {
    // 1. Order items must not be empty
    if (!sanitizedData.orderItems || sanitizedData.orderItems.length === 0) {
      errors.push({
        field: 'orderItems',
        error: 'Order must have at least one item',
        severity: 'error'
      });
    }
    
    // 2. Minimum order value check
    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { minimumOrderValue: true }
      });
      
      if (vendor?.minimumOrderValue && sanitizedData.totalAmount) {
        if (sanitizedData.totalAmount < vendor.minimumOrderValue) {
          errors.push({
            field: 'totalAmount',
            error: `Minimum order value is ₹${vendor.minimumOrderValue}. Your order total is ₹${sanitizedData.totalAmount}.`,
            severity: 'error'
          });
        }
      }
    } catch (error) {
      logger.warn({ err: error, vendorId }, 'Failed to check minimum order value');
    }
    
    // 3. Customer name format validation (if provided)
    if (sanitizedData.customerName) {
      const nameValidation = validateCustomerName(sanitizedData.customerName);
      if (!nameValidation.isValid) {
        errors.push({
          field: 'customerName',
          error: nameValidation.error || 'Invalid customer name format',
          severity: 'warning'
        });
      }
    }
  }
  
  // Get match statistics if available
  const matchStats = (sanitizedData as any).matchStats;
  
  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    validatedData: sanitizedData,
    matchStats: matchStats || undefined
  };
}

function isValidAddressFormat(address: string): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }
  // Basic validation - at least 10 characters
  return address.trim().length >= 10;
}

function calculateTotal(orderItems: any[]): number {
  return orderItems.reduce((sum, item) => {
    const price = item.price || 0;
    const quantity = item.quantity || 0;
    return sum + (price * quantity);
  }, 0);
}

/**
 * Validate order can be confirmed
 * Checks for required fields: customer name, delivery address, order items
 * 
 * @param order - Order to validate
 * @param customerId - Customer ID
 * @param vendorId - Vendor ID
 * @returns Validation result
 */
export async function validateOrderConfirmation(
  order: any,
  customerId: string,
  vendorId: string,
  supplementalData?: {
    customerName?: string | null;
    deliveryAddress?: string | null;
  }
): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = [];
  
  // 1. Order must exist
  if (!order) {
    errors.push({
      field: 'order',
      error: 'No pending order found to confirm',
      severity: 'error'
    });
    return { isValid: false, errors, validatedData: null };
  }
  
  // 2. Order must be in pending status
  if (order.status !== 'pending') {
    errors.push({
      field: 'orderStatus',
      error: `Order is ${order.status}, cannot confirm. Only pending orders can be confirmed.`,
      severity: 'error'
    });
  }
  
  // 3. Order must have items
  const items = Array.isArray(order.items) 
    ? order.items 
    : JSON.parse(order.items || '[]');
  
  if (!items || items.length === 0) {
    errors.push({
      field: 'orderItems',
      error: 'Order must have at least one item before confirming',
      severity: 'error'
    });
  }
  
  // 4. Customer name required (optimized: single query)
  try {
    const customerInsights = await prisma.customerInsights.findUnique({
      where: {
        customerId_vendorId: { customerId, vendorId }
      },
      select: {
        customerName: true,
        primaryDeliveryAddress: true,
        deliveryAddress: true
      }
    });
    
    const resolvedCustomerName = (
      supplementalData?.customerName ||
      customerInsights?.customerName ||
      ''
    ).trim();

    if (!resolvedCustomerName) {
      errors.push({
        field: 'customerName',
        error: 'Customer name is required before confirming order. Please provide your name.',
        severity: 'error'
      });
    }
    
    // 5. Delivery address required
    const address = supplementalData?.deliveryAddress ||
                   order.deliveryAddress || 
                   customerInsights?.primaryDeliveryAddress || 
                   customerInsights?.deliveryAddress;
    
    if (!address || address.trim().length < 10) {
      errors.push({
        field: 'deliveryAddress',
        error: 'Delivery address is required before confirming order. Please provide your delivery address.',
        severity: 'error'
      });
    }

    // 6. NEW: Check if preferred delivery date is required
    try {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          category: true,
          askForPreferredDeliveryDate: true
        }
      });

      if (vendor) {
        // Dynamic import to avoid circular dependency
        const orderSettingsModule = await import('../types/orderSettings.js');
        const needsDeliveryDate = orderSettingsModule.shouldAskForDeliveryDate(
          vendor.category,
          vendor.askForPreferredDeliveryDate
        );

        if (needsDeliveryDate) {
          const deliveryDate = order.deliveryDate || 
                             order.estimatedDelivery ||
                             null;

          if (!deliveryDate) {
            errors.push({
              field: 'deliveryDate',
              error: 'Preferred delivery date is required. Please provide your preferred delivery date.',
              severity: 'error'
            });
          }
        }
      }
    } catch (error) {
      logger.error({ err: error, vendorId }, 'Failed to check delivery date requirement');
      // Don't block order if check fails
    }
  } catch (error) {
    logger.error({ err: error, customerId, vendorId }, 'Failed to fetch customer insights for validation');
    errors.push({
      field: 'validation',
      error: 'Unable to verify customer information',
      severity: 'error'
    });
  }
  
  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    validatedData: order
  };
}

/**
 * Format validation errors into customer-friendly messages
 */
function formatValidationErrors(errors: ValidationResult['errors']): string {
  const customerFriendlyMessages: Record<string, string> = {
    customerName: "I need your name to confirm the order. Could you please provide your name?",
    deliveryAddress: "I need your delivery address to confirm the order. Could you please provide your delivery address?",
    orderItems: "Your order doesn't have any items. Please add items to your order before confirming.",
    orderStatus: "This order cannot be confirmed in its current state.",
    order: "No pending order found to confirm.",
    previousOrder: "No previous order found to repeat.",
    validation: "Unable to validate the request. Please try again or contact support."
  };
  
  return errors
    .filter(e => e.severity === 'error')
    .map(e => customerFriendlyMessages[e.field] || e.error)
    .join('\n\n');
}

/**
 * Validate order can be cancelled
 * Checks for order existence, cancellable state, and customer ownership
 * 
 * @param order - Order to validate
 * @param customerId - Customer ID
 * @param vendorId - Vendor ID
 * @returns Validation result
 */
export async function validateOrderCancellation(
  order: any,
  customerId: string,
  vendorId: string
): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = [];
  
  // 1. Order must exist
  if (!order) {
    errors.push({
      field: 'order',
      error: 'No order found to cancel',
      severity: 'error'
    });
    return { isValid: false, errors, validatedData: null };
  }
  
  // 2. Order must belong to customer
  if (order.customerId !== customerId) {
    errors.push({
      field: 'order',
      error: 'Order does not belong to this customer',
      severity: 'error'
    });
    return { isValid: false, errors, validatedData: null };
  }
  
  // 3. Order must be in cancellable state (pending or confirmed only)
  const cancellableStatuses = ['pending', 'confirmed'];
  if (!cancellableStatuses.includes(order.status)) {
    errors.push({
      field: 'orderStatus',
      error: `Order is ${order.status}, cannot cancel. Only pending or confirmed orders can be cancelled.`,
      severity: 'error'
    });
  }
  
  // 4. Order must not already be cancelled
  if (order.status === 'cancelled') {
    errors.push({
      field: 'orderStatus',
      error: 'Order is already cancelled',
      severity: 'error'
    });
  }
  
  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    validatedData: order
  };
}

/**
 * Validate repeat order data
 * Checks for previous order existence and product availability
 * 
 * @param previousOrder - Previous order to repeat
 * @param products - Current product catalog
 * @param vendorId - Vendor ID
 * @returns Validation result
 */
export async function validateRepeatOrder(
  previousOrder: any,
  products: any[],
  vendorId: string
): Promise<ValidationResult> {
  const errors: ValidationResult['errors'] = [];
  
  // 1. Previous order must exist
  if (!previousOrder) {
    errors.push({
      field: 'previousOrder',
      error: 'No previous order found to repeat',
      severity: 'error'
    });
    return { isValid: false, errors, validatedData: null };
  }
  
  // 2. Previous order must have items
  const items = Array.isArray(previousOrder.items) 
    ? previousOrder.items 
    : JSON.parse(previousOrder.items || '[]');
  
  if (!items || items.length === 0) {
    errors.push({
      field: 'orderItems',
      error: 'Previous order has no items to repeat',
      severity: 'error'
    });
    return { isValid: false, errors, validatedData: null };
  }
  
  // 3. Validate products from previous order are still available
  try {
    const unavailableProducts: string[] = [];
    const outOfStockProducts: string[] = [];
    
    for (const item of items) {
      const productName = item.product || item.name || '';
      
      if (!productName) continue;
      
      // Find product in current catalog
      const product = products.find(p => {
        const pName = (p.name || '').toLowerCase();
        const itemName = productName.toLowerCase();
        return pName === itemName || 
               pName.includes(itemName) || 
               itemName.includes(pName) ||
               (p.keywords && Array.isArray(p.keywords) && 
                p.keywords.some((k: string) => k.toLowerCase().includes(itemName)));
      });
      
      if (!product) {
        unavailableProducts.push(productName);
      } else if (product.inStock === false) {
        outOfStockProducts.push(productName);
      }
    }
    
    if (unavailableProducts.length > 0) {
      errors.push({
        field: 'orderItems',
        error: `Some products from your previous order are no longer available: ${unavailableProducts.join(', ')}`,
        severity: 'error'
      });
    }
    
    if (outOfStockProducts.length > 0) {
      errors.push({
        field: 'orderItems',
        error: `Some products from your previous order are out of stock: ${outOfStockProducts.join(', ')}`,
        severity: 'error'
      });
    }
    
    // 4. Validate quantities are valid
    for (const item of items) {
      const quantity = item.quantity || 0;
      if (quantity <= 0) {
        errors.push({
          field: 'orderItems',
          error: `Invalid quantity (${quantity}) for "${item.product || item.name}"`,
          severity: 'error'
        });
      }
    }
  } catch (error) {
    logger.error({ err: error, vendorId }, 'Failed to validate repeat order products');
    errors.push({
      field: 'validation',
      error: 'Unable to validate product availability',
      severity: 'error'
    });
  }
  
  return {
    isValid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    validatedData: previousOrder
  };
}

// Export formatValidationErrors for use in orchestrator
export { formatValidationErrors };

