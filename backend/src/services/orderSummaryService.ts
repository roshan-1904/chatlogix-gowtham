/**
 * Order Summary Service
 * 
 * Generates clear order summaries for customer communication.
 * Reference: Phase 6 of Order Management System Implementation Plan
 */

import { OrderIntent, OrderItem } from '../types/orderManagement.js';

/**
 * Generate order summary
 * 
 * @param order - Order object
 * @param intent - Order intent
 * @returns Formatted order summary string
 */
export function generateOrderSummary(
  order: any,
  intent?: OrderIntent | null
): string {
  const orderItems = Array.isArray(order.items)
    ? order.items
    : JSON.parse(order.items || '[]');

  if (orderItems.length === 0) {
    return 'Your order is empty.';
  }

  const orderNumber = order.orderNumber || order.id || 'N/A';
  const totalAmount = formatAmount(order.totalAmount || 0);
  
  let summary = `📦 Order ${orderNumber}:\n\n`;
  
  // List items
  orderItems.forEach((item: any, index: number) => {
    const productName = item.product || item.name || 'Unknown';
    const quantity = item.quantity || 0;
    const unitPrice = item.unitPrice || 0;
    const totalPrice = item.totalPrice || (unitPrice * quantity);
    
    summary += `${index + 1}. ${productName} x${quantity}`;
    if (totalPrice > 0) {
      summary += ` - ${formatAmount(totalPrice)}`;
    }
    summary += '\n';
  });

  summary += `\n💰 Total: ${totalAmount}`;

  if (order.deliveryAddress) {
    summary += `\n📍 Delivery Address: ${order.deliveryAddress}`;
  }

  if (order.deliveryInstructions) {
    summary += `\n📝 Instructions: ${order.deliveryInstructions}`;
  }

  if (order.specialRequests) {
    summary += `\n✨ Special Requests: ${order.specialRequests}`;
  }

  return summary;
}

/**
 * Generate add items summary
 * 
 * @param order - Updated order object
 * @param itemsAdded - Items that were added
 * @returns Formatted summary string
 */
export function generateAddItemsSummary(
  order: any,
  itemsAdded: OrderItem[]
): string {
  if (itemsAdded.length === 0) {
    return generateOrderSummary(order);
  }

  const orderNumber = order.orderNumber || order.id || 'N/A';
  const totalAmount = formatAmount(order.totalAmount || 0);
  
  let summary = `✅ Added to your order ${orderNumber}:\n\n`;
  
  itemsAdded.forEach((item, index) => {
    summary += `${index + 1}. ${item.product} x${item.quantity}\n`;
  });

  summary += `\n💰 New Total: ${totalAmount}`;
  summary += `\n\n${generateOrderSummary(order)}`;

  return summary;
}

/**
 * Generate remove items summary
 * 
 * @param order - Updated order object
 * @param itemsRemoved - Items that were removed
 * @returns Formatted summary string
 */
export function generateRemoveItemsSummary(
  order: any,
  itemsRemoved: string[]
): string {
  if (itemsRemoved.length === 0) {
    return generateOrderSummary(order);
  }

  const orderNumber = order.orderNumber || order.id || 'N/A';
  const totalAmount = formatAmount(order.totalAmount || 0);
  
  let summary = `✅ Removed from your order ${orderNumber}:\n\n`;
  
  itemsRemoved.forEach((item, index) => {
    summary += `${index + 1}. ${item}\n`;
  });

  summary += `\n💰 New Total: ${totalAmount}`;
  summary += `\n\n${generateOrderSummary(order)}`;

  return summary;
}

/**
 * Generate change quantity summary
 * 
 * @param order - Updated order object
 * @param quantityChanges - Quantity changes made
 * @returns Formatted summary string
 */
export function generateChangeQuantitySummary(
  order: any,
  quantityChanges: Array<{product: string, oldQuantity: number, newQuantity: number}>
): string {
  if (quantityChanges.length === 0) {
    return generateOrderSummary(order);
  }

  const orderNumber = order.orderNumber || order.id || 'N/A';
  const totalAmount = formatAmount(order.totalAmount || 0);
  
  let summary = `✅ Updated quantities in your order ${orderNumber}:\n\n`;
  
  quantityChanges.forEach((change, index) => {
    summary += `${index + 1}. ${change.product}: ${change.oldQuantity} → ${change.newQuantity}\n`;
  });

  summary += `\n💰 New Total: ${totalAmount}`;
  summary += `\n\n${generateOrderSummary(order)}`;

  return summary;
}

/**
 * Generate confirmation prompt
 * 
 * @param order - Order object
 * @returns Confirmation prompt string
 */
export function generateConfirmationPrompt(order: any): string {
  const summary = generateOrderSummary(order);
  
  return `${summary}\n\n✅ Please confirm if this looks correct, or let me know if you'd like to make any changes!`;
}

/**
 * Format amount (handle paise to rupees conversion)
 */
function formatAmount(amount: number): string {
  // If amount is likely in paise (>= 100), convert to rupees
  if (amount >= 100) {
    return `₹${(amount / 100).toFixed(2)}`;
  }
  return `₹${amount.toFixed(2)}`;
}

/**
 * Generate multi-language order summary (English, Tamil, Hindi)
 */
export function generateOrderSummaryMultiLanguage(
  order: any,
  language: 'en' | 'ta' | 'hi' = 'en'
): string {
  if (language === 'en') {
    return generateOrderSummary(order);
  }

  // For Tamil and Hindi, use English for now
  // In production, you'd add proper translations
  return generateOrderSummary(order);
}

