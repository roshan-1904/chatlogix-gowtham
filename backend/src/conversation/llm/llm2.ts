import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { logger } from '../../logger.js';
import type { CartOp, CartSnapshot, CompactCatalogEntry } from '../types.js';
import type { ApplyOpsResult } from '../cart/engine.js';

// Module-level singleton, same pattern as llm1.ts / every other OpenAI call
// site in the codebase.
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

const DEFAULT_VERIFY_THRESHOLD = Number(env.VERIFY_THRESHOLD || '0.75');

const MUTATING_OP_TYPES = new Set<CartOp['type']>(['add', 'set_qty', 'remove', 'set_field', 'confirm', 'cancel']);

/**
 * Run LLM-2 iff a cart-mutating op was applied, LLM-1 flagged needsVerify,
 * or confidence fell below threshold (spec §17, Q3). Skipping greetings,
 * thanks, and high-confidence noop is what lets p90 hit 5s (§8) — LLM-2
 * costs up to ~1.2s when it runs.
 */
export function shouldRunLlm2(ops: CartOp[], needsVerify: boolean, confidence: number, threshold: number = DEFAULT_VERIFY_THRESHOLD): boolean {
  const hasMutatingOp = ops.some((op) => MUTATING_OP_TYPES.has(op.type));
  return hasMutatingOp || needsVerify || confidence < threshold;
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
 * Deterministic fallback reply, built purely from the snapshot — never from
 * any LLM's prose. This is the "engine renderer" spec §17 requires when a
 * verifier's copy can't be trusted.
 */
export function renderSnapshotReply(snapshot: CartSnapshot): string {
  if (snapshot.items.length === 0) {
    return 'Your cart is currently empty. What would you like to order?';
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

/**
 * Deterministic reply for a turn where CartEngine rejected part (or all) of
 * what was asked (spec §17's correctness backstop, extended): LLM-1's/LLM-2's
 * prose is never trusted here, because neither is grounded in whether the op
 * actually applied — copyMatchesSnapshot only checks that the reply doesn't
 * *omit* a snapshot line, which is vacuously true against an empty snapshot,
 * so a hallucinated "I've added X" can slip through untouched otherwise.
 * Always paired with the true resulting cart state so anything that DID
 * succeed in the same turn still shows up correctly.
 */
export function renderRejectedOpsReply(rejectedOps: ApplyOpsResult['rejectedOps'], snapshot: CartSnapshot): string {
  const uniqueReasons = [...new Set(rejectedOps.map((r) => rejectionReasonText(r.reason)))];
  const explanation = uniqueReasons.length === 1
    ? `I'm sorry, ${uniqueReasons[0]}.`
    : `I'm sorry, I couldn't complete part of your request — ${uniqueReasons.join('; ')}.`;
  return `${explanation}\n\n${renderSnapshotReply(snapshot)}`;
}

/**
 * Cheap, deliberately narrow check: does the copy at least mention every
 * item's name? This directly targets spec §17's stated failure mode ("the
 * verifier's copy disagrees with snapshot lines") and the exact scenario
 * §26 test 9 describes (a list that omits a line). Price-string matching is
 * NOT attempted here — LLM phrasing of totals varies too much (currency
 * symbols, rounding, "Rs." vs "₹" vs "rupees") for a naive string match to
 * avoid false rejections; that's a deliberate v1 scope limit, not an
 * oversight, and can be tightened later from real Gate A transcripts.
 */
export function copyMatchesSnapshot(text: string, snapshot: CartSnapshot): boolean {
  const lower = text.toLowerCase();
  return snapshot.items.every((item) => lower.includes(item.name.toLowerCase()));
}

const MUTATING_INTENTS = new Set(['add', 'remove', 'set_qty']);

/**
 * Last-resort, non-LLM safety net for exactly the case shouldRunLlm2
 * legitimately skips (empty ops, needsVerify false, high confidence) but
 * draftReply still names a catalog item that never made it into the cart --
 * i.e. LLM-1 classified the turn as a cart change, said it happened, but
 * emitted no op for it (the "phantom mutation" bug: LLM-1 confirms an add
 * in prose while ops stays empty). Deliberately conservative: gated on
 * `intent` being one of the mutating types first, so it never fires on a
 * "query"-classified reply that simply mentions a product informationally
 * (e.g. answering "what brownies do you have?"). A false positive here only
 * costs a blander (but still correct) reply via renderPossibleMissedItemReply
 * -- it never lets a false confirmation through.
 */
export function possiblyOverclaimsAgainstCatalog(
  text: string,
  snapshot: CartSnapshot,
  compactCatalog: CompactCatalogEntry[]
): boolean {
  const lower = text.toLowerCase();
  const snapshotProductIds = new Set(snapshot.items.map((i) => i.productId));
  return compactCatalog.some((p) => {
    if (snapshotProductIds.has(p.id)) return false; // already genuinely in the cart
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
 * Deterministic reply for a suspected phantom mutation (draftReply claims a
 * change that isn't reflected anywhere in ops/snapshot) -- same reasoning as
 * renderRejectedOpsReply, just for a *missing* op instead of a *rejected*
 * one: never trust the free-text claim, always show the true cart, and ask
 * the customer to repeat the item so it can actually be added.
 */
export function renderPossibleMissedItemReply(snapshot: CartSnapshot): string {
  return `Sorry, I didn't quite catch that item — could you tell me the product name again?\n\n${renderSnapshotReply(snapshot)}`;
}

export interface RenderDecision {
  finalReply: string;
  usedEngineRenderer: boolean;
}

/**
 * Selects the text actually sent to the customer (spec §7 step 7, §17's
 * correctness backstop for I1): LLM-2's copy when it ran and matches the
 * snapshot; the draft reply as-is when LLM-2 was skipped (unless it looks
 * like a phantom mutation -- see isPhantomMutation); the deterministic
 * snapshot renderer when LLM-2 ran but its copy disagrees with the cart.
 */
export function selectFinalReply(input: {
  draftReply: string;
  llm2Result: Llm2Output;
  snapshot: CartSnapshot;
  traceId: string;
  intent: string;
  ops: CartOp[];
  compactCatalog: CompactCatalogEntry[];
}): RenderDecision {
  const { draftReply, llm2Result, snapshot, traceId, intent, ops, compactCatalog } = input;

  if (llm2Result.skipped) {
    if (isPhantomMutation(intent, ops, draftReply, snapshot, compactCatalog)) {
      logger.warn({ traceId, intent, draftReply }, 'Suspected phantom cart mutation (LLM-2 skipped) — falling back to engine renderer');
      return { finalReply: renderPossibleMissedItemReply(snapshot), usedEngineRenderer: true };
    }
    return { finalReply: draftReply, usedEngineRenderer: false };
  }

  if (!copyMatchesSnapshot(llm2Result.finalReply, snapshot)) {
    logger.warn({ traceId, llm2Reply: llm2Result.finalReply }, 'LLM-2 copy disagreed with cart snapshot — falling back to engine renderer');
    return { finalReply: renderSnapshotReply(snapshot), usedEngineRenderer: true };
  }

  return { finalReply: llm2Result.finalReply, usedEngineRenderer: false };
}
