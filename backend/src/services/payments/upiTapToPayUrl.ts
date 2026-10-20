import { createUpiPayLinkToken, buildTapToPayPageUrl } from './upiPayLinkToken.js';
import { loadUpiPayPageForOrder } from './upiPayPageService.js';

export async function getTapToPayUrlForOrder(orderId: string): Promise<string | null> {
  const view = await loadUpiPayPageForOrder(orderId);
  if (!view) return null;
  const token = createUpiPayLinkToken(orderId);
  return buildTapToPayPageUrl(token);
}
