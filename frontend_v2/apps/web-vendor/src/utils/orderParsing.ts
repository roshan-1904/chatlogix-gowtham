import type { OrderItem } from '../components/conversations/types';

/**
 * Helper to detect if amount is in paise (large values) or rupees (smaller values)
 * If amount > 10000, likely in paise; otherwise likely in rupees
 */
function isLikelyPaise(amount: number): boolean {
  return amount >= 10000;
}

/**
 * Convert paise to rupees if needed
 */
function normalizeToRupees(amount: number, isPaise: boolean): number {
  return isPaise ? amount / 100 : amount;
}

/**
 * Parse order items from JSON string or object
 * Handles both string and object formats
 * Calculates missing prices from total amount if needed
 * Handles both paise and rupees formats
 */
export function parseOrderItems(items: unknown, totalAmount?: number): OrderItem[] {
  let parsedItems: OrderItem[] = [];
  
  // If already an array, use as-is
  if (Array.isArray(items)) {
    parsedItems = items;
  }
  // If string, try to parse JSON
  else if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items);
      parsedItems = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch (error) {
      console.error('Failed to parse order items:', error);
      parsedItems = [];
    }
  }
  // If object but not array, wrap in array
  else if (items && typeof items === 'object') {
    parsedItems = [items as OrderItem];
  }
  
  // Validate and calculate missing prices
  if (parsedItems.length > 0 && totalAmount !== undefined && totalAmount !== null) {
    // Detect if totalAmount is in paise or rupees
    const totalIsPaise = isLikelyPaise(totalAmount);
    const totalInRupees = normalizeToRupees(totalAmount, totalIsPaise);
    
    // Check if any items are missing prices
    const hasMissingPrices = parsedItems.some(
      item => !item.unitPrice || !item.totalPrice || item.unitPrice === 0 || item.totalPrice === 0
    );
    
    if (hasMissingPrices) {
      // Calculate total quantity for proportional distribution
      const totalQuantity = parsedItems.reduce((sum, item) => {
        const qty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity)) || 1;
        return sum + qty;
      }, 0);
      
      // Distribute total amount proportionally based on quantity
      parsedItems = parsedItems.map(item => {
        const qty = typeof item.quantity === 'number' ? item.quantity : parseFloat(String(item.quantity)) || 1;
        
        // Detect if existing prices are in paise or rupees
        const itemUnitPriceIsPaise = item.unitPrice ? isLikelyPaise(item.unitPrice) : totalIsPaise;
        const itemTotalPriceIsPaise = item.totalPrice ? isLikelyPaise(item.totalPrice) : totalIsPaise;
        
        // If prices are missing, calculate them
        if (!item.totalPrice || item.totalPrice === 0) {
          // Calculate proportional share of total amount (in rupees)
          const proportionalShare = totalQuantity > 0 
            ? (qty / totalQuantity) * totalInRupees 
            : totalInRupees / parsedItems.length;
          const calculatedTotalPrice = proportionalShare;
          const calculatedUnitPrice = qty > 0 ? calculatedTotalPrice / qty : 0;
          
          return {
            ...item,
            unitPrice: item.unitPrice && item.unitPrice > 0 
              ? normalizeToRupees(item.unitPrice, itemUnitPriceIsPaise)
              : calculatedUnitPrice,
            totalPrice: calculatedTotalPrice,
          };
        }
        
        // If unitPrice is missing but totalPrice exists, calculate it
        if (!item.unitPrice || item.unitPrice === 0) {
          const totalInRupees = normalizeToRupees(item.totalPrice, itemTotalPriceIsPaise);
          return {
            ...item,
            unitPrice: qty > 0 ? totalInRupees / qty : 0,
            totalPrice: totalInRupees,
          };
        }
        
        // Normalize existing prices to rupees
        return {
          ...item,
          unitPrice: normalizeToRupees(item.unitPrice, itemUnitPriceIsPaise),
          totalPrice: normalizeToRupees(item.totalPrice, itemTotalPriceIsPaise),
        };
      });
    } else {
      // Normalize all prices to rupees even if they exist
      parsedItems = parsedItems.map(item => {
        const unitIsPaise = item.unitPrice ? isLikelyPaise(item.unitPrice) : false;
        const totalIsPaise = item.totalPrice ? isLikelyPaise(item.totalPrice) : false;
        return {
          ...item,
          unitPrice: item.unitPrice ? normalizeToRupees(item.unitPrice, unitIsPaise) : 0,
          totalPrice: item.totalPrice ? normalizeToRupees(item.totalPrice, totalIsPaise) : 0,
        };
      });
    }
  }
  
  return parsedItems;
}

/**
 * Get item count from order items
 */
export function getItemCount(items: unknown): number {
  const parsed = parseOrderItems(items);
  return parsed.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

/**
 * Get items summary (first N items)
 */
export function getItemsSummary(items: unknown, maxItems: number = 3): string {
  const parsed = parseOrderItems(items);
  if (parsed.length === 0) return 'No items';
  
  const itemNames = parsed.slice(0, maxItems).map(item => item.product);
  const summary = itemNames.join(', ');
  
  if (parsed.length > maxItems) {
    return `${summary} and ${parsed.length - maxItems} more`;
  }
  
  return summary;
}

