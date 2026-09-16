import OpenAI from 'openai';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { calculateCost } from '../utils/costCalculator.js';
import {
  aiCostMilliForAudio,
  aiCostMilliFromUsd,
  chargeVendor,
  InsufficientBalanceError
} from './pricing/pricingService.js';
import { assertVendorWalletForAi } from './billingService.js';
import { estimateWebRecordingDurationSec, TRANSCRIBE_MODEL } from './audioTranscription.js';
import {
  ENRICHMENT_MODEL,
  shopContextFromVendorProfile,
  type ShopEnrichmentContext
} from './catalogEnrichmentService.js';
import {
  buildEnhanceUserPayload,
  buildFaqEnhanceSystemPrompt,
  buildProductEnhanceSystemPrompt
} from './catalogEnhancePrompts.js';
import {
  createEmptySession,
  findSessionForEntity,
  saveSession,
  deleteSession,
  type EnhanceEntityType,
  type EnhanceSession,
  EnhanceSessionUnavailableError
} from './catalogEnhanceSessionService.js';
import {
  faqMissingHints,
  isFaqSufficient,
  isProductSufficient,
  productMissingHints
} from './catalogEnhanceSufficiency.js';
import { invalidateCompactCatalog } from '../conversation/prefetch.js';
import { invalidateFaqs } from '../conversation/prefetch.js';
import { embedFaqQuestionSafe } from './faqEmbedService.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

const MAX_HISTORY = 20;
const PRODUCT_DESC_MAX = 2000;
const FAQ_ANSWER_MAX = 1500;
const FAQ_QUESTION_MAX = 300;

const ProductGenSchema = z.object({
  assistantMessage: z.string(),
  description: z.string(),
  keywords: z
    .object({
      en: z.array(z.string()).default([]),
      hi: z.array(z.string()).default([]),
      ta: z.array(z.string()).default([])
    })
    .default({ en: [], hi: [], ta: [] })
});

const FaqGenSchema = z.object({
  assistantMessage: z.string(),
  answer: z.string(),
  question: z.string().optional()
});

export class EntityNotFoundError extends Error {
  constructor() {
    super('entity_not_found');
    this.name = 'EntityNotFoundError';
  }
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

export function mergeProductKeywords(existing: string[], suggested: string[]): string[] {
  return Array.from(
    new Set([...existing, ...suggested].filter((k) => k && k.trim().length > 0))
  ).slice(0, 50);
}

function flattenKeywords(kw: { en: string[]; hi: string[]; ta: string[] }): string[] {
  return [...kw.en, ...kw.hi, ...kw.ta];
}

function formatChatHistory(session: EnhanceSession): string {
  const tail = session.messages.slice(-MAX_HISTORY);
  return tail.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
}

type ProfileField = { value?: string | null } | null | undefined;

function parseVendorProfile(onboardingData: unknown): {
  businessName?: ProfileField;
  category?: ProfileField;
  address?: ProfileField;
  city?: ProfileField;
  hours?: ProfileField;
  deliveryNotes?: ProfileField;
} | null {
  if (!onboardingData || typeof onboardingData !== 'object') return null;
  const od = onboardingData as { vendorProfile?: unknown };
  if (!od.vendorProfile || typeof od.vendorProfile !== 'object') return null;
  return od.vendorProfile as ReturnType<typeof parseVendorProfile>;
}

export async function loadShopContext(vendorId: string): Promise<ShopEnrichmentContext | undefined> {
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: {
      businessName: true,
      onboardingData: true,
      aiDeliveryInstructions: true,
      aiPickupDeliveryAddress: true
    }
  });
  if (!vendor) return undefined;
  const profile = parseVendorProfile(vendor.onboardingData);
  return shopContextFromVendorProfile(profile, {
    businessName: vendor.businessName,
    deliveryNotes: vendor.aiDeliveryInstructions ?? undefined,
    address: vendor.aiPickupDeliveryAddress ?? undefined
  });
}

export async function loadProductSnapshot(vendorId: string, productId: string) {
  return prisma.product.findFirst({
    where: { id: productId, vendorId }
  });
}

export async function loadFaqSnapshot(vendorId: string, faqId: string) {
  return prisma.faq.findFirst({
    where: { id: faqId, vendorId }
  });
}

async function chargeGeneration(
  vendorId: string,
  session: EnhanceSession,
  costUsd: number,
  usage: { promptTokens?: number; completionTokens?: number; model: string }
): Promise<void> {
  await chargeVendor({
    vendorId,
    source: 'catalog_enhance',
    cost: { aiCostMilli: aiCostMilliFromUsd(costUsd) },
    entityType: session.entityType,
    entityId: session.entityId,
    metadata: { sessionId: session.id, ...usage }
  });
}

async function generateTurn(session: EnhanceSession, shop?: ShopEnrichmentContext): Promise<void> {
  if (!openai) {
    throw new Error('AI enhancement is not available');
  }
  const wallet = await assertVendorWalletForAi(session.vendorId);
  if (!wallet.allowed) {
    logger.info({ vendorId: session.vendorId, sessionId: session.id }, 'catalog_enhance_wallet_denied');
    throw new InsufficientBalanceError();
  }

  let entityJson = '';
  if (session.entityType === 'product') {
    const p = await loadProductSnapshot(session.vendorId, session.entityId);
    if (!p) throw new EntityNotFoundError();
    entityJson = JSON.stringify({
      name: p.name,
      description: p.description,
      category: p.category,
      keywords: p.keywords,
      tags: p.tags,
      baseUnit: p.baseUnit,
      baseQuantity: p.baseQuantity,
      variants: p.variants,
      fulfillmentType: p.fulfillmentType,
      inStock: p.inStock
    });
  } else {
    const f = await loadFaqSnapshot(session.vendorId, session.entityId);
    if (!f) throw new EntityNotFoundError();
    entityJson = JSON.stringify({ question: f.question, answer: f.answer });
  }

  const draft =
    session.entityType === 'product'
      ? session.preview.description ?? ''
      : session.preview.answer ?? '';

  const systemPrompt =
    session.entityType === 'product'
      ? buildProductEnhanceSystemPrompt(shop)
      : buildFaqEnhanceSystemPrompt(shop);

  const userContent = buildEnhanceUserPayload({
    entityType: session.entityType,
    entityJson,
    chatHistory: formatChatHistory(session),
    currentDraft: draft
  });

  const completion = await openai.chat.completions.create({
    model: ENRICHMENT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ],
    temperature: 0.3,
    max_completion_tokens: 4000,
    response_format: { type: 'json_object' }
  });

  const cost = calculateCost(
    ENRICHMENT_MODEL,
    completion.usage?.prompt_tokens,
    completion.usage?.completion_tokens,
    completion.usage?.total_tokens
  );
  await chargeGeneration(session.vendorId, session, cost.costUsd, {
    promptTokens: cost.promptTokens,
    completionTokens: cost.completionTokens,
    model: ENRICHMENT_MODEL
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);

  if (session.entityType === 'product') {
    const shaped = ProductGenSchema.safeParse(parsed);
    if (!shaped.success) {
      logger.warn({ issues: shaped.error.issues.slice(0, 3) }, 'catalog_enhance_shape_invalid');
      return;
    }
    session.preview.description = truncate(shaped.data.description, PRODUCT_DESC_MAX);
    session.preview.keywords = mergeProductKeywords([], flattenKeywords(shaped.data.keywords));
    session.messages.push({
      role: 'assistant',
      content: shaped.data.assistantMessage.trim(),
      createdAt: new Date().toISOString()
    });
  } else {
    const shaped = FaqGenSchema.safeParse(parsed);
    if (!shaped.success) {
      logger.warn({ issues: shaped.error.issues.slice(0, 3) }, 'catalog_enhance_faq_shape_invalid');
      return;
    }
    session.preview.answer = truncate(shaped.data.answer, FAQ_ANSWER_MAX);
    if (shaped.data.question?.trim()) {
      session.preview.question = truncate(shaped.data.question, FAQ_QUESTION_MAX);
    }
    session.messages.push({
      role: 'assistant',
      content: shaped.data.assistantMessage.trim(),
      createdAt: new Date().toISOString()
    });
  }

  logger.info(
    { vendorId: session.vendorId, sessionId: session.id, entityType: session.entityType },
    'catalog_enhance_generate'
  );
}

function openingInsufficientMessage(entityType: EnhanceEntityType, hints: string[]): string {
  const intro =
    entityType === 'product'
      ? 'I need a bit more detail before I can write a strong description.'
      : 'I need a bit more detail before I can improve this FAQ answer.';
  return `${intro}\n\n${hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}`;
}

export async function startEnhanceSession(
  vendorId: string,
  entityType: EnhanceEntityType,
  entityId: string
): Promise<{ session: EnhanceSession; resumed: boolean; sufficient: boolean }> {
  if (entityType === 'product') {
    const p = await loadProductSnapshot(vendorId, entityId);
    if (!p) throw new EntityNotFoundError();
  } else {
    const f = await loadFaqSnapshot(vendorId, entityId);
    if (!f) throw new EntityNotFoundError();
  }

  let session = await findSessionForEntity(vendorId, entityType, entityId);
  const resumed = Boolean(session);
  if (!session) {
    session = createEmptySession(vendorId, entityType, entityId);
  }

  const shop = await loadShopContext(vendorId);
  let sufficient = false;

  if (session.messages.length === 0) {
    if (entityType === 'product') {
      const p = await loadProductSnapshot(vendorId, entityId);
      if (!p) throw new EntityNotFoundError();
      sufficient = isProductSufficient({
        name: p.name,
        description: p.description,
        category: p.category,
        keywords: p.keywords,
        tags: p.tags,
        variants: p.variants,
        sessionMessages: session.messages
      });
      if (sufficient) {
        await generateTurn(session, shop);
      } else {
        const hints = productMissingHints({
          name: p.name,
          description: p.description,
          category: p.category,
          variants: p.variants
        });
        session.messages.push({
          role: 'assistant',
          content: openingInsufficientMessage('product', hints),
          createdAt: new Date().toISOString()
        });
      }
    } else {
      const f = await loadFaqSnapshot(vendorId, entityId);
      if (!f) throw new EntityNotFoundError();
      sufficient = isFaqSufficient({
        question: f.question,
        answer: f.answer,
        sessionMessages: session.messages
      });
      if (sufficient) {
        await generateTurn(session, shop);
      } else {
        const hints = faqMissingHints({ question: f.question, answer: f.answer });
        session.messages.push({
          role: 'assistant',
          content: openingInsufficientMessage('faq', hints),
          createdAt: new Date().toISOString()
        });
      }
    }
  } else {
    sufficient = Boolean(session.preview.description || session.preview.answer);
  }

  await saveSession(session);
  logger.info(
    { vendorId, sessionId: session.id, entityType, entityId, resumed },
    'catalog_enhance_session_start'
  );
  return { session, resumed, sufficient };
}

export async function postEnhanceMessage(
  vendorId: string,
  sessionId: string,
  content: string
): Promise<EnhanceSession> {
  const trimmed = content.trim();
  if (!trimmed) {
    const session = await findSessionByIdForVendor(vendorId, sessionId);
    return session;
  }

  const session = await findSessionByIdForVendor(vendorId, sessionId);
  session.messages.push({
    role: 'user',
    content: trimmed,
    createdAt: new Date().toISOString()
  });

  const shop = await loadShopContext(vendorId);
  await generateTurn(session, shop);
  await saveSession(session);
  return session;
}

async function findSessionByIdForVendor(vendorId: string, sessionId: string): Promise<EnhanceSession> {
  const { getSession } = await import('./catalogEnhanceSessionService.js');
  const session = await getSession(sessionId);
  if (!session || session.vendorId !== vendorId) {
    throw new EntityNotFoundError();
  }
  return session;
}

export async function acceptEnhancePreview(
  vendorId: string,
  sessionId: string,
  options?: {
    applyKeywords?: boolean;
    updateQuestion?: boolean;
    description?: string;
    answer?: string;
  }
): Promise<{ entityType: EnhanceEntityType; product?: unknown; faq?: unknown }> {
  const session = await findSessionByIdForVendor(vendorId, sessionId);

  if (session.entityType === 'product') {
    const existing = await loadProductSnapshot(vendorId, session.entityId);
    if (!existing) throw new EntityNotFoundError();
    const description = (options?.description ?? session.preview.description)?.trim();
    if (!description) throw new Error('no_preview');

    const keywords =
      options?.applyKeywords !== false && session.preview.keywords?.length
        ? mergeProductKeywords(existing.keywords ?? [], session.preview.keywords)
        : existing.keywords;

    const product = await prisma.product.update({
      where: { id: session.entityId },
      data: {
        description: truncate(description, PRODUCT_DESC_MAX),
        keywords
      }
    });
    await invalidateCompactCatalog(vendorId);
    logger.info({ vendorId, sessionId, productId: session.entityId }, 'catalog_enhance_accept');
    return { entityType: 'product', product };
  }

  const existing = await loadFaqSnapshot(vendorId, session.entityId);
  if (!existing) throw new EntityNotFoundError();
  const answer = (options?.answer ?? session.preview.answer)?.trim();
  if (!answer) throw new Error('no_preview');

  const data: { answer: string; question?: string } = {
    answer: truncate(answer, FAQ_ANSWER_MAX)
  };
  const polished = session.preview.question?.trim();
  if (options?.updateQuestion && polished && polished !== existing.question) {
    data.question = truncate(polished, FAQ_QUESTION_MAX);
  }

  const faq = await prisma.faq.update({
    where: { id: session.entityId },
    data
  });

  if (data.question) {
    await embedFaqQuestionSafe(faq.id, data.question);
  }
  await invalidateFaqs(vendorId);
  logger.info({ vendorId, sessionId, faqId: session.entityId }, 'catalog_enhance_accept');
  return { entityType: 'faq', faq };
}

export async function postEnhanceVoice(
  vendorId: string,
  sessionId: string,
  audioBytes: Buffer,
  mimeType: string
): Promise<EnhanceSession> {
  const wallet = await assertVendorWalletForAi(vendorId);
  if (!wallet.allowed) {
    throw new InsufficientBalanceError();
  }
  const { transcribeVendorAudioBuffer } = await import('./vendorAudioTranscriptionService.js');
  const { transcript } = await transcribeVendorAudioBuffer(audioBytes, mimeType);
  // Priced from audio duration, not from the caller's returned costUsd — that
  // number comes from calculateCost() on a synthetic token count, which is not
  // how OpenAI bills speech-to-text.
  const session = await findSessionByIdForVendor(vendorId, sessionId);
  await chargeVendor({
    vendorId,
    source: 'catalog_enhance_transcribe',
    cost: {
      aiCostMilli: aiCostMilliForAudio(
        TRANSCRIBE_MODEL,
        estimateWebRecordingDurationSec(audioBytes.byteLength)
      )
    },
    entityType: session.entityType,
    entityId: session.entityId,
    metadata: { sessionId: session.id, model: TRANSCRIBE_MODEL }
  });
  return postEnhanceMessage(vendorId, sessionId, transcript);
}

export async function discardEnhanceSession(vendorId: string, sessionId: string): Promise<void> {
  const session = await findSessionByIdForVendor(vendorId, sessionId);
  await deleteSession(session);
}

// Re-exported so the enhance route keeps importing both error types from here.
export { EnhanceSessionUnavailableError, InsufficientBalanceError };
