import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { logger } from '../../logger.js';
import { isEnglishLanguage, type CustomerLanguage } from '../language.js';
import type { CartOp, CartSnapshot, CompactCatalogEntry } from '../types.js';
import type { ApplyOpsResult } from '../cart/engine.js';

// Module-level singleton, same pattern as llm1.ts / every other OpenAI call
// site in the codebase.
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

const DEFAULT_VERIFY_THRESHOLD = Number(env.VERIFY_THRESHOLD || '0.75');

const MUTATING_OP_TYPES = new Set<CartOp['type']>(['add', 'set_qty', 'remove', 'set_field', 'confirm', 'cancel']);

/** English-only deterministic strings — non-English prose comes from LLM draftReply. */
const EMPTY_CART_EN = 'Your cart is currently empty. What would you like to order?';
const MISSED_ITEM_PROMPT_EN = "Sorry, I didn't quite catch that item — could you tell me the product name again?";
const UPDATED_ORDER_HEADER_EN = "Here's your updated order:";

/**
 * Run LLM-2 iff a cart-mutating op was applied, LLM-1 flagged needsVerify,
 * or confidence fell below threshold (spec §17, Q3). Skipping greetings,
 * thanks, high-confidence noop, and set_field-only turns is what lets p90
 * hit 5s (§8) — LLM-2 costs up to ~1.2s when it runs.
 */
export function shouldRunLlm2(ops: CartOp[], needsVerify: boolean, confidence: number, threshold: number = DEFAULT_VERIFY_THRESHOLD): boolean {
  const mutatingOps = ops.filter((op) => MUTATING_OP_TYPES.has(op.type));
  if (mutatingOps.length > 0 && mutatingOps.every((op) => op.type === 'set_field')) {
    return false;
  }
  return mutatingOps.length > 0 || needsVerify || confidence < threshold;
}

export interface Llm2Input {
  draftReply: string;
  snapshot: CartSnapshot;
  vendorId: string;
  language: string;
  model: string;
  ops: CartOp[];
  needsVerify: boolean;
  confidence: number;
}

export type Llm2Output =
  | { skipped: false; finalReply: string; promptTokens: number; completionTokens: number }
  | { skipped: true };

const llm2JsonSchema: Record<string, unknown> = {
  type: 'object',
  properties: { finalReply: { type: 'string' } },
  required: ['finalReply'],
  additionalProperties: false
};

function buildLlm2Prompt(input: Llm2Input): string {
  const { snapshot, language } = input;
  const parts: string[] = [];

  parts.push('You are copy-editing a WhatsApp reply for a customer order. You may ONLY rewrite wording — never change what is being ordered.');
  parts.push('Rules:');
  parts.push('- Keep every product name, quantity, unit, and price exactly as given in CART SNAPSHOT below. Do not add or drop any line.');
  parts.push('- If the draft reply claims an item was added, updated, removed, or confirmed and that item is NOT listed in CART SNAPSHOT, remove that claim entirely — never tell the customer an item was added/changed when it is not actually in the snapshot.');
  parts.push('- Do not invent a delivery date, ETA, or "arrives on X".');
  parts.push(`- Reply in this language/script: ${language}.`);
  parts.push('- Answer the customer\'s actual question first. Only include the full cart line list when they asked to review the order or you changed items this turn.');
  parts.push('- No more than about 120 words.');
  parts.push('- Output only the polished reply text — you are not proposing cart changes.');

  parts.push('');
  parts.push('CART SNAPSHOT:');
  if (snapshot.items.length > 0) {
    parts.push(snapshot.items.map((i) => `- ${i.name} x${i.quantity} ${i.unit} = Rs${(i.lineTotalPaise / 100).toFixed(2)}`).join('\n'));
    parts.push(`Total: Rs${(snapshot.totalPaise / 100).toFixed(2)}`);
  } else {
    parts.push('(empty)');
  }

  parts.push('');
  parts.push('DRAFT REPLY TO POLISH:');
  parts.push(input.draftReply);

  return parts.join('\n');
}

/**
 * Copy-only verifier (spec §17, Q4). Takes the draft reply + cart snapshot,
 * returns polished copy only — never ops, never parsed for cart fields.
 * Internally checks shouldRunLlm2 first and short-circuits to `{skipped:
 * true}` so callers don't have to duplicate the skip decision.
 */
export async function runLlm2(input: Llm2Input): Promise<Llm2Output> {
  if (!shouldRunLlm2(input.ops, input.needsVerify, input.confidence)) {
    return { skipped: true };
  }

  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }

  const completion = await openai.chat.completions.create({
    model: input.model,
    messages: [{ role: 'system', content: buildLlm2Prompt(input) }],
    temperature: 0.2,
    max_completion_tokens: 300, // §8: LLM-2 budget is <=1.2s; keep the completion small
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'llm2_result', schema: llm2JsonSchema, strict: true }
    }
  });

  const choice = completion.choices[0];
  if (choice?.message?.refusal) {
    throw new Error(`LLM-2 refused: ${choice.message.refusal}`);
  }
  const content = choice?.message?.content;
  if (!content) {
    throw new Error('LLM-2 returned no content');
  }

  const parsed = JSON.parse(content) as { finalReply: string };

  return {
    skipped: false,
    finalReply: parsed.finalReply,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0
  };
}

/**
 * Structural cart block: catalog English product names + Rs amounts.
 * Conversational wrapper comes from LLM draftReply for non-English customers.
 */
export function renderSnapshotReply(snapshot: CartSnapshot, _language: CustomerLanguage = 'en'): string {
  if (snapshot.items.length === 0) {
    return EMPTY_CART_EN;
  }
  const lines = snapshot.items.map(
    (i) => `${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''} x${i.quantity} ${i.unit} - Rs${(i.lineTotalPaise / 100).toFixed(2)}`
  );
  return [...lines, `Total: Rs${(snapshot.totalPaise / 100).toFixed(2)}`].join('\n');
}

const REJECTION_REASON_TEXT: Record<string, string> = {
  product_not_found: "that item isn't available in our catalog",
  variant_not_found: "that exact option isn't available — only the listed sizes/variants are",
  line_not_found: "I couldn't find that item in your current order to change",
  no_order_to_cancel: "there's no active order to cancel",
  no_order_to_refund: "there's no matching order to refund",
  not_cancellable_at_this_stage: "that order can't be changed at this stage — I've flagged this for the team"
};

function rejectionReasonText(reason: string): string {
  if (REJECTION_REASON_TEXT[reason]) return REJECTION_REASON_TEXT[reason];
  if (reason.startsWith('missing_')) return "I still need a few details before I can confirm that";
  return "I wasn't able to do that";
}

function englishRejectionOpener(uniqueReasons: string[]): string {
  return uniqueReasons.length === 1
    ? `I'm sorry, ${uniqueReasons[0]}.`
    : `I'm sorry, I couldn't complete part of your request — ${uniqueReasons.join('; ')}.`;
}

/**
 * Deterministic reply for a turn where CartEngine rejected part (or all) of
 * what was asked (spec §17's correctness backstop, extended).
 */
export function renderRejectedOpsReply(
  rejectedOps: ApplyOpsResult['rejectedOps'],
  snapshot: CartSnapshot,
  language: CustomerLanguage = 'en',
  draftReply?: string
): string {
  const uniqueReasons = [...new Set(rejectedOps.map((r) => rejectionReasonText(r.reason)))];

  if (!isEnglishLanguage(language) && draftReply?.trim() && !looksLikeBareCartList(draftReply, snapshot)) {
    if (snapshot.items.length === 0) return draftReply.trim();
    return `${draftReply.trim()}\n\n${renderSnapshotReply(snapshot, language)}`;
  }

  const explanation = englishRejectionOpener(uniqueReasons);
  if (snapshot.items.length === 0) {
    return `${explanation}\n\n${renderSnapshotReply(snapshot, language)}`;
  }
  return `${explanation}\n\n${UPDATED_ORDER_HEADER_EN}\n${renderSnapshotReply(snapshot, language)}`;
}

function snapshotTotalAppearsInText(text: string, snapshot: CartSnapshot): boolean {
  const totalFormatted = (snapshot.totalPaise / 100).toFixed(2);
  const totalWhole = String(Math.round(snapshot.totalPaise / 100));
  return (
    text.includes(totalFormatted) ||
    text.includes(totalWhole) ||
    text.includes(totalFormatted.replace('.00', ''))
  );
}

/**
 * English: every catalog product name must appear in the reply.
 * Non-English: relaxed — total amount + line quantities (names stay English in catalog).
 */
export function copyMatchesSnapshot(text: string, snapshot: CartSnapshot, language: CustomerLanguage = 'en'): boolean {
  if (snapshot.items.length === 0) {
    return true;
  }
  const lower = text.toLowerCase();
  const allNames = snapshot.items.every((item) => lower.includes(item.name.toLowerCase()));
  if (allNames) return true;

  if (isEnglishLanguage(language)) {
    return false;
  }

  if (!snapshotTotalAppearsInText(text, snapshot)) {
    return false;
  }

  const allQtys = snapshot.items.every((item) => new RegExp(`(?:x|\\s|^)${item.quantity}(?:\\s|$|\\.|-)`).test(text));
  return allQtys;
}

const MUTATING_INTENTS = new Set(['add', 'remove', 'set_qty']);

export function isSetFieldOnlyOps(ops: CartOp[]): boolean {
  const mutating = ops.filter((op) => MUTATING_OP_TYPES.has(op.type));
  return mutating.length > 0 && mutating.every((op) => op.type === 'set_field');
}

export function isQueryWithoutMutation(intent: string, ops: CartOp[]): boolean {
  if (intent !== 'query') return false;
  return !ops.some((op) => MUTATING_OP_TYPES.has(op.type));
}

export function isCartItemMutation(ops: CartOp[]): boolean {
  return ops.some((op) => op.type === 'add' || op.type === 'set_qty' || op.type === 'remove');
}

function englishNameSaved(value: string): string {
  return `Thanks! I've saved your name as ${value}.`;
}

function englishAddressSaved(value: string): string {
  return `Thanks! I've saved your delivery address:\n${value}`;
}

function englishMissingFieldsPrompt(missing: CartSnapshot['missing']): string | null {
  if (missing.length === 0) return null;
  const needName = missing.includes('name');
  const needAddress = missing.includes('address');
  const needItems = missing.includes('items');
  if (needAddress && !needName && !needItems) return 'Please share your full delivery address so we can ship your order.';
  if (needName && needAddress) return 'To proceed, please share your name and delivery address.';
  if (needName) return 'To proceed, please share your name.';
  if (needItems) return 'To proceed, please tell me what you would like to order.';
  return null;
}

/**
 * Short confirmation when only name/address/notes/delivery_date changed.
 * Non-English: uses LLM-1 draftReply (already in the customer's language).
 */
export function renderSetFieldConfirmation(
  ops: CartOp[],
  snapshot: CartSnapshot,
  language: CustomerLanguage,
  draftReply?: string
): string {
  if (!isEnglishLanguage(language) && draftReply?.trim() && !looksLikeBareCartList(draftReply, snapshot)) {
    return draftReply.trim();
  }

  const fields = ops.filter((op): op is Extract<CartOp, { type: 'set_field' }> => op.type === 'set_field');
  const parts: string[] = [];
  for (const op of fields) {
    switch (op.field) {
      case 'name':
        parts.push(englishNameSaved(op.value));
        break;
      case 'address':
        parts.push(englishAddressSaved(op.value));
        break;
      case 'notes':
        parts.push("Got it, I've noted that.");
        break;
      case 'delivery_date':
        parts.push(`Thanks! Preferred delivery date saved: ${op.value}.`);
        break;
    }
  }
  const missingPrompt = englishMissingFieldsPrompt(snapshot.missing);
  if (missingPrompt) parts.push(missingPrompt);
  return parts.join('\n\n');
}

function looksLikeBareCartList(text: string, snapshot: CartSnapshot): boolean {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return false;
  const cartLinePattern = /x\d+(?:\.\d+)?\s+\S+\s*-\s*Rs/i;
  const cartLines = lines.filter((l) => cartLinePattern.test(l) || /^Total:/i.test(l.trim()));
  return snapshot.items.length > 0 && cartLines.length >= snapshot.items.length && cartLines.length / lines.length >= 0.6;
}

function pickConversationalLead(llm2Reply: string, draftReply: string, snapshot: CartSnapshot): string {
  const draft = draftReply.trim();
  const polished = llm2Reply.trim();
  if (draft && !looksLikeBareCartList(draft, snapshot)) return draft;
  if (polished && !looksLikeBareCartList(polished, snapshot)) return polished;
  return draft || polished;
}

function mergeLeadWithSnapshot(lead: string, snapshot: CartSnapshot, language: CustomerLanguage, appendCart: boolean): string {
  if (!appendCart || snapshot.items.length === 0) {
    return lead.trim();
  }
  const cartBlock = renderSnapshotReply(snapshot, language);
  if (!lead.trim()) return cartBlock;
  if (looksLikeBareCartList(lead, snapshot)) return cartBlock;
  if (isEnglishLanguage(language)) {
    return `${lead.trim()}\n\n${UPDATED_ORDER_HEADER_EN}\n${cartBlock}`;
  }
  return `${lead.trim()}\n\n${cartBlock}`;
}

export function possiblyOverclaimsAgainstCatalog(
  text: string,
  snapshot: CartSnapshot,
  compactCatalog: CompactCatalogEntry[]
): boolean {
  const lower = text.toLowerCase();
  const snapshotProductIds = new Set(snapshot.items.map((i) => i.productId));
  return compactCatalog.some((p) => {
    if (snapshotProductIds.has(p.id)) return false;
    const name = p.name.toLowerCase();
    return name.length > 0 && lower.includes(name);
  });
}

export function isPhantomMutation(
  intent: string,
  ops: CartOp[],
  draftReply: string,
  snapshot: CartSnapshot,
  compactCatalog: CompactCatalogEntry[]
): boolean {
  if (ops.length > 0) return false;
  if (!MUTATING_INTENTS.has(intent.toLowerCase())) return false;
  return possiblyOverclaimsAgainstCatalog(draftReply, snapshot, compactCatalog);
}

/**
 * Phantom-mutation backstop — never trust draftReply's false add claim;
 * English prompt + grounded cart (non-English customers still see English
 * here because the draft cannot be trusted on this path).
 */
export function renderPossibleMissedItemReply(snapshot: CartSnapshot, _language: CustomerLanguage = 'en'): string {
  if (snapshot.items.length === 0) return MISSED_ITEM_PROMPT_EN;
  return `${MISSED_ITEM_PROMPT_EN}\n\n${renderSnapshotReply(snapshot)}`;
}

export interface RenderDecision {
  finalReply: string;
  usedEngineRenderer: boolean;
}

export function selectFinalReply(input: {
  draftReply: string;
  llm2Result: Llm2Output;
  snapshot: CartSnapshot;
  traceId: string;
  intent: string;
  ops: CartOp[];
  compactCatalog: CompactCatalogEntry[];
  language: CustomerLanguage;
  cartMutated?: boolean;
}): RenderDecision {
  const {
    draftReply,
    llm2Result,
    snapshot,
    traceId,
    intent,
    ops,
    compactCatalog,
    language,
    cartMutated = false
  } = input;

  if (llm2Result.skipped) {
    if (isSetFieldOnlyOps(ops)) {
      return {
        finalReply: renderSetFieldConfirmation(ops, snapshot, language, draftReply),
        usedEngineRenderer: true
      };
    }
    if (isPhantomMutation(intent, ops, draftReply, snapshot, compactCatalog)) {
      logger.warn({ traceId, intent, draftReply }, 'Suspected phantom cart mutation (LLM-2 skipped) — falling back to engine renderer');
      return { finalReply: renderPossibleMissedItemReply(snapshot, language), usedEngineRenderer: true };
    }
    return { finalReply: draftReply, usedEngineRenderer: false };
  }

  if (copyMatchesSnapshot(llm2Result.finalReply, snapshot, language)) {
    return { finalReply: llm2Result.finalReply, usedEngineRenderer: false };
  }

  logger.warn({ traceId, llm2Reply: llm2Result.finalReply }, 'LLM-2 copy disagreed with cart snapshot — merging conversational lead with grounded cart');

  if (isQueryWithoutMutation(intent, ops)) {
    const conversational = llm2Result.finalReply.trim() || draftReply;
    return { finalReply: conversational, usedEngineRenderer: false };
  }

  if (isSetFieldOnlyOps(ops)) {
    return {
      finalReply: renderSetFieldConfirmation(ops, snapshot, language, draftReply),
      usedEngineRenderer: true
    };
  }

  const appendCart = isCartItemMutation(ops) || cartMutated;
  const lead = pickConversationalLead(llm2Result.finalReply, draftReply, snapshot);
  return {
    finalReply: mergeLeadWithSnapshot(lead, snapshot, language, appendCart),
    usedEngineRenderer: true
  };
}
