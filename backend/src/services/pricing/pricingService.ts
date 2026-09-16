/**
 * The single place a vendor wallet is debited.
 *
 * Every billable action costs
 *
 *   chargeMilli = ceil((aiCostMilli + whatsappCostMilli + platformFeeMilli)
 *                      * (1 + markupPercent / 100))
 *
 * in millirupees, with exactly one rounding step, applied after markup. The
 * cost components stay fractional right up to that point so a turn made of
 * several sub-millirupee API calls (LLM-1, LLM-2, transcription) is not
 * rounded three times on the way in.
 *
 * The WhatsApp per-message slot is scaffolded but always zero until the Meta
 * rate card lands (P2h).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../logger.js';
import { ceilMilli, paiseToMilli, usdToMilliFloat } from '../../utils/money.js';
import { calculateAudioCost, calculateCost } from '../../utils/costCalculator.js';
import type { MessageKind } from '../billingService.js';
import { ensurePlatformSettings, getPlatformSettings } from '../platformSettingsService.js';

/** Mirrors `Vendor.markupPercent`'s schema default. */
export const DEFAULT_MARKUP_PERCENT = 50;

/** Thrown by pre-flight wallet gates; routes map it to a 402. */
export class InsufficientBalanceError extends Error {
  readonly code = 'INSUFFICIENT_BALANCE';
  constructor() {
    super('insufficient_balance');
    this.name = 'InsufficientBalanceError';
  }
}

/** Matches the admin-editable range validated in Phase E. */
const MAX_MARKUP_PERCENT = 500;

/**
 * Written to `WalletTransaction.metadata.source` and read back by
 * billingService's trial-wallet breakdown and the catalog daily-cap readers —
 * these strings are a persisted contract, not just logging.
 */
export type ChargeSource =
  | 'conversation_turn'
  | 'legacy_conversation_turn'
  | 'outbound_media'
  | 'catalog_import'
  | 'catalog_enhance'
  | 'catalog_enhance_transcribe'
  | 'sandbox_chat'
  | 'sandbox_transcribe';

/** Pre-markup cost components, all in unrounded millirupees. */
export interface ChargeCostInput {
  /** OpenAI spend for this action. */
  aiCostMilli?: number;
  /** Meta per-message conversation cost. Zero until P2h. */
  whatsappCostMilli?: number;
  /** Flat ChatLogix fee, from PlatformSettings (converted paise → milli). */
  platformFeeMilli?: number;
}

export interface ChargeBreakdown extends Required<ChargeCostInput> {
  /** Sum of the three components, before markup. */
  baseMilli: number;
  markupMilli: number;
  markupPercent: number;
  /** The only integer in here — what the wallet is actually debited. */
  chargeMilli: number;
}

export interface ChargeVendorInput {
  vendorId: string;
  source: ChargeSource;
  cost: ChargeCostInput;
  /**
   * Skips the vendor markup lookup. Only for callers that already resolved it
   * in the same request (and for tests) — normal callers should omit it.
   */
  markupPercent?: number;
  /**
   * Written to `CreditUsage.externalId`, whose unique index is what makes a
   * double charge a no-op. Works for every source: `CreditUsage.conversationId`
   * is nullable, so non-conversation charges (catalog import/enhance, sandbox)
   * get a row — and therefore the same dedup guarantee — as well.
   */
  idempotencyKey?: string;
  conversationId?: string;
  conversationType?: MessageKind;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  /** Trial/sandbox wallets must never go negative; live ones may. */
  floorAtZero?: boolean;
}

export interface ChargeVendorResult {
  outcome: 'charged' | 'already_charged' | 'skipped';
  breakdown: ChargeBreakdown;
  /** Differs from `breakdown.chargeMilli` only when `floorAtZero` clamped it. */
  deductedMilli: number;
  balanceAfterMilli: number | null;
}

function nonNegative(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 0;
}

export function normalizeMarkupPercent(value: number | null | undefined): number {
  if (!Number.isFinite(value as number)) return DEFAULT_MARKUP_PERCENT;
  return Math.min(Math.max(value as number, 0), MAX_MARKUP_PERCENT);
}

export function computeChargeMilli(
  input: ChargeCostInput & { markupPercent: number }
): ChargeBreakdown {
  const aiCostMilli = nonNegative(input.aiCostMilli);
  const whatsappCostMilli = nonNegative(input.whatsappCostMilli);
  const platformFeeMilli = nonNegative(input.platformFeeMilli);
  const markupPercent = normalizeMarkupPercent(input.markupPercent);

  const baseMilli = aiCostMilli + whatsappCostMilli + platformFeeMilli;
  const markupMilli = baseMilli * (markupPercent / 100);

  return {
    aiCostMilli,
    whatsappCostMilli,
    platformFeeMilli,
    baseMilli,
    markupMilli,
    markupPercent,
    chargeMilli: ceilMilli(baseMilli + markupMilli)
  };
}

export async function getVendorMarkupPercent(vendorId: string): Promise<number> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { markupPercent: true }
  });
  return normalizeMarkupPercent(vendor?.markupPercent);
}

// -- cost helpers ---------------------------------------------------------

/** Pass-through OpenAI USD spend as unrounded millirupees. */
export function aiCostMilliFromUsd(costUsd: number): number {
  return usdToMilliFloat(costUsd);
}

export function aiCostMilliForTokens(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  return usdToMilliFloat(calculateCost(model, promptTokens, completionTokens).costUsd);
}

/** Speech-to-text, priced per second of audio rather than per token. */
export function aiCostMilliForAudio(model: string, durationSec: number): number {
  return usdToMilliFloat(calculateAudioCost(model, durationSec).costUsd);
}

// -- pre-flight estimate --------------------------------------------------

/**
 * Worst-case token budget for one assistant turn. The completion numbers are
 * the hard `max_completion_tokens` caps in llm1.ts (400) and llm2.ts (300);
 * the prompt numbers are generous hot-set/snapshot sizes. Over-estimating is
 * the safe direction: this only gates *entry* to a turn, and a vendor whose
 * balance clears the estimate can always finish the turn.
 */
const ESTIMATE_LLM1_PROMPT_TOKENS = 4000;
const ESTIMATE_LLM1_COMPLETION_TOKENS = 400;
const ESTIMATE_LLM2_PROMPT_TOKENS = 1500;
const ESTIMATE_LLM2_COMPLETION_TOKENS = 300;

/** PM6 worst case for one turn: 1 assistant text plus 3 images (or 1 video). */
const WORST_CASE_MEDIA_ATTACHMENTS = 3;

export interface TurnEstimateOptions {
  aiModel?: string | null;
  /** Reserve the outbound product-media fee too (conversation pipeline only). */
  includeWorstCaseMedia?: boolean;
}

/** Pre-markup components of the worst-case turn. */
export function turnEstimateCost(options: TurnEstimateOptions = {}): ChargeCostInput {
  const model = options.aiModel || 'gpt-4.1-mini';
  const aiCostMilli =
    aiCostMilliForTokens(model, ESTIMATE_LLM1_PROMPT_TOKENS, ESTIMATE_LLM1_COMPLETION_TOKENS) +
    aiCostMilliForTokens(model, ESTIMATE_LLM2_PROMPT_TOKENS, ESTIMATE_LLM2_COMPLETION_TOKENS);

  const settings = getPlatformSettings();
  const platformFeeMilli =
    paiseToMilli(settings.platformFeePerTurnPaise) +
    (options.includeWorstCaseMedia
      ? WORST_CASE_MEDIA_ATTACHMENTS * paiseToMilli(settings.platformFeeOutboundMediaPaise)
      : 0);

  return { aiCostMilli, platformFeeMilli };
}

/**
 * Pure form of the gate, for callers that already loaded the vendor row
 * (billingService.canProcessMessage) and don't want a second query.
 */
export function computeTurnEstimate(
  input: TurnEstimateOptions & { markupPercent: number }
): ChargeBreakdown {
  return computeChargeMilli({ ...turnEstimateCost(input), markupPercent: input.markupPercent });
}

/** Minimum balance a vendor needs before a turn is allowed to start. */
export async function estimateTurnChargeMilli(
  vendorId: string,
  options: TurnEstimateOptions = {}
): Promise<number> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { markupPercent: true, aiModel: true }
  });
  return computeTurnEstimate({
    markupPercent: normalizeMarkupPercent(vendor?.markupPercent),
    aiModel: options.aiModel ?? vendor?.aiModel,
    includeWorstCaseMedia: options.includeWorstCaseMedia
  }).chargeMilli;
}

// -- the debit ------------------------------------------------------------

/** Keeps float noise (0.30000000000000004) out of the persisted JSON. */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function buildMetadata(
  input: ChargeVendorInput,
  breakdown: ChargeBreakdown,
  deductedMilli: number
): Prisma.InputJsonValue {
  return {
    source: input.source,
    markupPercent: breakdown.markupPercent,
    aiCostMilli: round4(breakdown.aiCostMilli),
    whatsappCostMilli: round4(breakdown.whatsappCostMilli),
    platformFeeMilli: round4(breakdown.platformFeeMilli),
    baseMilli: round4(breakdown.baseMilli),
    markupMilli: round4(breakdown.markupMilli),
    chargeMilli: breakdown.chargeMilli,
    ...(deductedMilli !== breakdown.chargeMilli ? { clampedToBalance: true } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.entityType ? { entityType: input.entityType } : {}),
    ...(input.entityId ? { entityId: input.entityId } : {}),
    ...(input.idempotencyKey ? { externalId: input.idempotencyKey } : {}),
    ...(input.metadata ?? {})
  } as Prisma.InputJsonValue;
}

function emptyBreakdown(markupPercent: number): ChargeBreakdown {
  return computeChargeMilli({ markupPercent });
}

/**
 * Debit a vendor wallet in one transaction: decrement the balance, write the
 * `WalletTransaction` ledger row with the full breakdown, and the `CreditUsage`
 * row whose unique `externalId` makes the whole thing idempotent.
 *
 * The CreditUsage row is written for every source, not just conversations —
 * it is what every vendor-facing spend number is derived from, so skipping it
 * would show the vendor a balance drop with no matching spend.
 */
export async function chargeVendor(input: ChargeVendorInput): Promise<ChargeVendorResult> {
  const rawTotal =
    nonNegative(input.cost.aiCostMilli) +
    nonNegative(input.cost.whatsappCostMilli) +
    nonNegative(input.cost.platformFeeMilli);

  await ensurePlatformSettings();

  // Nothing billable — skip before touching the database at all. This is the
  // normal path for outbound media while the platform outbound-media fee is 0.
  if (rawTotal <= 0) {
    return {
      outcome: 'skipped',
      breakdown: emptyBreakdown(input.markupPercent ?? DEFAULT_MARKUP_PERCENT),
      deductedMilli: 0,
      balanceAfterMilli: null
    };
  }

  let breakdown = emptyBreakdown(input.markupPercent ?? DEFAULT_MARKUP_PERCENT);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({
        where: { id: input.vendorId },
        select: { walletBalanceMilli: true, markupPercent: true }
      });
      if (!vendor) throw new Error(`Vendor not found: ${input.vendorId}`);

      // Resolved inside the transaction so the markup snapshot written to
      // metadata is the one the charge was actually computed with.
      breakdown = computeChargeMilli({
        ...input.cost,
        markupPercent: input.markupPercent ?? normalizeMarkupPercent(vendor.markupPercent)
      });

      const before = vendor.walletBalanceMilli;
      const after = input.floorAtZero
        ? Math.max(0, before - breakdown.chargeMilli)
        : before - breakdown.chargeMilli;
      const deductedMilli = before - after;

      await tx.vendor.update({
        where: { id: input.vendorId },
        data: { walletBalanceMilli: after }
      });

      await tx.walletTransaction.create({
        data: {
          vendorId: input.vendorId,
          transactionType: 'deduction',
          amountMilli: deductedMilli,
          balanceBeforeMilli: before,
          balanceAfterMilli: after,
          metadata: buildMetadata(input, breakdown, deductedMilli)
        }
      });

      // Conversation charges keep defaulting to 'text' for drill-down; sources
      // with no conversation leave both conversation columns null.
      const conversationType = input.conversationId
        ? input.conversationType ?? 'text'
        : input.conversationType;

      await tx.creditUsage.create({
        data: {
          vendorId: input.vendorId,
          source: input.source,
          chargedMilli: deductedMilli,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(conversationType ? { conversationType: conversationType as never } : {}),
          ...(input.idempotencyKey ? { externalId: input.idempotencyKey } : {})
        }
      });

      return { deductedMilli, balanceAfterMilli: after };
    });

    logger.info(
      {
        vendorId: input.vendorId,
        source: input.source,
        chargeMilli: breakdown.chargeMilli,
        deductedMilli: result.deductedMilli,
        markupPercent: breakdown.markupPercent
      },
      'wallet_charged'
    );

    return { outcome: 'charged', breakdown, ...result };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.info(
        { vendorId: input.vendorId, source: input.source, externalId: input.idempotencyKey },
        'wallet_charge_already_applied'
      );
      return { outcome: 'already_charged', breakdown, deductedMilli: 0, balanceAfterMilli: null };
    }
    throw error;
  }
}
