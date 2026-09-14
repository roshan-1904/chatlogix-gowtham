import OpenAI from 'openai';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { embedFaqQuestionSafe } from '../services/faqEmbedService.js';
import { invalidateFaqs } from './prefetch.js';
import { logCount } from './metrics.js';
import { toStoredEnglish } from '../utils/englishStorage.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export type PromotionAction = 'faq' | 'catalog' | 'dismiss';

export interface PromotionDraft {
  question: string;
  answer: string;
  suggestedAction: PromotionAction;
}

const PROMOTION_SYSTEM = [
  'Summarize a vendor WhatsApp answer into an English FAQ draft for the next customer.',
  'Return JSON only: {"question":"...","answer":"...","suggestedAction":"faq"|"catalog"|"dismiss"}',
  'Rules:',
  '- English only. Transliterate names and places into Latin script.',
  '- Do not invent prices, ETAs, or policies that are not in the vendor reply.',
  '- question max 300 characters, answer max 1500 characters.',
  '- If the answer is a size/price matrix or missing variant, suggestedAction is catalog.',
  '- If the answer is a repeatable product or policy fact, suggestedAction is faq.',
  '- If the answer is a one-off personal request, suggestedAction is dismiss.'
].join('\n');

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max);
}

function parseAction(value: unknown): PromotionAction {
  if (value === 'catalog' || value === 'dismiss' || value === 'faq') return value;
  return 'faq';
}

export async function buildPromotionDraft(input: {
  questionOriginal: string;
  questionEn: string;
  vendorAnswerOriginal: string | null;
  vendorAnswerEn: string | null;
  category: string;
  productName?: string | null;
}): Promise<PromotionDraft> {
  const fallback: PromotionDraft = {
    question: clip(input.questionEn || input.questionOriginal, 300),
    answer: clip(input.vendorAnswerEn || input.vendorAnswerOriginal || '', 1500),
    suggestedAction: input.category === 'product' ? 'catalog' : input.category === 'policy' ? 'faq' : 'dismiss'
  };

  if (!openai) return fallback;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PROMOTION_SYSTEM },
        {
          role: 'user',
          content: JSON.stringify({
            questionOriginal: input.questionOriginal,
            questionEn: input.questionEn,
            vendorAnswerOriginal: input.vendorAnswerOriginal,
            vendorAnswerEn: input.vendorAnswerEn,
            category: input.category,
            productName: input.productName ?? null
          })
        }
      ]
    });
    const raw = JSON.parse(completion.choices[0]?.message?.content || '{}') as Partial<PromotionDraft>;
    return {
      question: clip(await toStoredEnglish(String(raw.question || fallback.question)), 300),
      answer: clip(await toStoredEnglish(String(raw.answer || fallback.answer)), 1500),
      suggestedAction: parseAction(raw.suggestedAction) || fallback.suggestedAction
    };
  } catch (error) {
    logger.warn({ err: error }, 'CustomerQuery promotion summarizer failed — using fallback draft');
    return fallback;
  }
}

export async function promoteCustomerQuery(input: {
  queryId: string;
  vendorId: string;
  action: PromotionAction;
  question?: string;
  answer?: string;
  productId?: string | null;
  dismissReason?: string | null;
}): Promise<Record<string, unknown>> {
  const query = await prisma.customerQuery.findFirst({
    where: { id: input.queryId, vendorId: input.vendorId }
  });
  if (!query) {
    const error = new Error('Query not found') as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  if (query.status !== 'answered') {
    const error = new Error('Query must be answered before promotion') as Error & { statusCode: number };
    error.statusCode = 409;
    throw error;
  }

  if (input.action === 'dismiss') {
    const updated = await prisma.customerQuery.update({
      where: { id: query.id },
      data: { status: 'dismissed', dismissReason: input.dismissReason ?? null }
    });
    logCount('CustomerQueryDismissed', { vendorId: input.vendorId });
    return { id: updated.id, status: updated.status, dismissReason: updated.dismissReason };
  }

  if (input.action === 'catalog') {
    const productId = input.productId ?? query.productId;
    const updated = await prisma.customerQuery.update({
      where: { id: query.id },
      data: { status: 'needs_catalog_fix', productId }
    });
    logCount('CustomerQueryCatalogFork', { vendorId: input.vendorId });
    return {
      id: updated.id,
      status: updated.status,
      productId,
      editPath: productId ? `/catalog/${productId}/edit` : '/catalog'
    };
  }

  const question = clip(await toStoredEnglish(input.question || query.questionEn), 300);
  const answer = clip(await toStoredEnglish(input.answer || query.vendorAnswerEn || query.vendorAnswerOriginal || ''), 1500);
  if (!question || !answer) {
    const error = new Error('FAQ question and answer are required') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  const faq = await prisma.faq.create({
    data: { vendorId: input.vendorId, question, answer, isActive: true }
  });
  await embedFaqQuestionSafe(faq.id, question);
  await invalidateFaqs(input.vendorId);

  const updated = await prisma.customerQuery.update({
    where: { id: query.id },
    data: { status: 'promoted_to_faq', faqId: faq.id }
  });
  logCount('CustomerQueryPromotedFaq', { vendorId: input.vendorId });
  return { id: updated.id, status: updated.status, faqId: faq.id, faq };
}
