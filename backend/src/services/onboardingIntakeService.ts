import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import type { MergedVendorProfile } from '../lib/visionClient.js';
import type { NormalizedProductDraft } from '../routes/schemas/catalogImport.js';
import { logOnboardingFunnelEvent } from './onboardingFunnelService.js';
import { buildAIPromptsUpdate, mergeHoursIntoDelivery } from './vendorAIConfigService.js';
import { enrichKeywordsBatch, type ShopEnrichmentContext } from './catalogEnrichmentService.js';

export const CONFIDENCE_THRESHOLD = 0.75;
export const OVERALL_READY_THRESHOLD = 0.8;
export const MAX_INTAKE_QUESTIONS = 10;
export const MAX_EXTRA_AFTER_80 = 2;

const STORE_WEIGHTS = {
  businessName: 0.22,
  category: 0.1,
  fulfillment: 0.16,
  deliveryArea: 0.14,
  hours: 0.12,
  addressOrCity: 0.1,
  language: 0.08,
  minOrderPayment: 0.08
} as const;

const PRODUCT_WEIGHTS = {
  hasProduct: 0.15,
  priceShare: 0.25,
  unitShare: 0.15,
  descriptionShare: 0.25,
  catalogDepth: 0.2
} as const;

export type IntakeQuestionKind = 'chips' | 'text' | 'price_list';

export interface IntakeQuestion {
  id: string;
  prompt: string;
  kind: IntakeQuestionKind;
  options?: string[];
}

export interface CompletenessResult {
  store: number;
  products: number;
  overall: number;
  readyForDemo: boolean;
  missing: string[];
}

export interface IntakeState {
  answers: Record<string, string | string[]>;
  askedIds: string[];
  extraAfter80?: number;
  fullListConfirmed?: boolean;
}

export interface VendorProfileDraft {
  businessName?: string | null;
  category?: string | null;
  address?: string | null;
  city?: string | null;
  hours?: string | null;
  deliveryNotes?: string | null;
  languageHint?: string | null;
}

export interface IntakeContext {
  businessName?: string;
  category?: string;
  address?: string;
  city?: string;
  hours?: string;
  deliveryNotes?: string;
  language?: string;
  fulfillment?: string;
  deliveryArea?: string;
  minOrderPayment?: string;
  customerFaqs?: string;
  fullListConfirmed?: boolean;
  products: Array<{ name: string; basePrice?: number | null; baseUnit?: string; description?: string | null }>;
}

function asString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

function answerValue(answers: Record<string, string | string[]>, id: string): string | undefined {
  const raw = answers[id];
  if (typeof raw === 'string') return raw.trim() || undefined;
  if (Array.isArray(raw) && raw.length) return raw.join(', ');
  return undefined;
}

export function mergedProfileToDraft(profile: MergedVendorProfile | null | undefined): VendorProfileDraft | null {
  if (!profile) return null;
  const draft: VendorProfileDraft = {};
  for (const [key, cell] of Object.entries(profile)) {
    if (cell && typeof cell === 'object' && 'value' in cell && cell.value) {
      (draft as Record<string, string>)[key] = cell.value;
    }
  }
  return Object.keys(draft).length ? draft : null;
}

export function asExtractedFields(
  draft: VendorProfileDraft | MergedVendorProfile | null | undefined
): Record<string, { value: string | null; confidence: number }> | null {
  if (!draft) return null;
  const out: Record<string, { value: string | null; confidence: number }> = {};
  for (const [key, cell] of Object.entries(draft)) {
    if (cell && typeof cell === 'object' && 'value' in cell) {
      const value = (cell as { value: string | null; confidence?: number }).value;
      if (value) {
        out[key] = {
          value,
          confidence: (cell as { confidence?: number }).confidence ?? 1
        };
      }
    } else if (typeof cell === 'string' && cell.trim()) {
      out[key] = { value: cell.trim(), confidence: 1 };
    }
  }
  return Object.keys(out).length ? out : null;
}

export function profileFieldFilled(
  profile: MergedVendorProfile | null | undefined,
  field: keyof MergedVendorProfile
): boolean {
  const cell = profile?.[field];
  return !!cell && cell.confidence >= CONFIDENCE_THRESHOLD && !!cell.value?.trim();
}

function isRealDescription(name: string, description?: string | null): boolean {
  if (!description?.trim()) return false;
  const norm = description.trim().toLowerCase();
  const nameNorm = name.trim().toLowerCase();
  return norm.length > 8 && norm !== nameNorm;
}

function isThinListingDescription(name: string, description?: string | null): boolean {
  if (!isRealDescription(name, description)) return true;
  return (description?.trim().length ?? 0) < 200;
}

function buildContext(input: {
  vendor: {
    businessName: string;
    category: string | null;
    aiPickupDeliveryAddress: string | null;
    aiDeliveryInstructions: string | null;
  };
  onboardingData: Record<string, unknown> | null;
  products: Array<{ name: string; basePrice: number; baseUnit: string; description: string | null }>;
  extractedProfile?: MergedVendorProfile | VendorProfileDraft | null;
}): IntakeContext {
  const data = input.onboardingData ?? {};
  const intake = (data.intake as IntakeState | undefined) ?? { answers: {}, askedIds: [] };
  const answers = intake.answers ?? {};
  const extracted =
    (data.extractedProfile as VendorProfileDraft | undefined) ??
    mergedProfileToDraft(input.extractedProfile as MergedVendorProfile | undefined);

  const fulfillment =
    answerValue(answers, 'fulfillment') ??
    (() => {
      const notes = extracted?.deliveryNotes?.toLowerCase() ?? '';
      if (notes.includes('pickup') && notes.includes('deliver')) return 'both';
      if (notes.includes('deliver')) return 'deliver';
      if (notes.includes('pickup')) return 'pickup';
      return undefined;
    })();

  return {
    businessName:
      (input.vendor.businessName?.trim().length >= 3 ? input.vendor.businessName : undefined) ??
      extracted?.businessName ??
      answerValue(answers, 'businessName'),
    category: input.vendor.category ?? extracted?.category ?? answerValue(answers, 'category'),
    address: extracted?.address ?? answerValue(answers, 'address'),
    city: extracted?.city ?? answerValue(answers, 'city'),
    hours: extracted?.hours ?? answerValue(answers, 'hours'),
    deliveryNotes: extracted?.deliveryNotes ?? undefined,
    language: extracted?.languageHint ?? answerValue(answers, 'language'),
    fulfillment,
    deliveryArea:
      answerValue(answers, 'deliveryArea') ??
      extracted?.address ??
      extracted?.city ??
      input.vendor.aiPickupDeliveryAddress ??
      undefined,
    minOrderPayment: answerValue(answers, 'minOrderPayment'),
    customerFaqs: answerValue(answers, 'customerFaqs'),
    fullListConfirmed: intake.fullListConfirmed ?? answerValue(answers, 'fullListConfirm') === 'yes',
    products: input.products.map((p) => ({
      name: p.name,
      basePrice: p.basePrice,
      baseUnit: p.baseUnit,
      description: p.description
    }))
  };
}

function storeFieldScore(ctx: IntakeContext, field: keyof typeof STORE_WEIGHTS): number {
  switch (field) {
    case 'businessName':
      return ctx.businessName && ctx.businessName.length >= 3 ? 1 : 0;
    case 'category':
      return ctx.category ? 1 : 0;
    case 'fulfillment':
      return ctx.fulfillment ? 1 : 0;
    case 'deliveryArea': {
      if (ctx.fulfillment === 'pickup') return 1;
      return ctx.deliveryArea ? 1 : 0;
    }
    case 'hours':
      return ctx.hours ? 1 : 0;
    case 'addressOrCity':
      return ctx.address || ctx.city ? 1 : 0;
    case 'language':
      return ctx.language ? 1 : 0;
    case 'minOrderPayment':
      return ctx.minOrderPayment ? 1 : 0;
    default:
      return 0;
  }
}

function productFieldScore(ctx: IntakeContext, field: keyof typeof PRODUCT_WEIGHTS): number {
  const products = ctx.products;
  if (field === 'hasProduct') return products.length >= 1 ? 1 : 0;
  if (products.length === 0) return 0;

  if (field === 'priceShare') {
    const withPrice = products.filter((p) => p.basePrice != null && p.basePrice > 0).length;
    return withPrice / products.length;
  }
  if (field === 'unitShare') {
    const withUnit = products.filter((p) => p.baseUnit?.trim()).length;
    return withUnit / products.length;
  }
  if (field === 'descriptionShare') {
    const withDesc = products.filter((p) => isRealDescription(p.name, p.description)).length;
    return withDesc / products.length;
  }
  if (field === 'catalogDepth') {
    return products.length >= 3 || ctx.fullListConfirmed ? 1 : 0;
  }
  return 0;
}

export function computeCompleteness(ctx: IntakeContext): CompletenessResult {
  let store = 0;
  const missing: string[] = [];
  for (const [field, weight] of Object.entries(STORE_WEIGHTS)) {
    const score = storeFieldScore(ctx, field as keyof typeof STORE_WEIGHTS);
    store += score * weight;
    if (score < 1) missing.push(field);
  }

  let products = 0;
  for (const [field, weight] of Object.entries(PRODUCT_WEIGHTS)) {
    const score = productFieldScore(ctx, field as keyof typeof PRODUCT_WEIGHTS);
    products += score * weight;
    if (score < 1) missing.push(`product:${field}`);
  }

  const overall = 0.5 * store + 0.5 * products;
  return {
    store: Math.round(store * 1000) / 1000,
    products: Math.round(products * 1000) / 1000,
    overall: Math.round(overall * 1000) / 1000,
    readyForDemo: overall >= OVERALL_READY_THRESHOLD,
    missing
  };
}

const QUESTION_DEFS: Record<string, Omit<IntakeQuestion, 'id'>> = {
  businessName: {
    prompt: 'What is your shop name?',
    kind: 'text'
  },
  category: {
    prompt: 'What type of shop is this?',
    kind: 'chips',
    options: ['Food', 'Retail', 'Services', 'Healthcare', 'Education', 'Other']
  },
  fulfillment: {
    prompt: 'How do customers get their order?',
    kind: 'chips',
    options: ['Pickup only', 'Delivery only', 'Pickup and delivery']
  },
  deliveryArea: {
    prompt: 'Where do you deliver? (area or city)',
    kind: 'text'
  },
  hours: {
    prompt: 'What are your shop hours or order lead time?',
    kind: 'text'
  },
  addressOrCity: {
    prompt: 'What is your shop address or city?',
    kind: 'text'
  },
  language: {
    prompt: 'Which language should replies use?',
    kind: 'chips',
    options: ['English', 'Tamil', 'Hindi']
  },
  minOrderPayment: {
    prompt: 'Any minimum order or payment note customers should know?',
    kind: 'text'
  },
  productPrices: {
    prompt: 'Tap items that are missing a price',
    kind: 'price_list'
  },
  productDescriptions: {
    prompt: 'Which item should we describe better for customers?',
    kind: 'text'
  },
  fullListConfirm: {
    prompt: 'Is this your full product list?',
    kind: 'chips',
    options: ['Yes, that is all', 'No, I will add more']
  },
  customerFaqs: {
    prompt: 'Anything customers always ask about?',
    kind: 'text'
  }
};

const PRIMARY_ORDER: string[] = [
  'businessName',
  'productPrices',
  'fulfillment',
  'deliveryArea',
  'hours',
  'addressOrCity',
  'productDescriptions',
  'language',
  'fullListConfirm',
  'minOrderPayment'
];

const EXTRA_AFTER_80_ORDER: string[] = ['productDescriptions', 'hours', 'customerFaqs'];

function questionWeight(id: string, ctx: IntakeContext): number {
  if (id === 'businessName') return STORE_WEIGHTS.businessName * (1 - storeFieldScore(ctx, 'businessName'));
  if (id === 'category') return STORE_WEIGHTS.category * (1 - storeFieldScore(ctx, 'category'));
  if (id === 'fulfillment') return STORE_WEIGHTS.fulfillment * (1 - storeFieldScore(ctx, 'fulfillment'));
  if (id === 'deliveryArea') return STORE_WEIGHTS.deliveryArea * (1 - storeFieldScore(ctx, 'deliveryArea'));
  if (id === 'hours') return STORE_WEIGHTS.hours * (1 - storeFieldScore(ctx, 'hours'));
  if (id === 'addressOrCity') return STORE_WEIGHTS.addressOrCity * (1 - storeFieldScore(ctx, 'addressOrCity'));
  if (id === 'language') return STORE_WEIGHTS.language * (1 - storeFieldScore(ctx, 'language'));
  if (id === 'minOrderPayment') return STORE_WEIGHTS.minOrderPayment * (1 - storeFieldScore(ctx, 'minOrderPayment'));
  if (id === 'productPrices') return PRODUCT_WEIGHTS.priceShare * (1 - productFieldScore(ctx, 'priceShare'));
  if (id === 'fullListConfirm') return PRODUCT_WEIGHTS.catalogDepth * (1 - productFieldScore(ctx, 'catalogDepth'));
  if (id === 'productDescriptions') {
    return PRODUCT_WEIGHTS.descriptionShare * (1 - productFieldScore(ctx, 'descriptionShare'));
  }
  if (id === 'customerFaqs') return 0.05;
  return 0;
}

function isQuestionAnswered(id: string, ctx: IntakeContext, askedIds: string[]): boolean {
  if (askedIds.includes(id)) {
    if (id === 'productPrices') {
      return productFieldScore(ctx, 'priceShare') >= 1;
    }
    return true;
  }
  if (id === 'businessName') return storeFieldScore(ctx, 'businessName') >= 1;
  if (id === 'category') return storeFieldScore(ctx, 'category') >= 1;
  if (id === 'fulfillment') return storeFieldScore(ctx, 'fulfillment') >= 1;
  if (id === 'deliveryArea') return storeFieldScore(ctx, 'deliveryArea') >= 1;
  if (id === 'hours') return storeFieldScore(ctx, 'hours') >= 1;
  if (id === 'addressOrCity') return storeFieldScore(ctx, 'addressOrCity') >= 1;
  if (id === 'language') return storeFieldScore(ctx, 'language') >= 1;
  if (id === 'minOrderPayment') return storeFieldScore(ctx, 'minOrderPayment') >= 1;
  if (id === 'productPrices') return productFieldScore(ctx, 'priceShare') >= 1;
  if (id === 'fullListConfirm') return productFieldScore(ctx, 'catalogDepth') >= 1;
  if (id === 'productDescriptions') return productFieldScore(ctx, 'descriptionShare') >= 0.8;
  if (id === 'customerFaqs') return !!ctx.customerFaqs;
  return false;
}

export function getNextQuestions(
  ctx: IntakeContext,
  intake: IntakeState,
  completeness: CompletenessResult
): IntakeQuestion[] {
  const askedIds = intake.askedIds ?? [];
  if (askedIds.length >= MAX_INTAKE_QUESTIONS) return [];

  const extraAfter80 = intake.extraAfter80 ?? 0;
  const order =
    completeness.readyForDemo && extraAfter80 < MAX_EXTRA_AFTER_80
      ? EXTRA_AFTER_80_ORDER
      : PRIMARY_ORDER;

  const candidates = order
    .filter((id) => !isQuestionAnswered(id, ctx, askedIds))
    .filter((id) => {
      if (id === 'deliveryArea' && ctx.fulfillment === 'pickup') return false;
      if (id === 'productPrices' && ctx.products.every((p) => p.basePrice != null && p.basePrice > 0)) return false;
      return true;
    })
    .sort((a, b) => questionWeight(b, ctx) - questionWeight(a, ctx));

  if (candidates.length === 0) return [];
  if (completeness.readyForDemo && extraAfter80 >= MAX_EXTRA_AFTER_80) return [];

  const nextId = candidates[0];
  const def = QUESTION_DEFS[nextId];
  if (!def) return [];

  const question: IntakeQuestion = { id: nextId, ...def };
  if (nextId === 'productPrices') {
    question.options = ctx.products
      .filter((p) => p.basePrice == null || p.basePrice <= 0)
      .map((p) => p.name)
      .slice(0, 10);
    if (!question.options.length) return getNextQuestions(ctx, { ...intake, askedIds: [...askedIds, nextId] }, completeness);
  }
  return [question];
}

export function buildDemoPrompts(
  products: Array<{ name: string }>,
  city?: string | null
): string[] {
  const prompts: string[] = [];
  const first = products[0]?.name;
  const second = products[1]?.name;
  if (first) prompts.push(`How much is ${first}?`);
  if (second) prompts.push(`Do you have ${second}?`);
  else if (first) prompts.push(`Do you have ${first}?`);
  if (city?.trim()) prompts.push(`Do you deliver to ${city.trim()}?`);
  return prompts.slice(0, 5);
}

async function loadIntakeInputs(vendorId: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      businessName: true,
      category: true,
      aiPickupDeliveryAddress: true,
      aiDeliveryInstructions: true,
      onboardingData: true,
      products: {
        select: { name: true, basePrice: true, baseUnit: true, description: true },
        take: 10,
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  if (!vendor) return null;

  const latestJob = await prisma.catalogImportJob.findFirst({
    where: { vendorId, status: 'ready' },
    orderBy: { createdAt: 'desc' },
    select: { result: true }
  });
  const jobResult = latestJob?.result as { vendorProfile?: MergedVendorProfile } | null;

  return {
    vendor,
    ctx: buildContext({
      vendor,
      onboardingData: vendor.onboardingData as Record<string, unknown> | null,
      products: vendor.products,
      extractedProfile: jobResult?.vendorProfile
    }),
    intake: ((vendor.onboardingData as Record<string, unknown> | null)?.intake as IntakeState | undefined) ?? {
      answers: {},
      askedIds: []
    },
    extractedProfile:
      ((vendor.onboardingData as Record<string, unknown> | null)?.extractedProfile as VendorProfileDraft | undefined) ??
      mergedProfileToDraft(jobResult?.vendorProfile)
  };
}

export async function getCompleteness(vendorId: string): Promise<CompletenessResult> {
  const loaded = await loadIntakeInputs(vendorId);
  if (!loaded) {
    return { store: 0, products: 0, overall: 0, readyForDemo: false, missing: ['vendor'] };
  }
  return computeCompleteness(loaded.ctx);
}

export async function getIntakeSnapshot(vendorId: string): Promise<{
  completeness: CompletenessResult;
  nextQuestions: IntakeQuestion[];
  extractedProfile: VendorProfileDraft | null;
  demoPrompts: string[];
}> {
  const loaded = await loadIntakeInputs(vendorId);
  if (!loaded) {
    return {
      completeness: { store: 0, products: 0, overall: 0, readyForDemo: false, missing: [] },
      nextQuestions: [],
      extractedProfile: null,
      demoPrompts: []
    };
  }
  const completeness = computeCompleteness(loaded.ctx);
  const nextQuestions = getNextQuestions(loaded.ctx, loaded.intake, completeness);
  return {
    completeness,
    nextQuestions,
    extractedProfile: loaded.extractedProfile ?? null,
    demoPrompts: buildDemoPrompts(loaded.ctx.products, loaded.ctx.city)
  };
}

function mapFulfillmentAnswer(raw: string): { fulfillment: string; deliveryNotes?: string } {
  const lower = raw.toLowerCase();
  if (lower.includes('pickup') && lower.includes('deliver')) return { fulfillment: 'both', deliveryNotes: 'Pickup and delivery' };
  if (lower.includes('delivery')) return { fulfillment: 'deliver', deliveryNotes: 'Delivery' };
  return { fulfillment: 'pickup', deliveryNotes: 'Pickup only' };
}

function mapLanguageAnswer(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith('ta')) return 'ta';
  if (lower.startsWith('hi')) return 'hi';
  return 'en';
}

export async function applyIntakeAnswers(
  vendorId: string,
  payload: { answers?: Record<string, string | string[]>; askedIds?: string[]; skipped?: boolean }
): Promise<{ completeness: CompletenessResult; nextQuestions: IntakeQuestion[] }> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      businessName: true,
      category: true,
      email: true,
      aiPickupDeliveryAddress: true,
      aiDeliveryInstructions: true,
      aiContentImportantInstructions: true,
      onboardingData: true
    }
  });
  if (!vendor) throw new Error('vendor_not_found');

  const data = (vendor.onboardingData as Record<string, unknown> | null) ?? {};
  const prevIntake = (data.intake as IntakeState | undefined) ?? { answers: {}, askedIds: [] };
  const mergedAnswers = { ...prevIntake.answers, ...(payload.answers ?? {}) };
  const mergedAsked = Array.from(new Set([...(prevIntake.askedIds ?? []), ...(payload.askedIds ?? [])]));

  const vendorUpdate: Record<string, unknown> = {};
  const extractedUpdates: VendorProfileDraft = { ...(data.extractedProfile as VendorProfileDraft | undefined) };

  for (const [qid, raw] of Object.entries(payload.answers ?? {})) {
    const value = Array.isArray(raw) ? raw.join(', ') : raw;
    if (!value?.trim()) continue;
    logOnboardingFunnelEvent('intake_question_answered', { vendorId, questionId: qid });

    if (qid === 'businessName') {
      vendorUpdate.businessName = value.trim();
      extractedUpdates.businessName = value.trim();
    }
    if (qid === 'category') {
      vendorUpdate.category = value.trim();
      extractedUpdates.category = value.trim();
    }
    if (qid === 'fulfillment') {
      const mapped = mapFulfillmentAnswer(value);
      extractedUpdates.deliveryNotes = mapped.deliveryNotes;
      mergedAnswers.fulfillment = mapped.fulfillment;
      if (!vendor.aiDeliveryInstructions && mapped.deliveryNotes) {
        vendorUpdate.aiDeliveryInstructions = mapped.deliveryNotes;
      }
    }
    if (qid === 'deliveryArea') {
      vendorUpdate.aiPickupDeliveryAddress = value.trim();
      extractedUpdates.city = value.trim();
    }
    if (qid === 'hours') {
      extractedUpdates.hours = value.trim();
      vendorUpdate.aiDeliveryInstructions = mergeHoursIntoDelivery(
        asString(vendorUpdate.aiDeliveryInstructions) ?? vendor.aiDeliveryInstructions,
        value.trim()
      );
    }
    if (qid === 'addressOrCity') {
      extractedUpdates.address = value.trim();
      vendorUpdate.aiPickupDeliveryAddress = value.trim();
    }
    if (qid === 'language') extractedUpdates.languageHint = mapLanguageAnswer(value);
    if (qid === 'minOrderPayment') mergedAnswers.minOrderPayment = value.trim();
    if (qid === 'customerFaqs') {
      vendorUpdate.aiContentImportantInstructions = [
        vendor.aiContentImportantInstructions,
        `Customer notes: ${value.trim()}`
      ]
        .filter((part) => typeof part === 'string' && part.trim())
        .join('. ');
    }
    if (qid === 'fullListConfirm' && value.toLowerCase().includes('yes')) {
      mergedAnswers.fullListConfirm = 'yes';
    }
  }

  const prevCompleteness = computeCompleteness(
    buildContext({
      vendor,
      onboardingData: data,
      products: [],
      extractedProfile: extractedUpdates
    })
  );
  let extraAfter80 = prevIntake.extraAfter80 ?? 0;
  if (prevCompleteness.readyForDemo) {
    extraAfter80 += (payload.askedIds ?? []).length;
  }

  const nextIntake: IntakeState = {
    answers: mergedAnswers,
    askedIds: mergedAsked,
    extraAfter80,
    fullListConfirmed: mergedAnswers.fullListConfirm === 'yes' || prevIntake.fullListConfirmed
  };

  const onboardingData = {
    ...data,
    extractedProfile: extractedUpdates,
    intake: nextIntake
  };

  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      ...buildAIPromptsUpdate({
        pickupDeliveryAddress: asString(vendorUpdate.aiPickupDeliveryAddress),
        deliveryInstructions: asString(vendorUpdate.aiDeliveryInstructions),
        contentImportantInstructions: asString(vendorUpdate.aiContentImportantInstructions)
      }),
      ...(asString(vendorUpdate.businessName) ? { businessName: vendorUpdate.businessName as string } : {}),
      ...(asString(vendorUpdate.category) ? { category: vendorUpdate.category as string } : {}),
      onboardingData: onboardingData as unknown as Prisma.InputJsonValue
    }
  });

  const snapshot = await getIntakeSnapshot(vendorId);
  return { completeness: snapshot.completeness, nextQuestions: snapshot.nextQuestions };
}

/** Second enrichment pass after intake answers — optional, non-blocking. */
export async function enrichProductsAfterIntake(
  vendorId: string,
  drafts: NormalizedProductDraft[]
): Promise<{ updated: NormalizedProductDraft[] }> {
  const loaded = await loadIntakeInputs(vendorId);
  if (!loaded || drafts.length === 0) return { updated: drafts };

  const shopContext: ShopEnrichmentContext = {
    businessName: loaded.ctx.businessName,
    category: loaded.ctx.category,
    address: loaded.ctx.address,
    deliveryNotes: loaded.ctx.deliveryNotes,
    hours: loaded.ctx.hours,
    city: loaded.ctx.city,
    intakeAnswers: loaded.intake.answers
  };
  const { updated } = await enrichKeywordsBatch(drafts, shopContext);
  return { updated };
}

/**
 * Re-enrich products that still have thin descriptions (name-only / empty)
 * after Details, then persist so demo chat can quote them. Skips vendor-edited copy.
 */
export async function persistThinProductsForDemo(vendorId: string): Promise<{ updatedCount: number }> {
  const loaded = await loadIntakeInputs(vendorId);
  if (!loaded) return { updatedCount: 0 };

  const products = await prisma.product.findMany({
    where: { vendorId, isActive: true },
    take: 10,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      sku: true,
      description: true,
      keywords: true,
      baseUnit: true,
      baseQuantity: true,
      basePrice: true,
      isActive: true
    }
  });

  const thin = products.filter((p) => isThinListingDescription(p.name, p.description));
  if (thin.length === 0) return { updatedCount: 0 };

  const drafts: NormalizedProductDraft[] = thin.map((p) => ({
    rowId: p.id,
    name: p.name,
    sku: p.sku ?? undefined,
    description: p.description ?? undefined,
    basePrice: p.basePrice,
    baseUnit: p.baseUnit,
    baseQuantity: Number(p.baseQuantity) || 1,
    isActive: p.isActive,
    keywords: p.keywords ?? [],
    overrideProtected: true,
    sourceMeta: { source: 'manual', confidence: 1, fieldConfidence: {}, warnings: [] }
  }));

  const { updated } = await enrichProductsAfterIntake(vendorId, drafts);
  let updatedCount = 0;
  for (const draft of updated) {
    const orig = thin.find((p) => p.id === draft.rowId);
    if (!orig) continue;
    const nextDesc = draft.description?.trim() || orig.description;
    const descChanged = (nextDesc ?? '') !== (orig.description ?? '');
    const origKw = orig.keywords ?? [];
    const nextKw = draft.keywords ?? [];
    const kwChanged = JSON.stringify(nextKw) !== JSON.stringify(origKw);
    if (!descChanged && !kwChanged) continue;
    await prisma.product.update({
      where: { id: draft.rowId },
      data: {
        ...(descChanged ? { description: nextDesc } : {}),
        ...(kwChanged ? { keywords: nextKw } : {})
      }
    });
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    const { invalidateCompactCatalog } = await import('../conversation/prefetch.js');
    await invalidateCompactCatalog(vendorId);
  }
  return { updatedCount };
}
