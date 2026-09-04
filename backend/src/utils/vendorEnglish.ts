import OpenAI from 'openai';
import type { CartOp } from '../conversation/types.js';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export const VENDOR_ENGLISH_MODEL = 'gpt-4.1-mini';

const VENDOR_ENGLISH_SYSTEM_PROMPT = [
  'Translate the following WhatsApp message into English for a vendor dashboard.',
  'Rules:',
  '- Translate meaning into natural English.',
  '- Transliterate personal names and place names into Latin script (e.g. ராஜி → Raji, கோயம்புத்தூர் → Coimbatore, सावनमपट्टी → Savanampatti). Never leave native script.',
  '- If the text is already English, return it unchanged.',
  '- Return only the English/Latin text. No quotes, labels, or commentary.'
].join('\n');

const LETTER = /\p{L}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;

/**
 * True when `text` has substantial non-Latin script (Devanagari, Tamil, etc.).
 * Latin-script Hinglish/Tanglish is already vendor-displayable — returns false.
 * Empty and placeholder bodies (location pins, contact cards, stickers) return false.
 */
export function needsEnglish(text: string): boolean {
  if (!text || isPlaceholderBody(text)) return false;

  let nonLatinLetters = 0;
  for (const char of text) {
    if (!LETTER.test(char)) continue;
    if (!LATIN_LETTER.test(char)) nonLatinLetters += 1;
  }
  return nonLatinLetters > 0;
}

/**
 * Translate / transliterate `text` for vendor display.
 * Skips the model when the body is empty, a placeholder, or already Latin-script.
 */
export async function toVendorEnglish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || isPlaceholderBody(trimmed) || !needsEnglish(trimmed)) {
    return trimmed;
  }

  if (!openai) {
    logger.warn('OpenAI not configured, skipping vendor English translation');
    return trimmed;
  }

  const completion = await openai.chat.completions.create({
    model: VENDOR_ENGLISH_MODEL,
    messages: [
      { role: 'system', content: VENDOR_ENGLISH_SYSTEM_PROMPT },
      { role: 'user', content: trimmed }
    ],
    temperature: 0,
    max_completion_tokens: 800
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    logger.warn({ model: VENDOR_ENGLISH_MODEL }, 'toVendorEnglish returned no content');
    return trimmed;
  }

  return stripWrappingQuotes(content);
}

/**
 * Idempotently persist `Message.contentEn` from the original body.
 * No-op when `contentEn` is already set, the body does not need English, or translation fails.
 * Never overwrites `content`.
 */
export async function ensureMessageContentEn(
  messageId: string,
  original: string
): Promise<string | null> {
  try {
    if (!original.trim() || isPlaceholderBody(original) || !needsEnglish(original)) {
      return null;
    }

    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { contentEn: true }
    });
    if (!existing) {
      logger.warn({ messageId }, 'ensureMessageContentEn: message not found');
      return null;
    }
    if (existing.contentEn) {
      return existing.contentEn;
    }

    const english = await toVendorEnglish(original);
    const trimmedOriginal = original.trim();
    if (!english || english === trimmedOriginal) {
      return null;
    }

    await prisma.message.updateMany({
      where: { id: messageId, contentEn: null },
      data: { contentEn: english }
    });
    return english;
  } catch (err) {
    logger.warn({ err, messageId }, 'Failed to persist Message.contentEn');
    return null;
  }
}

const SET_FIELD_ENGLISH_FIELDS = new Set<Extract<CartOp, { type: 'set_field' }>['field']>([
  'name',
  'address',
  'notes',
  'delivery_date'
]);

/** Transliterate / translate set_field values so CustomerInsights and Order stay English-only. */
export async function normalizeSetFieldOps(ops: CartOp[]): Promise<CartOp[]> {
  return Promise.all(
    ops.map(async (op) => {
      if (op.type !== 'set_field' || !SET_FIELD_ENGLISH_FIELDS.has(op.field)) {
        return op;
      }
      const english = await toVendorEnglish(op.value);
      const trimmed = op.value.trim();
      if (!english || english === trimmed) {
        return op;
      }
      return { ...op, value: english };
    })
  );
}

function isPlaceholderBody(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('📍')) return true;
  if (/^👤\s*Contact card$/i.test(trimmed)) return true;
  if (/^🟦\s*Sticker$/i.test(trimmed)) return true;
  return false;
}

function stripWrappingQuotes(text: string): string {
  const match = text.match(/^["“'](.+)["”']$/s);
  return match?.[1]?.trim() ?? text;
}
