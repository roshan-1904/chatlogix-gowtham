/**
 * Context-Aware Data Fetching Service
 * 
 * Fetches only relevant data based on intent for Stage 2
 * Reference: Phase 5.3: Stage 2 - Context-Aware Data Fetching (Implementation Plan)
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import {
  getCachedVendorConfig,
  getCachedProductCatalog,
  getCachedCustomerInsights,
  getCachedPendingOrder,
  cacheVendorConfig,
  cacheProductCatalog,
  cacheCustomerInsights,
  cachePendingOrder
} from '../utils/cacheStrategy.js';
import { IntentClassification } from '../types/multiStage.js';
import { findBestProductMatch } from '../utils/productMatcher.js';

/**
 * Detect if message contains a product name using intelligent matching
 * Handles: typos, partial names, multi-language, spelling mistakes
 * Uses existing productMatcher utility for consistency
 * LIMITED SEQUENCE CHECKING: Only checks 2-4 word sequences for performance
 */
async function detectProductNameInMessage(
  message: string,
  vendorId: string
): Promise<{ hasProduct: boolean; productNames: string[] }> {
  if (!message || message.trim().length < 3) {
    return { hasProduct: false, productNames: [] };
  }

  try {
    // Get product catalog (cached)
    let products = await getCachedProductCatalog(vendorId);
    if (!products || products.length === 0) {
      // If no products cached, try to fetch from DB
      products = await prisma.product.findMany({
        where: { vendorId, isActive: true },
        select: { 
          id: true, 
          name: true, 
          keywords: true 
        }
      });
      
      if (products.length === 0) {
        return { hasProduct: false, productNames: [] };
      }
    }
    
    // Check word sequences (LIMITED: 2-4 words only for performance)
    const words = message.toLowerCase().split(/\s+/);
    const potentialProductNames: string[] = [];
    
    // LIMITED SEQUENCE CHECKING: Only check 2-4 word sequences (not 2-5)
    for (let i = 0; i < words.length; i++) {
      for (let j = i + 2; j <= Math.min(i + 4, words.length); j++) {
        const potentialName = words.slice(i, j).join(' ');
        if (potentialName.length >= 3) {
          const match = await findBestProductMatch(potentialName, products, {
            threshold: 0.6, // Lower threshold for detection (more lenient)
            enableFuzzy: true, // Enable fuzzy matching for typos
            enableAIMatching: false, // Don't use AI for detection (too slow)
            vendorId
          });
          
          if (match && match.similarity >= 0.6) {
            potentialProductNames.push(match.matchedName);
          }
        }
      }
    }
    
    return {
      hasProduct: potentialProductNames.length > 0,
      productNames: [...new Set(potentialProductNames)] // Remove duplicates
    };
  } catch (error) {
    logger.error({ err: error, vendorId }, 'Failed to detect product name in message');
    // Fallback: Simple heuristic (word count + product keywords)
    const words = message.toLowerCase().split(/\s+/);
    const productKeywords = ['cookies', 'brownie', 'cake', 'product', 'item', 'available', 'have'];
    const hasProductKeyword = productKeywords.some(kw => words.some(w => w.includes(kw)));
    
    return {
      hasProduct: words.length >= 2 && hasProductKeyword,
      productNames: []
    };
  }
}

/**
 * Fetch only relevant data based on intent and extracted information
 */
export async function fetchRelevantData(
  intent: string,
  extractedInfo: any,
  conversationId: string,
  vendorId: string,
  customerId: string,
  rawMessage?: string // ADD THIS PARAMETER
): Promise<any> {
  const dataToFetch = {
    customerInsights: false,
    pendingOrder: false,
    productCatalog: false,
    orderHistory: false,
    vendorConfig: false
  };
  
  // IMPROVEMENT: Use intelligent product detection
  let productDetected = false;
  let detectedProductNames: string[] = [];
  
  if (rawMessage) {
    const detectionResult = await detectProductNameInMessage(rawMessage, vendorId);
    productDetected = detectionResult.hasProduct;
    detectedProductNames = detectionResult.productNames;
    
    if (productDetected && detectedProductNames.length > 0) {
      logger.info({ 
        conversationId, 
        vendorId,
        detectedProducts: detectedProductNames,
        intent
      }, 'Product names detected in message');
    }
  }
  
  // Determine what to fetch based on intent
  switch(intent) {
    case 'order_new':
      dataToFetch.pendingOrder = true; // Check if order already exists
      dataToFetch.productCatalog = true;
      dataToFetch.customerInsights = true; // For address/preferences
      dataToFetch.vendorConfig = true; // For vendor-specific prompts
      break;
    
    case 'order_update':
      dataToFetch.pendingOrder = true; // Required for updates
      dataToFetch.productCatalog = true; // For validation
      dataToFetch.customerInsights = true;
      dataToFetch.vendorConfig = true;
      
      // Fetch based on update type
      if (extractedInfo?.orderUpdateType === 'add_items') {
        dataToFetch.productCatalog = true; // Validate new items
      } else if (extractedInfo?.orderUpdateType === 'modify_delivery') {
        dataToFetch.customerInsights = true; // For address validation
      }
      break;
    
    case 'order_status':
      dataToFetch.pendingOrder = true;
      dataToFetch.orderHistory = true;
      break;
    
    case 'product_inquiry':
      dataToFetch.productCatalog = true;
      // Fetch customer's order history for personalized recommendations
      dataToFetch.orderHistory = true;
      dataToFetch.vendorConfig = true;
      break;
    
    case 'greeting':
      dataToFetch.customerInsights = true; // Check if new customer
      dataToFetch.productCatalog = true; // Show products
      dataToFetch.orderHistory = true; // For "repeat order" suggestions
      dataToFetch.vendorConfig = true;
      break;
    
    case 'confirm_order':
      dataToFetch.pendingOrder = true;
      dataToFetch.vendorConfig = true;
      // IMPROVEMENT: Fetch products if product name detected (handles typos/spelling)
      if (productDetected) {
        dataToFetch.productCatalog = true;
        logger.info({ conversationId, vendorId }, 'Product detected in confirm_order, fetching catalog');
      }
      break;
    
    case 'cancel_order':
      dataToFetch.pendingOrder = true;
      dataToFetch.vendorConfig = true;
      break;
    
    case 'payment_inquiry':
      dataToFetch.vendorConfig = true; // For payment methods
      dataToFetch.customerInsights = true; // For payment preferences
      break;
    
    case 'delivery_inquiry':
      dataToFetch.vendorConfig = true; // For delivery areas/time
      dataToFetch.customerInsights = true; // For customer location
      break;
    
    case 'complaint':
      dataToFetch.pendingOrder = true; // For order context
      dataToFetch.orderHistory = true; // For complaint history
      dataToFetch.vendorConfig = true; // For escalation info
      dataToFetch.customerInsights = true; // For customer info
      break;
    
    case 'refund_request':
      dataToFetch.pendingOrder = true; // Check order status
      dataToFetch.orderHistory = true; // Check refund history
      dataToFetch.vendorConfig = true; // For refund policy
      dataToFetch.customerInsights = true; // For customer info
      break;
    
    case 'feedback':
      dataToFetch.orderHistory = true; // For recent orders
      dataToFetch.vendorConfig = true; // For business info
      break;
    
    case 'return_request':
      dataToFetch.pendingOrder = true; // Check if order exists
      dataToFetch.orderHistory = true; // For return history
      dataToFetch.vendorConfig = true; // For return policy
      dataToFetch.productCatalog = true; // For exchange options
      break;
    
    case 'account_inquiry':
      dataToFetch.customerInsights = true; // For account info
      dataToFetch.vendorConfig = true; // For business info
      break;
    
    case 'repeat_order':
      dataToFetch.orderHistory = true; // Fetch last order
      dataToFetch.productCatalog = true; // Validate products still available
      dataToFetch.vendorConfig = true; // For business info
      dataToFetch.customerInsights = true; // For customer preferences
      break;
    
    default:
      // IMPROVEMENT: Fetch products for 'other' if product name detected
      if (productDetected) {
        dataToFetch.productCatalog = true;
        dataToFetch.vendorConfig = true;
        logger.info({ conversationId, vendorId }, 'Product detected in other intent, fetching catalog');
      } else {
        dataToFetch.vendorConfig = true;
      }
      break;
  }
  
  // OPTIMIZATION: Fetch data with caching - PARALLELIZED for performance
  const data: any = {};
  
  // Build parallel fetch promises
  const fetchPromises: Array<Promise<{ key: string; value: any; vendorOrderSettings?: any; matchingProducts?: any[] }>> = [];
  
  if (dataToFetch.vendorConfig) {
    fetchPromises.push(
      (async () => {
        let vendorConfig = await getCachedVendorConfig(vendorId);
        if (!vendorConfig) {
          try {
            const vendor = await prisma.vendor.findUnique({ 
              where: { id: vendorId },
              select: {
                id: true,
                businessName: true,
                aiSystemPrompt: true,
                aiPersonality: true,
                aiBotName: true,
                aiDeliveryInstructions: true,
                aiPickupDeliveryAddress: true,
                aiToneExample: true,
                timezone: true,
                orderPrefix: true,
                category: true,
                askForPreferredDeliveryDate: true,
                orderPreparationConfig: true
              }
            });
            if (vendor) {
              vendorConfig = vendor;
              await cacheVendorConfig(vendorId, vendor);
            }
          } catch (error) {
            logger.error({ err: error, vendorId }, 'Failed to fetch vendor config');
          }
        }
        
        // Extract order settings if needed
        let vendorOrderSettings = undefined;
        if (vendorConfig && (intent === 'order_new' || intent === 'order_update' || intent === 'confirm_order')) {
          vendorOrderSettings = {
            category: vendorConfig.category,
            askForPreferredDeliveryDate: vendorConfig.askForPreferredDeliveryDate ?? false,
            orderPreparationConfig: vendorConfig.orderPreparationConfig as any
          };
        }
        
        return { key: 'vendorConfig', value: vendorConfig, vendorOrderSettings };
      })()
    );
  }
  
  if (dataToFetch.productCatalog) {
    fetchPromises.push(
      (async () => {
        let products = await getCachedProductCatalog(vendorId);
        if (!products) {
          try {
            // Try Product catalog table first (primary source)
            const productsFromDb = await prisma.product.findMany({
              where: { vendorId, isActive: true },
              select: {
                id: true,
                name: true,
                basePrice: true,
                baseUnit: true,
                baseQuantity: true,
                keywords: true,
                inStock: true,
                description: true,
                minOrderQuantity: true,
                maxOrderQuantity: true,
                isDivisible: true
              }
            });
            
            if (productsFromDb.length > 0) {
              products = productsFromDb;
              await cacheProductCatalog(vendorId, products);
            } else {
              // Fallback to vendor.aiProducts JSON if Product table is empty
              logger.warn({ vendorId }, 'Product table empty, falling back to vendor.aiProducts');
              const vendor = await prisma.vendor.findUnique({
                where: { id: vendorId },
                select: { aiProducts: true }
              });
              
              if (vendor?.aiProducts) {
                try {
                  const legacyProducts = JSON.parse(vendor.aiProducts);
                  const normalizedProducts = Array.isArray(legacyProducts?.products) 
                    ? legacyProducts.products.map((p: any) => ({
                        id: p.id || `legacy_${p.name}`,
                        name: p.name || p.product || '',
                        basePrice: p.price ? Math.round(p.price * 100) : 0,
                        baseUnit: p.unit || 'piece',
                        keywords: p.keywords || [],
                        inStock: p.inStock !== false,
                        description: p.description || ''
                      }))
                    : (Array.isArray(legacyProducts) 
                        ? legacyProducts.map((p: any) => ({
                            id: p.id || `legacy_${p.name || p.product}`,
                            name: p.name || p.product || '',
                            basePrice: p.price ? Math.round(p.price * 100) : 0,
                            baseUnit: p.unit || 'piece',
                            keywords: p.keywords || [],
                            inStock: p.inStock !== false,
                            description: p.description || ''
                          }))
                        : []);
                  
                  products = normalizedProducts;
                  await cacheProductCatalog(vendorId, normalizedProducts);
                  logger.info({ vendorId, productCount: normalizedProducts.length }, 'Using vendor.aiProducts fallback');
                } catch (parseError) {
                  logger.error({ err: parseError, vendorId }, 'Failed to parse vendor.aiProducts fallback');
                  products = [];
                }
              } else {
                products = [];
              }
            }
          } catch (error) {
            logger.error({ err: error, vendorId }, 'Failed to fetch product catalog');
            products = [];
          }
        }
        
        // Handle product matching (if needed)
        let matchingProducts = undefined;
        if (extractedInfo?.products && extractedInfo.products.length > 0 && products) {
          const potentiallyMatchingProducts = products.filter((p: any) =>
            extractedInfo.products.some((mentioned: string) => {
              const mentionedLower = mentioned.toLowerCase();
              const nameLower = (p.name || '').toLowerCase();
              
              if (nameLower.includes(mentionedLower)) return true;
              
              const nameWords = nameLower.split(/\s+/).filter((w: string) => w.length > 3);
              if (nameWords.some((word: string) => mentionedLower.includes(word))) return true;
              
              if (p.keywords && Array.isArray(p.keywords)) {
                if (p.keywords.some((k: string) => {
                  const keywordLower = k.toLowerCase();
                  return mentionedLower.includes(keywordLower) || keywordLower.includes(mentionedLower);
                })) return true;
              }
              
              return false;
            })
          );
          
          if (potentiallyMatchingProducts.length > 0) {
            matchingProducts = potentiallyMatchingProducts;
            logger.info({ 
              vendorId, 
              mentionedProducts: extractedInfo.products,
              matchingCount: potentiallyMatchingProducts.length,
              matchingNames: potentiallyMatchingProducts.map((p: any) => p.name)
            }, 'Found potentially matching products');
          } else {
            logger.warn({ 
              vendorId, 
              mentionedProducts: extractedInfo.products,
              totalProducts: products.length,
              productNames: products.map((p: any) => p.name)
            }, 'No products matched customer query - will show all products to AI for matching');
          }
        }
        
        return { key: 'products', value: products, matchingProducts };
      })()
    );
  }
  
  if (dataToFetch.customerInsights) {
    fetchPromises.push(
      (async () => {
        let insights = await getCachedCustomerInsights(customerId, vendorId);
        if (!insights) {
          try {
            const insightsFromDb = await prisma.customerInsights.findUnique({
              where: {
                customerId_vendorId: {
                  customerId,
                  vendorId
                }
              }
            });
            if (insightsFromDb) {
              insights = insightsFromDb;
              await cacheCustomerInsights(customerId, vendorId, insights);
            }
          } catch (error) {
            logger.error({ err: error, customerId, vendorId }, 'Failed to fetch customer insights');
          }
        }
        return { key: 'insights', value: insights };
      })()
    );
  }
  
  if (dataToFetch.pendingOrder) {
    fetchPromises.push(
      (async () => {
        let pendingOrder = await getCachedPendingOrder(conversationId);
        if (!pendingOrder) {
          try {
            const order = await prisma.order.findFirst({
              where: {
                conversationId,
                vendorId,
                status: { in: ['pending', 'confirmed'] }
              },
              orderBy: { createdAt: 'desc' }
            });
            if (order) {
              pendingOrder = order;
              await cachePendingOrder(conversationId, order);
            }
          } catch (error) {
            logger.error({ err: error, conversationId, vendorId }, 'Failed to fetch pending order');
          }
        }
        return { key: 'pendingOrder', value: pendingOrder };
      })()
    );
  }
  
  if (dataToFetch.orderHistory) {
    fetchPromises.push(
      (async () => {
        try {
          logger.info({ customerId, vendorId, intent }, 'Fetching order history');
          const orderHistory = await prisma.order.findMany({
            where: {
              customerId,
              vendorId
            },
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              orderNumber: true,
              items: true,
              totalAmount: true,
              status: true,
              createdAt: true
            }
          });
          logger.info({ 
            customerId, 
            vendorId, 
            orderCount: orderHistory.length,
            orderNumbers: orderHistory.map((o: any) => o.orderNumber || o.id)
          }, 'Order history fetched');
          
          if (orderHistory.length === 0) {
            logger.warn({ customerId, vendorId }, 'No orders found for customer - check customerId and vendorId match');
          }
          return { key: 'orderHistory', value: orderHistory };
        } catch (error) {
          logger.error({ err: error, customerId, vendorId }, 'Failed to fetch order history');
          return { key: 'orderHistory', value: [] };
        }
      })()
    );
  }
  
  // Execute all fetches in parallel
  const results = await Promise.all(fetchPromises);
  
  // Process results
  results.forEach((result: any) => {
    if (result.key === 'vendorConfig') {
      data.vendorConfig = result.value;
      if (result.vendorOrderSettings) {
        data.vendorOrderSettings = result.vendorOrderSettings;
      }
    } else if (result.key === 'products') {
      data.products = result.value;
      if (result.matchingProducts) {
        data.matchingProducts = result.matchingProducts;
      }
    } else {
      data[result.key] = result.value;
    }
  });
  
  // IMPROVEMENT: Add detected products to extractedInfo if available
  if (productDetected && detectedProductNames.length > 0) {
    if (!data.products) {
      data.products = [];
    }
    // Note: This doesn't filter products, just logs detection
    // The full product catalog will be fetched above
  }
  
  return data;
}

