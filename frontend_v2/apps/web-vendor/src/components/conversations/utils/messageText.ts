export type MessageTextPart = { type: 'text' | 'emoji'; value: string };

/**
 * Flags, keycaps, ZWJ sequences (families, professions), skin tones, and
 * typical pictographs. Used to render emojis larger than surrounding copy.
 */
const EMOJI_SEQUENCE =
  /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u20E3)*(?:\u200D(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u20E3)*))*)/gu;

export function splitEmojiAndText(input: string): MessageTextPart[] {
  if (!input) return [];

  const parts: MessageTextPart[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(EMOJI_SEQUENCE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: 'text', value: input.slice(lastIndex, index) });
    }
    parts.push({ type: 'emoji', value: match[0] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < input.length) {
    parts.push({ type: 'text', value: input.slice(lastIndex) });
  }

  return parts;
}

/** Number of emojis when the message is emoji-only (whitespace ignored); else 0. */
export function standaloneEmojiCount(input: string): number {
  const parts = splitEmojiAndText(input);
  const hasText = parts.some((part) => part.type === 'text' && part.value.trim() !== '');
  if (hasText) return 0;
  return parts.filter((part) => part.type === 'emoji').length;
}

export function standaloneEmojiClass(count: number): string {
  if (count === 1) return 'chat-emoji-lg text-[2.75rem]';
  if (count === 2) return 'chat-emoji-lg text-[2.35rem]';
  if (count <= 3) return 'chat-emoji-lg text-[2rem]';
  if (count <= 6) return 'chat-emoji-lg text-[1.65rem]';
  return 'chat-emoji-lg text-[1.45em]';
}

export type DualLanguageDisplay =
  | { dual: false; text: string }
  | { dual: true; english: string; original: string };

/**
 * Thread copy: English first + original underneath only when `contentEn` is
 * present, non-empty, and distinct from the original. Otherwise a single line.
 */
export function dualLanguageDisplay(
  original: string,
  contentEn?: string | null,
): DualLanguageDisplay {
  const english = contentEn?.trim() ?? '';
  const origTrimmed = original.trim();
  if (english && origTrimmed && english !== origTrimmed) {
    return { dual: true, english, original };
  }
  return { dual: false, text: original };
}

const LETTER = /\p{L}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;

/** Mirrors backend needsEnglish — true when content has non-Latin script. */
export function likelyNeedsEnglish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('📍')) return false;
  if (/^👤\s*Contact card$/i.test(trimmed)) return false;
  if (/^🟦\s*Sticker$/i.test(trimmed)) return false;

  let nonLatinLetters = 0;
  for (const char of trimmed) {
    if (!LETTER.test(char)) continue;
    if (!LATIN_LETTER.test(char)) nonLatinLetters += 1;
  }
  return nonLatinLetters > 0;
}

/** True when the vendor portal should keep polling until contentEn arrives. */
export function needsContentEnRefresh(content: string, contentEn?: string | null): boolean {
  if (contentEn?.trim()) return false;
  return likelyNeedsEnglish(content);
}
