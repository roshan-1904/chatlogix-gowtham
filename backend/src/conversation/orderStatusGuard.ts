import { getPreparationTimeMessage, type OrderPreparationConfig } from '../types/orderSettings.js';
import { parseOrderItems } from './cart/snapshot.js';
import { ORDER_STATUS_LABELS } from './llm/prompts.js';
import type { CartOp, OrderHistoryEntry } from './types.js';

export interface OrderStatusTurnInput {
  mergedContent: string;
  intent: string;
  ops: CartOp[];
  orderHistory: OrderHistoryEntry[];
}

export const ORDER_STATUS_PHRASES: RegExp[] = [
  /\border status\b/i,
  /\bwhere(?:'s| is) (?:my |the )?order\b/i,
  /\bwhere is it\b/i,
  /\blast order\b/i,
  /\balready ordered\b/i,
  /\bi (?:already )?ordered\b/i,
  /\bdid i (?:already )?order\b/i,
  /\btracking\b/i,
  /\bmy order\b/i,
  /\bstill checking\b/i,
  /\bwhen (?:will|would) (?:i get|it (?:arrive|come|be ready)|my order)\b/i,
  /\beappo kidaikum\b/i,
  /\beppo kidaikum\b/i,
  /\border panni/i,
  /\border pannen\b/i,
  /\bkab milega\b/i,
  /\border kahan\b/i,
  /\bstatus kya\b/i,
  /எப்போ/,
  /ஆர்டர்/,
  /कब मिलेगा/,
  /ऑर्डर/
];

/** “How long if I order today” is prep/policy, not D6, when there is no history. */
export const HYPOTHETICAL_PREP_PHRASES: RegExp[] = [
  /\bif i (?:were to )?order\b/i,
  /\bwhen i order\b/i,
  /\bhow long (?:does it take|to (?:bake|make|prepare|ready)|if i)\b/i
];

export const REORDER_PHRASES: RegExp[] = [
  /\bsame as (?:last|before)\b/i,
  /\brepeat (?:order|last)\b/i,
  /\border again\b/i,
  /\blast time\b/i,
  /\bமீண்டும்\b/,
  /\bஅதே\b.*\border\b/i,
  /\bफिर से\b/,
  /\bवही\b/
];

export function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

/** Short greeting/thanks-only turns → general mode (no catalog retrieval). */
export function isGreetingOrThanksOnly(text: string): boolean {
  const t = normalizeForMatch(text).toLowerCase();
  if (!t || t.length > 80) return false;
  if (/^(hi|hello|hey|good (morning|afternoon|evening)|namaste|vanakkam|வணக்கம்|नमस्ते)\b/.test(t)) return true;
  if (/^(thanks|thank you|thx|ok thanks|okay thanks|👍|🙏)\b/.test(t)) return true;
  if (/^(ok|okay|cool|great|nice)\.?$/i.test(t)) return true;
  return false;
}

/**
 * True when the customer is asking about an existing order’s status/ETA,
 * or the turn is cancel/refund. False for hypothetical prep-time questions
 * with empty history (“how long if I order today”).
 */
export function isOrderStatusTurn(input: OrderStatusTurnInput): boolean {
  const hasCancelOrRefund = input.ops.some((op) => op.type === 'cancel' || op.type === 'refund_request');
  if (hasCancelOrRefund) return true;

  const text = normalizeForMatch(input.mergedContent);
  if (!text) return false;

  const historyEmpty = input.orderHistory.length === 0;
  if (historyEmpty && matchesAny(text, HYPOTHETICAL_PREP_PHRASES) && !/\bmy order\b/i.test(text)) {
    return false;
  }

  if (matchesAny(text, ORDER_STATUS_PHRASES)) return true;
  if (input.intent === 'order_status') return true;

  return false;
}

/** Phrase fallback for “I’ll check / get back / Kanmani will confirm”. */
export function looksLikeDeferral(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\bi(?:'|’| a)?ll check\b/.test(t) ||
    /\bi will check\b/.test(t) ||
    /\blet me check\b/.test(t) ||
    /\bget back (?:to you|soon)\b/.test(t) ||
    /\bi(?:'|’| a)?ll get back\b/.test(t) ||
    /\bstill checking\b/.test(t) ||
    /\bwill (?:check|confirm|get back)\b/.test(t) ||
    /\bkanmani will confirm\b/.test(t) ||
    /\bcheck with (?:the )?(?:vendor|team|kanmani|shop)\b/.test(t) ||
    /\bconfirm (?:availability|exact sizes|the status)\b/.test(t)
  );
}

export function citesOrderNumberFromHistory(text: string, orderHistory: OrderHistoryEntry[]): boolean {
  if (orderHistory.length === 0 || !text) return false;
  const lower = text.toLowerCase();
  return orderHistory.some((o) => o.orderNumber && lower.includes(o.orderNumber.toLowerCase()));
}

export function shouldRewriteOrderStatusReply(draftReply: string, orderHistory: OrderHistoryEntry[]): boolean {
  return looksLikeDeferral(draftReply) || !citesOrderNumberFromHistory(draftReply, orderHistory);
}

/** Safe no-op until `knowledge_gap` exists on CartOp (PR2). */
export function stripKnowledgeGapOps<T extends { type: string }>(ops: T[]): T[] {
  return ops.filter((op) => op.type !== 'knowledge_gap');
}

/** D6: order-status turns never send catalog media (docs/PRODUCT_MEDIA.md §5). */
export function stripSendProductMediaOps<T extends { type: string }>(ops: T[]): T[] {
  return ops.filter((op) => op.type !== 'send_product_media');
}

export function renderOrderStatusReply(
  orderHistory: OrderHistoryEntry[],
  vendorConfig?: { orderPreparationConfig?: unknown } | null
): string {
  if (orderHistory.length === 0) {
    return "I don't see an order on file. Would you like to place one?";
  }

  const latest = orderHistory[0];
  const label = ORDER_STATUS_LABELS[latest.status] || `📦 ${latest.status}`;
  const itemsSummary =
    parseOrderItems(latest.items)
      .map((i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} x${i.quantity}`)
      .join(', ') || '(no items)';

  const parts = [`Your order ${latest.orderNumber} is ${label} — ${itemsSummary}.`];

  if (['pending', 'confirmed', 'preparing'].includes(latest.status)) {
    parts.push(getPreparationTimeMessage(vendorConfig?.orderPreparationConfig as OrderPreparationConfig | null));
  }

  return parts.join(' ');
}
