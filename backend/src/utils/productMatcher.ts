/**
 * Unified Product Matching Utility
 * 
 * Provides consistent, high-performance product matching across all services using:
 * - Exact matching (fastest, returns immediately)
 * - Partial matching (substring, optimized)
 * - Keyword matching (indexed lookup)
 * - Fuzzy matching (Levenshtein distance) for typos
 * - AI-based multi-language matching (OpenAI) for cross-language support
 * 
 * Performance Optimizations:
 * - Early exit for exact matches
 * - Length-based filtering (skip products with >50% length difference)
 * - Caching of normalized strings
 * - Parallel matching for multiple items
 * - Rate limiting for AI calls
 * - AI result caching (24h TTL)
 * 
 * Vendor-Agnostic Design:
 * - Configurable field names (name, keywords, price, stock)
 * - Works with any product structure
 * - No hard-coded assumptions
 * 
 * @module utils/productMatcher
 * @see PRODUCT_MATCHING_COMPLETE_SOLUTION.md
 */

import { logger } from '../logger.js';
import { prisma } from '../db/prisma.js';
import {
  PRODUCT_MATCHING_THRESHOLD,
  PRODUCT_MATCHING_ENABLE_FUZZY,
  PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
  PRODUCT_MATCHING_AI_FALLBACK_THRESHOLD,
  PRODUCT_MATCHING_MAX_CATALOG_SIZE,
  env
} from '../config/env.js';
import { getCachedProductCatalog } from './cacheStrategy.js';
import OpenAI from 'openai';

// Initialize OpenAI client (singleton pattern for performance)
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

/**
 * Product match result interface
 */
export interface ProductMatch {
  product: any; // Generic product structure
  similarity: number; // 0-1, where 1 is perfect match
  matchType: 'exact' | 'partial' | 'fuzzy' | 'keyword';
  originalName: string;
  matchedName: string;
  confidence: 'high' | 'medium' | 'low'; // Confidence level based on match type
}

/**
 * Configuration for product matching
 */
export interface MatchingConfig {
  threshold?: number; // Minimum similarity for fuzzy match (default: 0.7)
  enableFuzzy?: boolean; // Enable fuzzy matching (default: true)
  useCache?: boolean; // Use cached product catalog (default: true)
  maxResults?: number; // Maximum number of matches to consider (default: 1)
  enableAIMatching?: boolean; // Enable OpenAI-based multi-language matching (default: true)
  customerLanguage?: string; // Customer's language (e.g., 'en', 'hi', 'ta', 'te')
  vendorId?: string; // Vendor ID for vendor-specific config
  productNameField?: string; // Field name for product name (default: 'name')
  productKeywordsField?: string; // Field name for keywords (default: 'keywords')
  productPriceField?: string; // Field name for price (default: 'basePrice')
}

/**
 * Vendor-specific matching configuration (from database)
 */
interface VendorMatchingConfig {
  threshold?: number;
  enableFuzzy?: boolean;
  enableAIMatching?: boolean;
  productNameField?: string;
  productKeywordsField?: string;
  productPriceField?: string;
  productStockField?: string;
  supportedLanguages?: string[];
  aiMatchingModel?: string;
  aiMatchingThreshold?: number;
}

// Performance: Cache for normalized strings (LRU-like behavior)
const normalizedStringCache = new Map<string, string>();
const NORMALIZED_CACHE_MAX_SIZE = 10000; // Prevent memory bloat

// Performance: Cache for AI match results (24h TTL)
interface AIMatchCacheEntry {
  result: ProductMatch | null;
  timestamp: number;
}
const aiMatchCache = new Map<string, AIMatchCacheEntry>();
const AI_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const AI_CACHE_MAX_SIZE = 5000; // Limit cache size

// Performance: Rate limiting for AI calls (per vendor)
const aiRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const AI_RATE_LIMIT = 10; // Max calls per minute per vendor
const AI_RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

/**
 * Normalize string for matching (handles Unicode, special chars, whitespace)
 * Performance: Uses cache to avoid repeated normalization
 * 
 * @param str - String to normalize
 * @param preserveDiacritics - Whether to preserve diacritics (default: false)
 * @returns Normalized string
 */
function normalizeString(str: string, preserveDiacritics: boolean = false): string {
  if (!str || typeof str !== 'string') return '';
  
  // Check cache first (performance optimization)
  const cacheKey = `${str}:${preserveDiacritics}`;
  const cached = normalizedStringCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  
  let normalized = str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Normalize whitespace
  
  // Only remove diacritics if not preserving them (for some languages, diacritics matter)
  if (!preserveDiacritics) {
    normalized = normalized
      .normalize('NFD') // Normalize Unicode
      .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics (é -> e)
  }
  
  // Cache result (with size limit to prevent memory bloat)
  if (normalizedStringCache.size >= NORMALIZED_CACHE_MAX_SIZE) {
    // Clear oldest 20% of entries (simple LRU approximation)
    const entriesToDelete = Math.floor(NORMALIZED_CACHE_MAX_SIZE * 0.2);
    const keysToDelete = Array.from(normalizedStringCache.keys()).slice(0, entriesToDelete);
    keysToDelete.forEach(key => normalizedStringCache.delete(key));
  }
  normalizedStringCache.set(cacheKey, normalized);
  
  return normalized;
}

/**
 * Calculate Levenshtein distance between two strings
 * Performance: Optimized with early exit for very different lengths
 * 
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Levenshtein distance
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  // Early exit: if one string is empty, return length of other
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;
  
  // Performance: Use single array instead of 2D matrix for better memory locality
  const matrix: number[] = new Array(len2 + 1);
  
  // Initialize first row
  for (let i = 0; i <= len2; i++) {
    matrix[i] = i;
  }
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    let prev = matrix[0];
    matrix[0] = i;
    
    for (let j = 1; j <= len2; j++) {
      const cost = str1.charAt(i - 1) === str2.charAt(j - 1) ? 0 : 1;
      const current = Math.min(
        matrix[j] + 1,     // deletion
        prev + 1,          // insertion
        matrix[j - 1] + cost // substitution
      );
      prev = matrix[j];
      matrix[j] = current;
    }
  }
  
  return matrix[len2];
}

/**
 * Calculate similarity score between two strings using Levenshtein distance
 * Performance: Early exit optimizations for very different strings
 * 
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score (0-1, where 1 is identical)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1, false);
  const s2 = normalizeString(str2, false);
  
  // Exact match (fastest path)
  if (s1 === s2) return 1.0;
  
  // Early exit: empty strings
  if (s1.length === 0 || s2.length === 0) return 0.0;
  
  // Performance: Early exit for very different lengths (>50% difference)
  const lengthDiff = Math.abs(s1.length - s2.length);
  const maxLen = Math.max(s1.length, s2.length);
  if (lengthDiff > maxLen * 0.5) return 0.0;
  
  const distance = levenshteinDistance(s1, s2);
  
  // Convert distance to similarity (0-1 scale)
  // Use maxLen instead of minLen for better accuracy
  return 1 - (distance / maxLen);
}

/**
 * Get vendor-specific matching configuration from database
 * Performance: Results should be cached by caller
 * 
 * @param vendorId - Vendor ID
 * @returns Vendor matching config or null
 */
async function getVendorMatchingConfig(vendorId: string): Promise<Partial<MatchingConfig> | null> {
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
        : config as Partial<MatchingConfig>;
    }
  } catch (error) {
    // If column doesn't exist yet (migration not run), return null gracefully
    logger.debug({ err: error, vendorId }, 'Failed to fetch vendor matching config (may need migration)');
  }
  
  return null;
}

/**
 * Use OpenAI to match products across languages
 * Performance: Rate limited, cached, and only used as fallback
 * 
 * Handles cases where customer message is in different language than product names
 * Example: Customer says "கருப்பு கவுனி" (Tamil) → Matches "Karuppu Kavuni Rice Brownie" (English)
 * 
 * @param productName - Product name to match (any language)
 * @param products - Array of products from catalog
 * @param customerLanguage - Customer's language code
 * @param config - Matching configuration
 * @returns Product match or null
 */
async function findProductMatchWithAI(
  productName: string,
  products: Array<{ [key: string]: any }>,
  customerLanguage: string,
  config: MatchingConfig
): Promise<ProductMatch | null> {
  if (!openai) {
    return null;
  }
  
  const vendorId = config.vendorId || '';
  
  // Performance: Check cache first
  const cacheKey = `${vendorId}:${productName}:${customerLanguage}`;
  const cached = aiMatchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < AI_CACHE_TTL) {
    return cached.result;
  }
  
  // Performance: Rate limiting check
  const now = Date.now();
  const rateLimit = aiRateLimitMap.get(vendorId);
  if (rateLimit) {
    if (now < rateLimit.resetTime) {
      if (rateLimit.count >= AI_RATE_LIMIT) {
        logger.debug({ vendorId, productName }, 'AI matching rate limit exceeded, skipping');
        return null;
      }
      rateLimit.count++;
    } else {
      // Reset window
      aiRateLimitMap.set(vendorId, { count: 1, resetTime: now + AI_RATE_LIMIT_WINDOW });
    }
  } else {
    aiRateLimitMap.set(vendorId, { count: 1, resetTime: now + AI_RATE_LIMIT_WINDOW });
  }
  
  const nameField = config.productNameField ?? 'name';
  const keywordsField = config.productKeywordsField ?? 'keywords';
  
  // Performance: Limit products to prevent token overflow (max 50)
  const productsToMatch = products.slice(0, Math.min(50, PRODUCT_MATCHING_MAX_CATALOG_SIZE));
  
  // Prepare product list for AI (optimized format)
  const productList = productsToMatch.map((p, idx) => {
    const name = p[nameField] || '';
    const keywords = Array.isArray(p[keywordsField]) ? p[keywordsField].join(', ') : '';
    return `${idx + 1}. ${name}${keywords ? ` (Keywords: ${keywords})` : ''}`;
  }).join('\n');
  
  const prompt = `You are a product matching assistant. Match the customer's product query to the correct product from the catalog.

Customer Query (Language: ${customerLanguage}): "${productName}"

Available Products:
${productList}

Task:
1. Find the best matching product from the catalog
2. Consider translations, synonyms, and similar products
3. Return the product number and similarity score (0-1)

Return ONLY valid JSON:
{
  "productNumber": 1,
  "similarity": 0.85,
  "reason": "Customer query matches product name/description"
}`;

  try {
    // Get vendor config for model selection
    const vendorConfig = config.vendorId 
      ? await getVendorMatchingConfig(config.vendorId)
      : null;
    const model = (vendorConfig as VendorMatchingConfig)?.aiMatchingModel || 'gpt-4o-mini';
    
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: productName }
      ],
      temperature: 0.3, // Low temperature for consistent matching
      max_completion_tokens: 100, // Minimal tokens for cost optimization
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(responseText);
    
    const threshold = (vendorConfig as VendorMatchingConfig)?.aiMatchingThreshold 
      ?? config.threshold 
      ?? PRODUCT_MATCHING_AI_FALLBACK_THRESHOLD;
    
    if (parsed.productNumber && parsed.similarity >= threshold) {
      const productIndex = parsed.productNumber - 1;
      if (productIndex >= 0 && productIndex < productsToMatch.length) {
        const matchedProduct = productsToMatch[productIndex];
        const matchedName = matchedProduct[nameField] || '';
        
        const result: ProductMatch = {
          product: matchedProduct,
          similarity: parsed.similarity,
          matchType: 'fuzzy', // AI matching is a form of fuzzy matching
          originalName: productName,
          matchedName: matchedName,
          confidence: parsed.similarity >= 0.85 ? 'high' : parsed.similarity >= 0.75 ? 'medium' : 'low'
        };
        
        // Cache result (with size limit)
        if (aiMatchCache.size >= AI_CACHE_MAX_SIZE) {
          // Clear oldest 20% of entries
          const entriesToDelete = Math.floor(AI_CACHE_MAX_SIZE * 0.2);
          const keysToDelete = Array.from(aiMatchCache.keys()).slice(0, entriesToDelete);
          keysToDelete.forEach(key => aiMatchCache.delete(key));
        }
        aiMatchCache.set(cacheKey, { result, timestamp: Date.now() });
        
        return result;
      }
    }
  } catch (error) {
    logger.error({ err: error, productName, customerLanguage }, 'AI product matching failed');
  }
  
  // Cache null result to avoid repeated failed attempts
  if (aiMatchCache.size < AI_CACHE_MAX_SIZE) {
    aiMatchCache.set(cacheKey, { result: null, timestamp: Date.now() });
  }
  
  return null;
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
 * Find best matching product using multi-layer matching strategy
 * 
 * Vendor-Agnostic & Multi-Language Support:
 * - Works with any product structure (configurable field names)
 * - Supports multiple languages via OpenAI matching
 * - No hard-coded product names or types
 * 
 * Matching Priority (Performance-Optimized):
 * 1. Exact match (100% similarity) - Returns immediately (fastest)
 * 2. Partial match (substring, >80% similarity) - Fast
 * 3. Keyword match (85% similarity) - Fast
 * 4. Fuzzy match (Levenshtein, >= threshold) - Slower, only if no good match
 * 5. AI-based multi-language match (OpenAI) - Slowest, only as last resort
 * 
 * Performance: Early exits, caching, optimized algorithms
 * 
 * @param productName - Product name to match (may contain typos, any language)
 * @param products - Array of products from catalog (any structure)
 * @param config - Matching configuration (threshold, enableFuzzy, language, field names, etc.)
 * @returns Best match or null if no match found
 */
export async function findBestProductMatch(
  productName: string,
  products: Array<{ [key: string]: any }>, // Generic product structure
  config: MatchingConfig = {}
): Promise<ProductMatch | null> {
  // Input validation (fast path)
  if (!productName || typeof productName !== 'string') {
    return null;
  }
  
  // Get vendor-specific config if vendorId provided
  const vendorConfig = config.vendorId 
    ? await getVendorMatchingConfig(config.vendorId)
    : null;
  
  // Merge configs (vendor config overrides provided config)
  const finalConfig: MatchingConfig = {
    ...config,
    ...vendorConfig,
    threshold: (vendorConfig as VendorMatchingConfig)?.threshold ?? config.threshold ?? PRODUCT_MATCHING_THRESHOLD,
    enableFuzzy: (vendorConfig as VendorMatchingConfig)?.enableFuzzy ?? config.enableFuzzy ?? PRODUCT_MATCHING_ENABLE_FUZZY,
    enableAIMatching: (vendorConfig as VendorMatchingConfig)?.enableAIMatching ?? config.enableAIMatching ?? PRODUCT_MATCHING_ENABLE_AI_MULTILANG,
    productNameField: (vendorConfig as VendorMatchingConfig)?.productNameField ?? config.productNameField ?? 'name',
    productKeywordsField: (vendorConfig as VendorMatchingConfig)?.productKeywordsField ?? config.productKeywordsField ?? 'keywords',
    productPriceField: (vendorConfig as VendorMatchingConfig)?.productPriceField ?? config.productPriceField ?? 'basePrice'
  };
  
  const normalizedName = normalizeString(productName, false);
  
  // Early exit: too short to match
  if (normalizedName.length < 2) {
    return null;
  }
  
  // Early exit: empty catalog
  if (!products || products.length === 0) {
    logger.warn('Product catalog is empty');
    return null;
  }
  
  // Performance: Limit catalog size to prevent performance degradation
  const productsToSearch = products.length > PRODUCT_MATCHING_MAX_CATALOG_SIZE
    ? products.slice(0, PRODUCT_MATCHING_MAX_CATALOG_SIZE)
    : products;
  
  const threshold = finalConfig.threshold!;
  const enableFuzzy = finalConfig.enableFuzzy!;
  const enableAI = finalConfig.enableAIMatching!;
  const nameField = finalConfig.productNameField!;
  const keywordsField = finalConfig.productKeywordsField!;
  
  let bestMatch: ProductMatch | null = null;
  let bestScore = 0;
  
  // Performance: Single pass through products (no multiple iterations)
  for (const product of productsToSearch) {
    // Get product name using configurable field name (vendor-agnostic)
    const productNameValue = product[nameField];
    if (!productNameValue || typeof productNameValue !== 'string') {
      continue;
    }
    
    const productNameFull = normalizeString(productNameValue, false);
    
    // 1. Exact match (fastest, returns immediately)
    if (productNameFull === normalizedName) {
      return {
        product,
        similarity: 1.0,
        matchType: 'exact',
        originalName: productName,
        matchedName: productNameValue,
        confidence: 'high'
      };
    }
    
    // 2. Partial match (fast, substring check)
    if (bestScore < 0.8) {
      const productIncludesInput = productNameFull.includes(normalizedName);
      const inputIncludesProduct = normalizedName.includes(productNameFull);
      
      if (productIncludesInput || inputIncludesProduct) {
        // Calculate similarity based on length ratio
        const minLen = Math.min(normalizedName.length, productNameFull.length);
        const maxLen = Math.max(normalizedName.length, productNameFull.length);
        const score = minLen / maxLen;
        
        if (score > bestScore && score >= 0.8) {
          bestScore = score;
          bestMatch = {
            product,
            similarity: score,
            matchType: 'partial',
            originalName: productName,
            matchedName: productNameValue,
            confidence: score >= 0.9 ? 'high' : 'medium'
          };
        }
      }
    }
    
    // 3. Keyword match (fast, array lookup)
    if (bestScore < 0.85) {
      const keywords = product[keywordsField];
      if (keywords && Array.isArray(keywords)) {
        for (const keyword of keywords) {
          if (!keyword || typeof keyword !== 'string') continue;
          
          const keywordNormalized = normalizeString(keyword, false);
          const keywordIncludes = keywordNormalized.includes(normalizedName);
          const inputIncludesKeyword = normalizedName.includes(keywordNormalized);
          
          if (keywordIncludes || inputIncludesKeyword) {
            const score = 0.85; // High score for keyword match
            if (score > bestScore) {
              bestScore = score;
              bestMatch = {
                product,
                similarity: score,
                matchType: 'keyword',
                originalName: productName,
                matchedName: productNameValue,
                confidence: 'medium'
              };
            }
          }
        }
      }
    }
    
    // 4. Fuzzy match (slower, only if no good match found yet)
    if (enableFuzzy && bestScore < threshold) {
      const similarity = calculateSimilarity(normalizedName, productNameFull);
      
      if (similarity >= threshold && similarity > bestScore) {
        bestScore = similarity;
        bestMatch = {
          product,
          similarity,
          matchType: 'fuzzy',
          originalName: productName,
          matchedName: productNameValue,
          confidence: similarity >= 0.85 ? 'high' : similarity >= 0.75 ? 'medium' : 'low'
        };
      }
      
      // Also check fuzzy match against keywords (if no good match yet)
      if (bestScore < threshold) {
        const keywords = product[keywordsField];
        if (keywords && Array.isArray(keywords)) {
          for (const keyword of keywords) {
            if (!keyword || typeof keyword !== 'string') continue;
            
            const keywordSimilarity = calculateSimilarity(normalizedName, normalizeString(keyword, false));
            if (keywordSimilarity >= threshold && keywordSimilarity > bestScore) {
              bestScore = keywordSimilarity;
              bestMatch = {
                product,
                similarity: keywordSimilarity,
                matchType: 'fuzzy',
                originalName: productName,
                matchedName: productNameValue,
                confidence: keywordSimilarity >= 0.85 ? 'high' : keywordSimilarity >= 0.75 ? 'medium' : 'low'
              };
            }
          }
        }
      }
    }
  }
  
  // 5. AI-based multi-language matching (slowest, only as fallback)
  if (enableAI && bestScore < threshold && finalConfig.customerLanguage) {
    try {
      const aiMatch = await findProductMatchWithAI(
        productName,
        productsToSearch,
        finalConfig.customerLanguage,
        finalConfig
      );
      
      if (aiMatch && aiMatch.similarity > bestScore) {
        bestMatch = aiMatch;
        bestScore = aiMatch.similarity;
      }
    } catch (error) {
      logger.warn({ err: error, productName }, 'AI matching failed, using fuzzy match result');
      // Continue with best match found so far
    }
  }
  
  // Log low-confidence matches for monitoring
  if (bestMatch && bestMatch.confidence === 'low') {
    logger.warn({
      original: productName,
      matched: bestMatch.matchedName,
      similarity: bestMatch.similarity,
      matchType: bestMatch.matchType,
      language: finalConfig.customerLanguage
    }, 'Low confidence product match');
  }
  
  return bestMatch;
}

/**
 * Detect language from order items (simple heuristic)
 * Performance: Fast regex-based detection
 * 
 * @param orderItems - Array of order items
 * @returns Language code
 */
function detectLanguageFromItems(orderItems: Array<{ product?: string; name?: string }>): string {
  // Try to detect from first item's product name
  const firstItem = orderItems[0];
  if (firstItem) {
    const text = (firstItem.product || firstItem.name || '').trim();
    if (text.length > 0) {
      return detectLanguageFromText(text);
    }
  }
  return 'en'; // Default to English
}

/**
 * Match multiple order items against product catalog
 * Performance: Parallel matching, caching, optimized for high throughput
 * 
 * Uses cached product catalog when available for performance.
 * Vendor-agnostic: Works with any product structure.
 * Multi-language: Supports matching across languages using AI.
 * 
 * @param orderItems - Array of order items with product names (any language)
 * @param vendorId - Vendor ID for caching and vendor-specific config
 * @param products - Optional: Pre-fetched products array (if not provided, will fetch/cache)
 * @param config - Matching configuration (language, field names, etc.)
 * @returns Array of matches (null if no match found)
 */
export async function matchOrderItems(
  orderItems: Array<{ product?: string; name?: string; [key: string]: any }>,
  vendorId: string,
  products?: Array<{ [key: string]: any }>, // Generic product structure
  config: MatchingConfig = {}
): Promise<Array<{ item: any; match: ProductMatch | null }>> {
  // Use cached products if available and not provided
  let productsToUse: Array<{ [key: string]: any }> | undefined = products;
  
  if (!productsToUse && config.useCache !== false) {
    try {
      const cached = await getCachedProductCatalog(vendorId);
      if (cached && cached.length > 0) {
        productsToUse = cached;
      }
    } catch (error) {
      logger.warn({ err: error, vendorId }, 'Failed to get cached products, will fetch from DB');
    }
  }
  
  // If still no products, return empty matches (caller should handle fetching)
  if (!productsToUse || productsToUse.length === 0) {
    logger.warn({ vendorId }, 'No products available for matching');
    return orderItems.map((item: any) => ({ item, match: null }));
  }
  
  // Get customer language from config or detect from items
  const customerLanguage = config.customerLanguage || detectLanguageFromItems(orderItems);
  
  // Update config with language and vendorId
  const finalConfig: MatchingConfig = {
    ...config,
    customerLanguage,
    vendorId
  };
  
  // Performance: Match items in parallel for better throughput
  const matchPromises = orderItems.map(async (item) => {
    const productName = item.product || item.name || '';
    const match = await findBestProductMatch(productName, productsToUse!, finalConfig);
    
    if (match) {
      // Log fuzzy/AI matches for monitoring
      if (match.matchType === 'fuzzy') {
        logger.info({
          original: productName,
          matched: match.matchedName,
          similarity: match.similarity,
          confidence: match.confidence,
          language: customerLanguage,
          vendorId
        }, 'Fuzzy/AI matched product');
      }
      
      // Log low confidence matches
      if (match.confidence === 'low') {
        logger.warn({
          original: productName,
          matched: match.matchedName,
          similarity: match.similarity,
          matchType: match.matchType,
          language: customerLanguage,
          vendorId
        }, 'Low confidence product match - review recommended');
      }
    } else {
      logger.debug({
        productName,
        language: customerLanguage,
        vendorId
      }, 'No product match found');
    }
    
    return { item, match };
  });
  
  return Promise.all(matchPromises);
}

/**
 * Sanitize extracted data by removing invalid placeholder values
 * Performance: Fast array filtering, preserves valid partial names for matching
 * 
 * Preserves partial names and typos for fuzzy matching.
 * Only removes clearly invalid placeholder values.
 * 
 * @param extractedData - Data extracted from AI response
 * @param conversationId - Optional: Conversation ID for logging
 * @returns Sanitized data with invalid placeholders removed
 */
export function sanitizeExtractedData(extractedData: any, conversationId?: string): any {
  if (!extractedData || typeof extractedData !== 'object') {
    return extractedData;
  }
  
  const sanitized = { ...extractedData };
  
  if (sanitized.orderItems && Array.isArray(sanitized.orderItems)) {
    const originalCount = sanitized.orderItems.length;
    const removedItems: any[] = [];
    
    // Performance: Single pass filter
    sanitized.orderItems = sanitized.orderItems.filter((item: any) => {
      // Handle null/undefined items
      if (!item || typeof item !== 'object') {
        removedItems.push({ item, reason: 'Invalid item structure' });
        return false;
      }
      
      const productName = item.product || item.name || '';
      
      // Remove invalid placeholder values (case-insensitive)
      const invalidPlaceholders = [
        'unknown',
        'n/a',
        'na',
        'none',
        'null',
        'undefined',
        '',
        '?',
        '??',
        '???'
      ];
      
      const normalizedProductName = productName.toLowerCase().trim();
      
      if (invalidPlaceholders.includes(normalizedProductName)) {
        removedItems.push({ item, reason: 'Invalid placeholder', productName });
        return false;
      }
      
      // Preserve partial names and typos (they will be matched by fuzzy matching)
      return true;
    });
    
    // Log removals for monitoring
    if (removedItems.length > 0) {
      logger.info({
        conversationId,
        removedCount: removedItems.length,
        originalCount,
        removedItems: removedItems.map(r => ({ reason: r.reason, productName: r.productName }))
      }, 'Sanitized extracted data - removed invalid placeholders');
    }
  }
  
  return sanitized;
}
