import OpenAI from 'openai';
import type { CartOp } from '../conversation/types.js';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export const VENDOR_ENGLISH_MODEL = 'gpt-4.1-mini';

export type VendorEnglishSource = 'audio';

export interface VendorEnglishOptions {
  source?: VendorEnglishSource;
}

export const UNCLEAR_VOICE_NOTE_EN = '[unclear voice note]';

const VENDOR_ENGLISH_SYSTEM_PROMPT = [
  'Translate the following WhatsApp message into English for a vendor dashboard.',
  'The vendor reads English only. Always translate — including Tamil, Hindi, Kannada, Telugu, Malayalam, Bengali, and any other language or script.',
  'Rules:',
  '- Translate meaning into natural English.',
  '- Transliterate personal names and place names into Latin script (e.g. ராஜி → Raji, கோயம்புத்தூர் → Coimbatore, सावनमपट्टी → Savanampatti). Never leave native script in the output.',
  '- Tamil, Hindi, and mixed-language messages must still be fully translated to English for the vendor.',
  '- If the text is already English, return it unchanged.',
  '- Return only the English/Latin text. No quotes, labels, or commentary.'
].join('\n');

const VENDOR_ENGLISH_AUDIO_EXTRA = [
  'This text is a speech-to-text transcript of a WhatsApp voice note, not typed text. It may be garbled.',
  'Translate only what is clearly said. Do not invent medical conditions, street addresses, quantities, dates, or other facts that are not clearly in the transcript.',
  `If the transcript is incoherent or you cannot be reasonably sure of the meaning, return exactly: ${UNCLEAR_VOICE_NOTE_EN}`
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
export async function toVendorEnglish(
  text: string,
  opts?: VendorEnglishOptions
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || isPlaceholderBody(trimmed) || !needsEnglish(trimmed)) {
    return trimmed;
  }

  if (!openai) {
    logger.warn('OpenAI not configured, skipping vendor English translation');
    return trimmed;
  }

  const system =
    opts?.source === 'audio'
      ? `${VENDOR_ENGLISH_SYSTEM_PROMPT}\n${VENDOR_ENGLISH_AUDIO_EXTRA}`
      : VENDOR_ENGLISH_SYSTEM_PROMPT;

  const completion = await openai.chat.completions.create({
    model: VENDOR_ENGLISH_MODEL,
    messages: [
      { role: 'system', content: system },
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
  original: string,
  opts?: VendorEnglishOptions
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

    const english = await toVendorEnglish(original, opts);
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

type MessageContentRow = { id: string; content: string; contentEn?: string | null };

/**
 * Fill missing `contentEn` on vendor read paths (conversation load, single message).
 * Customer WhatsApp copy is never touched — only the vendor-portal English field.
 */
export async function hydrateMessagesContentEn<T extends MessageContentRow>(
  messages: T[],
  maxToHydrate = 15
): Promise<T[]> {
  const pending = messages.filter((m) => !m.contentEn?.trim() && needsEnglish(m.content));
  if (pending.length === 0) return messages;

  const batch = pending.slice(0, maxToHydrate);
  const results = await Promise.all(
    batch.map(async (m) => {
      const contentEn = await ensureMessageContentEn(m.id, m.content);
      return contentEn ? { id: m.id, contentEn } : null;
    })
  );

  const byId = new Map<string, string>();
  for (const row of results) {
    if (row) byId.set(row.id, row.contentEn);
  }
  if (byId.size === 0) return messages;

  return messages.map((m) => {
    const contentEn = byId.get(m.id);
    return contentEn ? { ...m, contentEn } : m;
  });
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
