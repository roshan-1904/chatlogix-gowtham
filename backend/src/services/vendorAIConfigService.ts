import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

/**
 * Single allow-list + mapper for vendor AI-prompt fields. Used by both the
 * PUT /api/vendors/:id/ai-prompts route and the catalog-import commit flow so
 * there's no chance of the two drifting.
 */
export interface AIPromptsInput {
  botName?: string;
  personality?: string;
  systemPrompt?: string;
  greeting?: string;
  closing?: string;
  preparationTimeMinutes?: number | string;
  deliveryInstructions?: string;
  pickupDeliveryAddress?: string;
  toneExample?: string;
  products?: string;
  contentResponsibilities?: string;
  contentConversationRules?: string;
  contentImportantInstructions?: string;
}

export function buildAIPromptsUpdate(input: AIPromptsInput): Prisma.VendorUpdateInput {
  const update: Prisma.VendorUpdateInput = {};
  if (typeof input.botName !== 'undefined') update.aiBotName = input.botName;
  if (typeof input.personality !== 'undefined') update.aiPersonality = input.personality;
  if (typeof input.systemPrompt !== 'undefined') update.aiSystemPrompt = input.systemPrompt;
  if (typeof input.greeting !== 'undefined') update.aiGreeting = input.greeting;
  if (typeof input.closing !== 'undefined') update.aiClosing = input.closing;
  if (typeof input.preparationTimeMinutes !== 'undefined') {
    update.aiPreparationTimeMinutes = Number(input.preparationTimeMinutes);
  }
  if (typeof input.deliveryInstructions !== 'undefined') update.aiDeliveryInstructions = input.deliveryInstructions;
  if (typeof input.pickupDeliveryAddress !== 'undefined') update.aiPickupDeliveryAddress = input.pickupDeliveryAddress;
  if (typeof input.toneExample !== 'undefined') update.aiToneExample = input.toneExample;
  if (typeof input.products !== 'undefined') update.aiProducts = input.products;
  if (typeof input.contentResponsibilities !== 'undefined') update.aiContentResponsibilities = input.contentResponsibilities;
  if (typeof input.contentConversationRules !== 'undefined') update.aiContentConversationRules = input.contentConversationRules;
  if (typeof input.contentImportantInstructions !== 'undefined') update.aiContentImportantInstructions = input.contentImportantInstructions;
  return update;
}

export async function applyAIPrompts(
  vendorId: string,
  input: AIPromptsInput,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const data = buildAIPromptsUpdate(input);
  if (Object.keys(data).length === 0) return;
  const client = tx ?? prisma;
  await client.vendor.update({ where: { id: vendorId }, data });
}
