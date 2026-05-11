/**
 * Product API service
 * Handles all product-related API calls with price conversion
 */

import { apiClient } from './api';
import { rupeesToPaise, paiseToRupees } from '../utils/price';
import type { Product, ProductFormData, ProductFilters, ProductStats, BulkOperationResult } from '../types/product';

/**
 * Convert Product from API (paise) to display format (rupees)
 */
function convertProductFromAPI(product: any): Product {
  // Handle variants: ensure it's an array before mapping
  let variants: Product['variants'] = undefined;
  if (product.variants) {
    let variantsArray: any[] = [];
    
    if (Array.isArray(product.variants)) {
      // Variants is already an array - process normally
      variantsArray = product.variants;
    } else if (typeof product.variants === 'string') {
      // Variants is a JSON string - try to parse it
      try {
        const parsed = JSON.parse(product.variants);
        if (Array.isArray(parsed)) {
          variantsArray = parsed;
        } else if (parsed && typeof parsed === 'object') {
          // Check if it's the API format with pricing object
          if (parsed.pricing && typeof parsed.pricing === 'object') {
            // Convert pricing object to variant array
            // e.g., { "1box": 499, "2box": 950 } -> [{ quantity: 1, unit: "box", price: 499 }, ...]
            const pricingKeys = Object.keys(parsed.pricing);
            variantsArray = pricingKeys.map(key => {
              // Parse key like "1box" or "2box" to extract quantity and unit
              const match = key.match(/^(\d+)(.+)$/);
              if (match) {
                const quantity = parseInt(match[1], 10);
                const unit = match[2] || product.baseUnit || 'box';
                return {
                  unit,
                  baseQuantity: quantity,
                  price: parsed.pricing[key],
                  isDivisible: parsed.isDivisible || false
                };
              }
              return null;
            }).filter(Boolean);
          } else {
            // Check if it's an object with numeric keys (like {0: {...}, 1: {...}})
            const keys = Object.keys(parsed);
            if (keys.length > 0 && keys.every(k => !isNaN(Number(k)))) {
              // It's an object with numeric keys, convert to array
              variantsArray = keys.map(k => parsed[k]);
            } else {
              // It's a single variant object, wrap it in an array
              variantsArray = [parsed];
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse variants JSON string:', e);
      }
    } else if (product.variants && typeof product.variants === 'object') {
      // Check if it's the API format with pricing object
      if (product.variants.pricing && typeof product.variants.pricing === 'object') {
        // Convert pricing object to variant array
        // e.g., { "1box": 49900, "2box": 95000 } -> [{ quantity: 1, unit: "box", price: 499 }, ...]
        const pricingKeys = Object.keys(product.variants.pricing);
        variantsArray = pricingKeys.map(key => {
          // Parse key like "1box" or "2box" to extract quantity and unit
          const match = key.match(/^(\d+)(.+)$/);
          if (match) {
            const quantity = parseInt(match[1], 10);
            const unit = match[2] || product.baseUnit || 'box';
            return {
              unit,
              baseQuantity: quantity,
              price: product.variants.pricing[key], // Price is already in paise from API
              isDivisible: product.variants.isDivisible || product.isDivisible || false
            };
          }
          return null;
        }).filter(Boolean);
      } else {
        // Variants is an object - try to convert to array
        const keys = Object.keys(product.variants);
        if (keys.length > 0 && keys.every(k => !isNaN(Number(k)))) {
          // It's an object with numeric keys, convert to array
          variantsArray = keys.map(k => product.variants[k]);
        } else {
          // It's a single variant object, wrap it in an array
          variantsArray = [product.variants];
        }
      }
    }
    
    // Process the variants array if we have one
    if (variantsArray.length > 0) {
      variants = variantsArray.map((v: any) => {
        // Determine if price is in paise or rupees
        // If basePrice is in paise (e.g., 49900) and variant price is small (e.g., 499), 
        // variant price is likely already in rupees
        let priceInRupees = v.price || 0;
        const basePriceInPaise = product.basePrice || 0;
        
        // If variant price is much smaller than basePrice (less than 1/10th), 
        // it's likely already in rupees. Otherwise, assume it's in paise.
        if (basePriceInPaise > 0 && priceInRupees > 0 && priceInRupees < basePriceInPaise / 10) {
          // Already in rupees, use as-is
          priceInRupees = priceInRupees;
        } else if (priceInRupees >= 1000) {
          // Large value, likely in paise - convert to rupees
          priceInRupees = paiseToRupees(priceInRupees);
        }
        // If price is between 0-1000, assume it's already in rupees
        
        return {
          label: v.label || undefined,
          attributes: v.attributes && typeof v.attributes === 'object' ? v.attributes : undefined,
          sku: v.sku || undefined,
          unit: v.unit || product.baseUnit || '',
          baseQuantity: Number(v.baseQuantity) || 1,
          price: priceInRupees,
          isDivisible: Boolean(v.isDivisible),
          isActive: v.isActive !== false
        };
      });
    }
  }

  return {
    ...product,
    basePrice: paiseToRupees(product.basePrice), // Convert to rupees for display
    variants,
    stockQuantity: product.stockQuantity ? Number(product.stockQuantity) : undefined,
    baseQuantity: Number(product.baseQuantity),
    minOrderQuantity: product.minOrderQuantity ? Number(product.minOrderQuantity) : undefined,
    maxOrderQuantity: product.maxOrderQuantity ? Number(product.maxOrderQuantity) : undefined,
  };
}

/**
 * Convert Product to API format (paise)
 */
function convertProductToAPI(product: Partial<ProductFormData>): any {
  // Handle variants: convert to array format expected by backend schema
  let variants: any = undefined;
  if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
    // Backend expects variants as an array of VariantSchema objects
    // Each variant should have: unit, baseQuantity, price (in paise as integer), isDivisible
    variants = product.variants.map(variant => {
      const v: any = {
        unit: variant.unit,
        baseQuantity: variant.baseQuantity,
        price: rupeesToPaise(variant.price),
        isDivisible: variant.isDivisible ?? false,
        isActive: variant.isActive !== false
      };
      if (variant.label) v.label = variant.label;
      if (variant.sku) v.sku = variant.sku;
      if (variant.attributes && Object.keys(variant.attributes).length > 0) {
        v.attributes = variant.attributes;
      }
      return v;
    });
  }

  // Prepare the API payload - only include fields that should be sent
  const apiData: any = {};

  // Basic Information
  if (product.name !== undefined) apiData.name = product.name;
  if (product.description !== undefined) {
    apiData.description = product.description === '' ? undefined : product.description;
  }
  if (product.category !== undefined) {
    apiData.category = product.category === '' ? undefined : product.category;
  }
  if (product.imageUrl !== undefined) {
    apiData.imageUrl = product.imageUrl === '' ? undefined : product.imageUrl;
  }
  if (product.tags !== undefined) {
    apiData.tags = Array.isArray(product.tags) ? product.tags : [];
  }

  // Pricing & Units
  if (product.baseUnit !== undefined) apiData.baseUnit = product.baseUnit;
  if (product.baseQuantity !== undefined) apiData.baseQuantity = product.baseQuantity;
  if (product.basePrice !== undefined && product.basePrice > 0) {
    apiData.basePrice = rupeesToPaise(product.basePrice); // Convert to paise (integer)
  }
  if (product.isDivisible !== undefined) apiData.isDivisible = product.isDivisible;
  if (product.minOrderQuantity !== undefined) apiData.minOrderQuantity = product.minOrderQuantity;
  if (product.maxOrderQuantity !== undefined) apiData.maxOrderQuantity = product.maxOrderQuantity;

  // Variants - only include if we have variants
  if (variants !== undefined && Array.isArray(variants) && variants.length > 0) {
    apiData.variants = variants;
  }

  // Inventory
  if (product.stockQuantity !== undefined && product.stockQuantity !== null) {
    apiData.stockQuantity = product.stockQuantity;
  }
  if (product.inStock !== undefined) apiData.inStock = product.inStock;

  // AI Keywords
  if (product.keywords !== undefined) {
    apiData.keywords = Array.isArray(product.keywords) ? product.keywords : [];
  }

  // Status
  if (product.isActive !== undefined) apiData.isActive = product.isActive;

  return apiData;
}

/**
 * Get products with filtering and pagination
 */
export async function getProducts(
  filters?: ProductFilters
): Promise<{ products: Product[]; total: number; page: number; pageSize: number }> {
  const params = new URLSearchParams();
  
  if (filters?.category) params.append('category', filters.category);
  if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
  if (filters?.search) params.append('search', filters.search);
  if (filters?.inStock !== undefined) params.append('inStock', String(filters.inStock));
  if (filters?.page) params.append('page', String(filters.page));
  if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
  
  const response = await apiClient.get<any>(`/products?${params.toString()}`);
  
  // Handle both paginated response and array response (for backward compatibility)
  if (response.products && typeof response.total === 'number') {
    // Paginated response format
    return {
      products: response.products.map(convertProductFromAPI),
      total: response.total,
      page: response.page || filters?.page || 1,
      pageSize: response.pageSize || filters?.pageSize || 20,
    };
  } else if (Array.isArray(response)) {
    // Array response format (backward compatibility)
    return {
      products: response.map(convertProductFromAPI),
      total: response.length,
      page: filters?.page || 1,
      pageSize: filters?.pageSize || 20,
    };
  } else {
    // Fallback
    return {
      products: [],
      total: 0,
      page: filters?.page || 1,
      pageSize: filters?.pageSize || 20,
    };
  }
}

/**
 * Get single product by ID
 */
export async function getProduct(id: string): Promise<Product> {
  const product = await apiClient.get<any>(`/products/${id}`);
  return convertProductFromAPI(product);
}

/**
 * Create a new product
 */
export async function createProduct(product: Omit<ProductFormData, 'isActive'> & { isActive?: boolean }): Promise<Product> {
  const apiData = convertProductToAPI(product);
  const created = await apiClient.post<any>('/products', apiData);
  return convertProductFromAPI(created);
}

/**
 * Update an existing product
 */
export async function updateProduct(id: string, product: Partial<ProductFormData>): Promise<Product> {
  const apiData = convertProductToAPI(product);
  
  // Log the data being sent for debugging
  console.log('Updating product with data:', JSON.stringify(apiData, null, 2));
  
  try {
    const updated = await apiClient.put<any>(`/products/${id}`, apiData);
    return convertProductFromAPI(updated);
  } catch (error: any) {
    // Log the full error for debugging
    console.error('Update product error:', error);
    if (error.message) {
      console.error('Error message:', error.message);
    }
    throw error;
  }
}

/**
 * Delete a product (soft delete)
 */
export async function deleteProduct(id: string): Promise<void> {
  return apiClient.delete(`/products/${id}`);
}

/**
 * Bulk update products
 */
export async function bulkUpdateProducts(
  action: 'activate' | 'deactivate' | 'delete',
  ids: string[]
): Promise<BulkOperationResult> {
  return apiClient.post('/products/bulk', { action, ids });
}

/**
 * Get all unique categories for the vendor
 */
export async function getCategories(): Promise<string[]> {
  const response = await apiClient.get<{ categories: string[] }>('/products/categories');
  return response.categories || [];
}

/**
 * Get product statistics
 */
export async function getProductStats(id: string): Promise<ProductStats> {
  const stats = await apiClient.get<{
    totalOrders: number;
    totalRevenue: number; // Already in rupees from backend
    averageOrderQuantity: number;
    lastOrderedAt: string | null;
  }>(`/products/${id}/stats`);
  
  return {
    ...stats,
    totalRevenue: stats.totalRevenue // Already converted to rupees by backend
  };
}

