/**
 * Order Preparation Configuration Types
 * 
 * Defines types and helper functions for vendor order delivery and preparation settings
 */

export type PreparationTimeType = 
  | 'after_order'      // Start preparing after order placed
  | 'fixed_minutes'    // Fixed time (e.g., 30 minutes)
  | 'variable'         // Variable time (needs more time)
  | 'ready_to_ship';   // Ready to ship immediately

export interface OrderPreparationConfig {
  type: PreparationTimeType;
  fixedMinutes?: number | null;  // Only for 'fixed_minutes'
  message?: string | null;       // Custom message for vendor
}

export interface VendorOrderSettings {
  category?: string | null;
  askForPreferredDeliveryDate: boolean;
  orderPreparationConfig?: OrderPreparationConfig | null;
}

/**
 * Helper: Get preparation time message
 */
export function getPreparationTimeMessage(
  config: OrderPreparationConfig | null | undefined,
  vendorName?: string
): string {
  if (!config) {
    return 'We\'ll prepare your order and let you know when it\'s ready.';
  }

  switch (config.type) {
    case 'after_order':
      return 'We\'ll start preparing your order right away!';
    
    case 'fixed_minutes':
      if (config.fixedMinutes) {
        return `Your order will be ready in approximately ${config.fixedMinutes} minutes.`;
      }
      return 'We\'ll prepare your order and let you know when it\'s ready.';
    
    case 'variable':
      return config.message || 'We\'ll prepare your order and let you know when it\'s ready.';
    
    case 'ready_to_ship':
      return 'Your order is ready to ship immediately!';
    
    default:
      return 'We\'ll prepare your order and let you know when it\'s ready.';
  }
}

/**
 * Helper: Check if vendor should ask for delivery date
 */
export function shouldAskForDeliveryDate(
  category: string | null | undefined,
  askForPreferredDeliveryDate: boolean
): boolean {
  // Only ask if explicitly enabled AND vendor is in food category
  return askForPreferredDeliveryDate === true && category === 'food';
}

