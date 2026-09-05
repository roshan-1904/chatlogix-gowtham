/**
 * Customer-facing language helpers for the conversation pipeline.
 * Free-form ISO 639-1 codes (en, hi, ta, ml, kn, te, …) or "mixed" for
 * code-switching. Pipeline logic uses English vs non-English only — natural
 * prose for any regional language comes from LLM-1/LLM-2 draftReply.
 */

export type CustomerLanguage = string;

/** True when the language code is English (en, en-IN, en_US, …). */
export function isEnglishLanguage(language: CustomerLanguage | null | undefined): boolean {
  if (!language) return true;
  const base = language.toLowerCase().split(/[-_]/)[0]?.trim();
  if (!base || base === 'mixed') return false;
  return base === 'en';
}

/** Detect primary script/language from message text (Unicode ranges). */
export function detectLanguageFromText(text: string): CustomerLanguage {
  if (!text || text.length === 0) return 'en';

  // Ordered by common Indian-language frequency in WhatsApp traffic
  if (/[\u0900-\u097F]/.test(text)) return 'hi'; // Devanagari (Hindi, Marathi, …)
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta'; // Tamil
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te'; // Telugu
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml'; // Malayalam
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn'; // Kannada
  if (/[\u0980-\u09FF]/.test(text)) return 'bn'; // Bengali
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu'; // Gujarati
  if (/[\u0A00-\u0A7F]/.test(text)) return 'pa'; // Gurmukhi (Punjabi)
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or'; // Odia
  if (/[\u0D80-\u0DFF]/.test(text)) return 'si'; // Sinhala

  return 'en';
}
