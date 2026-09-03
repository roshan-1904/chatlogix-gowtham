import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { logger } from '../../logger.js';

// Module-level singleton, same pattern as every other OpenAI call site in the
// codebase (e.g. llm1.ts, visionClient.ts).
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

// 1536 dims — matches Faq.embedding's `vector(1536)` column. Changing this
// model requires re-embedding every existing row (dimensionality differs
// across OpenAI embedding models).
export const FAQ_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Best-effort: returns null (never throws) on any failure — missing API key,
 * rate limit, network error. Callers must treat null as "embedding
 * unavailable right now", not as a reason to fail the caller's own write or
 * request (see routes/faqs.ts, conversation/prefetch.ts's loadFaqs).
 */
export async function embedText(text: string): Promise<number[] | null> {
  if (!openai) return null;
  try {
    const resp = await openai.embeddings.create({ model: FAQ_EMBEDDING_MODEL, input: text });
    return resp.data[0]?.embedding ?? null;
  } catch (err) {
    logger.warn({ err }, 'FAQ embedding call failed');
    return null;
  }
}

/** pgvector accepts this bracketed text form as input; cast with `::vector` on the SQL side. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
