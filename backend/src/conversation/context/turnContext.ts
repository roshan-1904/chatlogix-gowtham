import type { HotSet } from '../types.js';
import {
  HYPOTHETICAL_PREP_PHRASES,
  matchesAny,
  normalizeForMatch,
  ORDER_STATUS_PHRASES,
  REORDER_PHRASES,
  isGreetingOrThanksOnly
} from '../orderStatusGuard.js';
import { FULL_CATALOG_FAST_PATH_MAX, K_BROWSE, K_PRODUCT } from './catalogContextConfig.js';

export type TurnContextMode =
  | 'order_status'
  | 'checkout_fields'
  | 'product'
  | 'browse'
  | 'general';

export interface TurnContextPlan {
  mode: TurnContextMode;
  retrievalQuery: string;
  retrievalTopK: number;
  omitCatalogTable: boolean;
  pinnedProductIds: string[];
  reasons: string[];
}

const CANCEL_REFUND_PHRASES: RegExp[] = [
  /\bcancel (?:my )?order\b/i,
  /\brefund\b/i,
  /\bmoney back\b/i
];

const CHECKOUT_FIELD_PHRASES: RegExp[] = [
  /\bmy (?:name|address) is\b/i,
  /\bdeliver(?:y)? (?:to|on|date)\b/i,
  /\bconfirm(?:ation)?\b/i,
  /\byes\b/i,
  /\bok(?:ay)?\b/i,
  /\bship (?:to|it)\b/i
];

const BROWSE_PHRASES: RegExp[] = [
  /\bmenu\b/i,
  /\bcatalog(?:ue)?\b/i,
  /\bwhat do you (?:have|sell)\b/i,
  /\brate list\b/i,
  /\bprice list\b/i,
  /\bshow (?:me )?(?:all|everything)\b/i,
  /\blist (?:of )?products\b/i,
  /\bஎன்ன வகை\b/,
  /\bक्या मिलेगा\b/
];

const SHORT_ACK = /^(yes|ok|okay|yep|sure|correct|confirmed)\.?$/i;

function cartProductIds(hotSet: HotSet): string[] {
  if (!hotSet.pendingOrder?.items.length) return [];
  return hotSet.pendingOrder.items.map((i) => i.productId);
}

function orderHistoryEntries(hotSet: HotSet) {
  return hotSet.orderHistory ?? [];
}

function reorderPinnedIds(hotSet: HotSet, text: string): string[] {
  if (!matchesAny(text, REORDER_PHRASES)) return [];
  const ids: string[] = [];
  const orders = orderHistoryEntries(hotSet).slice(0, 2);
  for (const order of orders) {
    const items = order.items as Array<{ productId?: string }>;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (item.productId) ids.push(item.productId);
      }
    }
  }
  return ids;
}

function isOrderStatusPreLlm1(mergedContent: string, hotSet: HotSet): boolean {
  const text = normalizeForMatch(mergedContent);
  if (!text) return false;

  if (matchesAny(text, CANCEL_REFUND_PHRASES)) return true;

  const historyEmpty = orderHistoryEntries(hotSet).length === 0;
  if (historyEmpty && matchesAny(text, HYPOTHETICAL_PREP_PHRASES) && !/\bmy order\b/i.test(text)) {
    return false;
  }

  return matchesAny(text, ORDER_STATUS_PHRASES);
}

function isCheckoutFields(mergedContent: string, hotSet: HotSet): boolean {
  const text = normalizeForMatch(mergedContent);
  const hasCart = cartProductIds(hotSet).length > 0;
  if (!hasCart && hotSet.memory?.stage !== 'confirming') return false;

  if (hotSet.memory?.stage === 'confirming' && SHORT_ACK.test(text)) {
    return true;
  }

  if (!hasCart) return false;
  return matchesAny(text, CHECKOUT_FIELD_PHRASES);
}

function isBrowse(mergedContent: string): boolean {
  const text = normalizeForMatch(mergedContent);
  return matchesAny(text, BROWSE_PHRASES);
}

function browseRetrievalTopK(fullCatalogSize: number): number {
  if (fullCatalogSize <= FULL_CATALOG_FAST_PATH_MAX) return 0;
  if (fullCatalogSize <= 20) return 0;
  return Math.min(K_BROWSE, fullCatalogSize);
}

function productRetrievalTopK(fullCatalogSize: number): number {
  if (fullCatalogSize <= FULL_CATALOG_FAST_PATH_MAX) return 0;
  return Math.min(K_PRODUCT, fullCatalogSize);
}

/**
 * Deterministic turn routing before LLM-1 (strict priority A→E).
 */
export function planTurnContext(input: {
  mergedContent: string;
  hotSet: HotSet;
  traceId?: string;
}): TurnContextPlan {
  const { mergedContent, hotSet } = input;
  const text = normalizeForMatch(mergedContent);
  const fullSize = hotSet.compactCatalog.length;
  const reasons: string[] = [];

  // A. order_status
  if (isOrderStatusPreLlm1(mergedContent, hotSet)) {
    const reorderPins = reorderPinnedIds(hotSet, text);
    if (reorderPins.length) reasons.push('reorder_pins');
    reasons.push('order_status_phrase');
    return {
      mode: 'order_status',
      retrievalQuery: text,
      retrievalTopK: 0,
      omitCatalogTable: reorderPins.length === 0,
      pinnedProductIds: reorderPins,
      reasons
    };
  }

  // B. checkout_fields
  if (isCheckoutFields(mergedContent, hotSet)) {
    reasons.push('checkout_fields');
    return {
      mode: 'checkout_fields',
      retrievalQuery: text,
      retrievalTopK: 0,
      omitCatalogTable: false,
      pinnedProductIds: cartProductIds(hotSet),
      reasons
    };
  }

  // C. general (before product default)
  if (isGreetingOrThanksOnly(text)) {
    reasons.push('greeting_or_thanks');
    return {
      mode: 'general',
      retrievalQuery: text,
      retrievalTopK: 0,
      omitCatalogTable: true,
      pinnedProductIds: [],
      reasons
    };
  }

  // D. browse
  if (isBrowse(mergedContent)) {
    const topK = browseRetrievalTopK(fullSize);
    reasons.push('browse_phrase');
    if (topK === 0) reasons.push('browse_full_catalog_fast_path');
    return {
      mode: 'browse',
      retrievalQuery: text,
      retrievalTopK: topK,
      omitCatalogTable: false,
      pinnedProductIds: [],
      reasons
    };
  }

  // E. product (default)
  const topK = productRetrievalTopK(fullSize);
  reasons.push('product_default');
  if (topK === 0) reasons.push('product_full_catalog_fast_path');
  return {
    mode: 'product',
    retrievalQuery: text,
    retrievalTopK: topK,
    omitCatalogTable: false,
    pinnedProductIds: cartProductIds(hotSet),
    reasons
  };
}
