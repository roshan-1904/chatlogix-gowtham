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

export interface OnboardingAiConfigInput {
  businessName?: string | null;
  category?: string | null;
  languageHint?: string | null;
  deliveryNotes?: string | null;
  address?: string | null;
  city?: string | null;
  hours?: string | null;
  deliveryInstructions?: string | null;
}

const CATEGORY_PERSONALITY: Record<string, string> = {
  Food: "Warm and helpful — share what's fresh, portion sizes, and how to order.",
  Retail: 'Friendly and clear — help customers find the right item and check availability.',
  Services: 'Professional and reassuring — explain what you offer and how booking works.',
  Healthcare: 'Calm and precise — share only factual product details, no medical claims.',
  Education: 'Encouraging and clear — explain offerings and next steps simply.',
  Other: 'Friendly shop assistant — answer questions clearly and help customers order.'
};

export function buildOnboardingShopBrief(input: OnboardingAiConfigInput): string {
  const lines: string[] = [];
  const shop = input.businessName?.trim();
  const category = input.category?.trim();
  if (shop && category) lines.push(`${shop} is a ${category.toLowerCase()} shop`);
  else if (shop) lines.push(`You represent ${shop}`);
  else if (category) lines.push(`This is a ${category.toLowerCase()} shop`);
  if (input.city?.trim()) lines.push(`Customers are in and around ${input.city.trim()}`);
  if (input.address?.trim()) lines.push(`Address: ${input.address.trim()}`);
  if (input.hours?.trim()) lines.push(`Hours: ${input.hours.trim()}`);
  const fulfill = input.deliveryInstructions?.trim() || input.deliveryNotes?.trim();
  if (fulfill) lines.push(`Fulfillment: ${fulfill}`);
  if (lines.length === 0) return '';
  return `${lines.join('. ')}. Answer from these shop facts and the catalog. Do not invent other locations, hours, or policies.`;
}

export function mergeHoursIntoDelivery(
  existing: string | null | undefined,
  hours: string | null | undefined
): string | undefined {
  const hoursText = hours?.trim();
  const current = existing?.trim() ?? '';
  if (!hoursText) return current || undefined;
  if (
    current.toLowerCase().includes(hoursText.toLowerCase()) ||
    /(^|[.!?]\s*)hours\s*:/i.test(current)
  ) {
    return current || `Hours: ${hoursText}`;
  }
  return [current, `Hours: ${hoursText}`].filter(Boolean).join('. ') || undefined;
}

export function onboardingAiConfigFromProfile(profile: {
  businessName?: { value: string | null };
  category?: { value: string | null };
  languageHint?: { value: string | null };
  deliveryNotes?: { value: string | null };
  address?: { value: string | null };
  city?: { value: string | null };
  hours?: { value: string | null };
}): OnboardingAiConfigInput {
  return {
    businessName: profile.businessName?.value,
    category: profile.category?.value,
    languageHint: profile.languageHint?.value,
    deliveryNotes: profile.deliveryNotes?.value,
    address: profile.address?.value,
    city: profile.city?.value,
    hours: profile.hours?.value
  };
}

export function hasOnboardingProfileFacts(input: OnboardingAiConfigInput): boolean {
  return Boolean(
    input.businessName?.trim() ||
    input.city?.trim() ||
    input.address?.trim() ||
    input.hours?.trim() ||
    input.deliveryNotes?.trim() ||
    input.deliveryInstructions?.trim() ||
    (input.category?.trim() && input.category.trim() !== 'Other')
  );
}

export function isPlaceholderShopName(name?: string | null): boolean {
  const n = (name ?? '').trim();
  if (n.length < 3) return true;
  return /^(shop|my shop|my store|vendor|business|store|untitled|new shop)$/i.test(n);
}

function isGenericGreeting(greeting?: string | null): boolean {
  const g = (greeting ?? '').trim();
  if (!g) return true;
  return /welcome to our shop/i.test(g);
}

/** Write brochure shop facts onto the vendor so confirm/demo are prefilled. */
export async function applyExtractedCatalogProfile(
  vendorId: string,
  profile: {
    businessName?: { value: string | null };
    category?: { value: string | null };
    languageHint?: { value: string | null };
    deliveryNotes?: { value: string | null };
    address?: { value: string | null };
    city?: { value: string | null };
    hours?: { value: string | null };
  }
): Promise<void> {
  const input = onboardingAiConfigFromProfile(profile);
  if (!hasOnboardingProfileFacts(input)) return;

  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      businessName: true,
      category: true,
      aiGreeting: true,
      aiBotName: true,
      aiPersonality: true,
      aiDeliveryInstructions: true,
      aiPickupDeliveryAddress: true,
      aiContentImportantInstructions: true,
      onboardingData: true
    }
  });
  if (!vendor) return;

  const generated = generateOnboardingAiConfig(input);
  const data: Prisma.VendorUpdateInput = {};

  if (isPlaceholderShopName(vendor.businessName) && input.businessName?.trim()) {
    data.businessName = input.businessName.trim();
  }
  if (!vendor.category && input.category?.trim()) {
    data.category = input.category.trim();
  }

  const patch: AIPromptsInput = {};
  if (isGenericGreeting(vendor.aiGreeting) && generated.greeting) patch.greeting = generated.greeting;
  if (!vendor.aiBotName && generated.botName) patch.botName = generated.botName;
  if (!vendor.aiPersonality && generated.personality) patch.personality = generated.personality;
  if (!vendor.aiDeliveryInstructions && generated.deliveryInstructions) {
    patch.deliveryInstructions = generated.deliveryInstructions;
  } else if (vendor.aiDeliveryInstructions && input.hours) {
    patch.deliveryInstructions = mergeHoursIntoDelivery(vendor.aiDeliveryInstructions, input.hours);
  }
  if (!vendor.aiPickupDeliveryAddress && generated.pickupDeliveryAddress) {
    patch.pickupDeliveryAddress = generated.pickupDeliveryAddress;
  }
  if (generated.contentImportantInstructions && !vendor.aiContentImportantInstructions) {
    patch.contentImportantInstructions = generated.contentImportantInstructions;
  }

  const onboardingData = (vendor.onboardingData as Record<string, unknown> | null) ?? {};
  data.onboardingData = {
    ...onboardingData,
    extractedProfile: {
      ...(typeof onboardingData.extractedProfile === 'object' && onboardingData.extractedProfile
        ? (onboardingData.extractedProfile as Record<string, unknown>)
        : {}),
      ...(input.businessName ? { businessName: input.businessName } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.address ? { address: input.address } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.hours ? { hours: input.hours } : {}),
      ...(input.deliveryNotes ? { deliveryNotes: input.deliveryNotes } : {}),
      ...(input.languageHint ? { languageHint: input.languageHint } : {})
    }
  };

  Object.assign(data, buildAIPromptsUpdate(patch));
  await prisma.vendor.update({ where: { id: vendorId }, data });
}

/** Fill empty AI prompt fields from brochure/intake facts. Never overwrites vendor-edited copy. */
export function generateOnboardingAiConfig(input: OnboardingAiConfigInput): AIPromptsInput {
  const shopName = input.businessName?.trim() || 'our shop';
  const category = input.category?.trim() || 'Other';
  const lang = input.languageHint?.trim().toLowerCase();
  const botName = shopName.length >= 3 ? `${shopName} assistant` : 'Shop assistant';

  let greeting = `Hello! Welcome to ${shopName}. How can I help you today?`;
  if (lang === 'ta') greeting = `வணக்கம்! ${shopName}-க்கு வரவேற்கிறோம். எப்படி உதவலாம்?`;
  if (lang === 'hi') greeting = `नमस्ते! ${shopName} में आपका स्वागत है। मैं कैसे मदद करूँ?`;

  const personality = CATEGORY_PERSONALITY[category] ?? CATEGORY_PERSONALITY.Other;
  const addressParts = [input.address, input.city].filter(Boolean).join(', ');
  const deliveryInstructions =
    mergeHoursIntoDelivery(
      input.deliveryInstructions?.trim() || input.deliveryNotes?.trim(),
      input.hours
    ) || undefined;
  const contentImportantInstructions = buildOnboardingShopBrief(input) || undefined;

  return {
    botName,
    greeting,
    personality,
    deliveryInstructions,
    pickupDeliveryAddress: addressParts || input.city || undefined,
    contentImportantInstructions
  };
}

/** Fill empty AI prompt fields from brochure/intake facts. Never overwrites vendor-edited copy. */
export async function applyGeneratedOnboardingAiConfigIfEmpty(
  vendorId: string,
  input: OnboardingAiConfigInput
): Promise<void> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      aiGreeting: true,
      aiBotName: true,
      aiPersonality: true,
      aiDeliveryInstructions: true,
      aiPickupDeliveryAddress: true,
      aiContentImportantInstructions: true
    }
  });
  if (!vendor) return;

  const generated = generateOnboardingAiConfig(input);
  const patch: AIPromptsInput = {};
  if (!vendor.aiGreeting && generated.greeting) patch.greeting = generated.greeting;
  if (!vendor.aiBotName && generated.botName) patch.botName = generated.botName;
  if (!vendor.aiPersonality && generated.personality) patch.personality = generated.personality;
  if (!vendor.aiDeliveryInstructions && generated.deliveryInstructions) {
    patch.deliveryInstructions = generated.deliveryInstructions;
  }
  if (!vendor.aiPickupDeliveryAddress && generated.pickupDeliveryAddress) {
    patch.pickupDeliveryAddress = generated.pickupDeliveryAddress;
  }
  if (generated.contentImportantInstructions && !vendor.aiContentImportantInstructions) {
    patch.contentImportantInstructions = generated.contentImportantInstructions;
  }
  await applyAIPrompts(vendorId, patch);
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
