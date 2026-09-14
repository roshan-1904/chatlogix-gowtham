import { prisma } from '../db/prisma.js';
import { logger } from '../logger.js';
import { embedText, toVectorLiteral, FAQ_EMBEDDING_MODEL } from '../conversation/faq/embedding.js';

export async function embedFaqQuestion(faqId: string, question: string): Promise<boolean> {
  const embedding = await embedText(question);
  if (!embedding) return false;
  await prisma.$executeRaw`
    UPDATE "Faq" SET embedding = ${toVectorLiteral(embedding)}::vector, "embeddingModel" = ${FAQ_EMBEDDING_MODEL}
    WHERE id = ${faqId}
  `;
  return true;
}

export async function embedFaqQuestionSafe(faqId: string, question: string): Promise<boolean> {
  try {
    return await embedFaqQuestion(faqId, question);
  } catch (err) {
    logger.warn({ err, faqId }, 'faq_embed_failed');
    return false;
  }
}
