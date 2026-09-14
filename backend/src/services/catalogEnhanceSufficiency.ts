import type { EnhanceChatMessage } from './catalogEnhanceSessionService.js';

export interface ProductSufficiencyInput {
  name: string;
  description?: string | null;
  category?: string | null;
  keywords?: string[];
  tags?: string[];
  variants?: unknown;
  sessionMessages?: EnhanceChatMessage[];
}

export interface FaqSufficiencyInput {
  question: string;
  answer: string;
  sessionMessages?: EnhanceChatMessage[];
}

function sessionUserTextLen(messages?: EnhanceChatMessage[]): number {
  if (!messages?.length) return 0;
  return messages
    .filter((m) => m.role === 'user')
    .reduce((sum, m) => sum + m.content.trim().length, 0);
}

function variantCount(variants: unknown): number {
  if (!variants) return 0;
  if (Array.isArray(variants)) return variants.length;
  if (typeof variants === 'object' && variants !== null) {
    const v = variants as { pricing?: unknown };
    if (v.pricing && typeof v.pricing === 'object') {
      return Object.keys(v.pricing as object).length;
    }
  }
  return 0;
}

export function isProductSufficient(input: ProductSufficiencyInput): boolean {
  const name = input.name?.trim();
  if (!name) return false;

  const descLen = (input.description ?? '').trim().length;
  const keywordTags =
    (input.keywords?.filter(Boolean).length ?? 0) + (input.tags?.filter(Boolean).length ?? 0);
  const hasCategory = Boolean(input.category?.trim());
  const hasVariants = variantCount(input.variants) >= 1;
  const sessionText = sessionUserTextLen(input.sessionMessages);

  if (descLen >= 40) return true;
  if (keywordTags >= 2) return true;
  if (hasCategory) return true;
  if (hasVariants) return true;
  if (sessionText >= 20) return true;
  return false;
}

export function isFaqSufficient(input: FaqSufficiencyInput): boolean {
  const q = input.question?.trim();
  const a = input.answer?.trim();
  if (!q || !a) return false;
  if (a.length >= 30) return true;
  if (sessionUserTextLen(input.sessionMessages) >= 20) return true;
  return false;
}

export function productMissingHints(input: ProductSufficiencyInput): string[] {
  const hints: string[] = [];
  if (!(input.description ?? '').trim()) {
    hints.push('What is this product? (taste, ingredients, or how customers use it)');
  } else if ((input.description ?? '').trim().length < 40) {
    hints.push('Add a bit more detail about ingredients, portion size, or who it is for');
  }
  if (!input.category?.trim() && variantCount(input.variants) === 0) {
    hints.push('Pack size or variants (e.g. 500g box, single vs dozen)');
  }
  if (hints.length === 0) {
    hints.push('Any allergens, freshness, or ordering notes customers should know?');
  }
  return hints.slice(0, 4);
}

export function faqMissingHints(input: FaqSufficiencyInput): string[] {
  const hints: string[] = [];
  if (!input.answer?.trim()) {
    hints.push('What should customers hear when they ask this?');
  } else if (input.answer.trim().length < 30) {
    hints.push('Expand the answer with hours, fees, or exceptions if any');
  }
  return hints.slice(0, 3);
}
