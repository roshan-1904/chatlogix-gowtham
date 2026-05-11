/**
 * Cache Strategy for Multi-Stage AI Processing
 * 
 * Provides centralized caching utilities with TTL management
 * Reference: Phase 3: Caching Strategy (Implementation Plan)
 */

import { getCached, setCached, deleteCached, deleteCachedByPattern } from './redis.js';
import { logger } from '../logger.js';

/**
 * Cache TTL constants (in seconds)
 */
export const CACHE_TTL = {
  CONVERSATION_MEMORY: 300,      // 5 minutes
  VENDOR_CONFIG: 1800,          // 30 minutes
  PRODUCT_CATALOG: 3600,         // 1 hour
  CUSTOMER_INSIGHTS: 600,        // 10 minutes
  PENDING_ORDER: 120,            // 2 minutes
  INTENT_CLASSIFICATION: 3600,   // 1 hour
  NORMALIZATION: 3600             // 1 hour
} as const;

/**
 * Cache conversation memory
 */
export async function cacheConversationMemory(
  conversationId: string,
  memory: any
): Promise<void> {
  const key = `conversation_memory:${conversationId}`;
  await setCached(key, memory, CACHE_TTL.CONVERSATION_MEMORY);
}

/**
 * Get cached conversation memory
 */
export async function getCachedConversationMemory(conversationId: string): Promise<any | null> {
  const key = `conversation_memory:${conversationId}`;
  return await getCached(key);
}

/**
 * Cache vendor config
 */
export async function cacheVendorConfig(
  vendorId: string,
  config: any
): Promise<void> {
  const key = `vendor_config:${vendorId}`;
  await setCached(key, config, CACHE_TTL.VENDOR_CONFIG);
}

/**
 * Get cached vendor config
 */
export async function getCachedVendorConfig(vendorId: string): Promise<any | null> {
  const key = `vendor_config:${vendorId}`;
  return await getCached(key);
}

/**
 * Cache product catalog
 */
export async function cacheProductCatalog(
  vendorId: string,
  products: any[]
): Promise<void> {
  const key = `product_catalog:${vendorId}`;
  await setCached(key, products, CACHE_TTL.PRODUCT_CATALOG);
}

/**
 * Get cached product catalog
 */
export async function getCachedProductCatalog(vendorId: string): Promise<any[] | null> {
  const key = `product_catalog:${vendorId}`;
  return await getCached<any[]>(key);
}

/**
 * Cache customer insights
 */
export async function cacheCustomerInsights(
  customerId: string,
  vendorId: string,
  insights: any
): Promise<void> {
  const key = `customer_insights:${customerId}:${vendorId}`;
  await setCached(key, insights, CACHE_TTL.CUSTOMER_INSIGHTS);
}

/**
 * Get cached customer insights
 */
export async function getCachedCustomerInsights(
  customerId: string,
  vendorId: string
): Promise<any | null> {
  const key = `customer_insights:${customerId}:${vendorId}`;
  return await getCached(key);
}

/**
 * Cache pending order
 */
export async function cachePendingOrder(
  conversationId: string,
  order: any
): Promise<void> {
  const key = `pending_order:${conversationId}`;
  await setCached(key, order, CACHE_TTL.PENDING_ORDER);
}

/**
 * Get cached pending order
 */
export async function getCachedPendingOrder(conversationId: string): Promise<any | null> {
  const key = `pending_order:${conversationId}`;
  return await getCached(key);
}

/**
 * Invalidate all conversation-related cache
 */
export async function invalidateConversationCache(conversationId: string): Promise<void> {
  const patterns = [
    `conversation_memory:${conversationId}`,
    `pending_order:${conversationId}`
  ];
  
  for (const pattern of patterns) {
    await deleteCached(pattern);
  }
  
  logger.info({ conversationId }, '🗑️ Invalidated conversation cache');
}

/**
 * Invalidate all vendor-related cache
 */
export async function invalidateVendorCache(vendorId: string): Promise<void> {
  const patterns = [
    `vendor_config:${vendorId}`,
    `product_catalog:${vendorId}`
  ];
  
  for (const pattern of patterns) {
    await deleteCached(pattern);
  }
  
  // Invalidate customer insights cache (pattern match)
  await deleteCachedByPattern(`customer_insights:*:${vendorId}`);
  
  logger.info({ vendorId }, '🗑️ Invalidated vendor cache');
}

/**
 * Generate cache key for intent classification
 */
export function getIntentCacheKey(message: string): string {
  const hash = Buffer.from(message.toLowerCase().trim()).toString('base64').substring(0, 16);
  return `intent_classification:${hash}`;
}

/**
 * Generate cache key for normalization
 */
export function getNormalizationCacheKey(message: string): string {
  const hash = Buffer.from(message.toLowerCase().trim()).toString('base64').substring(0, 16);
  return `normalization:${hash}`;
}

