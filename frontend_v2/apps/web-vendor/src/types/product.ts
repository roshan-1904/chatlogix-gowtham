/**
 * Product type definitions
 * Note: Prices in frontend are stored in rupees for display, converted to paise for API
 */

export type ProductMediaKind = 'image' | 'video';

/** Catalog photo/video row from GET /api/products/:id/media (or embedded on product). */
export interface ProductMedia {
  id: string;
  productId: string;
  kind: ProductMediaKind;
  mimeType: string;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  label: string | null;
  sortOrder: number;
  isActive: boolean;
  /** API-relative path, e.g. `/api/products/:id/media/:mediaId/preview` */
  previewUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMediaUploadUrlResponse {
  uploadId: string;
  s3Key: string;
  presignedUrl?: string;
  expiresAt: string;
  kind: ProductMediaKind;
  /** When true, PUT file bytes to `uploadUrl` on the API (Bearer auth) instead of S3. */
  uploadViaApi?: boolean;
  uploadUrl?: string;
  requiredHeaders: Record<string, string>;
}

export interface ProductMediaCommitInput {
  s3Key: string;
  label?: string | null;
  sortOrder?: number;
  width?: number;
  height?: number;
  durationSec?: number;
}

export interface Variant {
  label?: string;                         // "10x10 Kadai"
  attributes?: Record<string, string>;    // { size: "10x10", material: "Kadai" }
  sku?: string;
  unit: string;
  baseQuantity: number;
  price: number; // In rupees for frontend
  isDivisible: boolean;
  isActive?: boolean;
}

export interface Product {
  id: string;
  vendorId: string;
  name: string;
  description?: string;
  keywords: string[];
  baseUnit: string;
  baseQuantity: number;
  basePrice: number; // In rupees for frontend (converted from paise)
  isDivisible: boolean;
  variants?: Variant[];
  isActive: boolean;
  inStock: boolean;
  stockQuantity?: number;
  minOrderQuantity?: number;
  maxOrderQuantity?: number;
  category?: string;
  imageUrl?: string;
  media?: ProductMedia[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductFormData {
  // Basic Information
  name: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  tags: string[];
  
  // Pricing & Units
  baseUnit: string;
  baseQuantity: number;
  basePrice: number; // In rupees
  isDivisible: boolean;
  minOrderQuantity?: number;
  maxOrderQuantity?: number;
  
  // Variants
  variants?: Variant[];
  
  // Inventory
  stockQuantity?: number; // null = not tracking stock
  inStock: boolean;
  
  // AI Keywords
  keywords: string[];
  
  // Status
  isActive: boolean;
}

export interface ProductFilters {
  category?: string;
  isActive?: boolean;
  search?: string;
  inStock?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductStats {
  totalOrders: number;
  totalRevenue: number; // In rupees
  averageOrderQuantity: number;
  lastOrderedAt: string | null;
}

export interface BulkOperationResult {
  success: boolean;
  updated: number;
  errors: Array<{ id: string; error: string }>;
}

