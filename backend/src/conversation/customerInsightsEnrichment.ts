import { logger } from '../logger.js';
import { extractKeyFacts } from '../services/conversationMemoryService.js';
import { CustomerInsightsService } from '../services/customerInsightsService.js';
import type { CustomerInsightsContext } from '../types/aiResponse.js';
import { getCached, setCached } from '../utils/redis.js';
import { invalidateCustomerContext } from './prefetch.js';

const insightsService = new CustomerInsightsService();

/** Idempotency marker TTL — long enough to cover SQS redrives. */
const ENRICHMENT_IDEMPOTENCY_TTL_SEC = 7 * 24 * 60 * 60;

function enrichmentIdempotencyKey(whatsappMessageId: string): string {
  return `insights:enriched:${whatsappMessageId}`;
}

function mergeTextField(existing: string | undefined, incoming: string | string[] | null | undefined): string | undefined {
  if (!incoming) return existing?.trim() || undefined;
  const newParts = (Array.isArray(incoming) ? incoming : incoming.split(/[;,\n]/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (newParts.length === 0) return existing?.trim() || undefined;

  const combined = existing
    ? existing
        .split(/[;,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];
  for (const part of newParts) {
    const norm = part.toLowerCase();
    if (!combined.some((c) => c.toLowerCase() === norm)) combined.push(part);
  }
  return combined.join('; ');
}

function mapExtractionToUpdates(
  existing: CustomerInsightsContext,
  customerInformation?: Record<string, unknown>,
  customerPreferences?: Record<string, unknown>
): Partial<CustomerInsightsContext> {
  const updates: Partial<CustomerInsightsContext> = {};

  if (customerInformation) {
    if (typeof customerInformation.name === 'string' && customerInformation.name.trim()) {
      updates.customerName = customerInformation.name.trim();
    }
    if (typeof customerInformation.email === 'string' && customerInformation.email.trim()) {
      updates.email = customerInformation.email.trim();
    }
    if (typeof customerInformation.phoneNumber === 'string' && customerInformation.phoneNumber.trim()) {
      updates.alternativePhoneNumber = customerInformation.phoneNumber.trim();
    }
    if (Array.isArray(customerInformation.addresses) && customerInformation.addresses.length > 0) {
      const first = customerInformation.addresses.find((a) => typeof a === 'string' && a.trim());
      if (typeof first === 'string') {
        updates.primaryDeliveryAddress = first.trim();
        updates.deliveryAddress = first.trim();
      }
    }
    if (Array.isArray(customerInformation.specialOccasions) && customerInformation.specialOccasions.length > 0) {
      updates.specialOccasions = customerInformation.specialOccasions as CustomerInsightsContext['specialOccasions'];
    }
  }

  if (customerPreferences) {
    const special = mergeTextField(existing.specialRequests, customerPreferences.specialRequests as string | string[]);
    if (special) updates.specialRequests = special;

    const deliveryInstr = mergeTextField(
      existing.deliveryInstructions,
      customerPreferences.deliveryInstructions as string | string[]
    );
    if (deliveryInstr) updates.deliveryInstructions = deliveryInstr;

    if (typeof customerPreferences.communicationStyle === 'string' && customerPreferences.communicationStyle !== 'unclear') {
      updates.communicationStyle = customerPreferences.communicationStyle;
    }
    if (Array.isArray(customerPreferences.dietaryRestrictions) && customerPreferences.dietaryRestrictions.length > 0) {
      updates.dietaryRestrictions = customerPreferences.dietaryRestrictions.join('; ');
    } else if (typeof customerPreferences.dietaryRestrictions === 'string' && customerPreferences.dietaryRestrictions.trim()) {
      updates.dietaryRestrictions = customerPreferences.dietaryRestrictions.trim();
    }
    if (typeof customerPreferences.paymentMethod === 'string' && customerPreferences.paymentMethod !== 'unclear') {
      updates.paymentPreferences = customerPreferences.paymentMethod;
    }
    if (Array.isArray(customerPreferences.productPreferences) && customerPreferences.productPreferences.length > 0) {
      updates.preferences = mergeTextField(existing.preferences, customerPreferences.productPreferences) ?? existing.preferences;
    }
  }

  return updates;
}

export interface EnrichCustomerInsightsInput {
  vendorId: string;
  conversationId: string;
  customerId: string;
  whatsappMessageId: string;
  customerText: string;
  orderStatusTurn: boolean;
  hasHandoff: boolean;
  sandbox: boolean;
}

/**
 * Post-turn AI enrichment for CustomerInsights (after WhatsApp reply is queued).
 * Does not block the turn; enrichment cost is absorbed (not a separate wallet charge).
 */
export async function enrichCustomerInsightsIfNeeded(input: EnrichCustomerInsightsInput): Promise<void> {
  if (input.sandbox || input.hasHandoff || input.orderStatusTurn) return;

  const idempotencyKey = enrichmentIdempotencyKey(input.whatsappMessageId);
  if (await getCached<boolean>(idempotencyKey)) return;

  try {
    const extraction = await extractKeyFacts(input.conversationId, input.customerText);
    if (!extraction.customerInformation && !extraction.customerPreferences) {
      await setCached(idempotencyKey, true, ENRICHMENT_IDEMPOTENCY_TTL_SEC);
      return;
    }

    const existing = await insightsService.getOrCreateInsights(input.customerId, input.vendorId);
    const updates = mapExtractionToUpdates(
      existing,
      extraction.customerInformation as Record<string, unknown> | undefined,
      extraction.customerPreferences as Record<string, unknown> | undefined
    );

    if (Object.keys(updates).length === 0) {
      await setCached(idempotencyKey, true, ENRICHMENT_IDEMPOTENCY_TTL_SEC);
      return;
    }

    await insightsService.updateInsights(input.customerId, input.vendorId, updates);
    await invalidateCustomerContext(input.customerId, input.vendorId, input.conversationId);
    await setCached(idempotencyKey, true, ENRICHMENT_IDEMPOTENCY_TTL_SEC);

    logger.info(
      {
        vendorId: input.vendorId,
        conversationId: input.conversationId,
        whatsappMessageId: input.whatsappMessageId,
        fields: Object.keys(updates)
      },
      'Customer insights enriched from conversation'
    );
  } catch (error) {
    logger.error(
      { err: error, vendorId: input.vendorId, conversationId: input.conversationId, whatsappMessageId: input.whatsappMessageId },
      'Customer insights enrichment failed'
    );
  }
}
