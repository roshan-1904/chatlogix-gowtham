import type { NavigateFunction } from 'react-router-dom';

/**
 * Navigate to order details page
 */
export function navigateToOrderDetails(
  orderId: string,
  navigate: NavigateFunction
): void {
  navigate(`/orders/${orderId}`);
}

/**
 * Navigate to conversation with optional pre-selection
 */
export function navigateToConversation(
  conversationId: string,
  navigate: NavigateFunction,
  options?: { orderId?: string }
): void {
  navigate(`/conversations`, {
    state: { conversationId, orderId: options?.orderId },
  });
}

/**
 * Navigate to conversations page with query param
 */
export function navigateToConversationWithQuery(
  conversationId: string,
  navigate: NavigateFunction
): void {
  navigate(`/conversations?conversationId=${conversationId}`);
}

