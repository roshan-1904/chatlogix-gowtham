/**
 * Order Management Type Definitions
 * 
 * Centralized type definitions for order management system.
 * Consolidates OrderItem definitions from orderService.ts and aiResponse.ts.
 * 
 * Reference: Phase 0 of Order Management System Implementation Plan
 */

/**
 * Order Intent - Represents customer intent for order operations
 */
export interface OrderIntent {
  type: 'add' | 'remove' | 'change' | 'replace' | 'confirm' | 'cancel' | 'new';
  confidence: number;
  extractedItems?: OrderItem[];
  itemsToRemove?: string[];
  quantityChanges?: Array<{product: string, newQuantity: number}>;
  reasoning?: string;
}

/**
 * Order Update Result - Standardized result from order update operations
 */
export interface OrderUpdateResult {
  success: boolean;
  orderId: string;
  orderNumber: string;
  previousTotal: number;
  newTotal: number;
  itemsAdded?: number;
  itemsRemoved?: number;
  itemsChanged?: number;
  errors?: string[];
  warnings?: string[];
}

/**
 * Order Item - Consolidated definition for order items
 * Consolidates definitions from orderService.ts and aiResponse.ts
 */
export interface OrderItem {
  product: string;
  quantity: number;
  unitPrice?: number;
  totalPrice?: number;
  unit?: string; // 'piece' or 'kg'
  matchedProductId?: string; // Product ID from catalog after matching
}

/**
 * Recovery Result - Result from order recovery operations
 */
export interface RecoveryResult {
  success: boolean;
  recovered: boolean;
  itemsAdded?: OrderItem[];
  itemsRemoved?: OrderItem[];
  orderId: string;
  message: string;
  confidence: number;
}

